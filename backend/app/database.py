import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from .config import DB_PATH
from .crypto import compute_audit_hash

class Database:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DB_PATH
        self.init_schema()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    def init_schema(self):
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Users & Identity
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

            # Vaults (Architecture v3 A4)
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
                discoverable INTEGER NOT NULL DEFAULT 1,
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

            # Grants (Architecture v3 A4)
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

            # JIT Access Requests & Approvals
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

            # Resources & Chunks
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
                created_at TEXT NOT NULL,
                FOREIGN KEY (resource_id) REFERENCES resources(resource_id),
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
            );
            """)

            # Citation Spans for Grounding Verification
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

            # Structured Rows (Simulated DB Ingestion with RLS)
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
                created_at TEXT NOT NULL,
                FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
            );
            """)

            # Cryptographic Audit Log with Hash Chain
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

            # Federation & Bundles
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

            conn.commit()

db = Database()
