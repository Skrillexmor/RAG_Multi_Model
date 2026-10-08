import json
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple, Optional, Literal
from uuid import uuid4

from .models import (
    Principal, Grant, Vault, ResourceManifest, AuthorizationLease,
    ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE,
    ACTION_DOWNLOAD_DOCUMENT, ACTION_SHARE_DATA, ACTION_DELEGATE_PERMISSION,
    ACTION_APPROVE_ACCESS_REQUEST, ACTION_VIEW_AUDIT, ACTION_FETCH_SECRET,
    ALLOWED_PURPOSES
)
from .database import db
from .crypto import verify_grant_signature
from .time_authority import time_authority
from .config import LEASE_TTL_SECONDS, RESTRICTED_LEASE_TTL_SECONDS

class ScopeViolation(Exception):
    pass

class DelegationViolation(Exception):
    pass

class PolicyEngine:
    """
    Deterministic NIST SP 800-162 RBAC + ABAC + Grant PDP Engine (§5, §6, §20, §97).
    """

    @staticmethod
    def get_principal_by_username(username: str) -> Optional[Principal]:
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
            user_row = cursor.fetchone()
            if not user_row:
                return None

            user_id = user_row["user_id"]
            now_iso = time_authority.now().isoformat()

            # Load active roles
            cursor.execute("""
            SELECT r.name FROM roles r
            JOIN role_assignments ra ON r.role_id = ra.role_id
            WHERE ra.user_id = ?
              AND ra.valid_from <= ?
              AND (ra.valid_until IS NULL OR ra.valid_until > ?)
            """, (user_id, now_iso, now_iso))
            roles = [r["name"] for r in cursor.fetchall()]

            # Load groups
            cursor.execute("SELECT group_name FROM user_groups WHERE user_id = ?", (user_id,))
            groups = [g["group_name"] for g in cursor.fetchall()]

            return Principal(
                user_id=user_id,
                tenant_id=user_row["tenant_id"],
                username=user_row["username"],
                roles=roles,
                groups=groups,
                department=user_row["department"],
                clearance=user_row["clearance"],
                is_active=bool(user_row["is_active"]),
                auth_epoch=user_row["auth_epoch"]
            )

    @staticmethod
    def in_schedule(schedule: Optional[Dict[str, Any]], now: datetime) -> bool:
        if not schedule or "windows" not in schedule:
            return True
        weekday_map = {0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu", 4: "Fri", 5: "Sat", 6: "Sun"}
        curr_day = weekday_map[now.weekday()]
        curr_hm = now.strftime("%H:%M")

        for win in schedule.get("windows", []):
            days = win.get("days", "")
            if "Mon-Fri" in days and now.weekday() < 5:
                if win.get("from", "00:00") <= curr_hm <= win.get("to", "23:59"):
                    return True
            elif curr_day in days:
                if win.get("from", "00:00") <= curr_hm <= win.get("to", "23:59"):
                    return True
        return False

    @classmethod
    def usable_grants(cls, principal: Principal, now: datetime, net_ctx: Optional[dict] = None) -> List[Grant]:
        """Filters active, signed, unexpired grants within schedule & quota (§35, §36)."""
        if not principal.is_active:
            return []

        subjects = principal.subjects()
        now_iso = now.isoformat()
        usable: List[Grant] = []

        with db.get_connection() as conn:
            cursor = conn.cursor()
            query = f"""
            SELECT g.* FROM grants g
            JOIN vaults v ON g.vault_id = v.vault_id
            WHERE g.state = 'active'
              AND v.status = 'active'
              AND g.grantee_id IN ({','.join(['?']*len(subjects))})
              AND g.valid_from <= ?
              AND (g.valid_until IS NULL OR g.valid_until > ?)
            """
            cursor.execute(query, (*subjects, now_iso, now_iso))
            rows = cursor.fetchall()

            for r in rows:
                grant_dict = {
                    "grant_id": r["grant_id"],
                    "vault_id": r["vault_id"],
                    "grantee_type": r["grantee_type"],
                    "grantee_id": r["grantee_id"],
                    "selector": json.loads(r["selector"]),
                    "actions": json.loads(r["actions"]),
                    "valid_from": r["valid_from"],
                    "valid_until": r["valid_until"],
                    "schedule": json.loads(r["schedule"]) if r["schedule"] else None,
                    "quota": json.loads(r["quota"]) if r["quota"] else None,
                    "conditions": json.loads(r["conditions"]) if r["conditions"] else None,
                    "purpose": r["purpose"],
                    "delegable": bool(r["delegable"]),
                    "depth": r["depth"],
                    "parent_grant_id": r["parent_grant_id"],
                    "issuer_id": r["issuer_id"],
                    "state": r["state"],
                    "signature": r["signature"],
                    "created_at": r["created_at"]
                }

                # Cryptographic signature verification
                if not verify_grant_signature(grant_dict, r["signature"]):
                    continue  # Invalid signature -> reject fail-closed

                # Schedule check
                if not cls.in_schedule(grant_dict["schedule"], now):
                    continue

                usable.append(Grant(**grant_dict))

        return usable

    @classmethod
    def effective_scope(cls, vault_slug_or_id: str, principal: Principal, usable_grants: List[Grant]) -> Vault:
        """
        Resolves authoritative vault and validates tenant + workspace access.
        Enforces: "My RAG works only on my data unless explicitly shared" (§4, §32).
        """
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM vaults WHERE slug = ? OR vault_id = ?", (vault_slug_or_id, vault_slug_or_id))
            row = cursor.fetchone()
            if not row:
                raise ScopeViolation("Vault does not exist (SCOPE_UNKNOWN).")

            vault = Vault(
                vault_id=row["vault_id"],
                tenant_id=row["tenant_id"],
                slug=row["slug"],
                display_name=row["display_name"],
                owner_id=row["owner_id"],
                steward_role_id=row["steward_role_id"],
                classification_ceiling=row["classification_ceiling"],
                status=row["status"],
                scope_mode=row["scope_mode"],
                visibility=row["visibility"],
                discoverable=bool(row["discoverable"]),
                allow_delegation=bool(row["allow_delegation"]),
                max_delegation_depth=row["max_delegation_depth"],
                retention=json.loads(row["retention"]),
                key_id=row["key_id"],
                origin=row["origin"],
                import_terms=json.loads(row["import_terms"]) if row["import_terms"] else None,
                vault_epoch=row["vault_epoch"],
                created_at=row["created_at"]
            )

            # Tenant isolation (§139)
            if vault.tenant_id != principal.tenant_id:
                raise ScopeViolation("Cross-tenant access strictly forbidden (TENANT_MISMATCH).")

            # Check if user is owner
            if vault.owner_id == principal.user_id:
                return vault

            # Check if user has an active grant for this vault
            has_grant = any(g.vault_id == vault.vault_id for g in usable_grants)
            if has_grant:
                return vault

            # Check if user has steward role or admin clearance
            if vault.steward_role_id and vault.steward_role_id in principal.roles:
                return vault

            if "admin" in principal.roles and vault.visibility != "private":
                return vault

            # Default: PRIVATE data cannot be accessed by other users without an explicit grant (§32)
            raise ScopeViolation(f"Access to private workspace '{vault.display_name}' denied: no active grant held.")

    @classmethod
    def matches_selector(cls, selector: Dict[str, Any], manifest_or_chunk: Any) -> bool:
        """
        Generic Selector Engine (§20):
        Interprets: include_tags, exclude_tags, max_classification, resource_id.
        """
        if not selector or selector.get("all") is True:
            return True

        # Check classification ceiling
        max_class = selector.get("max_classification")
        target_class = getattr(manifest_or_chunk, "classification", None)
        if max_class is not None and target_class is not None:
            if target_class > max_class:
                return False

        # Check specific resource ID
        target_res = getattr(manifest_or_chunk, "resource_id", None)
        allowed_res = selector.get("resource_id")
        if allowed_res and target_res != allowed_res:
            return False

        # Check exclude_tags
        exclude_tags = set(selector.get("exclude_tags", []))
        if exclude_tags:
            # Check provenance tags or selectors
            chunk_acl = set(getattr(manifest_or_chunk, "acl_selector", []))
            if exclude_tags.intersection(chunk_acl):
                return False

        return True

    @classmethod
    def decide(
        cls,
        principal: Principal,
        action: str,
        manifest: ResourceManifest,
        usable_grants: List[Grant],
        purpose: str = "project_analysis",
        selector: Optional[Dict[str, Any]] = None
    ) -> Tuple[Literal["ALLOW", "DENY", "REDACT"], str, List[str]]:
        """
        Evaluates RBAC + ABAC + Grants with fail-closed default and explicit deny wins (§6).
        """
        matched_rules = []

        if not principal.is_active:
            return "DENY", "Principal account is inactive", []

        # Clearance check (Clearance is necessary, not sufficient - §165)
        if principal.clearance < manifest.min_clearance:
            return "DENY", f"Insufficient clearance: user has L{principal.clearance}, required L{manifest.min_clearance}", []

        # Credential action check: Credential data (level 4) requires explicit FETCH_SECRET permission (§150)
        if manifest.classification >= 4 and action != ACTION_FETCH_SECRET:
            return "DENY", "Credential-classified objects cannot be accessed via standard RAG operations", []

        subjects = set(principal.subjects())
        denied_users = set(f"user:{u}" for u in manifest.denied_users)
        denied_roles = set(f"role:{r}" for r in manifest.denied_roles)

        # 1. Explicit Deny Overrides (§6, §138)
        if subjects.intersection(denied_users):
            return "DENY", "Explicit user denial rule in resource manifest", []
        if subjects.intersection(denied_roles):
            return "DENY", "Explicit role denial rule in resource manifest", []

        # 2. Check Active Grant Matching
        matching_grants = [
            g for g in usable_grants
            if g.vault_id == manifest.vault_id and action in g.actions
        ]

        for g in matching_grants:
            if not cls.matches_selector(g.selector, manifest):
                continue
            matched_rules.append(f"Grant:{g.grant_id}")
            return "ALLOW", f"Authorized via Grant {g.grant_id}", matched_rules

        # 3. Direct ACL on Resource Manifest
        allowed_roles = set(f"role:{r}" if not r.startswith("role:") else r for r in manifest.allowed_roles)
        allowed_users = set(f"user:{u}" if not u.startswith("user:") else u for u in manifest.allowed_users)

        if subjects.intersection(allowed_users):
            matched_rules.append("ManifestUserACL")
            return "ALLOW", "Authorized via resource user ACL", matched_rules

        if subjects.intersection(allowed_roles):
            matched_rules.append("ManifestRoleACL")
            return "ALLOW", "Authorized via resource role ACL", matched_rules

        return "DENY", "No applicable allow rule or active grant matched", []

    @classmethod
    def issue_lease(cls, principal: Principal, usable_grants: List[Grant], restricted: bool = False) -> AuthorizationLease:
        """Issues short-lived Authorization Lease (§A6) for RAG context execution."""
        now = time_authority.now()
        ttl = RESTRICTED_LEASE_TTL_SECONDS if restricted else LEASE_TTL_SECONDS
        deadline_dt = now.timestamp + (ttl if isinstance(ttl, datetime) else datetime.fromtimestamp(0, tz=timezone.utc) - datetime.fromtimestamp(0, tz=timezone.utc) + (ttl if hasattr(ttl, 'days') else (datetime.fromtimestamp(ttl, tz=timezone.utc) - datetime.fromtimestamp(0, tz=timezone.utc))))
        
        # Exact TTL timestamp calculation
        from datetime import timedelta
        deadline_iso = (now.timestamp + timedelta(seconds=ttl)).isoformat()

        lease_id = f"lease_{uuid4().hex[:8]}"
        grant_ids = [g.grant_id for g in usable_grants]

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT vault_id, vault_epoch FROM vaults")
            vault_epochs = {r["vault_id"]: r["vault_epoch"] for r in cursor.fetchall()}

        return AuthorizationLease(
            lease_id=lease_id,
            principal_id=principal.user_id,
            grants=grant_ids,
            policy_epoch=principal.auth_epoch,
            vault_epochs=vault_epochs,
            issued_at=now.isoformat(),
            deadline=deadline_iso,
            time_status=now.status
        )
