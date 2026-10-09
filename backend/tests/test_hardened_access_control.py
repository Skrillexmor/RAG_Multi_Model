import pytest
from pathlib import Path
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import jwt
from fastapi.testclient import TestClient

from backend.app.config import (
    JWT_SECRET, JWT_ALGORITHM, ENCRYPTED_DIR
)
from backend.app.models import (
    Principal, Vault, Grant, Chunk, ResourceManifest,
    ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE
)
from backend.app.database import db
from backend.app.crypto import derive_vault_kek, encrypt_to_file, hash_password
from backend.app.session_service import session_service, SessionError
from backend.app.canonical_gate import canonical_gate
from backend.app.api import app

client = TestClient(app)

def create_test_token(user_id: str, username: str, roles: list, clearance: int, session_id: str, jti: str) -> str:
    payload = {
        "sub": username,
        "user_id": user_id,
        "tenant_id": "tenant_primary",
        "roles": roles,
        "clearance": clearance,
        "auth_epoch": 1,
        "jti": jti,
        "session_id": session_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def test_public_registration_cannot_escalate_privilege():
    """T-AUTH-001: Public self-registration assigns safe viewer defaults and no automatic grants."""
    username = f"attacker_{datetime.now().timestamp()}"
    res = client.post("/api/auth/register", json={
        "username": username,
        "password": "Password123!",
        "roles": ["admin", "security_admin"],
        "clearance": 4,
        "department": "Executive"
    })
    assert res.status_code == 200
    data = res.json()
    principal = data["principal"]

    # Must be viewer only, clearance 1
    assert principal["roles"] == ["viewer"]
    assert principal["clearance"] == 1
    assert "admin" not in principal["roles"]
    assert "security_admin" not in principal["roles"]

    # Must have 0 automatic grants
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as c FROM grants WHERE grantee_id = ?", (f"user:{principal['user_id']}",))
        cnt = cursor.fetchone()["c"]
        assert cnt == 0

def test_delete_document_enforces_authorization():
    """T-AUTH-002: Document deletion fails closed with 403 for non-owners and non-admins."""
    # Create test vault owned by Alice
    now_iso = datetime.now(timezone.utc).isoformat()
    test_vault_id = "v_del_test"
    test_res_id = "res_del_test"

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO vaults (vault_id, tenant_id, slug, display_name, owner_id, classification_ceiling, created_at)
            VALUES (?, 'tenant_primary', 'v-del-test', 'Del Test', 'u_alice', 3, ?)
        """, (test_vault_id, now_iso))
        cursor.execute("""
            INSERT OR REPLACE INTO resources (resource_id, vault_id, tenant_id, resource_type, title, classification, content_hash, status, created_at)
            VALUES (?, ?, 'tenant_primary', 'TEXT', 'Doc', 1, 'hash_test_123', 'active', ?)
        """, (test_res_id, test_vault_id, now_iso))
        conn.commit()

    # Bob attempts to delete Alice's document
    bob_sess, bob_jti = session_service.create_session("u_bob")
    bob_token = create_test_token("u_bob", "bob", ["analyst"], 2, bob_sess, bob_jti)

    res = client.delete(f"/api/documents/{test_res_id}", headers={"Authorization": f"Bearer {bob_token}"})
    assert res.status_code == 403
    assert "Unauthorized" in res.json()["detail"]

    # Cleanup
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM resources WHERE resource_id = ?", (test_res_id,))
        cursor.execute("DELETE FROM vaults WHERE vault_id = ?", (test_vault_id,))
        conn.commit()

def test_vault_ownership_strictly_enforced():
    """T-AUTH-003: Non-owner cannot update, delete, or assign grants to a vault."""
    now_iso = datetime.now(timezone.utc).isoformat()
    test_vault_id = "v_owner_test"

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO vaults (vault_id, tenant_id, slug, display_name, owner_id, classification_ceiling, created_at)
            VALUES (?, 'tenant_primary', 'v-owner-test', 'Owner Test', 'u_alice', 3, ?)
        """, (test_vault_id, now_iso))
        conn.commit()

    bob_sess, bob_jti = session_service.create_session("u_bob")
    bob_token = create_test_token("u_bob", "bob", ["analyst"], 2, bob_sess, bob_jti)

    # Bob attempts to update Alice's vault
    u_res = client.put(f"/api/vaults/{test_vault_id}", json={"display_name": "Hacked"}, headers={"Authorization": f"Bearer {bob_token}"})
    assert u_res.status_code == 403

    # Bob attempts to delete Alice's vault
    d_res = client.delete(f"/api/vaults/{test_vault_id}", headers={"Authorization": f"Bearer {bob_token}"})
    assert d_res.status_code == 403

    # Bob attempts to assign permissions to Alice's vault
    a_res = client.post(f"/api/vaults/{test_vault_id}/assign", json={"user_ids": ["user:u_bob"]}, headers={"Authorization": f"Bearer {bob_token}"})
    assert a_res.status_code == 403

    # Cleanup
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM vaults WHERE vault_id = ?", (test_vault_id,))
        conn.commit()

