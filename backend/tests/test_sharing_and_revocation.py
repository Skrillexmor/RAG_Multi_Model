import os
import sys
import json
import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.database import db
from backend.app.config import ENCRYPTED_DIR
from backend.app.crypto import derive_vault_kek, encrypt_to_file, compute_content_hash
from backend.app.models import Principal
from backend.app.policy_engine import PolicyEngine
from backend.app.access_service import access_service
from backend.app.api import (
    list_system_users,
    assign_vault,
    get_vault_members,
    get_vault_documents,
    list_vaults,
    AssignVaultRequest,
)

@pytest.fixture
def test_setup():
    alice = PolicyEngine.get_principal_by_username("alice")
    bob = PolicyEngine.get_principal_by_username("bob")
    charlie = PolicyEngine.get_principal_by_username("charlie")

    now_iso = datetime.now(timezone.utc).isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT vault_id FROM vaults WHERE vault_id = 'v_fin'")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT OR REPLACE INTO vaults (vault_id, tenant_id, slug, display_name, owner_id, classification_ceiling, origin, vault_epoch, created_at)
                VALUES ('v_fin', 'tenant_primary', 'finance-q3', 'Finance Q3', 'u_alice', 3, 'LOCAL', 1, ?)
            """, (now_iso,))

        # Clean any leftover grants to Charlie in v_fin safely
        cursor.execute("DELETE FROM grant_usage WHERE grant_id IN (SELECT grant_id FROM grants WHERE vault_id = 'v_fin' AND grantee_id = 'user:u_charlie')")
        cursor.execute("UPDATE grants SET parent_grant_id = NULL WHERE vault_id = 'v_fin' AND grantee_id = 'user:u_charlie'")
        cursor.execute("DELETE FROM grants WHERE vault_id = 'v_fin' AND grantee_id = 'user:u_charlie'")

        cursor.execute("SELECT resource_id FROM resources WHERE vault_id = 'v_fin' AND status = 'active'")
        active_res = cursor.fetchall()
        if len(active_res) < 2:
            kek = derive_vault_kek("v_fin")
            for i in range(1, 3):
                rid = f"res_fin_test_0{i}"
                cid = f"chk_fin_test_0{i}"
                title = f"Finance_Report_{i}.txt"
                content = f"Confidential test content for finance report {i}.".encode("utf-8")
                enc_path = ENCRYPTED_DIR / f"{cid}.enc"
                c_hash = encrypt_to_file(content, enc_path, kek)

                cursor.execute("""
                    INSERT OR REPLACE INTO resources (resource_id, vault_id, tenant_id, resource_type, title, classification, status, content_hash, created_at)
                    VALUES (?, 'v_fin', 'tenant_primary', 'TEXT', ?, 1, 'active', ?, ?)
                """, (rid, title, c_hash, now_iso))

                cursor.execute("""
                    INSERT OR REPLACE INTO resource_manifests (resource_id, vault_id, tenant_id, classification, allowed_roles, allowed_groups, allowed_users, denied_users, denied_roles, min_clearance, operations, policy_version, acl_version)
                    VALUES (?, 'v_fin', 'tenant_primary', 1, '["analyst"]', '[]', '["user:u_alice"]', '[]', '[]', 1, '["query_rag", "retrieve_evidence", "view_source"]', 1, 1)
                """, (rid,))

                cursor.execute("""
                    INSERT OR REPLACE INTO chunks (chunk_id, resource_id, vault_id, chunk_index, content, classification, min_clearance, acl_selector, deny_selector, provenance, content_hash, storage_path, created_at)
                    VALUES (?, ?, 'v_fin', 0, '', 1, 1, '["analyst"]', '[]', ?, ?, ?, ?)
                """, (cid, rid, json.dumps({"source": title, "page": 1}), c_hash, str(enc_path), now_iso))
        conn.commit()

    return {"alice": alice, "bob": bob, "charlie": charlie}

def test_user_directory_listing_for_non_admin(test_setup):
    """Non-admin users must be able to list active organization collaborators for sharing."""
    alice = test_setup["alice"]
    charlie = test_setup["charlie"]

    alice_users_res = list_system_users(alice)
    assert "users" in alice_users_res
    usernames = {u["username"] for u in alice_users_res["users"]}
    assert "alice" in usernames
    assert "bob" in usernames
    assert "charlie" in usernames
    assert "diana" in usernames
    assert "eve" in usernames

    charlie_users_res = list_system_users(charlie)
    charlie_usernames = {u["username"] for u in charlie_users_res["users"]}
    assert "alice" in charlie_usernames
    assert "bob" in charlie_usernames
    assert "charlie" in charlie_usernames

def test_specific_file_access_and_revocation(test_setup):
    """
    Assigning access to a specific file allows the grantee to see ONLY that file,
    and revoking the grant immediately terminates visibility.
    """
    alice = test_setup["alice"]
    charlie = test_setup["charlie"]

    # 1. Look up vault v and a specific resource
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT vault_id, slug FROM vaults WHERE vault_id = 'v_fin'")
        vault_row = cursor.fetchone()
        assert vault_row is not None
        v_slug = vault_row["slug"]
        v_id = vault_row["vault_id"]

        cursor.execute("SELECT resource_id FROM resources WHERE vault_id = ? AND status = 'active' LIMIT 2", (v_id,))
        res_rows = cursor.fetchall()
        if len(res_rows) < 1:
            pytest.skip("Not enough resources in vault to test file-level isolation")
        
        target_res_id = res_rows[0]["resource_id"]

    # 2. Assign ONLY target_res_id to Charlie
    assign_req = AssignVaultRequest(
        user_ids=["charlie"],
        actions=["query_rag", "retrieve_evidence"],
        valid_hours=48,
        resource_id=target_res_id
    )
    assign_res = assign_vault(v_slug, assign_req, alice)
    assert assign_res["status"] == "SUCCESS"
    assert assign_res["grants_created"] >= 1

    # 3. Check Charlie's document visibility: Charlie MUST see target_res_id
    c_docs = get_vault_documents(v_slug, charlie)
    c_doc_ids = {d["resource_id"] for d in c_docs["documents"]}
    assert target_res_id in c_doc_ids

    # 4. Check active members metadata returned to steward
    members_res = get_vault_members(v_slug, alice)
    c_grants = [m for m in members_res["members"] if "charlie" in m["grantee_id"] and m.get("resource_id") == target_res_id]
    assert len(c_grants) >= 1
    grant_to_revoke = c_grants[0]["grant_id"]

    # 5. Revoke the grant
    revoked_ids = access_service.revoke_grant(grant_to_revoke, alice, "Test Revocation")
    assert grant_to_revoke in revoked_ids

    # 6. Check Charlie's document visibility after revocation: target_res_id MUST NOT be visible
    c_docs_after = get_vault_documents(v_slug, charlie)
    c_doc_ids_after = {d["resource_id"] for d in c_docs_after["documents"]}
    assert target_res_id not in c_doc_ids_after

def test_gate_a_and_b_strictly_enforce_file_level_isolation(test_setup):
    """
    When Charlie is only granted access to a single file, Gate A must never return
    candidates from unshared files, and Gate B must strictly DENY unshared files
    even if Charlie holds a generic role matching the manifest.
    """
    import json
    from backend.app.policy_compiler import PolicyCompiler
    from backend.app.models import ResourceManifest, ACTION_RETRIEVE_EVIDENCE
    from backend.app.time_authority import time_authority

    alice = test_setup["alice"]
    charlie = test_setup["charlie"]

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT vault_id, slug FROM vaults WHERE vault_id = 'v_fin'")
        vault_row = cursor.fetchone()
        assert vault_row is not None
        v_slug = vault_row["slug"]
        v_id = vault_row["vault_id"]

        cursor.execute("SELECT resource_id FROM resources WHERE vault_id = ? AND status = 'active' LIMIT 2", (v_id,))
        res_rows = cursor.fetchall()
        if len(res_rows) < 2:
            pytest.skip("Need at least 2 resources to test cross-file isolation")
        
        granted_res_id = res_rows[0]["resource_id"]
        unshared_res_id = res_rows[1]["resource_id"]

    # 1. Alice grants Charlie access to ONLY granted_res_id
    assign_req = AssignVaultRequest(
        user_ids=["charlie"],
        actions=["query_rag", "retrieve_evidence"],
        valid_hours=48,
        resource_id=granted_res_id
    )
    assign_res = assign_vault(v_slug, assign_req, alice)
    assert assign_res["status"] == "SUCCESS"

    now = time_authority.now()
    usable = PolicyEngine.usable_grants(charlie, now.timestamp)
    vault = PolicyEngine.effective_scope(v_slug, charlie, usable)
    lease = PolicyEngine.issue_lease(charlie, usable)

    # 2. Gate A compilation with resource_id = None ("All Files in Folder")
    compiled_all = PolicyCompiler.compile_retrieval_filter(charlie, vault, lease, usable, resource_id=None)
    ast_all = compiled_all.to_dict()
    res_clause = next((c for c in ast_all["must"] if c.get("key") == "resource_id"), None)
    assert res_clause is not None
    if "value" in res_clause["match"]:
        assert res_clause["match"]["value"] == granted_res_id
    elif "any" in res_clause["match"]:
        assert granted_res_id in res_clause["match"]["any"]
        assert unshared_res_id not in res_clause["match"]["any"]

    # 3. Gate A compilation with explicit unshared resource_id
    compiled_unshared = PolicyCompiler.compile_retrieval_filter(charlie, vault, lease, usable, resource_id=unshared_res_id)
    ast_unshared = compiled_unshared.to_dict()
    unshared_clause = next((c for c in ast_unshared["must"] if c.get("key") == "resource_id"), None)
    assert unshared_clause is not None
    assert unshared_clause["match"]["value"] == "__UNAUTHORIZED_RESOURCE__"

    # 4. Gate B canonical decision check on both resources
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM resource_manifests WHERE resource_id = ?", (granted_res_id,))
        m_row_g = cursor.fetchone()
        cursor.execute("SELECT * FROM resource_manifests WHERE resource_id = ?", (unshared_res_id,))
        m_row_u = cursor.fetchone()

    manifest_granted = ResourceManifest(
        resource_id=m_row_g["resource_id"],
        vault_id=m_row_g["vault_id"],
        tenant_id=m_row_g["tenant_id"],
        classification=m_row_g["classification"],
        allowed_roles=json.loads(m_row_g["allowed_roles"]),
        allowed_groups=json.loads(m_row_g["allowed_groups"]),
        allowed_users=json.loads(m_row_g["allowed_users"]),
        denied_users=json.loads(m_row_g["denied_users"]),
        denied_roles=json.loads(m_row_g["denied_roles"]),
        min_clearance=m_row_g["min_clearance"],
        operations=json.loads(m_row_g["operations"]),
        policy_version=m_row_g["policy_version"],
        acl_version=m_row_g["acl_version"]
    )
    manifest_unshared = ResourceManifest(
        resource_id=m_row_u["resource_id"],
        vault_id=m_row_u["vault_id"],
        tenant_id=m_row_u["tenant_id"],
        classification=m_row_u["classification"],
        allowed_roles=json.loads(m_row_u["allowed_roles"]),
        allowed_groups=json.loads(m_row_u["allowed_groups"]),
        allowed_users=json.loads(m_row_u["allowed_users"]),
        denied_users=json.loads(m_row_u["denied_users"]),
        denied_roles=json.loads(m_row_u["denied_roles"]),
        min_clearance=m_row_u["min_clearance"],
        operations=json.loads(m_row_u["operations"]),
        policy_version=m_row_u["policy_version"],
        acl_version=m_row_u["acl_version"]
    )

    # Granted file MUST be ALLOWED
    dec_g, reason_g, _ = PolicyEngine.decide(charlie, ACTION_RETRIEVE_EVIDENCE, manifest_granted, usable, vault=vault)
    assert dec_g == "ALLOW"

    # Unshared file MUST be DENIED even if Charlie's role matches allowed_roles
    dec_u, reason_u, _ = PolicyEngine.decide(charlie, ACTION_RETRIEVE_EVIDENCE, manifest_unshared, usable, vault=vault)
    assert dec_u == "DENY"
    assert any(phrase in reason_u for phrase in ("Resource not shared", "No applicable allow rule", "DENY"))

    # Cleanup grant
    members_res = get_vault_members(v_slug, alice)
    c_grants = [m for m in members_res["members"] if "charlie" in m["grantee_id"] and m.get("resource_id") == granted_res_id]
    for g in c_grants:
        access_service.revoke_grant(g["grant_id"], alice, "Test Cleanup")

def test_rag_query_with_charlie_isolated_to_single_file(test_setup):
    """
    Simulates the exact user scenario:
    1. Charlie queries vault with "All Files in Folder" (resource_id=None).
    2. Charlie has grant ONLY for file A.
    3. Gate A and Gate B must only retrieve and authorize chunks from file A.
    4. Upon grant revocation, Charlie's query must immediately fail with HTTP 403.
    """
    from fastapi import HTTPException
    from backend.app.api import query_rag, QueryRequest

    alice = test_setup["alice"]
    charlie = test_setup["charlie"]

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT vault_id, slug FROM vaults WHERE vault_id = 'v_fin'")
        vault_row = cursor.fetchone()
        assert vault_row is not None
        v_slug = vault_row["slug"]
        v_id = vault_row["vault_id"]

        cursor.execute("SELECT resource_id FROM resources WHERE vault_id = ? AND status = 'active' LIMIT 2", (v_id,))
        res_rows = cursor.fetchall()
        if len(res_rows) < 2:
            pytest.skip("Need at least 2 resources to test cross-file isolation in RAG")
        
        granted_res_id = res_rows[0]["resource_id"]
        unshared_res_id = res_rows[1]["resource_id"]

    # 1. Alice grants Charlie access to ONLY granted_res_id
    assign_req = AssignVaultRequest(
        user_ids=["charlie"],
        actions=["query_rag", "retrieve_evidence"],
        valid_hours=48,
        resource_id=granted_res_id
    )
    assign_res = assign_vault(v_slug, assign_req, alice)
    assert assign_res["status"] == "SUCCESS"

    class DummyClient:
        host = "127.0.0.1"

    class DummyRequest:
        client = DummyClient()

    # 2. Charlie queries with resource_id=None ("All Files in Folder")
    rag_req = QueryRequest(
        vault_slug=v_slug,
        query="which document you have?",
        resource_id=None,
        retrieval_mode="LOW"
    )
    response = query_rag(req=rag_req, request=DummyRequest(), principal=charlie)
    assert response is not None
    assert response.answer is not None

    # All returned evidence MUST belong ONLY to the granted resource
    evidence_res_ids = {ev.resource_id for ev in response.evidence_items}
    assert unshared_res_id not in evidence_res_ids
    if evidence_res_ids:
        assert evidence_res_ids == {granted_res_id}

    # 3. Alice REVOKES the grant for granted_res_id
    members_res = get_vault_members(v_slug, alice)
    c_grants = [m for m in members_res["members"] if "charlie" in m["grantee_id"] and m.get("resource_id") == granted_res_id]
    assert len(c_grants) >= 1
    grant_id = c_grants[0]["grant_id"]
    revoked_ids = access_service.revoke_grant(grant_id, alice, "Test Revoke")
    assert grant_id in revoked_ids

    # 4. Charlie attempts RAG query after revocation -> MUST BE REJECTED 403
    with pytest.raises(HTTPException) as exc_info:
        query_rag(req=rag_req, request=DummyRequest(), principal=charlie)
    assert exc_info.value.status_code == 403
