import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from uuid import uuid4

from .database import db
from .models import Principal

logger = logging.getLogger(__name__)

class ConversationServiceError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code

class ConversationNotFoundError(ConversationServiceError):
    def __init__(self, message: str = "Conversation not found"):
        super().__init__(message, status_code=404)

class ConversationService:
    """
    Authoritative Server-Side Conversation & Memory Service (§Task C, §Task G).
    Strictly isolated per-user and per-tenant:
    - Ownership validated by authenticated principal user_id and tenant_id.
    - No cross-user access or data leakage.
    - Deterministic rolling context construction for follow-ups without using previous answers as evidence.
    """

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def list_conversations(self, principal: Principal) -> List[Dict[str, Any]]:
        """Lists conversations strictly owned by the caller."""
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT conversation_id, tenant_id, owner_user_id, title, vault_slug,
                       selected_file_id, selected_file_name, pinned, created_at, updated_at
                FROM conversations
                WHERE owner_user_id = ? AND tenant_id = ?
                ORDER BY pinned DESC, updated_at DESC
            """, (principal.user_id, principal.tenant_id))
            rows = cursor.fetchall()

            result = []
            for r in rows:
                c_id = r["conversation_id"]
                cursor.execute("""
                    SELECT content FROM conversation_messages
                    WHERE conversation_id = ? AND owner_user_id = ?
                    ORDER BY created_at DESC LIMIT 1
                """, (c_id, principal.user_id))
                last_msg = cursor.fetchone()
                preview = (last_msg["content"][:80] + "...") if last_msg and len(last_msg["content"]) > 80 else (last_msg["content"] if last_msg else "")

                result.append({
                    "id": r["conversation_id"],
                    "conversation_id": r["conversation_id"],
                    "title": r["title"],
                    "vault_slug": r["vault_slug"],
                    "vaultSlug": r["vault_slug"],
                    "selected_file_id": r["selected_file_id"],
                    "selectedFileId": r["selected_file_id"],
                    "selected_file_name": r["selected_file_name"],
                    "selectedFileName": r["selected_file_name"],
                    "pinned": bool(r["pinned"]),
                    "preview": preview,
                    "created_at": r["created_at"],
                    "createdAt": r["created_at"],
                    "updated_at": r["updated_at"],
                    "updatedAt": r["updated_at"],
                    "owner_user_id": r["owner_user_id"],
                    "tenant_id": r["tenant_id"],
                })
            return result

    def get_conversation(self, conversation_id: str, principal: Principal) -> Optional[Dict[str, Any]]:
        """
        Loads an owned conversation with all messages and memory.
        Returns None if not found or if caller is not the authenticated owner (prevents existence leakage).
        """
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT conversation_id, tenant_id, owner_user_id, title, vault_slug,
                       selected_file_id, selected_file_name, pinned, created_at, updated_at
                FROM conversations
                WHERE conversation_id = ? AND owner_user_id = ? AND tenant_id = ?
            """, (conversation_id, principal.user_id, principal.tenant_id))
            r = cursor.fetchone()
            if not r:
                return None

            cursor.execute("""
                SELECT message_id, role, content, retrieval_mode, citations_json,
                       evidence_items_json, security_trace_json, status, vault_slug,
                       selected_file_id, selected_file_name, created_at
                FROM conversation_messages
                WHERE conversation_id = ? AND owner_user_id = ?
                ORDER BY created_at ASC
            """, (conversation_id, principal.user_id))
            msg_rows = cursor.fetchall()

            messages = []
            for m in msg_rows:
                citations = json.loads(m["citations_json"]) if m["citations_json"] else []
                evidence_items = json.loads(m["evidence_items_json"]) if m["evidence_items_json"] else []
                security_trace = json.loads(m["security_trace_json"]) if m["security_trace_json"] else None
                messages.append({
                    "id": m["message_id"],
                    "role": m["role"],
                    "content": m["content"],
                    "retrieval_mode": m["retrieval_mode"],
                    "retrievalMode": m["retrieval_mode"],
                    "citations": citations,
                    "evidence_items": evidence_items,
                    "evidenceItems": evidence_items,
                    "security_trace": security_trace,
                    "securityTrace": security_trace,
                    "status": m["status"] or "complete",
                    "vault_slug": m["vault_slug"],
                    "vaultSlug": m["vault_slug"],
                    "selected_file_id": m["selected_file_id"],
                    "selectedFileId": m["selected_file_id"],
                    "selected_file_name": m["selected_file_name"],
                    "selectedFileName": m["selected_file_name"],
                    "created_at": m["created_at"],
                    "createdAt": m["created_at"],
                })

            cursor.execute("""
                SELECT summary, version, entities_json, updated_at
                FROM conversation_summaries
                WHERE conversation_id = ? AND owner_user_id = ?
            """, (conversation_id, principal.user_id))
            summary_row = cursor.fetchone()
            memory = None
            if summary_row:
                memory = {
                    "summary": summary_row["summary"],
                    "version": summary_row["version"],
                    "entities": json.loads(summary_row["entities_json"]) if summary_row["entities_json"] else [],
                    "updated_at": summary_row["updated_at"]
                }

            return {
                "id": r["conversation_id"],
                "conversation_id": r["conversation_id"],
                "title": r["title"],
                "vault_slug": r["vault_slug"],
                "vaultSlug": r["vault_slug"],
                "selected_file_id": r["selected_file_id"],
                "selectedFileId": r["selected_file_id"],
                "selected_file_name": r["selected_file_name"],
                "selectedFileName": r["selected_file_name"],
                "pinned": bool(r["pinned"]),
                "created_at": r["created_at"],
                "createdAt": r["created_at"],
                "updated_at": r["updated_at"],
                "updatedAt": r["updated_at"],
                "owner_user_id": r["owner_user_id"],
                "tenant_id": r["tenant_id"],
                "messages": messages,
                "memory": memory
            }

    def create_conversation(
        self,
        principal: Principal,
        title: str,
        vault_slug: str = "",
        selected_file_id: Optional[str] = None,
        selected_file_name: Optional[str] = None,
        conversation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Creates a new isolated conversation owned by caller."""
        cid = conversation_id or f"conv_{uuid4().hex[:12]}"
        now = self._now_iso()
        clean_title = (title or "New Conversation").strip()[:120]

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT conversation_id, owner_user_id, tenant_id FROM conversations WHERE conversation_id = ?", (cid,))
            existing = cursor.fetchone()
            if existing:
                if existing["owner_user_id"] == principal.user_id and existing["tenant_id"] == principal.tenant_id:
                    cursor.execute("""
                        UPDATE conversations
                        SET title = ?, vault_slug = ?, selected_file_id = ?, selected_file_name = ?, updated_at = ?
                        WHERE conversation_id = ?
                    """, (clean_title, vault_slug or "", selected_file_id, selected_file_name, now, cid))
                    conn.commit()
                    updated = self.get_conversation(cid, principal)
                    if updated:
                        return updated
                else:
                    raise ConversationServiceError("Conversation ID belongs to another principal.", status_code=403)
            else:
                cursor.execute("""
                    INSERT INTO conversations (
                        conversation_id, tenant_id, owner_user_id, title,
                        vault_slug, selected_file_id, selected_file_name,
                        pinned, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                """, (cid, principal.tenant_id, principal.user_id, clean_title, vault_slug or "",
                      selected_file_id, selected_file_name, now, now))
                conn.commit()

        return {
            "id": cid,
            "conversation_id": cid,
            "title": clean_title,
            "vault_slug": vault_slug or "",
            "vaultSlug": vault_slug or "",
            "selected_file_id": selected_file_id,
            "selectedFileId": selected_file_id,
            "selected_file_name": selected_file_name,
            "selectedFileName": selected_file_name,
            "pinned": False,
            "created_at": now,
            "createdAt": now,
            "updated_at": now,
            "updatedAt": now,
            "messages": [],
            "owner_user_id": principal.user_id,
            "tenant_id": principal.tenant_id
        }

    def update_conversation(
        self,
        conversation_id: str,
        principal: Principal,
        title: Optional[str] = None,
        pinned: Optional[bool] = None,
        vault_slug: Optional[str] = None,
        selected_file_id: Optional[str] = None,
        selected_file_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Updates metadata on an owned conversation."""
        existing = self.get_conversation(conversation_id, principal)
        if not existing:
            raise ConversationNotFoundError()

        now = self._now_iso()
        fields = []
        params = []

        if title is not None:
            fields.append("title = ?")
            params.append(title.strip()[:120])
        if pinned is not None:
            fields.append("pinned = ?")
            params.append(1 if pinned else 0)
        if vault_slug is not None:
            fields.append("vault_slug = ?")
            params.append(vault_slug)
        if selected_file_id is not None:
            fields.append("selected_file_id = ?")
            params.append(selected_file_id)
        if selected_file_name is not None:
            fields.append("selected_file_name = ?")
            params.append(selected_file_name)

        if not fields:
            return existing

        fields.append("updated_at = ?")
        params.append(now)

        params.extend([conversation_id, principal.user_id, principal.tenant_id])
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f"""
                UPDATE conversations
                SET {', '.join(fields)}
                WHERE conversation_id = ? AND owner_user_id = ? AND tenant_id = ?
            """, params)
            conn.commit()

        updated = self.get_conversation(conversation_id, principal)
        return updated or existing

    def delete_conversation(self, conversation_id: str, principal: Principal) -> bool:
        """Deletes an owned conversation and its messages."""
        existing = self.get_conversation(conversation_id, principal)
        if not existing:
            raise ConversationNotFoundError()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM conversation_messages WHERE conversation_id = ? AND owner_user_id = ?", (conversation_id, principal.user_id))
            cursor.execute("DELETE FROM conversation_summaries WHERE conversation_id = ? AND owner_user_id = ?", (conversation_id, principal.user_id))
            cursor.execute("DELETE FROM conversations WHERE conversation_id = ? AND owner_user_id = ? AND tenant_id = ?", (conversation_id, principal.user_id, principal.tenant_id))
            conn.commit()
        return True

    def append_message(
        self,
        conversation_id: str,
        principal: Principal,
        role: str,
        content: str,
        message_id: Optional[str] = None,
        retrieval_mode: Optional[str] = None,
        citations: Optional[List[Dict[str, Any]]] = None,
        evidence_items: Optional[List[Dict[str, Any]]] = None,
        security_trace: Optional[Dict[str, Any]] = None,
        status: Optional[str] = "complete",
        vault_slug: Optional[str] = None,
        selected_file_id: Optional[str] = None,
        selected_file_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Appends a message to an owned conversation."""
        existing = self.get_conversation(conversation_id, principal)
        if not existing:
            raise ConversationNotFoundError()

        mid = message_id or f"msg_{uuid4().hex[:12]}"
        now = self._now_iso()
        cit_json = json.dumps(citations or [])
        ev_json = json.dumps(evidence_items or [])
        trace_json = json.dumps(security_trace) if security_trace else None

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO conversation_messages (
                    message_id, conversation_id, owner_user_id, role,
                    content, retrieval_mode, citations_json, evidence_items_json,
                    security_trace_json, status, vault_slug, selected_file_id,
                    selected_file_name, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                mid, conversation_id, principal.user_id, role,
                content, retrieval_mode, cit_json, ev_json,
                trace_json, status, vault_slug or existing.get("vault_slug", ""),
                selected_file_id, selected_file_name, now
            ))
            cursor.execute("""
                UPDATE conversations SET updated_at = ?
                WHERE conversation_id = ? AND owner_user_id = ?
            """, (now, conversation_id, principal.user_id))
            conn.commit()

        # Update rolling memory periodically if assistant turn completes
        if role == "assistant":
            self.refresh_conversation_summary(conversation_id, principal)

        return {
            "id": mid,
            "role": role,
            "content": content,
            "retrieval_mode": retrieval_mode,
            "retrievalMode": retrieval_mode,
            "citations": citations or [],
            "evidence_items": evidence_items or [],
            "evidenceItems": evidence_items or [],
            "security_trace": security_trace,
            "securityTrace": security_trace,
            "status": status,
            "created_at": now,
            "createdAt": now
        }

    def get_memory(self, conversation_id: str, principal: Principal) -> Optional[Dict[str, Any]]:
        """Fetches isolated rolling memory summary for a conversation."""
        existing = self.get_conversation(conversation_id, principal)
        if not existing:
            raise ConversationNotFoundError()
        return existing.get("memory")

    def refresh_conversation_summary(self, conversation_id: str, principal: Principal) -> Optional[str]:
        """
        Maintains concise, versioned per-conversation rolling summary.
        Deterministic, local, offline-safe: extracts topics, cited resources, and user intent.
        Never duplicates whole documents or sensitive untrusted text into memory.
        """
        conv = self.get_conversation(conversation_id, principal)
        if not conv or not conv.get("messages"):
            return None

        msgs = conv["messages"]
        if len(msgs) < 2:
            return None

        # Build concise continuity summary from turns
        topics = []
        user_queries = [m["content"].strip() for m in msgs if m["role"] == "user"]
        recent_topics = user_queries[-5:]

        # Extract cited resource titles/locators
        cited_locators = set()
        for m in msgs:
            for c in m.get("citations", []):
                if isinstance(c, dict) and c.get("locator"):
                    cited_locators.add(c["locator"])

        summary_parts = [
            f"User asked about: {'; '.join(recent_topics)}."
        ]
        if cited_locators:
            summary_parts.append(f"Referenced sections: {', '.join(list(cited_locators)[:6])}.")
        if conv.get("selected_file_name"):
            summary_parts.append(f"Active file scope: {conv['selected_file_name']}.")

        summary_text = " ".join(summary_parts)
        now = self._now_iso()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO conversation_summaries (
                    conversation_id, owner_user_id, summary, version, entities_json, updated_at
                ) VALUES (?, ?, ?, 1, ?, ?)
                ON CONFLICT(conversation_id) DO UPDATE SET
                    summary = excluded.summary,
                    version = conversation_summaries.version + 1,
                    entities_json = excluded.entities_json,
                    updated_at = excluded.updated_at
            """, (conversation_id, principal.user_id, summary_text, json.dumps(list(cited_locators)), now))
            conn.commit()

        return summary_text

    def build_bounded_context(
        self,
        conversation_id: str,
        principal: Principal,
        max_paired_turns: int = 4
    ) -> List[Dict[str, str]]:
        """
        Constructs bounded history context for LLM query reformulation:
        Includes rolling summary (if conversation > max_paired_turns) plus recent paired turns.
        Guarantees prompt continuity for follow-up questions ("explain that part", "continue").
        """
        conv = self.get_conversation(conversation_id, principal)
        if not conv:
            return []

        messages = conv.get("messages", [])
        if not messages:
            return []

        recent = messages[- (max_paired_turns * 2):]
        context: List[Dict[str, str]] = []

        memory = conv.get("memory")
        if memory and memory.get("summary") and len(messages) > (max_paired_turns * 2):
            context.append({
                "role": "system",
                "content": f"[Conversation Continuity Memory]: {memory['summary']}"
            })

        for m in recent:
            context.append({
                "role": m["role"],
                "content": m["content"]
            })

        return context

conversation_service = ConversationService()
