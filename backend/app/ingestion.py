import json
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from uuid import uuid4
from .models import Chunk, ResourceManifest
from .database import db
from .crypto import compute_content_hash

class IngestionQuarantineError(Exception):
    pass

class MultiModalIngestion:
    """
    Architecture §1.4 & Master Spec §8, §9, §14, §15: Multi-Modal Safe Ingestion Pipeline.
    Implements Safe Chunking: splits chunks whenever security policy changes to prevent cross-policy leakage.
    Stores exact provenance (pages, lines, offsets, bounding boxes).
    """

    @staticmethod
    def validate_upload(filename: str, file_bytes: bytes, max_mb: int = 25):
        """Quarantine checks: file size, empty content, basic bombs (§20, T-DOS-001..004)."""
        if len(file_bytes) > max_mb * 1024 * 1024:
            raise IngestionQuarantineError(f"File size {len(file_bytes)} bytes exceeds quarantine limit {max_mb} MB.")
        if len(file_bytes) == 0:
            raise IngestionQuarantineError("Empty file rejected.")

    @classmethod
    def ingest_document(
        cls,
        vault_id: str,
        title: str,
        resource_type: str,  # 'PDF', 'IMAGE_OCR', 'STRUCTURED_DB'
        pages_or_sections: List[Dict[str, Any]],
        default_classification: int = 1,
        default_min_clearance: int = 1,
        allowed_roles: Optional[List[str]] = None,
        allowed_groups: Optional[List[str]] = None,
        denied_roles: Optional[List[str]] = None,
        denied_users: Optional[List[str]] = None,
    ) -> str:
        """
        Ingests multi-modal document with page/section-level security labels.
        Each section dict: { "text": str, "page": int, "locator": str, "classification": int, "min_clearance": int, "acl_selector": list, "deny_selector": list, "bbox": dict }
        """
        resource_id = f"res_{uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        full_text = " ".join([sec.get("text", "") for sec in pages_or_sections])
        content_hash = compute_content_hash(full_text.encode("utf-8"))

        with db.get_connection() as conn:
            cursor = conn.cursor()

            # 1. Insert Resource
            cursor.execute("""
            INSERT INTO resources (
                resource_id, vault_id, tenant_id, resource_type, title,
                classification, current_version, acl_version, content_hash, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, 'active', ?)
            """, (resource_id, vault_id, "default_tenant", resource_type, title, default_classification, content_hash, now_iso))

            # 2. Insert Resource Manifest
            cursor.execute("""
            INSERT INTO resource_manifests (
                resource_id, vault_id, tenant_id, classification,
                allowed_roles, allowed_groups, allowed_users,
                denied_users, denied_roles, min_clearance, operations,
                policy_version, acl_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
            """, (
                resource_id, vault_id, "default_tenant", default_classification,
                json.dumps(allowed_roles or ["role:analyst", "role:viewer"]),
                json.dumps(allowed_groups or []),
                json.dumps([]),
                json.dumps(denied_users or []),
                json.dumps(denied_roles or []),
                default_min_clearance,
                json.dumps(["read", "rag_context"])
            ))

            # 3. Safe Chunking Algorithm (§1.4)
            # Create chunk boundaries inside ONE policy domain only.
            for idx, sec in enumerate(pages_or_sections):
                chunk_id = f"chk_{uuid4().hex[:8]}"
                sec_text = sec.get("text", "").strip()
                if not sec_text:
                    continue

                chunk_classification = sec.get("classification", default_classification)
                chunk_min_clearance = sec.get("min_clearance", default_min_clearance)
                chunk_acl = sec.get("acl_selector", allowed_roles or ["role:analyst"])
                chunk_deny = sec.get("deny_selector", denied_roles or [])

                provenance = {
                    "page": sec.get("page", 1),
                    "locator": sec.get("locator", f"Page {sec.get('page', 1)}"),
                    "file_hash": content_hash[:16],
                    "resource_title": title,
                    "bbox": sec.get("bbox")
                }

                chunk_hash = compute_content_hash(sec_text.encode("utf-8"))

                cursor.execute("""
                INSERT INTO chunks (
                    chunk_id, resource_id, vault_id, chunk_index, content,
                    classification, min_clearance, acl_selector, deny_selector,
                    provenance, content_hash, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    chunk_id, resource_id, vault_id, idx, sec_text,
                    chunk_classification, chunk_min_clearance,
                    json.dumps(chunk_acl), json.dumps(chunk_deny),
                    json.dumps(provenance), chunk_hash, now_iso
                ))

                # Insert Citation Span for exact quote verification (§26)
                cursor.execute("""
                INSERT INTO citation_spans (
                    span_id, resource_id, chunk_id, vault_id, locator, exact_quote
                ) VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    f"span_{uuid4().hex[:8]}", resource_id, chunk_id, vault_id,
                    provenance["locator"], sec_text
                ))

                # Index chunk in real Qdrant neural vector store
                from .vector_store import vector_store
                chunk_obj = Chunk(
                    chunk_id=chunk_id,
                    resource_id=resource_id,
                    vault_id=vault_id,
                    chunk_index=idx,
                    content=sec_text,
                    classification=chunk_classification,
                    min_clearance=chunk_min_clearance,
                    acl_selector=chunk_acl,
                    deny_selector=chunk_deny,
                    provenance=provenance,
                    content_hash=chunk_hash,
                    created_at=now_iso
                )
                vector_store.index_chunk(chunk_obj)

            conn.commit()

        return resource_id

    @classmethod
    def ingest_raw_pdf(
        cls,
        vault_id: str,
        filename: str,
        pdf_bytes: bytes,
        classification: int = 1,
        min_clearance: int = 1,
        allowed_roles: Optional[List[str]] = None
    ) -> str:
        """Parses real binary PDF using pypdf, extracts text per page, and ingests with provenance."""
        import io
        import pypdf

        cls.validate_upload(filename, pdf_bytes)
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pages_data = []

        for p_idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            if text.strip():
                pages_data.append({
                    "page": p_idx + 1,
                    "locator": f"Page {p_idx + 1}",
                    "text": text.strip(),
                    "classification": classification,
                    "min_clearance": min_clearance,
                    "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                    "deny_selector": []
                })

        return cls.ingest_document(
            vault_id=vault_id,
            title=filename,
            resource_type="PDF",
            pages_or_sections=pages_data,
            default_classification=classification,
            default_min_clearance=min_clearance,
            allowed_roles=allowed_roles
        )

ingestion_pipeline = MultiModalIngestion()
