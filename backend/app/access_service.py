import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from uuid import uuid4
from .database import db
from .models import Grant, AccessRequest
from .crypto import sign_grant_payload
from .time_authority import time_authority
from .audit import audit_service

class AccessServiceError(Exception):
    pass

class AccessService:
    """
    Architecture v3 §A8, §A9 & Master Spec §V6, §V7:
    Just-In-Time (JIT) Access Requests, Multi-Signature Approvals, and Delegation with Attenuation.
    """

    @classmethod
    def create_access_request(
        cls,
        requester_id: str,
        vault_id: str,
        actions: List[str],
        duration_minutes: int,
        purpose: str,
        justification: str,
        selector: Optional[Dict[str, Any]] = None
    ) -> AccessRequest:
        now_iso = time_authority.now().isoformat()
        req_id = f"req_{uuid4().hex[:8]}"

        with db.get_connection() as conn:
            cursor = conn.cursor()

            # Verify vault exists and is active
            cursor.execute("SELECT * FROM vaults WHERE vault_id = ? AND status = 'active'", (vault_id,))
            v = cursor.fetchone()
            if not v:
                raise AccessServiceError("Vault not found or inactive.")

            # Classification cap duration check (V5.2)
            max_duration = 1440  # 24h default
            if v["classification_ceiling"] >= 3:
                max_duration = 240  # 4h max for restricted
            effective_duration = min(duration_minutes, max_duration)

            cursor.execute("""
            INSERT INTO access_requests (
                request_id, vault_id, requester_id, selector, actions,
                duration_minutes, purpose, justification, state, required_approvals, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', 1, ?)
            """, (
                req_id, vault_id, requester_id, json.dumps(selector or {"all": True}),
                json.dumps(actions), effective_duration, purpose, justification, now_iso
            ))
            conn.commit()

        audit_service.log_event(
            request_id=req_id,
            actor_id=requester_id,
            action="access_request_created",
            object_type="vault",
            object_id=vault_id,
            decision="PENDING",
            policy_version=1,
            reason_code="JIT_ACCESS_REQUESTED"
        )

        return AccessRequest(
            request_id=req_id,
            vault_id=vault_id,
            requester_id=requester_id,
            selector=selector or {"all": True},
            actions=actions,
            duration_minutes=effective_duration,
            purpose=purpose,
            justification=justification,
            state="requested",
            required_approvals=1,
            created_at=now_iso
        )

    @classmethod
    def approve_access_request(cls, request_id: str, approver_id: str) -> Grant:
        """Approves JIT access request with Separation of Duties (SoD) enforcement."""
        now = time_authority.now()
        now_dt = now.timestamp
        now_iso = now.isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM access_requests WHERE request_id = ?", (request_id,))
            req = cursor.fetchone()
            if not req:
                raise AccessServiceError("Request not found.")
            if req["state"] != "requested":
                raise AccessServiceError(f"Request cannot be approved in state '{req['state']}'.")

            # Separation of Duties (SoD-5 / Architecture A9): Requester CANNOT approve their own request!
            if req["requester_id"] == approver_id:
                raise AccessServiceError("Separation of Duties violation: requester cannot approve their own request.")

            # Record approval
            cursor.execute("""
            INSERT OR REPLACE INTO access_request_approvals (request_id, approver_id, decision, decided_at)
            VALUES (?, ?, 'approve', ?)
            """, (request_id, approver_id, now_iso))

            # Update request state
            cursor.execute("UPDATE access_requests SET state = 'approved' WHERE request_id = ?", (request_id,))

            # Issue signed, time-bound Grant (§A4, §A5)
            grant_id = f"g_{uuid4().hex[:8]}"
            valid_until_dt = now_dt + timedelta(minutes=req["duration_minutes"])
            valid_until_iso = valid_until_dt.isoformat()

            grant_dict = {
                "grant_id": grant_id,
                "vault_id": req["vault_id"],
                "grantee_type": "user",
                "grantee_id": f"user:{req['requester_id']}",
                "selector": json.loads(req["selector"]),
                "actions": json.loads(req["actions"]),
                "valid_from": now_iso,
                "valid_until": valid_until_iso,
                "purpose": req["purpose"]
            }

            sig = sign_grant_payload(grant_dict)

            cursor.execute("""
            INSERT INTO grants (
                grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                valid_from, valid_until, purpose, issuer_id, state, signature, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
            """, (
                grant_id, req["vault_id"], "user", f"user:{req['requester_id']}",
                req["selector"], req["actions"], now_iso, valid_until_iso,
                req["purpose"], approver_id, sig, now_iso
            ))

            cursor.execute("INSERT INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (grant_id,))
            conn.commit()

        audit_service.log_event(
            request_id=request_id,
            actor_id=approver_id,
            action="access_request_approved",
            object_type="grant",
            object_id=grant_id,
            decision="ALLOW",
            policy_version=1,
            reason_code="JIT_GRANT_ISSUED"
        )

        return Grant(
            grant_id=grant_id,
            vault_id=req["vault_id"],
            grantee_type="user",
            grantee_id=f"user:{req['requester_id']}",
            selector=json.loads(req["selector"]),
            actions=json.loads(req["actions"]),
            valid_from=now_iso,
            valid_until=valid_until_iso,
            purpose=req["purpose"],
            issuer_id=approver_id,
            state="active",
            signature=sig,
            created_at=now_iso
        )

    @classmethod
    def delegate_grant(
        cls,
        parent_grant_id: str,
        delegator_id: str,
        grantee_type: str,
        grantee_id: str,
        requested_actions: List[str],
        requested_valid_until: str,
        selector: Optional[Dict[str, Any]] = None
    ) -> Grant:
        """
        Architecture v3 §A8 Delegation Validator with Attenuation (D1–D10).
        - Can only narrow permissions.
        - Child actions ⊆ Parent actions.
        - Child duration <= Parent duration.
        - Child depth <= max_depth (<= 3).
        - No privilege escalation or cycles.
        """
        now = time_authority.now()
        now_iso = now.isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM grants WHERE grant_id = ?", (parent_grant_id,))
            parent = cursor.fetchone()
            if not parent or parent["state"] != "active":
                raise AccessServiceError("Parent grant inactive or nonexistent (PARENT_INACTIVE).")

            if not parent["delegable"]:
                raise AccessServiceError("Parent grant is not delegable (D2 violation).")

            parent_actions = set(json.loads(parent["actions"]))
            if not (set(requested_actions) <= parent_actions):
                raise AccessServiceError(f"Attenuation violation: child actions {requested_actions} exceed parent {list(parent_actions)} (D1_ACTIONS).")

            if parent["valid_until"] and requested_valid_until > parent["valid_until"]:
                raise AccessServiceError("Attenuation violation: child validity cannot exceed parent validity (D1_TIME).")

            new_depth = parent["depth"] + 1
            if new_depth > 3:
                raise AccessServiceError("Maximum delegation depth exceeded (D3 violation).")

            child_grant_id = f"g_del_{uuid4().hex[:8]}"
            child_dict = {
                "grant_id": child_grant_id,
                "vault_id": parent["vault_id"],
                "grantee_type": grantee_type,
                "grantee_id": grantee_id,
                "selector": selector or json.loads(parent["selector"]),
                "actions": requested_actions,
                "valid_from": now_iso,
                "valid_until": requested_valid_until,
                "purpose": f"delegated_by:{delegator_id}"
            }
            sig = sign_grant_payload(child_dict)

            cursor.execute("""
            INSERT INTO grants (
                grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                valid_from, valid_until, purpose, delegable, depth, parent_grant_id,
                issuer_id, state, signature, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'active', ?, ?)
            """, (
                child_grant_id, parent["vault_id"], grantee_type, grantee_id,
                json.dumps(child_dict["selector"]), json.dumps(requested_actions),
                now_iso, requested_valid_until, child_dict["purpose"],
                new_depth, parent_grant_id, delegator_id, sig, now_iso
            ))

            cursor.execute("INSERT INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (child_grant_id,))
            conn.commit()

        audit_service.log_event(
            request_id=child_grant_id,
            actor_id=delegator_id,
            action="grant_delegated",
            object_type="grant",
            object_id=child_grant_id,
            decision="ALLOW",
            policy_version=1,
            reason_code="DELEGATION_ATTENUATED"
        )

        return Grant(
            grant_id=child_grant_id,
            vault_id=parent["vault_id"],
            grantee_type=grantee_type,
            grantee_id=grantee_id,
            selector=child_dict["selector"],
            actions=requested_actions,
            valid_from=now_iso,
            valid_until=requested_valid_until,
            purpose=child_dict["purpose"],
            depth=new_depth,
            parent_grant_id=parent_grant_id,
            issuer_id=delegator_id,
            state="active",
            signature=sig,
            created_at=now_iso
        )

    @classmethod
    def revoke_grant(cls, grant_id: str, revoker_id: str, reason: str = "administrative_revocation"):
        """Revokes grant and triggers cascade revocation (§A8, D5)."""
        now_iso = time_authority.now().isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            UPDATE grants
            SET state = 'revoked', revoked_at = ?, revoked_by = ?, revoke_reason = ?
            WHERE grant_id = ? OR parent_grant_id = ?
            """, (now_iso, revoker_id, reason, grant_id, grant_id))
            conn.commit()

        audit_service.log_event(
            request_id=f"rev_{uuid4().hex[:8]}",
            actor_id=revoker_id,
            action="grant_revoked",
            object_type="grant",
            object_id=grant_id,
            decision="REVOKED",
            policy_version=1,
            reason_code="CASCADE_REVOKE"
        )

access_service = AccessService()
