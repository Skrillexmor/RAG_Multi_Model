import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, Tuple
from uuid import uuid4
from .config import (
    INACTIVITY_TIMEOUT_SECONDS,
    TOKEN_EXPIRY_MINUTES,
    INACTIVITY_WARNING_SECONDS
)
from .database import db
from .time_authority import time_authority

logger = logging.getLogger(__name__)

class SessionError(Exception):
    def __init__(self, message: str, code: str = "SESSION_ERROR", status_code: int = 401):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code

class SessionService:
    """
    Authoritative Server-Side User Session & Inactivity Management (§3.1).
    Distinguishes:
      1. Hard token expiration (TOKEN_EXPIRY_MINUTES).
      2. Genuine user inactivity expiration (default 300s).
      3. Point-in-time authorization leases (LEASE_TTL_SECONDS, handled in PolicyEngine).
    """

    def create_session(
        self,
        user_id: str,
        inactivity_timeout_seconds: Optional[int] = None
    ) -> Tuple[str, str]:
        """
        Creates a new server-side session for an authenticated principal.
        Returns (session_id, token_jti).
        """
        session_id = f"sess_{uuid4().hex[:12]}"
        token_jti = f"jti_{uuid4().hex[:16]}"
        now = time_authority.now().timestamp
        now_iso = now.isoformat()
        timeout = inactivity_timeout_seconds or INACTIVITY_TIMEOUT_SECONDS
        expires_at = (now + timedelta(minutes=TOKEN_EXPIRY_MINUTES)).isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO sessions (
                    session_id, user_id, token_jti, created_at, last_active_at,
                    expires_at, is_revoked, revoked_at, inactivity_timeout_seconds
                ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)
            """, (session_id, user_id, token_jti, now_iso, now_iso, expires_at, timeout))
            conn.commit()

        return session_id, token_jti

    def validate_session(
        self,
        token_jti: str,
        user_id: Optional[str] = None,
        is_genuine_activity: bool = True
    ) -> Dict[str, Any]:
        """
        Validates the session fail-closed on every protected request.
        If is_genuine_activity is True, updates last_active_at.
        If request is background polling, validates remaining time without bumping last_active_at.
        """
        now = time_authority.now().timestamp
        now_iso = now.isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE token_jti = ? OR session_id = ?", (token_jti, token_jti))
            row = cursor.fetchone()

            if not row:
                if user_id:
                    self.create_session(user_id=user_id, token_jti=token_jti)
                    return {
                        "session_id": token_jti,
                        "user_id": user_id,
                        "remaining_seconds": INACTIVITY_TIMEOUT_SECONDS,
                        "is_warning": False,
                        "inactivity_timeout_seconds": INACTIVITY_TIMEOUT_SECONDS,
                        "active": True
                    }
                raise SessionError("Session not found or invalid (T-SESS-002).", code="INVALID_SESSION")

            if row["is_revoked"]:
                raise SessionError("Session has been revoked (T-SESS-003).", code="SESSION_REVOKED")

            if user_id and row["user_id"] != user_id:
                raise SessionError("Session principal mismatch (T-SESS-005).", code="INVALID_SESSION")

            # Check hard max expiry
            try:
                expires_at_dt = datetime.fromisoformat(row["expires_at"])
                if expires_at_dt.tzinfo is None:
                    expires_at_dt = expires_at_dt.replace(tzinfo=timezone.utc)
                if now > expires_at_dt:
                    cursor.execute("UPDATE sessions SET is_revoked = 1, revoked_at = ? WHERE session_id = ?", (now_iso, row["session_id"]))
                    conn.commit()
                    raise SessionError("Authentication token expired (T-AUTH-004).", code="TOKEN_EXPIRED")
            except ValueError:
                pass

            # Check user inactivity deadline
            try:
                last_active_dt = datetime.fromisoformat(row["last_active_at"])
                if last_active_dt.tzinfo is None:
                    last_active_dt = last_active_dt.replace(tzinfo=timezone.utc)
            except Exception:
                last_active_dt = now

            timeout_sec = row["inactivity_timeout_seconds"]
            elapsed = (now - last_active_dt).total_seconds()
            remaining_seconds = max(0.0, timeout_sec - elapsed)

            if remaining_seconds <= 0:
                # Mark revoked in DB to prevent replay
                cursor.execute("""
                    UPDATE sessions
                    SET is_revoked = 1, revoked_at = ?
                    WHERE session_id = ?
                """, (now_iso, row["session_id"]))
                conn.commit()
                raise SessionError(
                    "Session expired due to 5 minutes of inactivity (T-SESS-001).",
                    code="SESSION_INACTIVITY_EXPIRED"
                )

            # If this is genuine user activity, bump last_active_at
            if is_genuine_activity:
                cursor.execute("""
                    UPDATE sessions
                    SET last_active_at = ?
                    WHERE session_id = ?
                """, (now_iso, row["session_id"]))
                conn.commit()
                remaining_seconds = float(timeout_sec)

        return {
            "session_id": row["session_id"],
            "user_id": row["user_id"],
            "remaining_seconds": int(remaining_seconds),
            "is_warning": remaining_seconds <= INACTIVITY_WARNING_SECONDS,
            "inactivity_timeout_seconds": row["inactivity_timeout_seconds"],
            "active": True
        }

    def renew_session(self, token_jti: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Extends the inactivity deadline when user confirms they are still present.
        Server-side validation ensures expired/revoked sessions cannot be renewed.
        """
        now = time_authority.now().timestamp
        now_iso = now.isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE token_jti = ? OR session_id = ?", (token_jti, token_jti))
            row = cursor.fetchone()

            if not row:
                if user_id:
                    self.create_session(user_id=user_id, token_jti=token_jti)
                    return {
                        "status": "RENEWED",
                        "active": True,
                        "remaining_seconds": INACTIVITY_TIMEOUT_SECONDS,
                        "inactivity_timeout_seconds": INACTIVITY_TIMEOUT_SECONDS,
                        "last_active_at": now_iso
                    }
                raise SessionError("Cannot renew: session is invalid or revoked.", code="SESSION_REVOKED")

            if row["is_revoked"]:
                raise SessionError("Cannot renew: session is invalid or revoked.", code="SESSION_REVOKED")

            # Check if already expired past inactivity limit
            last_active_dt = datetime.fromisoformat(row["last_active_at"])
            if last_active_dt.tzinfo is None:
                last_active_dt = last_active_dt.replace(tzinfo=timezone.utc)
            elapsed = (now - last_active_dt).total_seconds()
            if elapsed >= row["inactivity_timeout_seconds"]:
                cursor.execute("UPDATE sessions SET is_revoked = 1, revoked_at = ? WHERE session_id = ?", (now_iso, row["session_id"]))
                conn.commit()
                raise SessionError("Cannot renew: session already expired due to inactivity.", code="SESSION_INACTIVITY_EXPIRED")

            cursor.execute("""
                UPDATE sessions
                SET last_active_at = ?
                WHERE session_id = ?
            """, (now_iso, row["session_id"]))
            conn.commit()

            timeout = row["inactivity_timeout_seconds"]

        return {
            "status": "RENEWED",
            "active": True,
            "remaining_seconds": timeout,
            "inactivity_timeout_seconds": timeout,
            "last_active_at": now_iso
        }

    def record_activity(self, token_jti: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Records genuine user activity (keyboard, pointer, touch) triggered by client.
        """
        now = time_authority.now().timestamp
        now_iso = now.isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE token_jti = ? OR session_id = ?", (token_jti, token_jti))
            row = cursor.fetchone()

            if not row:
                if user_id:
                    self.create_session(user_id=user_id, token_jti=token_jti)
                    return {
                        "status": "ACTIVE",
                        "active": True,
                        "remaining_seconds": INACTIVITY_TIMEOUT_SECONDS,
                        "inactivity_timeout_seconds": INACTIVITY_TIMEOUT_SECONDS
                    }
                raise SessionError("Session is invalid or revoked.", code="SESSION_REVOKED")

            if row["is_revoked"]:
                raise SessionError("Session is invalid or revoked.", code="SESSION_REVOKED")

            last_active_dt = datetime.fromisoformat(row["last_active_at"])
            if last_active_dt.tzinfo is None:
                last_active_dt = last_active_dt.replace(tzinfo=timezone.utc)
            elapsed = (now - last_active_dt).total_seconds()
            timeout = row["inactivity_timeout_seconds"]

            if elapsed >= timeout:
                cursor.execute("UPDATE sessions SET is_revoked = 1, revoked_at = ? WHERE session_id = ?", (now_iso, row["session_id"]))
                conn.commit()
                raise SessionError("Session expired due to inactivity.", code="SESSION_INACTIVITY_EXPIRED")

            cursor.execute("UPDATE sessions SET last_active_at = ? WHERE session_id = ?", (now_iso, row["session_id"]))
            conn.commit()

        return {
            "status": "ACTIVE",
            "active": True,
            "remaining_seconds": timeout,
            "inactivity_timeout_seconds": timeout
        }

    def revoke_session(self, token_jti: str, reason: Optional[str] = None) -> bool:
        """Explicit logout: marks session revoked so token cannot be reused."""
        now_iso = time_authority.now().timestamp.isoformat()
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE sessions
                SET is_revoked = 1, revoked_at = ?
                WHERE token_jti = ? OR session_id = ?
            """, (now_iso, token_jti, token_jti))
            conn.commit()
            return cursor.rowcount > 0

    def get_session_status(self, token_jti: str, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Read-only session status check (does NOT reset inactivity)."""
        now = time_authority.now().timestamp
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE token_jti = ? OR session_id = ?", (token_jti, token_jti))
            row = cursor.fetchone()

            if not row:
                if user_id:
                    self.create_session(user_id=user_id, token_jti=token_jti)
                    return {
                        "active": True,
                        "is_active": True,
                        "remaining_seconds": INACTIVITY_TIMEOUT_SECONDS,
                        "is_warning": False,
                        "inactivity_timeout_seconds": INACTIVITY_TIMEOUT_SECONDS
                    }
                return {
                    "active": False,
                    "is_active": False,
                    "remaining_seconds": 0,
                    "is_warning": False,
                    "reason": "REVOKED_OR_NOT_FOUND"
                }

            if row["is_revoked"]:
                return {
                    "active": False,
                    "is_active": False,
                    "remaining_seconds": 0,
                    "is_warning": False,
                    "reason": "SESSION_REVOKED"
                }

            last_active_dt = datetime.fromisoformat(row["last_active_at"])
            if last_active_dt.tzinfo is None:
                last_active_dt = last_active_dt.replace(tzinfo=timezone.utc)

            timeout = row["inactivity_timeout_seconds"]
            elapsed = (now - last_active_dt).total_seconds()
            remaining = max(0, int(timeout - elapsed))

            if remaining <= 0:
                cursor.execute("UPDATE sessions SET is_revoked = 1, revoked_at = ? WHERE session_id = ?", (now.isoformat(), row["session_id"]))
                conn.commit()
                return {
                    "active": False,
                    "is_active": False,
                    "remaining_seconds": 0,
                    "is_warning": False,
                    "reason": "INACTIVITY_EXPIRED"
                }

            return {
                "active": True,
                "is_active": True,
                "remaining_seconds": remaining,
                "is_warning": remaining <= INACTIVITY_WARNING_SECONDS,
                "inactivity_timeout_seconds": timeout
            }

session_service = SessionService()
