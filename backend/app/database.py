import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from .config import DB_PATH, MIN_SENSITIVE_AGGREGATE_GROUP_SIZE
from .crypto import compute_audit_hash

class Database:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self.init_schema()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")  # High concurrency WAL mode
        return conn

    def init_schema(self):
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 1. Users & Identity
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                department TEXT NOT NULL,
                clearance INTEGER NOT NULL DEFAULT 1,
                is_active INTEGER NOT NULL DEFAULT 1,
                auth_epoch INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS roles (
                role_id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                description TEXT
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS role_assignments (
                user_id TEXT NOT NULL,
                role_id TEXT NOT NULL,
                valid_from TEXT NOT NULL,
                valid_until TEXT,
                granted_by TEXT NOT NULL,
                PRIMARY KEY (user_id, role_id, valid_from),
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_groups (
                user_id TEXT NOT NULL,
                group_name TEXT NOT NULL,
                PRIMARY KEY (user_id, group_name),
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );
            """)

            # 2. Vaults / Datasets (§4, §32)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS vaults (
                vault_id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                slug TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                steward_role_id TEXT,
                classification_ceiling INTEGER NOT NULL DEFAULT 2,
                status TEXT NOT NULL DEFAULT 'active',
                scope_mode TEXT NOT NULL DEFAULT 'strict_single',
                visibility TEXT NOT NULL DEFAULT 'private',
                discoverable INTEGER NOT NULL DEFAULT 0,
                allow_delegation INTEGER NOT NULL DEFAULT 1,
                max_delegation_depth INTEGER NOT NULL DEFAULT 1,
                retention TEXT NOT NULL DEFAULT '{}',
                key_id TEXT NOT NULL DEFAULT 'vault_kek',
                origin TEXT NOT NULL DEFAULT 'native',
                import_terms TEXT,
                vault_epoch INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            """)

            # 3. Grants (§35, §36)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS grants (
                grant_id TEXT PRIMARY KEY,
                vault_id TEXT NOT NULL,
                grantee_type TEXT NOT NULL,
                grantee_id TEXT NOT NULL,
                selector TEXT NOT NULL,
                actions TEXT NOT NULL,
                valid_from TEXT NOT NULL,
                valid_until TEXT,
                schedule TEXT,
                quota TEXT,
                conditions TEXT,
                purpose TEXT NOT NULL,
                delegable INTEGER NOT NULL DEFAULT 0,
                depth INTEGER NOT NULL DEFAULT 0,
                parent_grant_id TEXT,
                issuer_id TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'active',
                revoked_at TEXT,
                revoked_by TEXT,
                revoke_reason TEXT,
                signature TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id),
                FOREIGN KEY (parent_grant_id) REFERENCES grants(grant_id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS grant_usage (
                grant_id TEXT PRIMARY KEY,
                queries INTEGER NOT NULL DEFAULT 0,
                evidence INTEGER NOT NULL DEFAULT 0,
                bytes INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (grant_id) REFERENCES grants(grant_id)
            );
            """)

            # 4. JIT Access Requests & Multi-Signature Approvals (§37, §38, §39)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS access_requests (
                request_id TEXT PRIMARY KEY,
                vault_id TEXT NOT NULL,
                requester_id TEXT NOT NULL,
                selector TEXT NOT NULL,
                actions TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL,
                purpose TEXT NOT NULL,
                justification TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'requested',
                required_approvals INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id),
                FOREIGN KEY (requester_id) REFERENCES users(user_id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS access_request_approvals (
                request_id TEXT NOT NULL,
                approver_id TEXT NOT NULL,
                decision TEXT NOT NULL,
                decided_at TEXT NOT NULL,
                PRIMARY KEY (request_id, approver_id),
                FOREIGN KEY (request_id) REFERENCES access_requests(request_id),
                FOREIGN KEY (approver_id) REFERENCES users(user_id)
            );
            """)

            # 5. Resources, Canonical Manifests, and Chunks (§15, §21)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS resources (
                resource_id TEXT PRIMARY KEY,
                vault_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                title TEXT NOT NULL,
                owner_user_id TEXT,
                classification INTEGER NOT NULL,
                current_version INTEGER NOT NULL DEFAULT 1,
                acl_version INTEGER NOT NULL DEFAULT 1,
                content_hash TEXT NOT NULL,
                encrypted_storage_path TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL,
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS resource_manifests (
                resource_id TEXT PRIMARY KEY,
                vault_id TEXT NOT NULL,
                tenant_id TEXT NOT NULL,
                classification INTEGER NOT NULL,
                allowed_roles TEXT NOT NULL,
                allowed_groups TEXT NOT NULL,
                allowed_users TEXT NOT NULL,
                denied_users TEXT NOT NULL,
                denied_roles TEXT NOT NULL,
                min_clearance INTEGER NOT NULL DEFAULT 1,
                operations TEXT NOT NULL,
                policy_version INTEGER NOT NULL DEFAULT 1,
                acl_version INTEGER NOT NULL DEFAULT 1,
                FOREIGN KEY (resource_id) REFERENCES resources(resource_id),
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS chunks (
                chunk_id TEXT PRIMARY KEY,
                resource_id TEXT NOT NULL,
                vault_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                classification INTEGER NOT NULL,
                min_clearance INTEGER NOT NULL,
                acl_selector TEXT NOT NULL,
                deny_selector TEXT NOT NULL,
                provenance TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                storage_path TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (resource_id) REFERENCES resources(resource_id),
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS citation_spans (
                span_id TEXT PRIMARY KEY,
                resource_id TEXT NOT NULL,
                chunk_id TEXT NOT NULL,
                vault_id TEXT NOT NULL,
                locator TEXT NOT NULL,
                exact_quote TEXT NOT NULL,
                FOREIGN KEY (resource_id) REFERENCES resources(resource_id),
                FOREIGN KEY (chunk_id) REFERENCES chunks(chunk_id),
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
            );
            """)

            # 6. Structured Data Tables, Records & Field-Level Policies (§24, §26, §27)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS structured_tables (
                table_id TEXT PRIMARY KEY,
                vault_id TEXT NOT NULL,
                table_name TEXT NOT NULL,
                schema_json TEXT NOT NULL,
                classification INTEGER NOT NULL DEFAULT 1,
                owner_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id),
                UNIQUE (vault_id, table_name)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS structured_records (
                record_id TEXT PRIMARY KEY,
                vault_id TEXT NOT NULL,
                table_name TEXT NOT NULL,
                row_data TEXT NOT NULL,
                classification INTEGER NOT NULL,
                min_clearance INTEGER NOT NULL,
                allowed_roles TEXT NOT NULL,
                denied_roles TEXT NOT NULL,
                owner_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS field_policies (
                policy_id TEXT PRIMARY KEY,
                vault_id TEXT NOT NULL,
                table_name TEXT NOT NULL,
                field_name TEXT NOT NULL,
                classification INTEGER NOT NULL DEFAULT 1,
                min_clearance INTEGER NOT NULL DEFAULT 1,
                allowed_roles TEXT NOT NULL DEFAULT '[]',
                denied_roles TEXT NOT NULL DEFAULT '[]',
                is_sensitive INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id),
                UNIQUE (vault_id, table_name, field_name)
            );
            """)

            # 7. Audit Events & Signed Externalized Checkpoints (§71)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                session_id TEXT,
                action TEXT NOT NULL,
                object_type TEXT NOT NULL,
                object_id TEXT NOT NULL,
                decision TEXT NOT NULL,
                policy_version INTEGER NOT NULL,
                reason_code TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                client_ip TEXT NOT NULL,
                prev_hash TEXT NOT NULL,
                hash TEXT NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_checkpoints (
                checkpoint_id TEXT PRIMARY KEY,
                event_count INTEGER NOT NULL,
                last_event_id INTEGER NOT NULL,
                checkpoint_hash TEXT NOT NULL,
                signature TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """)

            # 8. Federation Nodes, Links & Replay Protection (§48, §49, §224)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS federation_nodes (
                node_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                pubkey TEXT NOT NULL,
                cert_fp TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'active',
                enrolled_at TEXT NOT NULL
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS federation_links (
                link_id TEXT PRIMARY KEY,
                node_id TEXT NOT NULL,
                direction TEXT NOT NULL,
                vault_allowlist TEXT NOT NULL,
                max_classification INTEGER NOT NULL,
                role_map TEXT NOT NULL,
                grant_id TEXT,
                state TEXT NOT NULL DEFAULT 'active',
                FOREIGN KEY (node_id) REFERENCES federation_nodes(node_id)
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS bundle_nonces (
                nonce TEXT PRIMARY KEY,
                bundle_id TEXT NOT NULL,
                sender_node_id TEXT NOT NULL,
                recipient_node_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            );
            """)

            # 9. Performance & Security Indexes (§104)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_role_assign_user ON role_assignments(user_id, valid_until);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_grants_grantee ON grants(grantee_id, vault_id, state);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_grants_valid ON grants(valid_until);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_grants_parent ON grants(parent_grant_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_resources_vault ON resources(vault_id, status);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_res ON chunks(resource_id, vault_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_structured_records_lookup ON structured_records(vault_id, table_name, classification);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_events_lookup ON audit_events(request_id, actor_id);")

            conn.commit()

    def revoke_grant_cascade(self, root_grant_id: str, revoker_id: str, reason: str) -> List[str]:
        """
        Recursively revokes root grant and ALL descendant grants (§42, §265) in a single atomic transaction.
        Returns list of all revoked grant IDs.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Find all descendant grants recursively
            revoked_ids = []
            queue = [root_grant_id]

            while queue:
                curr_id = queue.pop(0)
                revoked_ids.append(curr_id)
                cursor.execute("SELECT grant_id FROM grants WHERE parent_grant_id = ? AND state != 'revoked'", (curr_id,))
                for row in cursor.fetchall():
                    queue.append(row["grant_id"])

            for gid in revoked_ids:
                cursor.execute("""
                UPDATE grants
                SET state = 'revoked', revoked_at = ?, revoked_by = ?, revoke_reason = ?
                WHERE grant_id = ?
                """, (now_iso, revoker_id, reason, gid))

            # Fetch vault IDs affected and increment vault_epoch
            cursor.execute(f"SELECT DISTINCT vault_id FROM grants WHERE grant_id IN ({','.join(['?']*len(revoked_ids))})", revoked_ids)
            vault_ids = [r["vault_id"] for r in cursor.fetchall()]
            for vid in vault_ids:
                cursor.execute("UPDATE vaults SET vault_epoch = vault_epoch + 1 WHERE vault_id = ?", (vid,))

            conn.commit()
            return revoked_ids

    def query_structured_data(
        self,
        principal_roles: List[str],
        principal_clearance: int,
        vault_id: str,
        table_name: str,
        requested_fields: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Executes Structured Query with Row-Level Security (RLS) and Field-Level Projection (§24, §26, §27).
        - Excludes rows exceeding clearance or denied by roles.
        - Excludes/redacts sensitive columns without explicit permission.
        - Enforces minimum aggregate size constraint.
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 1. Fetch Field Policies for the table
            cursor.execute("SELECT * FROM field_policies WHERE vault_id = ? AND table_name = ?", (vault_id, table_name))
            field_policies = {row["field_name"]: row for row in cursor.fetchall()}

            # 2. Fetch rows with RLS predicates
            cursor.execute("""
            SELECT * FROM structured_records
            WHERE vault_id = ? AND table_name = ? AND min_clearance <= ?
            """, (vault_id, table_name, principal_clearance))
            rows = cursor.fetchall()

            authorized_records = []
            for r in rows:
                allowed_roles = json.loads(r["allowed_roles"])
                denied_roles = json.loads(r["denied_roles"])

                # Deny overrides
                if any(role in denied_roles for role in principal_roles):
                    continue

                # Role membership check (if allowed_roles specified)
                if allowed_roles and not any(role in allowed_roles for role in principal_roles):
                    continue

                raw_data = json.loads(r["row_data"])

                # 3. Field-Level Projection (§27)
                projected_data = {}
                for k, v in raw_data.items():
                    if requested_fields and k not in requested_fields:
                        continue

                    # Check field policy
                    f_pol = field_policies.get(k)
                    if f_pol:
                        if principal_clearance < f_pol["min_clearance"]:
                            continue  # Exclude unauthorized field entirely (§216: no schema leakage)
                        f_allowed = json.loads(f_pol["allowed_roles"])
                        f_denied = json.loads(f_pol["denied_roles"])
                        if any(role in f_denied for role in principal_roles):
                            continue
                        if f_allowed and not any(role in f_allowed for role in principal_roles):
                            continue

                    projected_data[k] = v

                if projected_data:
                    authorized_records.append(projected_data)

            return authorized_records

db = Database()
