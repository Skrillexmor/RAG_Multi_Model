import json
import base64
import hashlib
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple, Optional
from uuid import uuid4

from .database import db
from .config import DATA_DIR
from .crypto import compute_audit_hash, sign_data, verify_signature, get_system_public_key_bytes

class AuditService:
    """
    Architecture §33 & Master Spec §30, §54.F & UPGRADE_PROJECT §71..§74:
    Cryptographic Hash-Chained Audit Trail with externalized append-only log file
    and periodic Ed25519-signed checkpoints.
    """

    LOG_FILE = DATA_DIR / "audit_append_only.log"

    @classmethod
    def log_event(
        cls,
        request_id: str,
        actor_id: str,
        action: str,
        object_type: str,
        object_id: str,
        decision: str,
        policy_version: int,
        reason_code: str,
        client_ip: str = "127.0.0.1",
        session_id: Optional[str] = None
    ) -> str:
        now_iso = datetime.now(timezone.utc).isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()

            # 1. Get latest event hash
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

        # 2. Append to physical append-only external log file (§71)
        try:
            with open(cls.LOG_FILE, "a", encoding="utf-8") as f:
                log_entry = {
                    "hash": current_hash,
                    "prev_hash": prev_hash,
                    **event_dict
                }
                f.write(json.dumps(log_entry, sort_keys=True) + "\n")
        except Exception:
            pass

        return current_hash

    @classmethod
    def create_signed_checkpoint(cls) -> Dict[str, Any]:
        """Creates an Ed25519 signed checkpoint over the current audit log state (§71)."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT event_id, hash FROM audit_events ORDER BY event_id DESC LIMIT 1")
            last_row = cursor.fetchone()
            if not last_row:
                raise ValueError("No audit events to checkpoint.")

            last_id = last_row["event_id"]
            last_hash = last_row["hash"]

            cursor.execute("SELECT COUNT(*) as cnt FROM audit_events")
            event_count = cursor.fetchone()["cnt"]

            checkpoint_id = f"cp_{uuid4().hex[:8]}"
            cp_claims = {
                "checkpoint_id": checkpoint_id,
                "event_count": event_count,
                "last_event_id": last_id,
                "checkpoint_hash": last_hash,
                "created_at": now_iso
            }
            canonical_bytes = json.dumps(cp_claims, sort_keys=True, separators=(",", ":")).encode("utf-8")
            sig = sign_data(canonical_bytes)
            sig_b64 = base64.b64encode(sig).decode("utf-8")

            cursor.execute("""
            INSERT INTO audit_checkpoints (checkpoint_id, event_count, last_event_id, checkpoint_hash, signature, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (checkpoint_id, event_count, last_id, last_hash, sig_b64, now_iso))
            conn.commit()

            return {**cp_claims, "signature": sig_b64}

    @classmethod
    def verify_chain(cls) -> Tuple[bool, int, Optional[str]]:
        """Verifies cryptographic hash chain integrity."""
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