def test_media_endpoint_requires_auth_and_blocks_traversal():
    """T-AUTH-004: /api/media requires authentication and blocks path traversal."""
    # 1. Unauthenticated request rejected
    res = client.get("/api/media/test.png")
    assert res.status_code == 401

    # 2. Path traversal rejected
    alice_sess, alice_jti = session_service.create_session("u_alice")
    alice_token = create_test_token("u_alice", "alice", ["admin"], 4, alice_sess, alice_jti)

    t_res = client.get("/api/media/../../etc/passwd", headers={"Authorization": f"Bearer {alice_token}"})
    assert t_res.status_code in (403, 404)

def test_canonical_gate_fails_closed_when_ciphertext_missing():
    """T-STORE-001: Canonical Gate B fails closed without fallback to SQL content."""
    now_iso = datetime.now(timezone.utc).isoformat()
    test_vault_id = "v_gate_b_test"
    test_res_id = "res_gate_b_test"
    test_chunk_id = "chk_gate_b_missing"

    vault = Vault(
        vault_id=test_vault_id,
        tenant_id="tenant_primary",
        display_name="Gate B Test",
        slug="gate-b-test",
        owner_id="u_alice",
        classification_ceiling=3,
        created_at=now_iso
    )
    principal = Principal(
        user_id="u_alice",
        tenant_id="tenant_primary",
        username="alice",
        roles=["admin"],
        clearance=4,
        is_active=True
    )

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO vaults (vault_id, tenant_id, slug, display_name, owner_id, classification_ceiling, created_at)
            VALUES (?, 'tenant_primary', 'gate-b-test', 'Gate B Test', 'u_alice', 3, ?)
        """, (test_vault_id, now_iso))
        cursor.execute("""
            INSERT OR REPLACE INTO resources (resource_id, vault_id, tenant_id, resource_type, title, classification, content_hash, status, created_at)
            VALUES (?, ?, 'tenant_primary', 'TEXT', 'Doc', 1, 'hash_gate_b_test', 'active', ?)
        """, (test_res_id, test_vault_id, now_iso))
        cursor.execute("""
            INSERT OR REPLACE INTO resource_manifests (
                resource_id, vault_id, tenant_id, classification, allowed_roles, allowed_groups,
                allowed_users, denied_users, denied_roles, min_clearance, operations, policy_version, acl_version
            ) VALUES (?, ?, 'tenant_primary', 1, '["admin"]', '[]', '[]', '[]', '[]', 1, '["query_rag", "retrieve_evidence"]', 1, 1)
        """, (test_res_id, test_vault_id))
        # Insert chunk with plaintext content in SQL, but MISSING storage_path file
        cursor.execute("""
            INSERT OR REPLACE INTO chunks (
                chunk_id, resource_id, vault_id, chunk_index, content, classification,
                min_clearance, acl_selector, deny_selector, provenance, content_hash, storage_path, created_at
            ) VALUES (?, ?, ?, 0, 'Sensitive Plaintext In SQL', 1, 1, '["admin"]', '[]', '{}', 'some_hash', 'nonexistent_file.enc', ?)
        """, (test_chunk_id, test_res_id, test_vault_id, now_iso))
        conn.commit()

    candidate = (Chunk(
        chunk_id=test_chunk_id,
        resource_id=test_res_id,
        vault_id=test_vault_id,
        chunk_index=0,
        content="Sensitive Plaintext In SQL",
        classification=1,
        min_clearance=1,
        acl_selector=["admin"],
        deny_selector=[],
        provenance={},
        content_hash="some_hash",
        storage_path="nonexistent_file.enc",
        created_at=now_iso
    ), 0.95)

    ev_list, excluded = canonical_gate.verify_and_envelope(
        candidates=[candidate],
        principal=principal,
        vault=vault,
        usable_grants=[],
        lease_deadline="2099-01-01T00:00:00Z"
    )

    # Must fail closed: missing .enc file NEVER falls back to database plaintext
    assert len(ev_list) == 0
    assert excluded == 1

    # Cleanup
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM chunks WHERE chunk_id = ?", (test_chunk_id,))
        cursor.execute("DELETE FROM resource_manifests WHERE resource_id = ?", (test_res_id,))
        cursor.execute("DELETE FROM resources WHERE resource_id = ?", (test_res_id,))
        cursor.execute("DELETE FROM vaults WHERE vault_id = ?", (test_vault_id,))
        conn.commit()

def test_session_service_fails_closed_on_revoked_session():
    """T-SESS-001: Missing or revoked sessions fail closed without silent recreation."""
    fake_jti = "jti_fake_unknown_session_12345"

    with pytest.raises(SessionError):
        session_service.validate_session(fake_jti)

    with pytest.raises(SessionError):
        session_service.renew_session(fake_jti)

    status = session_service.get_session_status(fake_jti)
    assert status["is_active"] is False
    assert status["remaining_seconds"] == 0

def test_delete_user_cascades_safely_without_foreign_key_violation():
    """T-USER-001: Deleting a user cleans up all relational foreign keys without IntegrityError."""
    target_uid = f"u_del_test_{uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    # Create admin and target user
    admin_sess, admin_jti = session_service.create_session("u_diana")
    admin_token = create_test_token("u_diana", "diana", ["admin"], 4, admin_sess, admin_jti)

    analyst_sess, analyst_jti = session_service.create_session("u_bob")
    analyst_token = create_test_token("u_bob", "bob", ["analyst"], 2, analyst_sess, analyst_jti)

    # Seed target user and all relational records: sessions, roles, groups, grants, grant_usage, requests
    gid = f"g_del_test_{uuid4().hex[:8]}"
    req_id = f"req_del_test_{uuid4().hex[:8]}"

    with db.get_connection() as conn:
        cursor = conn.cursor()
        # Seed user
        cursor.execute("""
            INSERT INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES (?, 'tenant_primary', ?, 'hash', 'Engineering', 1, 1, 1, ?)
        """, (target_uid, f"del_user_{uuid4().hex[:6]}", now_iso))

        # Seed role assignment
        cursor.execute("""
            INSERT INTO role_assignments (user_id, role_id, valid_from, valid_until, granted_by)
            VALUES (?, 'r_viewer', ?, ?, 'u_alice')
        """, (target_uid, now_iso, now_iso))

        # Seed user group
        cursor.execute("INSERT INTO user_groups (user_id, group_name) VALUES (?, 'Engineering')", (target_uid,))

        # Seed session
        target_sess = f"sess_{uuid4().hex[:8]}"
        target_jti = f"jti_{uuid4().hex[:8]}"
        cursor.execute("""
            INSERT INTO sessions (session_id, user_id, token_jti, created_at, last_active_at, expires_at, is_revoked, inactivity_timeout_seconds)
            VALUES (?, ?, ?, ?, ?, ?, 0, 300)
        """, (target_sess, target_uid, target_jti, now_iso, now_iso, now_iso))

        cursor.execute("SELECT vault_id FROM vaults LIMIT 1")
        v_row = cursor.fetchone()
        valid_vault_id = v_row["vault_id"] if v_row else "v_test"

        # Seed grant and usage
        cursor.execute("""
            INSERT INTO grants (grant_id, vault_id, grantee_type, grantee_id, selector, actions, valid_from, valid_until, purpose, issuer_id, signature, created_at)
            VALUES (?, ?, 'user', ?, '{}', '["query_rag"]', ?, ?, 'Test', 'u_alice', 'sig', ?)
        """, (gid, valid_vault_id, f"user:{target_uid}", now_iso, now_iso, now_iso))

        cursor.execute("INSERT INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 1, 1, 100)", (gid,))

        # Seed access request and approval
        cursor.execute("""
            INSERT INTO access_requests (request_id, vault_id, requester_id, selector, actions, duration_minutes, purpose, justification, created_at)
            VALUES (?, ?, ?, '{}', '["query_rag"]', 60, 'Testing', 'Justification', ?)
        """, (req_id, valid_vault_id, target_uid, now_iso))

        cursor.execute("""
            INSERT INTO access_request_approvals (request_id, approver_id, decision, decided_at)
            VALUES (?, 'u_alice', 'APPROVED', ?)
        """, (req_id, now_iso))

        conn.commit()

    # 1. Non-admin caller rejected with 403
    forbidden_res = client.delete(f"/api/users/{target_uid}", headers={"Authorization": f"Bearer {analyst_token}"})
    assert forbidden_res.status_code == 403

    # 2. Self-deletion rejected with 400
    self_res = client.delete("/api/users/u_diana", headers={"Authorization": f"Bearer {admin_token}"})
    assert self_res.status_code == 400

    # 3. Admin deletes target user cleanly (HTTP 200, ZERO IntegrityError)
    del_res = client.delete(f"/api/users/{target_uid}", headers={"Authorization": f"Bearer {admin_token}"})
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "DELETED"

    # 4. Verify all relational records removed
    with db.get_connection() as conn:
        cursor = conn.cursor()
        assert cursor.execute("SELECT * FROM users WHERE user_id = ?", (target_uid,)).fetchone() is None
        assert cursor.execute("SELECT * FROM sessions WHERE user_id = ?", (target_uid,)).fetchone() is None
        assert cursor.execute("SELECT * FROM role_assignments WHERE user_id = ?", (target_uid,)).fetchone() is None
        assert cursor.execute("SELECT * FROM user_groups WHERE user_id = ?", (target_uid,)).fetchone() is None
        assert cursor.execute("SELECT * FROM grants WHERE grant_id = ?", (gid,)).fetchone() is None
        assert cursor.execute("SELECT * FROM grant_usage WHERE grant_id = ?", (gid,)).fetchone() is None
        assert cursor.execute("SELECT * FROM access_requests WHERE request_id = ?", (req_id,)).fetchone() is None
        assert cursor.execute("SELECT * FROM access_request_approvals WHERE request_id = ?", (req_id,)).fetchone() is None
