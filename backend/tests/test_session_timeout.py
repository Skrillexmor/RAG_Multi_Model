import os
import sys
import pytest
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.database import db
from backend.app.config import INACTIVITY_TIMEOUT_SECONDS, INACTIVITY_WARNING_SECONDS
from backend.app.session_service import session_service, SessionError
from backend.app.models import Principal
from backend.app.time_authority import time_authority
from backend.app.policy_engine import PolicyEngine

@pytest.fixture
def test_principal():
    now_iso = time_authority.now().timestamp.isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR IGNORE INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES ('u_session_test', 'tenant_primary', 'session_tester', 'hash', 'Audit', 2, 1, 1, ?)
        """, (now_iso,))
        conn.commit()

    return Principal(
        user_id="u_session_test",
        tenant_id="tenant_primary",
        username="session_tester",
        roles=["analyst"],
        clearance_level=2
    )

def test_session_creation_and_initial_deadline(test_principal):
    """Session is created with 300s default inactivity timeout."""
    session_id, token_jti = session_service.create_session(
        user_id=test_principal.user_id
    )
    assert session_id is not None
    assert token_jti is not None

    status = session_service.get_session_status(session_id)
    assert status["active"] is True
    assert 295 <= status["remaining_seconds"] <= 300
    assert status["is_warning"] is False

def test_background_polling_does_not_reset_inactivity(test_principal):
    """Read-only background polling calls must NOT reset the last_active_at timestamp."""
    session_id, token_jti = session_service.create_session(
        user_id=test_principal.user_id
    )

    # Artificially age the session last_active_at by 100 seconds
    past_iso = (time_authority.now().timestamp - timedelta(seconds=100)).isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE sessions SET last_active_at = ? WHERE session_id = ?", (past_iso, session_id))
        conn.commit()

    # Simulate read-only polling route (is_genuine_activity = False)
    val_result = session_service.validate_session(token_jti, is_genuine_activity=False)
    assert val_result["session_id"] == session_id

    # Verify last_active_at was NOT reset to now
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT last_active_at FROM sessions WHERE session_id = ?", (session_id,))
        current_active = cursor.fetchone()["last_active_at"]
        assert current_active == past_iso

def test_genuine_activity_resets_inactivity_deadline(test_principal):
    """Meaningful user activity updates last_active_at and restores full 300s window."""
    session_id, token_jti = session_service.create_session(
        user_id=test_principal.user_id
    )

    # Age the session by 200 seconds
    past_iso = (time_authority.now().timestamp - timedelta(seconds=200)).isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE sessions SET last_active_at = ? WHERE session_id = ?", (past_iso, session_id))
        conn.commit()

    # User interacts with app (genuine activity)
    session_service.record_activity(session_id)

    status = session_service.get_session_status(session_id)
    assert status["remaining_seconds"] >= 295

def test_warning_state_30_seconds_before_expiry(test_principal):
    """When remaining inactivity time is <= 30 seconds, is_warning flag is True."""
    session_id, token_jti = session_service.create_session(
        user_id=test_principal.user_id
    )

    # Age session to 280 seconds of inactivity (20 seconds remaining)
    near_expiry_iso = (time_authority.now().timestamp - timedelta(seconds=280)).isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE sessions SET last_active_at = ? WHERE session_id = ?", (near_expiry_iso, session_id))
        conn.commit()

    status = session_service.get_session_status(session_id)
    assert status["is_warning"] is True
    assert status["remaining_seconds"] <= 30
    assert status["active"] is True

def test_session_expiry_after_300_seconds_inactivity(test_principal):
    """When inactive for more than 300 seconds, validation raises SessionError."""
    session_id, token_jti = session_service.create_session(
        user_id=test_principal.user_id
    )

    # Age session past 300 seconds
    expired_iso = (time_authority.now().timestamp - timedelta(seconds=305)).isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE sessions SET last_active_at = ? WHERE session_id = ?", (expired_iso, session_id))
        conn.commit()

    with pytest.raises(SessionError) as exc_info:
        session_service.validate_session(token_jti)
    assert exc_info.value.code == "SESSION_INACTIVITY_EXPIRED"

def test_session_renewal_via_explicit_endpoint(test_principal):
    """Explicit renewal resets last_active_at and clears warning."""
    session_id, token_jti = session_service.create_session(
        user_id=test_principal.user_id
    )

    # Age session to warning threshold
    near_expiry_iso = (time_authority.now().timestamp - timedelta(seconds=285)).isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE sessions SET last_active_at = ? WHERE session_id = ?", (near_expiry_iso, session_id))
        conn.commit()

    renew_result = session_service.renew_session(session_id)
    assert renew_result["remaining_seconds"] >= 295

    status = session_service.get_session_status(session_id)
    assert status["is_warning"] is False

def test_session_revocation_on_logout(test_principal):
    """Logging out marks session as revoked; replaying token fails closed."""
    session_id, token_jti = session_service.create_session(
        user_id=test_principal.user_id
    )

    session_service.revoke_session(session_id, reason="USER_LOGOUT")

    with pytest.raises(SessionError) as exc_info:
        session_service.validate_session(token_jti)
    assert exc_info.value.code == "SESSION_REVOKED"

def test_authorization_lease_independence_from_session(test_principal):
    """Authorization lease TTL is distinct from user session inactivity."""
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(test_principal, now.timestamp)
    # Authorization lease is short-lived point-in-time cryptographic lease
    lease = PolicyEngine.issue_lease(test_principal, usable, restricted=True)

    assert lease.lease_id is not None
    assert lease.deadline is not None

    # Even if lease expires, session inactivity deadline is governed separately by session_service
    session_id, token_jti = session_service.create_session(test_principal.user_id)
    status = session_service.get_session_status(session_id)
    assert 295 <= status["remaining_seconds"] <= INACTIVITY_TIMEOUT_SECONDS
