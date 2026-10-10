import os
import sys
import json
import pytest
from pathlib import Path
from datetime import datetime, timezone
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.api import app
from backend.app.database import db
from backend.app.models import Principal
from backend.app.session_service import session_service
from backend.app.config import JWT_SECRET, JWT_ALGORITHM, MEDIA_DIR
import jwt

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
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

@pytest.fixture(scope="module")
def setup_test_users():
    now_iso = datetime.now(timezone.utc).isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        # Ensure Alice exists
        cursor.execute("""
            INSERT OR REPLACE INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES ('u_alice_tgt', 'tenant_primary', 'alice_tgt', 'dummy_hash', 'SecOps', 3, 1, 1, ?)
        """, (now_iso,))
        # Ensure Bob exists
        cursor.execute("""
            INSERT OR REPLACE INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES ('u_bob_tgt', 'tenant_primary', 'bob_tgt', 'dummy_hash', 'Marketing', 1, 1, 1, ?)
        """, (now_iso,))
        conn.commit()

    alice_sess, alice_jti = session_service.create_session("u_alice_tgt")
    alice_token = create_test_token("u_alice_tgt", "alice_tgt", ["analyst", "admin"], 3, alice_sess, alice_jti)

    bob_sess, bob_jti = session_service.create_session("u_bob_tgt")
    bob_token = create_test_token("u_bob_tgt", "bob_tgt", ["viewer"], 1, bob_sess, bob_jti)

    return {
        "alice_token": alice_token,
        "bob_token": bob_token,
        "alice_headers": {"Authorization": f"Bearer {alice_token}"},
        "bob_headers": {"Authorization": f"Bearer {bob_token}"}
    }

def test_public_auth_config_endpoint():
    """Task A: Public auth config returns operational mode without requiring token."""
    res = client.get("/api/auth/config")
    assert res.status_code == 200
    data = res.json()
    assert "demo_mode" in data
    assert data["offline_mode"] is True
    assert "inactivity_timeout_seconds" in data

def test_conversation_strict_isolation_and_ownership(setup_test_users):
    """Task C & Task G: Conversations are strictly scoped to owner. Foreign access is rejected with 404."""
    alice_headers = setup_test_users["alice_headers"]
    bob_headers = setup_test_users["bob_headers"]

    # 1. Alice creates conversation
    create_res = client.post(
        "/api/conversations",
        json={"title": "Alice Sensitive Strategy", "vault_slug": "project-alpha"},
        headers=alice_headers
    )
    assert create_res.status_code == 200
    conv = create_res.json()["conversation"]
    conv_id = conv["id"]
    assert conv["title"] == "Alice Sensitive Strategy"

    # 2. Bob lists conversations: Alice's conversation MUST NOT be in Bob's list
    bob_list = client.get("/api/conversations", headers=bob_headers)
    assert bob_list.status_code == 200
    bob_conv_ids = [c["id"] for c in bob_list.json()["conversations"]]
    assert conv_id not in bob_conv_ids

    # 3. Bob attempts direct GET on Alice's conversation -> non-leaking 404
    bob_get = client.get(f"/api/conversations/{conv_id}", headers=bob_headers)
    assert bob_get.status_code == 404

    # 4. Bob attempts PUT to rename Alice's conversation -> 404
    bob_put = client.put(f"/api/conversations/{conv_id}", json={"title": "Hacked Title"}, headers=bob_headers)
    assert bob_put.status_code == 404

    # 5. Bob attempts POST to append message to Alice's conversation -> 404
    bob_append = client.post(
        f"/api/conversations/{conv_id}/messages",
        json={"role": "user", "content": "Injected message"},
        headers=bob_headers
    )
    assert bob_append.status_code == 404

    # 6. Bob attempts GET on Alice's conversation memory -> 404
    bob_mem = client.get(f"/api/conversations/{conv_id}/memory", headers=bob_headers)
    assert bob_mem.status_code == 404

    # 7. Bob attempts DELETE on Alice's conversation -> 404
    bob_del = client.delete(f"/api/conversations/{conv_id}", headers=bob_headers)
    assert bob_del.status_code == 404

    # 8. Alice appends messages and reads memory
    alice_msg = client.post(
        f"/api/conversations/{conv_id}/messages",
        json={"role": "user", "content": "What is the Q3 operating margin?"},
        headers=alice_headers
    )
    assert alice_msg.status_code == 200

    alice_ast = client.post(
        f"/api/conversations/{conv_id}/messages",
        json={
            "role": "assistant",
            "content": "The Q3 operating margin was 14.2%.",
            "retrieval_mode": "HIGH",
            "citations": [{"citation_id": "C1", "locator": "Page 1", "quote": "Operating margin 14.2%"}]
        },
        headers=alice_headers
    )
    assert alice_ast.status_code == 200

    # 9. Alice reads conversation and verifies messages are persisted
    alice_get = client.get(f"/api/conversations/{conv_id}", headers=alice_headers)
    assert alice_get.status_code == 200
    msgs = alice_get.json()["conversation"]["messages"]
    assert len(msgs) == 2
    assert msgs[0]["content"] == "What is the Q3 operating margin?"
    assert msgs[1]["content"] == "The Q3 operating margin was 14.2%."

    # 10. Alice reads memory
    alice_mem = client.get(f"/api/conversations/{conv_id}/memory", headers=alice_headers)
    assert alice_mem.status_code == 200

    # 11. Alice updates title and pins
    alice_put = client.put(f"/api/conversations/{conv_id}", json={"title": "Updated Strategy", "pinned": True}, headers=alice_headers)
    assert alice_put.status_code == 200
    assert alice_put.json()["conversation"]["title"] == "Updated Strategy"
    assert alice_put.json()["conversation"]["pinned"] is True

    # 12. Alice deletes her conversation
    alice_del = client.delete(f"/api/conversations/{conv_id}", headers=alice_headers)
    assert alice_del.status_code == 200
    assert client.get(f"/api/conversations/{conv_id}", headers=alice_headers).status_code == 404

