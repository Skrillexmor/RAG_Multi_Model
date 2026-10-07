import json
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple, Optional
from .database import db
from .crypto import compute_audit_hash

class AuditService:
    """
    Architecture §33 & Master Spec §30, §54.F: Cryptographic Hash-Chained Audit Trail.
    Guarantees tamper evidence across all authorization requests, retrieval events, and data access.
    """

    @classmethod
    def log_event(
        cls,
        request_id: str,
        actor_id: str,
        action: str,  # e.g., 'rag_query', 'view', 'download', 'delegate', 'access_request'
        object_type: str,  # 'vault', 'document', 'chunk', 'grant'
        object_id: str,
        decision: str,  # 'ALLOW', 'DENY', 'REDACT'
        policy_version: int,
        reason_code: str,
        client_ip: str = "127.0.0.1",
        session_id: Optional[str] = None
    ) -> str:
        now_iso = datetime.now(timezone.utc).isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()

            # Get latest event hash
            cursor.execute("SELECT hash FROM audit_events ORDER BY event_id DESC LIMIT 1")
            last_row = cursor.fetchone()
            prev_hash = last_row["hash"] if last_row else "GENESIS_AUDIT_HASH_SECURE_RAG_2026"

            event_dict = {
                "request_id": request_id,
                "actor_id": actor_id,
                "session_id": session_id,
                "action": action,
                "object_type": object_type,
                "object_id": object_id,
                "decision": decision,
                "policy_version": policy_version,
                "reason_code": reason_code,
                "timestamp": now_iso,
                "client_ip": client_ip
            }

            canonical_json = json.dumps(event_dict, sort_keys=True, separators=(",", ":"))
            current_hash = compute_audit_hash(prev_hash, canonical_json)

            cursor.execute("""
            INSERT INTO audit_events (
                request_id, actor_id, session_id, action, object_type, object_id,
                decision, policy_version, reason_code, timestamp, client_ip, prev_hash, hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                request_id, actor_id, session_id, action, object_type, object_id,
                decision, policy_version, reason_code, now_iso, client_ip, prev_hash, current_hash
            ))

            conn.commit()
            return current_hash

    @classmethod
    def verify_chain(cls) -> Tuple[bool, int, Optional[str]]:
        """Verifies full cryptographic integrity of the audit hash chain."""
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM audit_events ORDER BY event_id ASC")
            events = cursor.fetchall()

            if not events:
                return True, 0, None

            prev_hash = "GENESIS_AUDIT_HASH_SECURE_RAG_2026"
            for row in events:
                if row["prev_hash"] != prev_hash:
                    return False, row["event_id"], f"Broken link at event {row['event_id']}: expected prev_hash {prev_hash}, got {row['prev_hash']}"

                event_dict = {
                    "request_id": row["request_id"],
                    "actor_id": row["actor_id"],
                    "session_id": row["session_id"],
                    "action": row["action"],
                    "object_type": row["object_type"],
                    "object_id": row["object_id"],
                    "decision": row["decision"],
                    "policy_version": row["policy_version"],
                    "reason_code": row["reason_code"],
                    "timestamp": row["timestamp"],
                    "client_ip": row["client_ip"]
                }
                canonical_json = json.dumps(event_dict, sort_keys=True, separators=(",", ":"))
                recomputed_hash = compute_audit_hash(prev_hash, canonical_json)

                if recomputed_hash != row["hash"]:
                    return False, row["event_id"], f"Hash mismatch at event {row['event_id']}: recorded {row['hash']} vs recomputed {recomputed_hash}"

                prev_hash = row["hash"]

            return True, len(events), None

    @classmethod
    def get_recent_events(cls, limit: int = 50) -> List[Dict[str, Any]]:
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM audit_events ORDER BY event_id DESC LIMIT ?", (limit,))
            return [dict(row) for row in cursor.fetchall()]

audit_service = AuditService()
