import sys
import os
from pathlib import Path
from datetime import datetime, timezone, timedelta
import json
from uuid import uuid4

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.database import db
from backend.app.crypto import sign_grant_payload, hash_password
from backend.app.ingestion import ingestion_pipeline
from backend.app.federation import federation_service
from backend.app.audit import audit_service
from backend.app.time_authority import time_authority
from backend.app.models import (
    ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE,
    ACTION_DOWNLOAD_DOCUMENT, ACTION_SHARE_DATA, ACTION_DELEGATE_PERMISSION,
    ACTION_VIEW_AUDIT, ACTION_FETCH_SECRET
)

def seed_database():
    print("[*] Initializing and seeding DARS-RAG production database...")
    now = time_authority.now().timestamp
    now_iso = now.isoformat()
    two_days_later = (now + timedelta(days=2)).isoformat()
    one_hour_later = (now + timedelta(hours=1)).isoformat()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        # Drop all tables to recreate with latest schema
        tables = [
            "audit_checkpoints", "audit_events", "bundle_nonces", "federation_links",
            "federation_nodes", "field_policies", "structured_records", "structured_tables",
            "citation_spans", "chunks", "resource_manifests", "resources", "grant_usage",
            "grants", "access_request_approvals", "access_requests", "vaults",
            "role_assignments", "roles", "user_groups", "users"
        ]
        for tbl in tables:
            cursor.execute(f"DROP TABLE IF EXISTS {tbl};")
        conn.commit()

    # Re-initialize latest schema
    db.init_schema()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        # 1. Seed Roles
        roles = [
            ("r_admin", "admin", "System and Security Administrator"),
            ("r_analyst", "analyst", "Finance / Data Analyst"),
            ("r_hr", "hr", "Human Resources Specialist"),
            ("r_engineer", "engineer", "Core Engineering Team"),
            ("r_viewer", "viewer", "Standard Organization Viewer"),
            ("r_auditor", "auditor", "Independent Compliance Auditor"),
            ("r_guest", "guest", "Untrusted External Contractor")
        ]
        for rid, rname, rdesc in roles:
            cursor.execute("INSERT INTO roles (role_id, name, description) VALUES (?, ?, ?)", (rid, rname, rdesc))

        # 2. Seed Users with Real Argon2id Password Hashes (§3.2, §239)
        users = [
            ("u_alice", "alice", "Finance", 2, 1, "alice123"),
            ("u_bob", "bob", "HR", 2, 1, "bob123"),
            ("u_charlie", "charlie", "Engineering", 2, 1, "charlie123"),
            ("u_diana", "diana", "Security", 3, 1, "diana123"),
            ("u_eve", "eve", "Audit", 1, 1, "eve123"),
        ]
        for uid, uname, udept, uclearance, uepoch, raw_pwd in users:
            pwd_hash = hash_password(raw_pwd)
            cursor.execute("""
            INSERT INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES (?, 'tenant_primary', ?, ?, ?, ?, 1, ?, ?)
            """, (uid, uname, pwd_hash, udept, uclearance, uepoch, now_iso))

        # 3. Seed Role Assignments
        assignments = [
            ("u_alice", "r_analyst"),
            ("u_alice", "r_viewer"),
            ("u_bob", "r_hr"),
            ("u_bob", "r_viewer"),
            ("u_charlie", "r_engineer"),
            ("u_charlie", "r_viewer"),
            ("u_diana", "r_admin"),
            ("u_diana", "r_viewer"),
            ("u_eve", "r_auditor"),
            ("u_eve", "r_viewer"),
        ]
        for uid, rid in assignments:
            cursor.execute("""
            INSERT INTO role_assignments (user_id, role_id, valid_from, valid_until, granted_by)
            VALUES (?, ?, ?, ?, 'system')
            """, (uid, rid, now_iso, two_days_later))

        # 4. Seed User Groups
        groups = [
            ("u_alice", "group:finance"),
            ("u_bob", "group:hr"),
            ("u_charlie", "group:engineering"),
            ("u_diana", "group:security"),
            ("u_eve", "group:compliance"),
        ]
        for uid, grp in groups:
            cursor.execute("INSERT INTO user_groups (user_id, group_name) VALUES (?, ?)", (uid, grp))

        # 5. Seed Vaults / Workspaces (§4, §151)
        vaults_data = [
            ("v_alpha", "project-alpha", "Project Alpha Knowledge Base", "u_alice", "r_analyst", 4, "private", 1),
            ("v_fin", "finance-q3", "Finance Q3 Executive Vault", "u_alice", "r_analyst", 2, "private", 1),
            ("v_hr", "hr-personnel", "HR Restricted Personnel Vault", "u_bob", "r_hr", 3, "private", 1),
            ("v_eng", "core-architecture", "Core Engineering Specs", "u_charlie", "r_engineer", 2, "private", 1),
        ]
        for vid, slug, name, owner, steward, ceil, vis, disc in vaults_data:
            cursor.execute("""
            INSERT INTO vaults (
                vault_id, tenant_id, slug, display_name, owner_id, steward_role_id,
                classification_ceiling, status, scope_mode, visibility, discoverable,
                allow_delegation, max_delegation_depth, retention, key_id, origin, vault_epoch, created_at
            ) VALUES (?, 'tenant_primary', ?, ?, ?, ?, ?, 'active', 'strict_single', ?, ?, 1, 3, '{}', 'vault_kek', 'native', 1, ?)
            """, (vid, slug, name, owner, steward, ceil, vis, disc, now_iso))

        # 6. Seed Usable Grants (§35, §36) with full canonical signatures
        grants = [
            # Alice owns Project Alpha & Finance Q3
            {
                "grant_id": "g_alice_alpha",
                "vault_id": "v_alpha",
                "grantee_type": "user",
                "grantee_id": "user:u_alice",
                "selector": {"all": True},
                "actions": [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE, ACTION_SHARE_DATA, ACTION_DELEGATE_PERMISSION],
                "valid_from": now_iso,
                "valid_until": two_days_later,
                "purpose": "project_analysis",
                "delegable": True,
                "depth": 0,
                "parent_grant_id": None,
                "issuer_id": "system"
            },
            {
                "grant_id": "g_alice_fin",
                "vault_id": "v_fin",
                "grantee_type": "user",
                "grantee_id": "user:u_alice",
                "selector": {"all": True},
                "actions": [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE, ACTION_SHARE_DATA, ACTION_DELEGATE_PERMISSION],
                "valid_from": now_iso,
                "valid_until": two_days_later,
                "purpose": "financial_review",
                "delegable": True,
                "depth": 0,
                "parent_grant_id": None,
                "issuer_id": "system"
            },
            # Bob has HR access with exclude_tags on hr-bank details unless elevated
            {
                "grant_id": "g_bob_hr",
                "vault_id": "v_hr",
                "grantee_type": "user",
                "grantee_id": "user:u_bob",
                "selector": {"exclude_tags": ["hr-bank"]},
                "actions": [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE],
                "valid_from": now_iso,
                "valid_until": two_days_later,
                "purpose": "hr_administration",
                "delegable": False,
                "depth": 0,
                "parent_grant_id": None,
                "issuer_id": "system"
            },
            # Charlie has Engineering access
            {
                "grant_id": "g_charlie_eng",
                "vault_id": "v_eng",
                "grantee_type": "user",
                "grantee_id": "user:u_charlie",
                "selector": {"all": True},
                "actions": [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE],
                "valid_from": now_iso,
                "valid_until": two_days_later,
                "purpose": "engineering_development",
                "delegable": False,
                "depth": 0,
                "parent_grant_id": None,
                "issuer_id": "system"
            },
            # Charlie has delegated Engineering slice in Project Alpha from Alice (§115)
            {
                "grant_id": "g_charlie_alpha_eng",
                "vault_id": "v_alpha",
                "grantee_type": "user",
                "grantee_id": "user:u_charlie",
                "selector": {"max_classification": 1, "exclude_tags": ["credentials", "finance", "hr"]},
                "actions": [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE],
                "valid_from": now_iso,
                "valid_until": one_hour_later,
                "purpose": "project_analysis",
                "delegable": False,
                "depth": 1,
                "parent_grant_id": "g_alice_alpha",
                "issuer_id": "u_alice"
            },
            # Diana (Admin) has full system and audit grant
            {
                "grant_id": "g_diana_audit",
                "vault_id": "v_alpha",
                "grantee_type": "user",
                "grantee_id": "user:u_diana",
                "selector": {"all": True},
                "actions": [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_AUDIT],
                "valid_from": now_iso,
                "valid_until": two_days_later,
                "purpose": "audit",
                "delegable": False,
                "depth": 0,
                "parent_grant_id": None,
                "issuer_id": "system"
            }
        ]

        for g in grants:
            sig = sign_grant_payload(g)
            cursor.execute("""
            INSERT INTO grants (
                grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                valid_from, valid_until, purpose, delegable, depth, parent_grant_id,
                issuer_id, state, signature, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
            """, (
                g["grant_id"], g["vault_id"], g["grantee_type"], g["grantee_id"],
                json.dumps(g["selector"]), json.dumps(g["actions"]),
                g["valid_from"], g["valid_until"], g["purpose"],
                1 if g["delegable"] else 0, g["depth"], g["parent_grant_id"],
                g["issuer_id"], sig, now_iso
            ))
            cursor.execute("INSERT INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (g["grant_id"],))

        conn.commit()

    # 7. Seed Multi-Modal Documents into Project Alpha (§151: Mixed-Security Dataset)
    print("[*] Ingesting mixed-security document into Project Alpha...")
    ingestion_pipeline.ingest_document(
        vault_id="v_alpha",
        title="Project Alpha Master Dossier",
        resource_type="PDF",
        pages_or_sections=[
            {
                "page": 1,
                "locator": "Section 1: Executive Overview",
                "text": "Project Alpha is the next-generation autonomous enterprise AI platform built for zero-cloud LAN environments. It implements strict data-centric access controls.",
                "classification": 0,  # PUBLIC
                "min_clearance": 0,
                "acl_selector": ["role:viewer", "role:engineer", "role:analyst", "role:hr"],
                "deny_selector": []
            },
            {
                "page": 2,
                "locator": "Section 2: Engineering Architecture",
                "text": "Project Alpha technical architecture features a two-gate retrieval firewall, local FastEmbed ONNX neural vectors, and zero external cloud network calls.",
                "classification": 1,  # INTERNAL
                "min_clearance": 1,
                "acl_selector": ["role:engineer", "role:admin"],
                "deny_selector": []
            },
            {
                "page": 3,
                "locator": "Section 3: Financial Budget Q3",
                "text": "Project Alpha approved capital expenditure for Q3 is 8.5 crore rupees allocated to local server clusters and neural inference accelerators.",
                "classification": 2,  # CONFIDENTIAL
                "min_clearance": 2,
                "acl_selector": ["role:analyst", "role:admin"],
                "deny_selector": []
            },
            {
                "page": 4,
                "locator": "Section 4: Personnel Compensation",
                "text": "Project Alpha lead engineer salary benchmark is 45 lakh rupees per annum with performance bonuses administered by HR. BANK: HDFC-0092-8871-3329.",
                "classification": 3,  # RESTRICTED
                "min_clearance": 2,
                "acl_selector": ["role:hr", "role:admin", "hr-bank"],
                "deny_selector": ["role:engineer"]
            },
            {
                "page": 5,
                "locator": "Section 5: Fake Infrastructure Credential",
                "text": "Database Root Password: password=DEMO-FAKE-SECRET-NOT-REAL-9938! API Key: AKIA-FAKE-DEMO-ONLY-SECURE-KEY-2026. Keep strictly offline.",
                "classification": 4,  # CREDENTIAL (§150)
                "min_clearance": 3,
                "acl_selector": ["role:admin"],
                "deny_selector": ["role:viewer", "role:engineer", "role:analyst", "role:hr"]
            }
        ],
        default_classification=1,
        default_min_clearance=1,
        allowed_roles=["role:viewer", "role:engineer", "role:analyst", "role:hr", "role:admin"]
    )

    # 8. Seed Structured Data Table with RLS & Field Policies (§24, §26)
    print("[*] Ingesting structured employees dataset with RLS...")
    employees_csv = """employee_id,name,department,salary,bank_account
EMP001,Aarav Sharma,Engineering,3500000,HDFC-991288
EMP002,Priya Patel,HR,2400000,ICICI-441209
EMP003,Rohan Verma,Finance,4200000,SBI-772183
EMP004,Ananya Iyer,Engineering,3800000,AXIS-119284
EMP005,Vikram Singh,Finance,5100000,KOTAK-661920
"""
    ingestion_pipeline.ingest_structured_csv(
        vault_id="v_alpha",
        table_name="employees",
        csv_text=employees_csv,
        owner_id="u_alice",
        field_configs={
            "employee_id": {"classification": 1, "min_clearance": 1, "allowed_roles": ["role:viewer", "role:analyst", "role:engineer", "role:hr"]},
            "name": {"classification": 1, "min_clearance": 1, "allowed_roles": ["role:viewer", "role:analyst", "role:engineer", "role:hr"]},
            "department": {"classification": 1, "min_clearance": 1, "allowed_roles": ["role:viewer", "role:analyst", "role:engineer", "role:hr"]},
            "salary": {"classification": 2, "min_clearance": 2, "allowed_roles": ["role:hr", "role:admin"], "is_sensitive": True},
            "bank_account": {"classification": 4, "min_clearance": 3, "allowed_roles": ["role:admin"], "is_sensitive": True}
        }
    )

    # 9. Initial Signed Audit Checkpoint (§71)
    print("[*] Creating initial cryptographic audit checkpoint...")
    audit_service.log_event(
        request_id="seed_genesis",
        actor_id="system",
        action="database_bootstrap",
        object_type="system",
        object_id="genesis",
        decision="ALLOW",
        policy_version=1,
        reason_code="PRODUCTION_SEED_COMPLETED"
    )
    audit_service.create_signed_checkpoint()

    print("[+] Seeding complete! Passwords for demo personas: alice123, bob123, charlie123, diana123, eve123.")

if __name__ == "__main__":
    seed_database()
