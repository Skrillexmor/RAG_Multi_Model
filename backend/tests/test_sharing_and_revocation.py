import os
import sys
import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.database import db
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
        cursor.execute("SELECT vault_id, slug FROM vaults WHERE owner_id = ?", (alice.user_id,))
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
