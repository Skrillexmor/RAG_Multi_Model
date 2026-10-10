import io
import re
import csv
import json
import base64
import urllib.request
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from uuid import uuid4

from .models import Chunk, ResourceManifest, ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE
from .database import db
from .config import STORAGE_DIR, ENCRYPTED_DIR, QUARANTINE_DIR, MEDIA_DIR
from .crypto import compute_content_hash, derive_vault_kek, encrypt_to_file
from .vector_store import vector_store
from .model_manager import local_model_manager

class IngestionQuarantineError(Exception):
    pass

class MultiModalIngestion:
    """
    Architecture §1.4 & Master Spec §8, §9, §14, §15, §70:
    Quarantine, universal multi-modal extraction (PDF, DOCX, Code, Image OCR, Video Keyframes, Audio Segments),
    secret scanning, AES-256-GCM encrypted canonical storage, monotonic chunk policy, and cascading deletion.
    """

    DOC_EXTS = {".pdf", ".docx", ".txt", ".md", ".json", ".csv", ".py", ".sql", ".html"}
    IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}
    VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".avi", ".webm"}
    AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".flac"}
    ALLOWED_EXTENSIONS = DOC_EXTS | IMAGE_EXTS | VIDEO_EXTS | AUDIO_EXTS

    @classmethod
    def validate_upload(cls, filename: str, file_bytes: bytes, max_mb: int = 25):
        """Quarantine checks: file size, empty content, extension allowlist (§11)."""
        if len(file_bytes) > max_mb * 1024 * 1024:
            raise IngestionQuarantineError(f"File size {len(file_bytes)} bytes exceeds quarantine limit {max_mb} MB.")
        if len(file_bytes) == 0:
            raise IngestionQuarantineError("Empty file rejected.")

        ext = Path(filename).suffix.lower()
        if ext not in cls.ALLOWED_EXTENSIONS:
            raise IngestionQuarantineError(f"Extension '{ext}' not permitted in secure quarantine allowlist.")

    @classmethod
    def detect_secrets(cls, text: str) -> bool:
        """Local regex secret / credential scanner (§14, §205)."""
        secret_patterns = [
            r"(?i)(password|passwd|pwd)\s*[:=]\s*[^\s,;]{4,}",
            r"(?i)(api_key|apikey|secret_key|secret)\s*[:=]\s*[^\s,;]{8,}",
            r"\bAKIA[0-9A-Z]{16}\b",
            r"ghp_[a-zA-Z0-9]{36}",
            r"-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----",
            r"(?i)bearer\s+[a-zA-Z0-9_\-\.]{16,}",
            r"(?i)postgres://\S+:\S+@\S+",
            r"(?i)mongodb(\+srv)?://\S+:\S+@\S+"
        ]
        return any(re.search(pat, text) for pat in secret_patterns)

    @classmethod
    def ingest_document(
        cls,
        vault_id: str,
        title: str,
        resource_type: str,  # 'PDF', 'IMAGE_OCR', 'STRUCTURED_CSV'
        pages_or_sections: List[Dict[str, Any]],
        default_classification: int = 1,
        default_min_clearance: int = 1,
        allowed_roles: Optional[List[str]] = None,
        allowed_groups: Optional[List[str]] = None,
        denied_roles: Optional[List[str]] = None,
        denied_users: Optional[List[str]] = None,
        owner_user_id: Optional[str] = None,
    ) -> str:
        """
        Ingests multi-modal document with encrypted canonical storage and monotonic security labels.
        """
        resource_id = f"res_{uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        full_text = " ".join([sec.get("text", "") for sec in pages_or_sections])
        content_hash = compute_content_hash(full_text.encode("utf-8"))
        vault_kek = derive_vault_kek(vault_id)

        # Monotonic classification ceiling check: scan for credentials
        if cls.detect_secrets(full_text):
            default_classification = max(default_classification, 4)  # Elevate to CREDENTIAL

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT tenant_id FROM vaults WHERE vault_id = ?", (vault_id,))
            v_row = cursor.fetchone()
            tenant_id = v_row["tenant_id"] if v_row else "tenant_primary"

            # 1. Insert Resource with owner_user_id
            clean_ou = owner_user_id.replace("user:", "").strip().lower() if owner_user_id else None
            cursor.execute("""
            INSERT INTO resources (
                resource_id, vault_id, tenant_id, resource_type, title, owner_user_id,
                classification, current_version, acl_version, content_hash, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 'active', ?)
            """, (resource_id, vault_id, tenant_id, resource_type, title, clean_ou, default_classification, content_hash, now_iso))

            # 2. Insert Resource Manifest with owner in allowed_users
            initial_allowed_users = [clean_ou, f"user:{clean_ou}"] if clean_ou else []
            cursor.execute("""
            INSERT INTO resource_manifests (
                resource_id, vault_id, tenant_id, classification,
                allowed_roles, allowed_groups, allowed_users,
                denied_users, denied_roles, min_clearance, operations,
                policy_version, acl_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
            """, (
                resource_id, vault_id, tenant_id, default_classification,
                json.dumps(allowed_roles or ["role:analyst", "role:viewer"]),
                json.dumps(allowed_groups or []),
                json.dumps(initial_allowed_users),
                json.dumps(denied_users or []),
                json.dumps(denied_roles or []),
                default_min_clearance,
                json.dumps([ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE])
            ))

            # 3. Policy-Aware Safe Chunking Algorithm (§13)
            for idx, sec in enumerate(pages_or_sections):
                chunk_id = f"chk_{uuid4().hex[:8]}"
                sec_text = sec.get("text", "").strip()
                if not sec_text:
                    continue

                # Monotonic classification: chunk cannot be less sensitive than section or credential scan
                chunk_classification = max(sec.get("classification", default_classification), default_classification)
                if cls.detect_secrets(sec_text):
                    chunk_classification = 4  # CREDENTIAL

                chunk_min_clearance = max(sec.get("min_clearance", default_min_clearance), default_min_clearance)
                chunk_acl = list(sec.get("acl_selector", allowed_roles or ["role:analyst", "role:viewer"]))
                if clean_ou:
                    for ou_tag in (clean_ou, f"user:{clean_ou}"):
                        if ou_tag not in chunk_acl:
                            chunk_acl.append(ou_tag)
                chunk_deny = sec.get("deny_selector", denied_roles or [])

                provenance = {
                    "page": sec.get("page", 1),
                    "locator": sec.get("locator", f"Section {idx + 1}"),
                    "file_hash": content_hash[:16],
                    "resource_title": title,
                    "bbox": sec.get("bbox"),
                    "modality": sec.get("modality", "document"),
                    "media_url": sec.get("media_url"),
                    "timestamp": sec.get("timestamp"),
                    "keyframe_url": sec.get("keyframe_url")
                }

                chunk_hash = compute_content_hash(sec_text.encode("utf-8"))

                # 4. Encrypt Chunk into Canonical Storage (§15, §100)
                chunk_file_path = ENCRYPTED_DIR / f"{chunk_id}.enc"
                encrypt_to_file(sec_text.encode("utf-8"), chunk_file_path, vault_kek)

                cursor.execute("""
                INSERT INTO chunks (
                    chunk_id, resource_id, vault_id, chunk_index, content,
                    classification, min_clearance, acl_selector, deny_selector,
                    provenance, content_hash, storage_path, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    chunk_id, resource_id, vault_id, idx, "",
                    chunk_classification, chunk_min_clearance,
                    json.dumps(chunk_acl), json.dumps(chunk_deny),
                    json.dumps(provenance), chunk_hash, str(chunk_file_path), now_iso
                ))

                # Insert Citation Span
                cursor.execute("""
                INSERT INTO citation_spans (
                    span_id, resource_id, chunk_id, vault_id, locator, exact_quote
                ) VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    f"span_{uuid4().hex[:8]}", resource_id, chunk_id, vault_id,
                    provenance["locator"], ""
                ))

                # 5. Index Chunk metadata in persistent Qdrant (Excluding raw plaintext content)
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
                    storage_path=str(chunk_file_path),
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
        allowed_roles: Optional[List[str]] = None,
        owner_user_id: Optional[str] = None
    ) -> str:
        """Parses real PDF using pypdf, extracts text per page, and ingests with provenance."""
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

        if not pages_data:
            pages_data.append({
                "page": 1,
                "locator": "Page 1",
                "text": f"Document content for {filename}. Uploaded and verified in knowledge vault.",
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
            allowed_roles=allowed_roles,
            owner_user_id=owner_user_id
        )

    @classmethod
    def ingest_raw_docx(
        cls,
        vault_id: str,
        filename: str,
        docx_bytes: bytes,
        classification: int = 1,
        min_clearance: int = 1,
        allowed_roles: Optional[List[str]] = None,
        owner_user_id: Optional[str] = None
    ) -> str:
        """Parses DOCX document paragraphs, headers, and tables."""
        cls.validate_upload(filename, docx_bytes)
        try:
            import docx
            doc = docx.Document(io.BytesIO(docx_bytes))
            sections = []

            sec_idx = 1
            current_buffer = []
            for p in doc.paragraphs:
                txt = p.text.strip()
                if not txt:
                    continue
                current_buffer.append(txt)
                if len("\n".join(current_buffer)) >= 500:
                    sections.append({
                        "page": sec_idx,
                        "locator": f"Section {sec_idx}",
                        "text": "\n".join(current_buffer),
                        "classification": classification,
                        "min_clearance": min_clearance,
                        "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                        "deny_selector": [],
                        "modality": "document"
                    })
                    sec_idx += 1
                    current_buffer = []

            if current_buffer:
                sections.append({
                    "page": sec_idx,
                    "locator": f"Section {sec_idx}",
                    "text": "\n".join(current_buffer),
                    "classification": classification,
                    "min_clearance": min_clearance,
                    "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                    "deny_selector": [],
                    "modality": "document"
                })
                sec_idx += 1

            for t_idx, table in enumerate(doc.tables):
                t_lines = []
                for row in table.rows:
                    r_cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
                    t_lines.append(" | ".join(r_cells))
                if t_lines:
                    sections.append({
                        "page": sec_idx,
                        "locator": f"Table {t_idx + 1}",
                        "text": "\n".join(t_lines),
                        "classification": classification,
                        "min_clearance": min_clearance,
                        "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                        "deny_selector": [],
                        "modality": "document"
                    })
                    sec_idx += 1

            if not sections:
                sections = [{
                    "page": 1,
                    "locator": "Document 1",
                    "text": f"Document content for {filename}.",
                    "classification": classification,
                    "min_clearance": min_clearance,
                    "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                    "deny_selector": [],
                    "modality": "document"
                }]

            return cls.ingest_document(
                vault_id=vault_id,
                title=filename,
                resource_type="DOCX",
                pages_or_sections=sections,
                default_classification=classification,
                default_min_clearance=min_clearance,
                allowed_roles=allowed_roles,
                owner_user_id=owner_user_id
            )
        except Exception as e:
            raise IngestionQuarantineError(f"Failed to process Word document {filename}: {e}")

    @classmethod
    def ingest_raw_code_or_text(
        cls,
        vault_id: str,
        filename: str,
        text_bytes: bytes,
        classification: int = 1,
        min_clearance: int = 1,
        allowed_roles: Optional[List[str]] = None,
        owner_user_id: Optional[str] = None
    ) -> str:
        """Ingests structured code, scripts, or plain text with logical line chunking."""
        cls.validate_upload(filename, text_bytes)
        try:
            raw_text = text_bytes.decode("utf-8")
        except UnicodeDecodeError:
            raw_text = text_bytes.decode("latin-1", errors="replace")

        ext = Path(filename).suffix.lower()
        is_code = ext in {".py", ".sql", ".json", ".csv", ".html"}
        res_type = "CODE" if is_code else "TEXT"

        lines = raw_text.splitlines()
        sections = []
        sec_idx = 1
        buffer_lines = []
        start_line = 1

        for idx, line in enumerate(lines, 1):
            buffer_lines.append(line)
            if len("\n".join(buffer_lines)) >= 600 or idx == len(lines):
                sec_text = "\n".join(buffer_lines).strip()
                if sec_text:
                    locator = f"Lines {start_line}-{idx}" if is_code else f"Section {sec_idx}"
                    sections.append({
                        "page": sec_idx,
                        "locator": locator,
                        "text": sec_text,
                        "classification": classification,
                        "min_clearance": min_clearance,
                        "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                        "deny_selector": [],
                        "modality": "code" if is_code else "document"
                    })
                    sec_idx += 1
                buffer_lines = []
                start_line = idx + 1

        if not sections:
            sections = [{
                "page": 1,
                "locator": "Section 1",
                "text": f"File content for {filename}.",
                "classification": classification,
                "min_clearance": min_clearance,
                "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                "deny_selector": [],
                "modality": "document"
            }]

        return cls.ingest_document(
            vault_id=vault_id,
            title=filename,
            resource_type=res_type,
            pages_or_sections=sections,
            default_classification=classification,
            default_min_clearance=min_clearance,
            allowed_roles=allowed_roles,
            owner_user_id=owner_user_id
        )

    @classmethod
    def ingest_raw_image(
        cls,
        vault_id: str,
        filename: str,
        image_bytes: bytes,
        classification: int = 1,
        min_clearance: int = 1,
        allowed_roles: Optional[List[str]] = None,
        owner_user_id: Optional[str] = None
    ) -> str:
        """
        Parses image using Deep Multimodal Vision (Qwen-VL) + OCR,
        with strict single-model RAM protection and web preview storage.
        """
        from PIL import Image
        cls.validate_upload(filename, image_bytes)
        img = Image.open(io.BytesIO(image_bytes))

        # Save display copy to media directory
        media_token = uuid4().hex[:10]
        preview_filename = f"img_{media_token}.png"
        preview_path = MEDIA_DIR / preview_filename
        try:
            img.save(preview_path, format="PNG")
            media_url = f"/api/media/{preview_filename}"
        except Exception:
            media_url = None

        # Execute Qwen-VL multimodal reasoning + OCR via model manager
        analysis_result = local_model_manager.analyze_image(image_bytes, filename=filename)
        full_content = analysis_result.get("combined_text", f"Image asset {filename}")

        sections = [{
            "page": 1,
            "locator": f"Image Asset ({img.width}x{img.height})",
            "text": full_content,
            "classification": classification,
            "min_clearance": min_clearance,
            "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
            "deny_selector": [],
            "bbox": {"x": 0, "y": 0, "w": img.width, "h": img.height},
            "modality": "image",
            "media_url": media_url
        }]

        return cls.ingest_document(
            vault_id=vault_id,
            title=filename,
            resource_type="IMAGE_OCR",
            pages_or_sections=sections,
            default_classification=classification,
            default_min_clearance=min_clearance,
            allowed_roles=allowed_roles,
            owner_user_id=owner_user_id
        )

    @classmethod
    def ingest_raw_video(
        cls,
        vault_id: str,
        filename: str,
        video_bytes: bytes,
        classification: int = 1,
        min_clearance: int = 1,
        allowed_roles: Optional[List[str]] = None,
        owner_user_id: Optional[str] = None
    ) -> str:
        """
        Parses video files using OpenCV keyframe extraction & scene OCR.
        Saves keyframe snapshots with timestamped chunks.
        """
        import cv2
        cls.validate_upload(filename, video_bytes, max_mb=100)

        media_token = uuid4().hex[:10]
        ext = Path(filename).suffix.lower()
        temp_video_path = QUARANTINE_DIR / f"vid_{media_token}{ext}"
        temp_video_path.write_bytes(video_bytes)

        cap = cv2.VideoCapture(str(temp_video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_sec = total_frames / fps if fps > 0 else 0

        # Sample keyframes every 15-30 seconds (or at least 3 points)
        interval_sec = max(15.0, duration_sec / 10.0) if duration_sec > 30 else 5.0
        current_time = 0.0
        sections = []
        sec_idx = 1

        try:
            import easyocr
            reader = easyocr.Reader(['en'], gpu=False)
        except Exception:
            reader = None

        while current_time < duration_sec:
            frame_num = int(current_time * fps)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
            ret, frame = cap.read()
            if not ret:
                break

            mins = int(current_time // 60)
            secs = int(current_time % 60)
            timestamp_str = f"{mins:02d}:{secs:02d}"

            # Save keyframe image
            keyframe_name = f"vid_{media_token}_f{int(current_time)}.jpg"
            keyframe_path = MEDIA_DIR / keyframe_name
            cv2.imwrite(str(keyframe_path), frame)
            keyframe_url = f"/api/media/{keyframe_name}"

            # Run OCR on frame to extract on-screen slide text
            ocr_text = ""
            if reader:
                try:
                    ocr_results = reader.readtext(frame, detail=0)
                    ocr_text = " ".join(ocr_results).strip()
                except Exception:
                    ocr_text = ""

            content_line = f"Video scene at timestamp {timestamp_str}."
            if ocr_text:
                content_line += f" On-screen text: {ocr_text}"

            sections.append({
                "page": sec_idx,
                "locator": f"Video @ {timestamp_str}",
                "text": content_line,
                "classification": classification,
                "min_clearance": min_clearance,
                "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                "deny_selector": [],
                "modality": "video",
                "timestamp": timestamp_str,
                "keyframe_url": keyframe_url,
                "media_url": keyframe_url
            })

            sec_idx += 1
            current_time += interval_sec

        cap.release()

        # Extract audio speech track from video using Whisper
        try:
            audio_segments = local_model_manager.transcribe_audio(temp_video_path, filename=filename)
            for seg in audio_segments:
                s_text = seg.get("text", "").strip()
                if s_text and "No spoken speech detected" not in s_text:
                    ts = seg.get("timestamp", "00:00")
                    sections.append({
                        "page": sec_idx,
                        "locator": f"Video Audio [{ts}]",
                        "text": f"[{ts}] Spoken Dialogue: {s_text}",
                        "classification": classification,
                        "min_clearance": min_clearance,
                        "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                        "deny_selector": [],
                        "modality": "video_audio",
                        "timestamp": ts,
                        "media_url": None
                    })
                    sec_idx += 1
        except Exception:
            pass

        try:
            temp_video_path.unlink()
        except Exception:
            pass

        if not sections:
            sections = [{
                "page": 1,
                "locator": "Video [00:00]",
                "text": f"Video file {filename} ingested into knowledge compartment.",
                "classification": classification,
                "min_clearance": min_clearance,
                "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                "deny_selector": [],
                "modality": "video",
                "timestamp": "00:00"
            }]

        return cls.ingest_document(
            vault_id=vault_id,
            title=filename,
            resource_type="VIDEO",
            pages_or_sections=sections,
            default_classification=classification,
            default_min_clearance=min_clearance,
            allowed_roles=allowed_roles,
            owner_user_id=owner_user_id
        )

    @classmethod
    def ingest_raw_audio(
        cls,
        vault_id: str,
        filename: str,
        audio_bytes: bytes,
        classification: int = 1,
        min_clearance: int = 1,
        allowed_roles: Optional[List[str]] = None,
        owner_user_id: Optional[str] = None
    ) -> str:
        """
        Parses audio recordings using local faster-whisper speech recognition,
        stores playable audio track in media store, and slices into timestamped
        verbatim speech chunks with strict single-model RAM protection.
        """
        cls.validate_upload(filename, audio_bytes, max_mb=50)

        media_token = uuid4().hex[:10]
        ext = Path(filename).suffix.lower() or ".mp3"
        audio_filename = f"aud_{media_token}{ext}"
        audio_path = MEDIA_DIR / audio_filename
        audio_path.write_bytes(audio_bytes)
        audio_url = f"/api/media/{audio_filename}"

        # Run Whisper speech transcription via model manager
        transcription_segments = local_model_manager.transcribe_audio(audio_path, filename=filename)

        sections = []
        for seg_idx, seg in enumerate(transcription_segments, start=1):
            ts = seg.get("timestamp", "00:00")
            speech_text = seg.get("text", "").strip()
            locator = f"Audio Segment [{ts}]"
            verbatim_chunk = f"[{ts}] {speech_text}" if speech_text else f"Audio recording segment ({ts})"

            sections.append({
                "page": seg_idx,
                "locator": locator,
                "text": verbatim_chunk,
                "classification": classification,
                "min_clearance": min_clearance,
                "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                "deny_selector": [],
                "modality": "audio",
                "timestamp": ts,
                "media_url": audio_url
            })

        if not sections:
            sections = [{
                "page": 1,
                "locator": "Audio [00:00]",
                "text": f"Audio file {filename} ingested into knowledge compartment.",
                "classification": classification,
                "min_clearance": min_clearance,
                "acl_selector": allowed_roles or ["role:analyst", "role:viewer"],
                "deny_selector": [],
                "modality": "audio",
                "timestamp": "00:00",
                "media_url": audio_url
            }]

        return cls.ingest_document(
            vault_id=vault_id,
            title=filename,
            resource_type="AUDIO",
            pages_or_sections=sections,
            default_classification=classification,
            default_min_clearance=min_clearance,
            allowed_roles=allowed_roles,
            owner_user_id=owner_user_id
        )

    @classmethod
    def ingest_universal(
        cls,
        vault_id: str,
        filename: str,
        file_bytes: bytes,
        classification: int = 1,
        min_clearance: int = 1,
        allowed_roles: Optional[List[str]] = None,
        owner_user_id: Optional[str] = None
    ) -> str:
        """
        Universal Multimodal Router:
        Automatically identifies file format and routes to the optimal extractor.
        """
        ext = Path(filename).suffix.lower()
        if ext == ".pdf":
            return cls.ingest_raw_pdf(vault_id, filename, file_bytes, classification, min_clearance, allowed_roles, owner_user_id=owner_user_id)
        elif ext == ".docx":
            return cls.ingest_raw_docx(vault_id, filename, file_bytes, classification, min_clearance, allowed_roles, owner_user_id=owner_user_id)
        elif ext in cls.IMAGE_EXTS:
            return cls.ingest_raw_image(vault_id, filename, file_bytes, classification, min_clearance, allowed_roles, owner_user_id=owner_user_id)
        elif ext in cls.VIDEO_EXTS:
            return cls.ingest_raw_video(vault_id, filename, file_bytes, classification, min_clearance, allowed_roles, owner_user_id=owner_user_id)
        elif ext in cls.AUDIO_EXTS:
            return cls.ingest_raw_audio(vault_id, filename, file_bytes, classification, min_clearance, allowed_roles, owner_user_id=owner_user_id)
        elif ext in cls.DOC_EXTS:
            return cls.ingest_raw_code_or_text(vault_id, filename, file_bytes, classification, min_clearance, allowed_roles, owner_user_id=owner_user_id)
        else:
            raise IngestionQuarantineError(f"Unsupported file format '{ext}' in multimodal pipeline.")

    @classmethod
    def ingest_structured_csv(
        cls,
        vault_id: str,
        table_name: str,
        csv_text: str,
        owner_id: str,
        field_configs: Optional[Dict[str, Dict[str, Any]]] = None
    ) -> int:
        """
        Ingests real CSV into structured tables with Row-Level Security (RLS) and Field Policies (§24, §26).
        """
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        rows = list(reader)
        if not rows:
            return 0

        now_iso = datetime.now(timezone.utc).isoformat()
        field_names = list(rows[0].keys())

        with db.get_connection() as conn:
            cursor = conn.cursor()

            # 1. Register Table
            cursor.execute("""
            INSERT OR REPLACE INTO structured_tables (table_id, vault_id, table_name, schema_json, classification, owner_id, created_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
            """, (f"tbl_{uuid4().hex[:8]}", vault_id, table_name, json.dumps(field_names), owner_id, now_iso))

            # 2. Register Field Policies
            field_configs = field_configs or {}
            for field in field_names:
                cfg = field_configs.get(field, {})
                f_class = cfg.get("classification", 1)
                f_min_clearance = cfg.get("min_clearance", 1)
                f_allowed = cfg.get("allowed_roles", [])
                f_denied = cfg.get("denied_roles", [])
                f_sens = 1 if cfg.get("is_sensitive", False) or "salary" in field.lower() or "bank" in field.lower() else 0

                cursor.execute("""
                INSERT OR REPLACE INTO field_policies (
                    policy_id, vault_id, table_name, field_name, classification,
                    min_clearance, allowed_roles, denied_roles, is_sensitive
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    f"fp_{uuid4().hex[:8]}", vault_id, table_name, field,
                    f_class, f_min_clearance, json.dumps(f_allowed), json.dumps(f_denied), f_sens
                ))

            # 3. Insert Structured Rows with security metadata
            for row in rows:
                rec_id = f"rec_{uuid4().hex[:8]}"
                row_class = 1
                row_roles = ["role:viewer", "role:analyst", "role:engineer", "role:hr", "role:admin"]

                cursor.execute("""
                INSERT INTO structured_records (
                    record_id, vault_id, table_name, row_data, classification,
                    min_clearance, allowed_roles, denied_roles, owner_id, created_at
                ) VALUES (?, ?, ?, ?, ?, 1, ?, '[]', ?, ?)
                """, (
                    rec_id, vault_id, table_name, json.dumps(row),
                    row_class, json.dumps(row_roles), owner_id, now_iso
                ))

            conn.commit()

        return len(rows)

    @classmethod
    def delete_resource(cls, resource_id: str):
        """Cascading Deletion Pipeline (§70): Deletes canonical files, chunks, Qdrant vectors, citations."""
        with db.get_connection() as conn:
            cursor = conn.cursor()

            # Find all chunks and dynamic cached chunks
            cursor.execute("SELECT chunk_id, storage_path FROM chunks WHERE resource_id = ?", (resource_id,))
            chunk_rows = cursor.fetchall()
            cursor.execute("SELECT chunk_id, storage_path FROM dynamic_chunks WHERE resource_id = ?", (resource_id,))
            dyn_rows = cursor.fetchall()

            for r in list(chunk_rows) + list(dyn_rows):
                sp = r["storage_path"]
                if sp and Path(sp).exists():
                    try:
                        Path(sp).unlink()
                    except Exception:
                        pass

            # Delete Qdrant vectors
            vector_store.delete_resource_vectors(resource_id)
            dyn_ids = [r["chunk_id"] for r in dyn_rows]
            if dyn_ids:
                vector_store.delete_points(dyn_ids)

            # Delete citation spans, chunks, dynamic chunks, manifest, resource
            cursor.execute("DELETE FROM citation_spans WHERE resource_id = ?", (resource_id,))
            cursor.execute("DELETE FROM chunks WHERE resource_id = ?", (resource_id,))
            cursor.execute("DELETE FROM dynamic_chunks WHERE resource_id = ?", (resource_id,))
            cursor.execute("DELETE FROM resource_manifests WHERE resource_id = ?", (resource_id,))
            cursor.execute("UPDATE resources SET status = 'deleted' WHERE resource_id = ?", (resource_id,))

            conn.commit()

ingestion_pipeline = MultiModalIngestion()
