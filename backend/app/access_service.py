import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from uuid import uuid4
from .database import db
from .models import Grant, AccessRequest, Principal, ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE
from .crypto import sign_grant_payload
from .time_authority import time_authority
from .audit import audit_service
from .config import DEMO_MODE

class AccessServiceError(Exception):
    pass

class AccessService:
    """
    Architecture v3 §A8, §A9 & Master Spec §V6, §V7, §37..§43:
    JIT Access Requests with Authority Verification, Multi-Signature Approvals,
    Delegation with Attenuation (D1–D10), and Recursive Cascade Revocation.
    """

    @classmethod
    def issue_grant(
        cls,
        issuer: Principal,
        grantee_id: str,
        vault_id: str,
        actions: List[str],
        valid_until: Any,
        selector: Optional[Dict[str, Any]] = None,
        delegable: bool = False,
        purpose: str = "direct_grant"
    ) -> Grant:
        """
        Issues an authoritative, Ed25519-signed Grant directly (§35, §36).
        Enforces caller authority (vault owner, admin, or delegable grant holder),
        canonicalizes grantee ID to user_id, normalizes RAG permissions,
        updates resource manifest ACL for granular file-level grants,
        and records tamper-evident audit log.
        """
        now = time_authority.now()
        now_iso = now.isoformat()

        if isinstance(valid_until, datetime):
            valid_until_iso = valid_until.isoformat()
        else:
            valid_until_iso = str(valid_until)

        # Normalize actions
        clean_actions = []
        raw_actions = actions or [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE]
        for act in raw_actions:
            c_act = act[7:] if act.startswith("action:") else act
            if c_act == "read":
                for standard_act in (ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE):
                    if standard_act not in clean_actions:
                        clean_actions.append(standard_act)
            elif c_act not in clean_actions:
                clean_actions.append(c_act)
        if not clean_actions:
            clean_actions = [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE]

        sel = selector or {"all": True}
        target_res_id = sel.get("resource_id") if isinstance(sel, dict) else None

        with db.get_connection() as conn:
            cursor = conn.cursor()

            # 1. Verify vault exists and caller authority
            cursor.execute("SELECT * FROM vaults WHERE vault_id = ? OR slug = ?", (vault_id, vault_id))
            vault_row = cursor.fetchone()
            if not vault_row:
                raise AccessServiceError(f"Vault '{vault_id}' not found.")

            real_vault_id = vault_row["vault_id"]
            vault_owner = (vault_row["owner_id"] or "").replace("user:", "").strip().lower()
            p_clean = issuer.user_id.replace("user:", "").strip().lower()
            p_uname = issuer.username.strip().lower()

            is_owner = (p_clean == vault_owner or p_uname == vault_owner)
            is_admin = any(r in issuer.roles for r in ("admin", "security_admin"))
            is_steward = bool(vault_row["steward_role_id"] and vault_row["steward_role_id"] in issuer.roles)

            if not (is_owner or is_admin or is_steward or DEMO_MODE):
                # Check for active delegable grant
                cursor.execute("""
                    SELECT grant_id FROM grants
                    WHERE vault_id = ? AND grantee_id IN (?, ?) AND state = 'active'
                      AND delegable = 1 AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)
                """, (real_vault_id, f"user:{issuer.user_id}", issuer.user_id, now_iso, now_iso))
                if not cursor.fetchone():
                    raise AccessServiceError("Unauthorized: caller lacks authority to issue grants for this vault (ISSUER_UNAUTHORIZED).")

            # 2. Resolve grantee identity and clearance
            grantee_raw = grantee_id.strip()
            if grantee_raw.startswith("role:"):
                grantee_type = "role"
                formatted_grantee = grantee_raw
                grantee_clearance = 1
                canonical_uid = grantee_raw.replace("role:", "")
                canonical_uname = canonical_uid
            else:
                grantee_type = "user"
                clean_grantee = grantee_raw.replace("user:", "").strip().lower()
                cursor.execute("SELECT user_id, username, clearance FROM users WHERE LOWER(username) = ? OR LOWER(user_id) = ?", (clean_grantee, clean_grantee))
                u_row = cursor.fetchone()
                if u_row:
                    canonical_uid = u_row["user_id"]
                    canonical_uname = u_row["username"]
                    grantee_clearance = u_row["clearance"]
                    formatted_grantee = f"user:{canonical_uid}"
                else:
                    canonical_uid = clean_grantee
                    canonical_uname = clean_grantee
                    grantee_clearance = 1
                    formatted_grantee = f"user:{clean_grantee}"

            # 3. Supersede old active grants for same vault, grantee, and target resource
            if target_res_id:
                cursor.execute("""
                    UPDATE grants
                    SET state = 'superseded', revoked_at = ?, revoked_by = ?, revoke_reason = 'Superseded by new grant'
                    WHERE vault_id = ? AND grantee_id IN (?, ?, ?, ?) AND state = 'active'
                      AND selector LIKE ?
                """, (now_iso, issuer.user_id, real_vault_id, formatted_grantee, canonical_uid, f"user:{canonical_uname}", canonical_uname, f'%{target_res_id}%'))

            # 4. Create and cryptographically sign new Grant
            grant_id = f"g_dir_{uuid4().hex[:8]}"
            grant_dict = {
                "grant_id": grant_id,
                "vault_id": real_vault_id,
                "grantee_type": grantee_type,
                "grantee_id": formatted_grantee,
                "selector": sel,
                "actions": clean_actions,
                "valid_from": now_iso,
                "valid_until": valid_until_iso,
                "purpose": purpose,
                "delegable": bool(delegable),
                "depth": 1 if delegable else 0,
                "parent_grant_id": None,
                "issuer_id": issuer.user_id
            }

            sig = sign_grant_payload(grant_dict)

            cursor.execute("""
                INSERT INTO grants (
                    grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                    valid_from, valid_until, purpose, delegable, depth, parent_grant_id,
                    issuer_id, state, signature, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'active', ?, ?)
            """, (
                grant_id, real_vault_id, grantee_type, formatted_grantee,
                json.dumps(sel), json.dumps(clean_actions),
                now_iso, valid_until_iso, purpose,
                1 if delegable else 0, 1 if delegable else 0,
                issuer.user_id, sig, now_iso
            ))

            cursor.execute("INSERT OR IGNORE INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (grant_id,))

            # 5. For file-specific grant, update resource manifest ACL
            if target_res_id:
                cursor.execute("SELECT allowed_users, allowed_roles, min_clearance FROM resource_manifests WHERE resource_id = ?", (target_res_id,))
                m_row = cursor.fetchone()
                if m_row:
                    if grantee_type == "user":
                        users_list = json.loads(m_row["allowed_users"] or "[]")
                        for candidate_u in (canonical_uid, canonical_uname, formatted_grantee, f"user:{canonical_uid}"):
                            if candidate_u not in users_list:
                                users_list.append(candidate_u)
                        new_min = m_row["min_clearance"]
                        if grantee_clearance < new_min:
                            new_min = grantee_clearance
                        cursor.execute("""
                            UPDATE resource_manifests
                            SET allowed_users = ?, min_clearance = ?, acl_version = acl_version + 1
                            WHERE resource_id = ?
                        """, (json.dumps(users_list), new_min, target_res_id))
                    else:
                        roles_list = json.loads(m_row["allowed_roles"] or "[]")
                        if canonical_uid not in roles_list:
                            roles_list.append(canonical_uid)
                        cursor.execute("""
                            UPDATE resource_manifests
                            SET allowed_roles = ?, acl_version = acl_version + 1
                            WHERE resource_id = ?
                        """, (json.dumps(roles_list), target_res_id))

            cursor.execute("UPDATE vaults SET vault_epoch = vault_epoch + 1 WHERE vault_id = ?", (real_vault_id,))
            conn.commit()

        audit_service.log_event(
            request_id=f"dir_{grant_id}",
            actor_id=issuer.user_id,
            action="grant_issued",
            object_type="resource" if target_res_id else "vault",
            object_id=target_res_id or real_vault_id,
            decision="ALLOW",
            policy_version=1,
            reason_code="RESOURCE_GRANTED" if target_res_id else "FOLDER_GRANTED"
        )

        return Grant(
            grant_id=grant_id,
            vault_id=real_vault_id,
            grantee_type=grantee_type,
            grantee_id=formatted_grantee,
            selector=sel,
            actions=clean_actions,
            valid_from=now_iso,
            valid_until=valid_until_iso,
            purpose=purpose,
            delegable=bool(delegable),
            depth=1 if delegable else 0,
            issuer_id=issuer.user_id,
            state="active",
            signature=sig,
            created_at=now_iso
        )

    @classmethod
    def create_access_request(
        cls,
        requester: Principal,
        vault_id: str,
        actions: List[str],
        duration_minutes: int,
        purpose: str,
        justification: str,
        selector: Optional[Dict[str, Any]] = None,
        required_approvals: int = 1
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

            # Classification cap duration check
            max_duration = 1440  # 24h default
            if v["classification_ceiling"] >= 3:
                max_duration = 240  # 4h max for restricted
            effective_duration = min(duration_minutes, max_duration)

            cursor.execute("""
            INSERT INTO access_requests (
                request_id, vault_id, requester_id, selector, actions,
                duration_minutes, purpose, justification, state, required_approvals, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)
            """, (
                req_id, vault_id, requester.user_id, json.dumps(selector or {"all": True}),
                json.dumps(actions), effective_duration, purpose, justification,
                max(1, required_approvals), now_iso
            ))
            conn.commit()

        audit_service.log_event(
            request_id=req_id,
            actor_id=requester.user_id,
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
            requester_id=requester.user_id,
            selector=selector or {"all": True},
            actions=actions,
            duration_minutes=effective_duration,
            purpose=purpose,
            justification=justification,
            state="requested",
            required_approvals=max(1, required_approvals),
            approvals_count=0,
            created_at=now_iso
        )

    @classmethod
    def approve_access_request(cls, request_id: str, approver: Principal) -> Optional[Grant]:
        """
        Approves JIT access request with Approver Authority Check & Separation of Duties (SoD) (§38, §39, §80).
        """
        now = time_authority.now()
        now_dt = now.timestamp
        now_iso = now.isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT ar.*, v.owner_id as vault_owner, v.steward_role_id FROM access_requests ar JOIN vaults v ON ar.vault_id = v.vault_id WHERE ar.request_id = ?", (request_id,))
            req = cursor.fetchone()
            if not req:
                raise AccessServiceError("Request not found.")
            if req["state"] != "requested":
                raise AccessServiceError(f"Request cannot be approved in state '{req['state']}'.")

            # 1. Separation of Duties (SoD / §38): Requester CANNOT approve their own request!
            if req["requester_id"] == approver.user_id:
                raise AccessServiceError("Separation of Duties violation: requester cannot approve their own request (T-V3-SOD-001).")

            # 2. Approver Authority Check (§38): Must be vault owner, steward role, security_admin, or admin
            is_owner = req["vault_owner"] == approver.user_id
            is_steward = req["steward_role_id"] in approver.roles if req["steward_role_id"] else False
            is_admin = any(r in approver.roles for r in ("admin", "security_admin", "data_owner", "data_steward"))

            if not (is_owner or is_steward or is_admin):
                raise AccessServiceError("Unauthorized approver: caller lacks authority over this dataset (APPROVER_UNAUTHORIZED).")

            # 3. Record approval
            cursor.execute("""
            INSERT OR REPLACE INTO access_request_approvals (request_id, approver_id, decision, decided_at)
            VALUES (?, ?, 'approve', ?)
            """, (request_id, approver.user_id, now_iso))

            # Count distinct valid approvals (§39: Multi-signature threshold)
            cursor.execute("SELECT COUNT(DISTINCT approver_id) as cnt FROM access_request_approvals WHERE request_id = ? AND decision = 'approve'", (request_id,))
            approval_count = cursor.fetchone()["cnt"]

            if approval_count < req["required_approvals"]:
                # Threshold not yet reached (e.g. 1 of 2 approved)
                conn.commit()
                return None

            # 4. Threshold met: Issue signed Grant
            cursor.execute("UPDATE access_requests SET state = 'approved' WHERE request_id = ?", (request_id,))

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
                "purpose": req["purpose"],
                "delegable": False,
                "depth": 0,
                "parent_grant_id": None,
                "issuer_id": approver.user_id
            }

            sig = sign_grant_payload(grant_dict)

            cursor.execute("""
            INSERT INTO grants (
                grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                valid_from, valid_until, purpose, delegable, depth, parent_grant_id,
                issuer_id, state, signature, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, 'active', ?, ?)
            """, (
                grant_id, req["vault_id"], "user", f"user:{req['requester_id']}",
                req["selector"], req["actions"], now_iso, valid_until_iso,
                req["purpose"], approver.user_id, sig, now_iso
            ))

            cursor.execute("INSERT INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (grant_id,))
            conn.commit()

        audit_service.log_event(
            request_id=request_id,
            actor_id=approver.user_id,
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
            issuer_id=approver.user_id,
            state="active",
            signature=sig,
            created_at=now_iso
        )

    @classmethod
    def delegate_grant(
        cls,
        parent_grant_id: str,
        delegator: Principal,
        grantee_type: str,
        grantee_id: str,
        requested_actions: List[str],
        requested_valid_until: str,
        selector: Optional[Dict[str, Any]] = None
    ) -> Grant:
        """
        Architecture v3 §A8 & §40, §41: Delegation Validator with Attenuation (D1–D10).
        - Delegator MUST be holder of parent grant (§40).
        - Parent grant must be delegable (§40).
        - Child actions ⊆ Parent actions (§41).
        - Child duration <= Parent duration (§41).
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

            # 1. Caller Authority Check (§40): Delegator must be the subject/grantee or vault owner/admin!
            parent_grantee = parent["grantee_id"]
            delegator_subjects = set(delegator.subjects())
            if parent_grantee not in delegator_subjects and "admin" not in delegator.roles:
                raise AccessServiceError("Caller does not hold parent grant (DELEGATOR_NOT_HOLDER).")

            # 2. Delegable flag check
            if not parent["delegable"]:
                raise AccessServiceError("Parent grant is not delegable (D2 violation).")

            # 3. Attenuation: Actions subset check (D1_ACTIONS)
            parent_actions = set(json.loads(parent["actions"]))
            if not (set(requested_actions) <= parent_actions):
                raise AccessServiceError(f"Attenuation violation: child actions exceed parent (D1_ACTIONS).")

            # 4. Attenuation: Time duration check (D1_TIME)
            if parent["valid_until"] and requested_valid_until > parent["valid_until"]:
                raise AccessServiceError("Attenuation violation: child validity cannot exceed parent validity (D1_TIME).")

            # 5. Attenuation: Depth check
            new_depth = parent["depth"] + 1
            if new_depth > 3:
                raise AccessServiceError("Maximum delegation depth exceeded (D3 violation).")

            # 6. Attenuation: Selector check (§20, §41)
            parent_sel = json.loads(parent["selector"])
            child_sel = selector or parent_sel
            # Child cannot remove parent's exclude_tags
            parent_exclude = set(parent_sel.get("exclude_tags", []))
            child_exclude = set(child_sel.get("exclude_tags", []))
            if not parent_exclude.issubset(child_exclude):
                raise AccessServiceError("Attenuation violation: child cannot remove parent selector exclusions.")

            child_grant_id = f"g_del_{uuid4().hex[:8]}"
            child_dict = {
                "grant_id": child_grant_id,
                "vault_id": parent["vault_id"],
                "grantee_type": grantee_type,
                "grantee_id": grantee_id,
                "selector": child_sel,
                "actions": requested_actions,
                "valid_from": now_iso,
                "valid_until": requested_valid_until,
                "purpose": f"delegated_by:{delegator.user_id}",
                "delegable": False,
                "depth": new_depth,
                "parent_grant_id": parent_grant_id,
                "issuer_id": delegator.user_id
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
                json.dumps(child_sel), json.dumps(requested_actions),
                now_iso, requested_valid_until, child_dict["purpose"],
                new_depth, parent_grant_id, delegator.user_id, sig, now_iso
            ))

            cursor.execute("INSERT INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (child_grant_id,))
            conn.commit()

        audit_service.log_event(
            request_id=child_grant_id,
            actor_id=delegator.user_id,
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
            selector=child_sel,
            actions=requested_actions,
            valid_from=now_iso,
            valid_until=requested_valid_until,
            purpose=child_dict["purpose"],
            depth=new_depth,
            parent_grant_id=parent_grant_id,
            issuer_id=delegator.user_id,
            state="active",
            signature=sig,
            created_at=now_iso
        )

    @classmethod
    def revoke_grant(cls, grant_id: str, revoker: Principal, reason: str = "administrative_revocation") -> List[str]:
        """
        Revokes grant and triggers recursive cascade revocation (§42, §81, §265).
        Caller must be grant issuer, vault owner, or admin (§81).
        """
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT g.*, v.owner_id as vault_owner FROM grants g JOIN vaults v ON g.vault_id = v.vault_id WHERE g.grant_id = ?", (grant_id,))
            g = cursor.fetchone()
            if not g:
                raise AccessServiceError("Grant not found.")

            revoker_clean = revoker.user_id.replace("user:", "").strip().lower()
            issuer_clean = (g["issuer_id"] or "").replace("user:", "").strip().lower()
            owner_clean = (g["vault_owner"] or "").replace("user:", "").strip().lower()

            is_issuer = (
                issuer_clean == revoker_clean
                or g["issuer_id"] == revoker.user_id
                or issuer_clean == revoker.username.lower()
                or g["issuer_id"] == f"user:{revoker.user_id}"
            )
            is_owner = (
                owner_clean == revoker_clean
                or g["vault_owner"] == revoker.user_id
                or owner_clean == revoker.username.lower()
                or g["vault_owner"] == f"user:{revoker.user_id}"
            )
            is_admin = any(r in revoker.roles for r in ("admin", "security_admin", "data_owner", "data_steward"))

            if not (is_issuer or is_owner or is_admin or DEMO_MODE):
                raise AccessServiceError("Unauthorized: caller cannot revoke this grant (REVOKER_UNAUTHORIZED).")

        # Execute atomic cascade revocation in database
        revoked_ids = db.revoke_grant_cascade(grant_id, revoker.user_id, reason)

        audit_service.log_event(
            request_id=f"rev_{uuid4().hex[:8]}",
            actor_id=revoker.user_id,
            action="grant_revoked",
            object_type="grant",
            object_id=grant_id,
            decision="REVOKED",
            policy_version=1,
            reason_code=f"CASCADE_REVOKED_{len(revoked_ids)}_GRANTS"
        )

        return revoked_ids

access_service = AccessService()
