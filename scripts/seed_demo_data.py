import sys
import os
from pathlib import Path
from datetime import datetime, timezone, timedelta
import json
from uuid import uuid4

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.database import db
from backend.app.crypto import sign_grant_payload
from backend.app.ingestion import ingestion_pipeline
from backend.app.federation import federation_service
from backend.app.audit import audit_service
from backend.app.time_authority import time_authority

def seed_database():
    print("[*] Initializing and seeding Secure Multi-Modal RAG database...")
    now = time_authority.now().timestamp
    now_iso = now.isoformat()
    two_days_later = (now + timedelta(days=2)).isoformat()
    one_hour_later = (now + timedelta(hours=1)).isoformat()

    with db.get_connection() as conn:
        cursor = conn.cursor()

        # Clean existing tables
        cursor.execute("DELETE FROM audit_events;")
        cursor.execute("DELETE FROM citation_spans;")
        cursor.execute("DELETE FROM chunks;")
        cursor.execute("DELETE FROM resource_manifests;")
        cursor.execute("DELETE FROM resources;")
        cursor.execute("DELETE FROM grant_usage;")
        cursor.execute("DELETE FROM grants;")
        cursor.execute("DELETE FROM access_request_approvals;")
        cursor.execute("DELETE FROM access_requests;")
        cursor.execute("DELETE FROM vaults;")
        cursor.execute("DELETE FROM role_assignments;")
        cursor.execute("DELETE FROM roles;")
        cursor.execute("DELETE FROM user_groups;")
        cursor.execute("DELETE FROM users;")

        # 1. Seed Roles
        roles = [
            ("r_admin", "admin", "System and Security Administrator"),
            ("r_analyst", "analyst", "Finance / Data Analyst"),
            ("r_hr", "hr", "Human Resources Specialist"),
            ("r_engineer", "engineer", "Core Engineering Team"),
            ("r_viewer", "viewer", "Standard Organization Viewer"),
            ("r_guest", "guest", "Untrusted External Contractor")
        ]
        for rid, rname, rdesc in roles:
            cursor.execute("INSERT INTO roles (role_id, name, description) VALUES (?, ?, ?)", (rid, rname, rdesc))

        # 2. Seed Users
        users = [
            ("u_alice", "alice", "Finance", 2, 1),
            ("u_bob", "bob", "HR", 2, 1),
            ("u_charlie", "charlie", "Engineering", 2, 1),
            ("u_diana", "diana", "Security", 3, 1),
            ("u_eve", "eve", "External", 0, 1),
        ]
        for uid, uname, udept, uclearance, uepoch in users:
            cursor.execute("""
            INSERT INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES (?, 'tenant_primary', ?, 'argon2id_mock_hash', ?, ?, 1, ?, ?)
            """, (uid, uname, udept, uclearance, uepoch, now_iso))

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
            ("u_eve", "r_guest"),
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
            ("u_eve", "group:external"),
        ]
        for uid, grp in groups:
            cursor.execute("INSERT INTO user_groups (user_id, group_name) VALUES (?, ?)", (uid, grp))

        # 5. Seed Vaults (Scoped RAGs)
        vaults_data = [
            ("v_fin", "finance-q3", "Finance-Q3 RAG", "u_alice", 2, "active", "strict_single", 1, 1),
            ("v_hr", "hr-policies-2026", "HR-Policies-2026 RAG", "u_bob", 3, "active", "strict_single", 1, 1),
            ("v_eng", "engineering-core", "Engineering-Core RAG", "u_charlie", 2, "active", "strict_single", 1, 1),
            ("v_pub", "company-public", "Company-Public RAG", "u_diana", 0, "active", "strict_single", 1, 1),
        ]
        for vid, vslug, vname, vowner, vceiling, vstatus, vmode, vdisc, vdeleg in vaults_data:
            cursor.execute("""
            INSERT INTO vaults (
                vault_id, tenant_id, slug, display_name, owner_id,
                classification_ceiling, status, scope_mode, discoverable,
                allow_delegation, max_delegation_depth, created_at
            ) VALUES (?, 'tenant_primary', ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)
            """, (vid, vslug, vname, vowner, vceiling, vstatus, vmode, vdisc, vdeleg, now_iso))

        # 6. Helper function to create signed grants
        def add_grant(gid, vid, gtype, gid_val, actions, valid_to, delegable=False, depth=0, parent=None, sel={"all": True}):
            g_dict = {
                "grant_id": gid,
                "vault_id": vid,
                "grantee_type": gtype,
                "grantee_id": gid_val,
                "selector": sel,
                "actions": actions,
                "valid_from": now_iso,
                "valid_until": valid_to,
                "purpose": "demo_evaluation"
            }
            sig = sign_grant_payload(g_dict)
            cursor.execute("""
            INSERT INTO grants (
                grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                valid_from, valid_until, purpose, delegable, depth, parent_grant_id,
                issuer_id, state, signature, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'demo_evaluation', ?, ?, ?, 'u_diana', 'active', ?, ?)
            """, (
                gid, vid, gtype, gid_val, json.dumps(sel), json.dumps(actions),
                now_iso, valid_to, 1 if delegable else 0, depth, parent, sig, now_iso
            ))
            cursor.execute("INSERT INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (gid,))

        # Grants for Alice (Finance)
        add_grant("g_alice_fin", "v_fin", "user", "user:u_alice", ["rag_context", "view", "delegate"], two_days_later, delegable=True)
        add_grant("g_alice_pub", "v_pub", "user", "user:u_alice", ["rag_context", "view"], two_days_later)

        # Grants for Bob (HR)
        add_grant("g_bob_hr", "v_hr", "user", "user:u_bob", ["rag_context", "view"], two_days_later)
        add_grant("g_bob_pub", "v_pub", "user", "user:u_bob", ["rag_context", "view"], two_days_later)

        # Grants for Charlie (Engineering)
        add_grant("g_charlie_eng", "v_eng", "user", "user:u_charlie", ["rag_context", "view"], two_days_later)
        add_grant("g_charlie_pub", "v_pub", "user", "user:u_charlie", ["rag_context", "view"], two_days_later)

        # Grants for Diana (Admin)
        add_grant("g_diana_fin", "v_fin", "user", "user:u_diana", ["rag_context", "view", "download", "export"], two_days_later)
        add_grant("g_diana_hr", "v_hr", "user", "user:u_diana", ["rag_context", "view", "download", "export"], two_days_later)
        add_grant("g_diana_eng", "v_eng", "user", "user:u_diana", ["rag_context", "view", "download", "export"], two_days_later)
        add_grant("g_diana_pub", "v_pub", "user", "user:u_diana", ["rag_context", "view"], two_days_later)

        # Eve has only public access
        add_grant("g_eve_pub", "v_pub", "user", "user:u_eve", ["rag_context", "view"], one_hour_later)

        conn.commit()

    print("[*] Ingesting Multi-Modal Demo Documents...")

    # Document 1: Finance Q3 Budget PDF (Mixed Sensitivity across pages!)
    ingestion_pipeline.ingest_document(
        vault_id="v_fin",
        title="Finance_Q3_Budget_Summary.pdf",
        resource_type="PDF",
        pages_or_sections=[
            {
                "page": 1,
                "locator": "Page 1 - Executive Summary",
                "text": "Project Alpha approved budget for Q3 is ₹8.5 crore ($1.02M USD). Operating expenses are projected at ₹4.2 crore, and capital expenditures are capped at ₹4.3 crore.",
                "classification": 1,
                "min_clearance": 1,
                "acl_selector": ["role:analyst", "role:viewer", "role:admin"],
                "deny_selector": ["role:guest"]
            },
            {
                "page": 2,
                "locator": "Page 2 - Vendor & Hardware Breakdown",
                "text": "Infrastructure vendor allocations: Cloud migration is zero (offline LAN policy). High-performance local GPU workstations allocation is ₹1.8 crore from hardware reserve.",
                "classification": 2,
                "min_clearance": 2,
                "acl_selector": ["role:analyst", "role:admin"],
                "deny_selector": ["role:viewer", "role:guest"]
            },
            {
                "page": 3,
                "locator": "Page 3 - C-Suite Executive Bonus Provisions",
                "text": "Executive Q3 bonus allocation: CFO retention bonus is ₹75 lakhs. BANK: HDFC-0092-PRIV-77. Authorized only for HR Compensation Committee.",
                "classification": 3,
                "min_clearance": 3,
                "acl_selector": ["role:hr", "role:admin"],
                "deny_selector": ["role:analyst", "role:viewer", "role:guest"]
            }
        ],
        default_classification=2,
        default_min_clearance=2,
        allowed_roles=["role:analyst", "role:admin"]
    )

    # Document 2: HR Compensation & Salaries PDF (HR Only)
    ingestion_pipeline.ingest_document(
        vault_id="v_hr",
        title="HR_2026_Compensation_and_Salary_Bands.pdf",
        resource_type="PDF",
        pages_or_sections=[
            {
                "page": 1,
                "locator": "Page 1 - General Benefits Policy",
                "text": "Standard annual paid leave is 24 days. Health insurance coverage extends to dependents up to ₹10 lakhs under Policy H-2026.",
                "classification": 1,
                "min_clearance": 1,
                "acl_selector": ["role:hr", "role:viewer", "role:admin"],
                "deny_selector": ["role:guest"]
            },
            {
                "page": 2,
                "locator": "Page 2 - Employee Salary Benchmarks",
                "text": "Senior HR Manager Bob salary is ₹28,50,000 per annum with a 15% performance bonus. Staff engineer baseline is ₹32,00,000.",
                "classification": 3,
                "min_clearance": 3,
                "acl_selector": ["role:hr", "role:admin"],
                "deny_selector": ["role:analyst", "role:viewer", "role:guest"]
            }
        ],
        default_classification=3,
        default_min_clearance=2,
        allowed_roles=["role:hr", "role:admin"]
    )

    # Document 3: Engineering Architecture Spec (Engineering Only)
    ingestion_pipeline.ingest_document(
        vault_id="v_eng",
        title="Engineering_Architecture_v3_Design.pdf",
        resource_type="PDF",
        pages_or_sections=[
            {
                "page": 1,
                "locator": "Page 1 - Offline LAN Topology",
                "text": "The Secure RAG core gateway operates on port 8000. Qdrant payload filtering isolates data partitions by vault_id. All cloud egress is blocked by host firewall rules.",
                "classification": 1,
                "min_clearance": 1,
                "acl_selector": ["role:engineer", "role:admin"],
                "deny_selector": ["role:guest"]
            },
            {
                "page": 2,
                "locator": "Page 2 - Zero Trust Encryption Engine",
                "text": "AES-256-GCM is used for vault compartments. Master KEK derives Vault KEK via HKDF. Grants are signed with Ed25519 asymmetric keys.",
                "classification": 2,
                "min_clearance": 2,
                "acl_selector": ["role:engineer", "role:admin"],
                "deny_selector": ["role:viewer", "role:guest"]
            }
        ],
        default_classification=2,
        default_min_clearance=1,
        allowed_roles=["role:engineer", "role:admin"]
    )

    # Document 4: Scanned OCR Invoice (Image with Bounding Boxes)
    ingestion_pipeline.ingest_document(
        vault_id="v_fin",
        title="scanned_hardware_invoice_q3.png",
        resource_type="IMAGE_OCR",
        pages_or_sections=[
            {
                "page": 1,
                "locator": "OCR BBox [120, 80, 450, 190]",
                "text": "INVOICE #INV-9902: 4x Nvidia RTX 4090 Workstations supplied by TechCorp Solutions. Subtotal: $45,000 USD. Approved by Finance.",
                "classification": 2,
                "min_clearance": 2,
                "acl_selector": ["role:analyst", "role:admin"],
                "deny_selector": ["role:guest"],
                "bbox": {"x": 120, "y": 80, "w": 450, "h": 190}
            }
        ],
        default_classification=2,
        default_min_clearance=2,
        allowed_roles=["role:analyst", "role:admin"]
    )

    # Document 5: Company Public Handbook
    ingestion_pipeline.ingest_document(
        vault_id="v_pub",
        title="Company_Handbook_Public_2026.pdf",
        resource_type="PDF",
        pages_or_sections=[
            {
                "page": 1,
                "locator": "Section 1 - Core Mission",
                "text": "Company values are Security First, Zero-Trust Privacy, and Customer Transparency. Working hours are Monday to Friday 09:00 to 18:00 IST.",
                "classification": 0,
                "min_clearance": 0,
                "acl_selector": ["role:viewer", "role:analyst", "role:hr", "role:engineer", "role:guest", "role:admin"],
                "deny_selector": []
            }
        ],
        default_classification=0,
        default_min_clearance=0,
        allowed_roles=["role:viewer", "role:guest", "role:admin"]
    )

    # Register initial federation node
    federation_service.register_node("Node-Bangalore-Datacenter")

    # Initial audit entry
    audit_service.log_event(
        request_id="init_genesis",
        actor_id="system",
        action="system_boot",
        object_type="gateway",
        object_id="genesis",
        decision="ALLOW",
        policy_version=1,
        reason_code="SYSTEM_INITIALIZATION_SUCCESS"
    )

    print("[SUCCESS] Database successfully seeded with test users, scoped vaults, multi-modal documents, and cryptographic grants!")

if __name__ == "__main__":
    seed_database()
