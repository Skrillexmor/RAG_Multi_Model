import json
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple, Optional, Literal
from .models import Principal, Grant, Vault, ResourceManifest, AuthorizationLease
from .database import db
from .crypto import verify_grant_signature
from .time_authority import time_authority
from .config import LEASE_TTL_SECONDS, RESTRICTED_LEASE_TTL_SECONDS
from uuid import uuid4

class ScopeViolation(Exception):
    pass

class DelegationViolation(Exception):
    pass

class PolicyEngine:
    """
    Deterministic RBAC + ABAC + Grant policy evaluation engine.
    Follows Master Spec §2, §9, §10 and Architecture v3 §A2, §A5, §A6, §A8.
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
            # e.g. Mon-Fri
            if "Mon-Fri" in days and now.weekday() < 5:
                if win.get("from", "00:00") <= curr_hm <= win.get("to", "23:59"):
                    return True
            elif curr_day in days:
                if win.get("from", "00:00") <= curr_hm <= win.get("to", "23:59"):
                    return True
        return False

    @classmethod
    def usable_grants(cls, principal: Principal, now: datetime, net_ctx: Optional[dict] = None) -> List[Grant]:
        """A5 Grant evaluation algorithm: filters active, signed, unexpired grants within schedule & quota."""
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

            for row in rows:
                grant_dict = {
                    "grant_id": row["grant_id"],
                    "vault_id": row["vault_id"],
                    "grantee_type": row["grantee_type"],
                    "grantee_id": row["grantee_id"],
                    "selector": json.loads(row["selector"]),
                    "actions": json.loads(row["actions"]),
                    "valid_from": row["valid_from"],
                    "valid_until": row["valid_until"],
                    "purpose": row["purpose"]
                }

                # 1. Verify Ed25519 digital signature
                if not verify_grant_signature(grant_dict, row["signature"]):
                    continue  # Tamper detected -> fail closed

                # 2. Schedule check
                schedule = json.loads(row["schedule"]) if row["schedule"] else None
                if not cls.in_schedule(schedule, now):
                    continue

                # 3. Quota check
                quota = json.loads(row["quota"]) if row["quota"] else None
                if quota and "max_queries" in quota:
                    cursor.execute("SELECT queries FROM grant_usage WHERE grant_id = ?", (row["grant_id"],))
                    usage_row = cursor.fetchone()
                    if usage_row and usage_row["queries"] >= quota["max_queries"]:
                        continue

                # 4. Chain validity check (for delegated grants)
                if row["parent_grant_id"]:
                    if not cls._chain_valid(cursor, row["parent_grant_id"], now_iso):
                        continue

                usable.append(Grant(
                    grant_id=row["grant_id"],
                    vault_id=row["vault_id"],
                    grantee_type=row["grantee_type"],
                    grantee_id=row["grantee_id"],
                    selector=grant_dict["selector"],
                    actions=grant_dict["actions"],
                    valid_from=row["valid_from"],
                    valid_until=row["valid_until"],
                    schedule=schedule,
                    quota=quota,
                    purpose=row["purpose"],
                    delegable=bool(row["delegable"]),
                    depth=row["depth"],
                    parent_grant_id=row["parent_grant_id"],
                    issuer_id=row["issuer_id"],
                    state=row["state"],
                    signature=row["signature"],
                    created_at=row["created_at"]
                ))

        return usable

    @classmethod
    def _chain_valid(cls, cursor: sqlite3.Cursor, grant_id: str, now_iso: str, depth: int = 0) -> bool:
        """Recursive check: all ancestor grants must be active and unexpired (§A8)."""
        if depth > 4:
            return False
        cursor.execute("SELECT * FROM grants WHERE grant_id = ?", (grant_id,))
        g = cursor.fetchone()
        if not g or g["state"] != "active":
            return False
        if g["valid_from"] > now_iso or (g["valid_until"] and g["valid_until"] <= now_iso):
            return False
        if g["parent_grant_id"]:
            return cls._chain_valid(cursor, g["parent_grant_id"], now_iso, depth + 1)
        return True

    @classmethod
    def issue_lease(cls, principal: Principal, usable_grants: List[Grant]) -> AuthorizationLease:
        """A6 Authorization Lease issue with context deadline calculation."""
        t = time_authority.now()
        now = t.timestamp

        # Base TTL: 5 min default, or 30s if any granted vault is restricted
        ttl_seconds = LEASE_TTL_SECONDS
        vault_epochs: Dict[str, int] = {}

        with db.get_connection() as conn:
            cursor = conn.cursor()
            for g in usable_grants:
                cursor.execute("SELECT vault_epoch, classification_ceiling FROM vaults WHERE vault_id = ?", (g.vault_id,))
                v = cursor.fetchone()
                if v:
                    vault_epochs[g.vault_id] = v["vault_epoch"]
                    if v["classification_ceiling"] >= 3:
                        ttl_seconds = min(ttl_seconds, RESTRICTED_LEASE_TTL_SECONDS)

        # Context deadline = min(now + ttl, earliest grant valid_until)
        deadline = now + datetime.resolution * ttl_seconds if False else now
        from datetime import timedelta
        candidate_deadline = now + timedelta(seconds=ttl_seconds)

        for g in usable_grants:
            if g.valid_until:
                g_dt = datetime.fromisoformat(g.valid_until)
                if g_dt < candidate_deadline:
                    candidate_deadline = g_dt

        return AuthorizationLease(
            lease_id=str(uuid4()),
            principal_id=principal.user_id,
            grants=[g.grant_id for g in usable_grants],
            policy_epoch=principal.auth_epoch,
            vault_epochs=vault_epochs,
            issued_at=now.isoformat(),
            deadline=candidate_deadline.isoformat(),
            time_status=t.status
        )

    @classmethod
    def effective_scope(cls, vault_slug_or_id: str, usable_grants: List[Grant]) -> Vault:
        """A2 Effective scope resolution: selected ∩ granted ∩ active."""
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM vaults WHERE (slug = ? OR vault_id = ?) AND status = 'active'",
                           (vault_slug_or_id, vault_slug_or_id))
            v_row = cursor.fetchone()
            if not v_row:
                raise ScopeViolation(f"Vault '{vault_slug_or_id}' not found or inactive.")

            vault = Vault(
                vault_id=v_row["vault_id"],
                tenant_id=v_row["tenant_id"],
                slug=v_row["slug"],
                display_name=v_row["display_name"],
                owner_id=v_row["owner_id"],
                classification_ceiling=v_row["classification_ceiling"],
                status=v_row["status"],
                scope_mode=v_row["scope_mode"],
                discoverable=bool(v_row["discoverable"]),
                allow_delegation=bool(v_row["allow_delegation"]),
                max_delegation_depth=v_row["max_delegation_depth"],
                retention=json.loads(v_row["retention"]),
                vault_epoch=v_row["vault_epoch"],
                created_at=v_row["created_at"]
            )

            # Assert at least one usable grant covers this vault with 'rag_context' action
            has_rag_grant = any(g.vault_id == vault.vault_id and "rag_context" in g.actions for g in usable_grants)
            if not has_rag_grant:
                raise ScopeViolation(f"No active 'rag_context' grant held for vault '{vault.display_name}'.")

            return vault

    @classmethod
    def decide(cls, principal: Principal, action: str, manifest: ResourceManifest, usable_grants: List[Grant]) -> Tuple[Literal["ALLOW", "DENY"], str, List[str]]:
        """Point-in-time ABAC decision pipeline (§9, §10, A5)."""
        # 1. Explicit Deny check
        if principal.user_id in manifest.denied_users:
            return "DENY", "EXPLICIT_USER_DENIED", ["RULE_EXPLICIT_USER_DENY"]
        for r in principal.roles:
            if r in manifest.denied_roles:
                return "DENY", f"EXPLICIT_ROLE_DENIED:{r}", ["RULE_EXPLICIT_ROLE_DENY"]

        # 2. Clearance check
        if principal.clearance < manifest.min_clearance:
            return "DENY", f"CLEARANCE_TOO_LOW ({principal.clearance} < {manifest.min_clearance})", ["RULE_MIN_CLEARANCE_FAIL"]

        # 3. Grant & Selector match
        for g in usable_grants:
            if g.vault_id == manifest.vault_id and action in g.actions:
                # Selector check
                sel = g.selector
                if sel.get("all") is True:
                    return "ALLOW", f"GRANT_MATCH:{g.grant_id}", ["GRANT_ACTIVE", "SELECTOR_ALL", "CLEARANCE_OK"]
                max_class = sel.get("max_classification", 3)
                if manifest.classification <= max_class:
                    return "ALLOW", f"GRANT_MATCH:{g.grant_id}", ["GRANT_ACTIVE", "SELECTOR_CLASSIFICATION_OK", "CLEARANCE_OK"]

        # 4. Fallback to resource ACL allowed lists
        for r in principal.roles:
            if r in manifest.allowed_roles:
                return "ALLOW", f"ROLE_ACL_MATCH:{r}", ["ROLE_ACL_MATCH", "CLEARANCE_OK"]
        for grp in principal.groups:
            if grp in manifest.allowed_groups:
                return "ALLOW", f"GROUP_ACL_MATCH:{grp}", ["GROUP_ACL_MATCH", "CLEARANCE_OK"]
        if principal.user_id in manifest.allowed_users:
            return "ALLOW", f"USER_ACL_MATCH:{principal.user_id}", ["USER_ACL_MATCH", "CLEARANCE_OK"]

        return "DENY", "NO_MATCHING_GRANT_OR_ACL", ["DEFAULT_DENY"]