def test_media_ticket_and_streaming(setup_test_users):
    """Task D: Authenticated media ticket creation, playback, and HTTP Range support."""
    alice_headers = setup_test_users["alice_headers"]

    # Pick an existing media file in MEDIA_DIR
    media_files = [f.name for f in MEDIA_DIR.glob("*.*") if f.is_file() and not f.name.startswith(".")]
    if not media_files:
        # Create a small sample audio file for testing
        test_file = MEDIA_DIR / "sample_test_audio.wav"
        test_file.write_bytes(b"RIFF" + b"\x00" * 36 + b"data" + b"\x00" * 100)
        sample_name = "sample_test_audio.wav"
    else:
        sample_name = media_files[0]

    # 1. Request media ticket
    ticket_res = client.post("/api/media/ticket", json={"file_path": sample_name}, headers=alice_headers)
    assert ticket_res.status_code == 200
    ticket_data = ticket_res.json()
    assert "ticket" in ticket_data
    ticket = ticket_data["ticket"]

    # 2. Access media using ticket without bearer header -> 200 OK
    stream_res = client.get(f"/api/media/{sample_name}?ticket={ticket}")
    assert stream_res.status_code == 200
    assert stream_res.headers.get("accept-ranges") == "bytes"
    assert len(stream_res.content) > 0

    # 3. Access media with HTTP Range header -> 206 Partial Content
    range_res = client.get(f"/api/media/{sample_name}?ticket={ticket}", headers={"Range": "bytes=0-10"})
    assert range_res.status_code == 206
    assert len(range_res.content) == 11

    # 4. Forged ticket rejected with 401
    bad_res = client.get(f"/api/media/{sample_name}?ticket=invalid.jwt.signature")
    assert bad_res.status_code == 401

    # 5. Path traversal rejected with 403
    traversal_res = client.get(f"/api/media/../../etc/passwd?ticket={ticket}")
    assert traversal_res.status_code in (403, 404)

def test_retrieval_mode_trace_and_elapsed_seconds():
    """Task B: Verified retrieval mode is returned in response, trace, and includes measured elapsed time."""
    login_res = client.post("/api/auth/login", json={"username": "alice", "password": "alice123"})
    assert login_res.status_code == 200
    alice_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Create a conversation for the run
    c_res = client.post("/api/conversations", json={"title": "Mode Test"}, headers=alice_headers)
    assert c_res.status_code == 200
    cid = c_res.json()["conversation"]["id"]

    # Run query with HIGH mode on project-alpha
    q_res = client.post(
        "/api/rag/query",
        json={
            "vault_slug": "project-alpha",
            "query": "Summarize operational milestones",
            "retrieval_mode": "HIGH",
            "conversation_id": cid
        },
        headers=alice_headers
    )
    assert q_res.status_code == 200
    data = q_res.json()
    assert data["retrieval_mode"] == "HIGH"
    assert data["conversation_id"] == cid
    assert data["elapsed_seconds"] is not None
    assert data["elapsed_seconds"] >= 0

    trace = data["security_trace"]
    assert trace["retrieval_mode"] == "HIGH"
    assert trace["elapsed_seconds"] is not None

    # Verify turns were auto-persisted into the conversation
    c_loaded = client.get(f"/api/conversations/{cid}", headers=alice_headers).json()["conversation"]
    assert len(c_loaded["messages"]) >= 2
    assert c_loaded["messages"][0]["role"] == "user"
    assert c_loaded["messages"][0]["retrieval_mode"] == "HIGH"
    assert c_loaded["messages"][1]["role"] == "assistant"
    assert c_loaded["messages"][1]["retrieval_mode"] == "HIGH"

