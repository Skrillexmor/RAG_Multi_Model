import os
import sys
import json
import pytest
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone, timedelta
import jwt
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.api import app
from backend.app.database import db
from backend.app.models import (
    Principal, Vault, Grant, Chunk, ResourceManifest,
    ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE
)
from backend.app.config import JWT_SECRET, JWT_ALGORITHM, ENCRYPTED_DIR
from backend.app.session_service import session_service
from backend.app.access_service import access_service
from backend.app.crypto import derive_vault_kek, encrypt_to_file, compute_content_hash
from backend.app.vector_store import vector_store

client = TestClient(app)

def create_test_token(user_id: str, username: str, roles: list, clearance: int, session_id: str, token_jti: str, tenant_id: str = "tenant_primary") -> str:
    payload = {
        "sub": username,
        "user_id": user_id,
        "tenant_id": tenant_id,
        "roles": roles,
        "clearance": clearance,
        "auth_epoch": 1,
        "jti": token_jti,
        "session_id": session_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

@pytest.fixture(scope="module")
def setup_sharing_and_owner_fixture():
    now_iso = datetime.now(timezone.utc).isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        # Create Owner User Dave with role 'viewer' (non-default role)
        cursor.execute("""
            INSERT OR REPLACE INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES ('u_dave_owner', 'tenant_primary', 'dave_owner', 'hash', 'Engineering', 2, 1, 1, ?)
        """, (now_iso,))
        # Create User Eve (grantee)
        cursor.execute("""
            INSERT OR REPLACE INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES ('u_eve_recipient', 'tenant_primary', 'eve_recipient', 'hash', 'Research', 2, 1, 1, ?)
        """, (now_iso,))
        # Create User Frank (unrelated)
        cursor.execute("""
            INSERT OR REPLACE INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES ('u_frank_stranger', 'tenant_primary', 'frank_stranger', 'hash', 'HR', 1, 1, 1, ?)
        """, (now_iso,))
        conn.commit()

    dave_sess, dave_jti = session_service.create_session("u_dave_owner")
    dave_token = create_test_token("u_dave_owner", "dave_owner", ["viewer"], 2, dave_sess, dave_jti)

    eve_sess, eve_jti = session_service.create_session("u_eve_recipient")
    eve_token = create_test_token("u_eve_recipient", "eve_recipient", ["viewer"], 2, eve_sess, eve_jti)

    frank_sess, frank_jti = session_service.create_session("u_frank_stranger")
    frank_token = create_test_token("u_frank_stranger", "frank_stranger", ["viewer"], 1, frank_sess, frank_jti)

    # Setup Dave's Vault
    vault_id = "v_dave_secure"
    vault_slug = "dave-vault"
    kek = derive_vault_kek(vault_id)

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO vaults (
                vault_id, tenant_id, slug, display_name, owner_id, steward_role_id,
                classification_ceiling, origin, vault_epoch, created_at
            ) VALUES (?, 'tenant_primary', ?, 'Dave Private Vault', 'u_dave_owner', 'r_viewer', 2, 'native', 1, ?)
        """, (vault_id, vault_slug, now_iso))

        # Doc 1: L1 Document owned by Dave
        res1_id = "res_dave_doc_1"
        cursor.execute("""
            INSERT OR REPLACE INTO resources (
                resource_id, vault_id, tenant_id, title, resource_type, classification,
                content_hash, current_version, status, owner_user_id, created_at
            ) VALUES (?, ?, 'tenant_primary', 'Architecture_Guide.md', 'markdown', 1, 'hash_doc1', 1, 'active', 'u_dave_owner', ?)
        """, (res1_id, vault_id, now_iso))

        cursor.execute("""
            INSERT OR REPLACE INTO resource_manifests (
                resource_id, vault_id, tenant_id, classification, min_clearance,
                allowed_roles, allowed_groups, allowed_users, denied_users, denied_roles,
                operations, policy_version, acl_version
            ) VALUES (?, ?, 'tenant_primary', 1, 1, '["role:analyst"]', '[]', '["u_dave_owner"]', '[]', '[]', '["QUERY_RAG", "RETRIEVE_EVIDENCE"]', 1, 1)
        """, (res1_id, vault_id))

        # Doc 2: Private Doc 2 in same vault (NOT shared)
        res2_id = "res_dave_doc_2"
        cursor.execute("""
            INSERT OR REPLACE INTO resources (
                resource_id, vault_id, tenant_id, title, resource_type, classification,
                content_hash, current_version, status, owner_user_id, created_at
            ) VALUES (?, ?, 'tenant_primary', 'Private_Salaries.txt', 'text', 1, 'hash_doc2', 1, 'active', 'u_dave_owner', ?)
        """, (res2_id, vault_id, now_iso))

        cursor.execute("""
            INSERT OR REPLACE INTO resource_manifests (
                resource_id, vault_id, tenant_id, classification, min_clearance,
                allowed_roles, allowed_groups, allowed_users, denied_users, denied_roles,
                operations, policy_version, acl_version
            ) VALUES (?, ?, 'tenant_primary', 1, 1, '["role:analyst"]', '[]', '["u_dave_owner"]', '[]', '[]', '["QUERY_RAG", "RETRIEVE_EVIDENCE"]', 1, 1)
        """, (res2_id, vault_id))

        # Add chunk for doc 1
        c1_id = "chk_dave_1"
        t1 = "Architecture Design: Microservices communicate using mutual TLS over HTTP/2. FastEmbed is used for offline neural indexing."
        h1 = compute_content_hash(t1.encode("utf-8"))
        sp1 = str(ENCRYPTED_DIR / f"{c1_id}.enc")
        encrypt_to_file(t1.encode("utf-8"), Path(sp1), kek)

        cursor.execute("""
            INSERT OR REPLACE INTO chunks (
                chunk_id, resource_id, vault_id, chunk_index, content, classification,
                min_clearance, acl_selector, deny_selector, provenance, content_hash,
                storage_path, created_at
            ) VALUES (?, ?, ?, 0, ?, 1, 1, '["role:analyst"]', '[]', ?, ?, ?, ?)
        """, (c1_id, res1_id, vault_id, t1, json.dumps({"file": "Architecture_Guide.md"}), h1, sp1, now_iso))

        # Add chunk for doc 2
        c2_id = "chk_dave_2"
        t2 = "Confidential Payroll: Executive compensation details and bonus structures for Q4."
        h2 = compute_content_hash(t2.encode("utf-8"))
        sp2 = str(ENCRYPTED_DIR / f"{c2_id}.enc")
        encrypt_to_file(t2.encode("utf-8"), Path(sp2), kek)

        cursor.execute("""
            INSERT OR REPLACE INTO chunks (
                chunk_id, resource_id, vault_id, chunk_index, content, classification,
                min_clearance, acl_selector, deny_selector, provenance, content_hash,
                storage_path, created_at
            ) VALUES (?, ?, ?, 0, ?, 1, 1, '["role:analyst"]', '[]', ?, ?, ?, ?)
        """, (c2_id, res2_id, vault_id, t2, json.dumps({"file": "Private_Salaries.txt"}), h2, sp2, now_iso))

        conn.commit()

    chunk1 = Chunk(
        chunk_id=c1_id, resource_id=res1_id, vault_id=vault_id, chunk_index=0,
        content=t1, classification=1, min_clearance=1, acl_selector=["role:analyst"],
        deny_selector=[], provenance={"file": "Architecture_Guide.md"},
        content_hash=h1, storage_path=sp1, created_at=now_iso
    )
    chunk2 = Chunk(
        chunk_id=c2_id, resource_id=res2_id, vault_id=vault_id, chunk_index=0,
        content=t2, classification=1, min_clearance=1, acl_selector=["role:analyst"],
        deny_selector=[], provenance={"file": "Private_Salaries.txt"},
        content_hash=h2, storage_path=sp2, created_at=now_iso
    )

    vector_store.index_chunk(chunk1)
    vector_store.index_chunk(chunk2)

    return {
        "vault_id": vault_id,
        "vault_slug": vault_slug,
        "res1_id": res1_id,
        "res2_id": res2_id,
        "dave_token": dave_token,
        "eve_token": eve_token,
        "frank_token": frank_token,
        "dave_headers": {"Authorization": f"Bearer {dave_token}"},
        "eve_headers": {"Authorization": f"Bearer {eve_token}"},
        "frank_headers": {"Authorization": f"Bearer {frank_token}"}
    }

def test_owner_l1_rag_query_with_non_default_role(setup_sharing_and_owner_fixture):
    """
    Problem 2 Fix Verification:
    Dave owns vault-dave and uploaded L1 Architecture_Guide.md.
    Dave has role 'viewer' (not the static 'analyst' role on chunk ACLs).
    Dave queries his vault in LOW, MEDIUM, and HIGH modes.
    Retrieval and RAG answer must succeed with authorized evidence and citations.
    """
    fixture = setup_sharing_and_owner_fixture
    headers = fixture["dave_headers"]
    vault_slug = fixture["vault_slug"]
    res1_id = fixture["res1_id"]

    for mode in ["LOW", "MEDIUM", "HIGH"]:
        res = client.post(
            "/api/rag/query",
            json={
                "vault_slug": vault_slug,
                "query": "How do microservices communicate?",
                "resource_id": res1_id,
                "retrieval_mode": mode
            },
            headers=headers
        )
        assert res.status_code == 200, f"Failed in mode {mode}: {res.text}"
        data = res.json()
        assert len(data["evidence_items"]) > 0, f"Expected evidence in mode {mode}"
        assert len(data["citations"]) > 0, f"Expected citations in mode {mode}"
        assert data["evidence_items"][0]["resource_id"] == res1_id
        assert "mutual TLS" in data["answer"] or "mTLS" in data["answer"] or len(data["citations"]) > 0

def test_file_level_sharing_and_isolation(setup_sharing_and_owner_fixture):
    """
    Problem 1 Fix Verification:
    Dave shares ONLY Doc 1 (Architecture_Guide.md) with Eve.
    Eve sees Doc 1 in listing, but DOES NOT see Doc 2.
    Eve can query RAG on Doc 1 and receive grounded evidence.
    Eve CANNOT query Doc 2 (403 Forbidden or 0 chunks).
    """
    fixture = setup_sharing_and_owner_fixture
    dave_headers = fixture["dave_headers"]
    eve_headers = fixture["eve_headers"]
    vault_slug = fixture["vault_slug"]
    res1_id = fixture["res1_id"]
    res2_id = fixture["res2_id"]

    # 1. Dave shares doc 1 with Eve using POST /api/grants/create
    grant_res = client.post(
        "/api/grants/create",
        json={
            "grantee_id": "eve_recipient",
            "vault_id": fixture["vault_id"],
            "resource_id": res1_id,
            "actions": ["read"],  # Automatically mapped to canonical query_rag, retrieve_evidence, view_source
            "valid_hours": 24,
            "is_delegable": False
        },
        headers=dave_headers
    )
    assert grant_res.status_code == 200, f"Grant creation failed: {grant_res.text}"
    grant_id = grant_res.json()["grant_id"]
    assert grant_id is not None

    # 2. Eve lists documents in Dave's vault -> only Doc 1 must be present
    docs_res = client.get(f"/api/vaults/{vault_slug}/documents", headers=eve_headers)
    assert docs_res.status_code == 200
    docs = docs_res.json()["documents"]
    doc_ids = [d.get("resource_id") or d.get("id") for d in docs]
    assert res1_id in doc_ids, "Eve should see shared Doc 1"
    assert res2_id not in doc_ids, "Eve MUST NOT see unshared Doc 2"

    # 3. Eve queries RAG on Doc 1 -> succeeds with evidence
    q_res = client.post(
        "/api/rag/query",
        json={
            "vault_slug": vault_slug,
            "query": "What communication protocol is used?",
            "resource_id": res1_id,
            "retrieval_mode": "LOW"
        },
        headers=eve_headers
    )
    assert q_res.status_code == 200
    q_data = q_res.json()
    assert len(q_data["evidence_items"]) > 0
    assert q_data["evidence_items"][0]["resource_id"] == res1_id

    # 4. Eve attempts to query unshared Doc 2 -> 403 Forbidden
    q2_res = client.post(
        "/api/rag/query",
        json={
            "vault_slug": vault_slug,
            "query": "Tell me about executive salaries",
            "resource_id": res2_id,
            "retrieval_mode": "LOW"
        },
        headers=eve_headers
    )
    assert q2_res.status_code == 403 or (q2_res.status_code == 200 and len(q2_res.json()["evidence_items"]) == 0)

def test_file_sharing_revocation_and_unrelated_user(setup_sharing_and_owner_fixture):
    """
    Revocation immediately severs recipient access.
    Unrelated User Frank is rejected with 403 Forbidden.
    """
    fixture = setup_sharing_and_owner_fixture
    dave_headers = fixture["dave_headers"]
    eve_headers = fixture["eve_headers"]
    frank_headers = fixture["frank_headers"]
    vault_slug = fixture["vault_slug"]
    res1_id = fixture["res1_id"]

    # 1. Frank (stranger) attempts to query Dave's vault -> 403 Forbidden
    frank_res = client.post(
        "/api/rag/query",
        json={
            "vault_slug": vault_slug,
            "query": "What is in this vault?",
            "retrieval_mode": "LOW"
        },
        headers=frank_headers
    )
    assert frank_res.status_code == 403

    # 2. Dave revokes Eve's grant
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT grant_id FROM grants WHERE grantee_id = 'u_eve_recipient' OR grantee_id = 'user:u_eve_recipient'")
        row = cursor.fetchone()
        grant_id = row["grant_id"]

    rev_res = client.post(
        f"/api/grants/{grant_id}/revoke",
        json={"reason": "Audit complete"},
        headers=dave_headers
    )
    assert rev_res.status_code == 200

    # 3. Eve queries again -> immediately 403 Forbidden
    eve_after_rev = client.post(
        "/api/rag/query",
        json={
            "vault_slug": vault_slug,
            "query": "How do microservices communicate?",
            "resource_id": res1_id,
            "retrieval_mode": "LOW"
        },
        headers=eve_headers
    )
    assert eve_after_rev.status_code == 403

def test_client_conversation_id_autoregistration_and_isolation(setup_sharing_and_owner_fixture):
    """
    Verifies that client-generated conversation IDs (conv_${timestamp})
    are auto-registered cleanly for the authenticated owner without throwing 404,
    while foreign conversation IDs are rejected with non-leaking 404.
    """
    fixture = setup_sharing_and_owner_fixture
    dave_headers = fixture["dave_headers"]
    frank_headers = fixture["frank_headers"]
    vault_slug = fixture["vault_slug"]
    res1_id = fixture["res1_id"]

    client_conv_id = f"conv_client_{uuid4().hex[:8]}"

    # 1. Dave sends query with brand new client conversation ID -> succeeds, auto-creates conversation
    res = client.post(
        "/api/rag/query",
        json={
            "vault_slug": vault_slug,
            "query": "What is microservices design?",
            "resource_id": res1_id,
            "retrieval_mode": "LOW",
            "conversation_id": client_conv_id
        },
        headers=dave_headers
    )
    assert res.status_code == 200
    assert res.json()["conversation_id"] == client_conv_id

    # 2. Dave verifies conversation exists in server list
    dave_convs = client.get("/api/conversations", headers=dave_headers).json()["conversations"]
    assert any(c["id"] == client_conv_id for c in dave_convs)

    # 3. Frank attempts to access Dave's conversation -> 404 non-leaking
    frank_access = client.get(f"/api/conversations/{client_conv_id}", headers=frank_headers)
    assert frank_access.status_code == 404
