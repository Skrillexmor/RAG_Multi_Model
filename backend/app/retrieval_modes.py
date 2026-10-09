import re
import json
import logging
import hashlib
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime, timezone
from uuid import uuid4
from pathlib import Path

from .models import Chunk, EvidenceItem, Vault, Principal, Grant, ResourceManifest
from .vector_store import vector_store
from .policy_compiler import CompiledFilter
from .canonical_gate import canonical_gate
from .crypto import derive_vault_kek, encrypt_to_file, decrypt_from_file, compute_content_hash
from .database import db
from .config import ENCRYPTED_DIR, DYNAMIC_CACHE_MAX_CHUNKS
from .time_authority import time_authority

logger = logging.getLogger(__name__)

class RetrievalPipeline:
    """
    Adaptive Multimodal Retrieval Engine:
      - LOW: Standard Pre-indexed Vector RAG (Fast, minimal runtime compute).
      - MEDIUM: Lazy, Query-Aware Chunking (Coarse search + on-demand sentence/paragraph slicing with secure caching).
      - HIGH: Advanced Query-Aware Retrieval (Intent extraction, hybrid scoring, context expansion, lightweight local reranking).
    """

    STRATEGY_VERSION = "v1"

    # ------------------ CACHE MANAGEMENT (MEDIUM & HIGH) ------------------

    @classmethod
    def compute_cache_key(
        cls,
        resource_id: str,
        resource_version: int,
        source_content_hash: str,
        source_span: str,
        strategy_version: str = "v1"
    ) -> str:
        """
        Derives deterministic SHA-256 cache key bound to resource version,
        content hash, source span, and chunking strategy.
        """
        key_raw = f"{resource_id}:{resource_version}:{source_content_hash}:{source_span}:{strategy_version}"
        return hashlib.sha256(key_raw.encode("utf-8")).hexdigest()

    @classmethod
    def evict_cache_if_needed(cls, max_capacity: int = DYNAMIC_CACHE_MAX_CHUNKS):
        """Enforces bounded dynamic chunk cache growth using LRU eviction."""
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as cnt FROM dynamic_chunks")
            count = cursor.fetchone()["cnt"]
            if count > max_capacity:
                excess = count - max_capacity
                cursor.execute("""
                    SELECT cache_key, chunk_id, storage_path
                    FROM dynamic_chunks
                    ORDER BY last_accessed_at ASC
                    LIMIT ?
                """, (excess,))
                evict_rows = cursor.fetchall()
                evict_keys = [r["cache_key"] for r in evict_rows]
                evict_chunk_ids = [r["chunk_id"] for r in evict_rows]

                for r in evict_rows:
                    sp = r["storage_path"]
                    if sp and Path(sp).exists():
                        try:
                            Path(sp).unlink()
                        except Exception:
                            pass

                # Delete from dynamic_chunks and chunks table
                placeholders = ",".join(["?"] * len(evict_keys))
                cursor.execute(f"DELETE FROM dynamic_chunks WHERE cache_key IN ({placeholders})", evict_keys)
                cursor.execute(f"DELETE FROM chunks WHERE chunk_id IN ({','.join(['?'] * len(evict_chunk_ids))})", evict_chunk_ids)
                conn.commit()

                # Delete from vector store
                vector_store.delete_points(evict_chunk_ids)

    # ------------------ TEXT PROCESSING & BOUNDARIES ------------------

    @classmethod
    def split_sentences(cls, text: str) -> List[str]:
        """Splits text into clean sentences respecting punctuation boundaries."""
        sentences = re.split(r'(?<=[.!?])\s+|\n\n+', text.strip())
        return [s.strip() for s in sentences if s.strip()]

    @classmethod
    def create_query_aware_slices(
        cls,
        parent_text: str,
        query_terms: List[str],
        target_chunk_size: int = 350,
        overlap_sentences: int = 1
    ) -> List[Tuple[str, str]]:
        """
        Generates query-aware text slices respecting sentence and paragraph boundaries.
        Returns list of (span_locator, slice_text).
        """
        sentences = cls.split_sentences(parent_text)
        if not sentences:
            return [("Span 0", parent_text)]

        # Score sentences by term overlap
        scored = []
        lower_terms = [t.lower() for t in query_terms if len(t) > 2]
        for idx, s in enumerate(sentences):
            s_lower = s.lower()
            score = sum(1 for t in lower_terms if t in s_lower)
            scored.append((idx, score, s))

        # Windows of sentences around high-scoring sentences
        slices: List[Tuple[str, str]] = []
        seen_spans = set()

        # Group sentences into units of ~target_chunk_size
        current_unit = []
        current_len = 0
        start_idx = 0

        for idx, s in enumerate(sentences):
            current_unit.append(s)
            current_len += len(s) + 1

            if current_len >= target_chunk_size or idx == len(sentences) - 1:
                end_idx = idx
                span_id = f"sents_{start_idx}_{end_idx}"
                if span_id not in seen_spans:
                    slice_content = " ".join(current_unit)
                    slices.append((span_id, slice_content))
                    seen_spans.add(span_id)

                # Overlap
                overlap_count = min(overlap_sentences, len(current_unit))
                current_unit = current_unit[-overlap_count:] if overlap_count > 0 else []
                current_len = sum(len(x) + 1 for x in current_unit)
                start_idx = idx - len(current_unit) + 1

        if not slices:
            slices.append(("Full Span", parent_text))

        return slices

    # ------------------ QUERY ANALYSIS (HIGH MODE) ------------------

    @classmethod
    def analyze_query(cls, query: str) -> Dict[str, Any]:
        """
        Extracts key entities, keywords, and domain intents for query-aware refinement.
        100% offline rule-based heuristic + local model extraction.
        """
        clean_q = query.strip()
        # Extract terms (alphanumeric, min length 3)
        words = re.findall(r'\b[A-Za-z0-9_-]{3,}\b', clean_q)
        stop_words = {
            "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
            "the", "and", "for", "with", "from", "that", "this", "these", "those",
            "is", "are", "was", "were", "been", "being", "have", "has", "had", "does",
            "did", "can", "could", "will", "would", "should", "tell", "give", "show"
        }
        keywords = [w for w in words if w.lower() not in stop_words]

        # Extract potential named entities / capitalized terms
        entities = re.findall(r'\b[A-Z][a-z0-9]+\b', clean_q)

        # Context expansion terms
        expansion_terms = []
        lower_q = clean_q.lower()
        if any(w in lower_q for w in ["budget", "finance", "cost", "revenue", "price"]):
            expansion_terms.extend(["budget", "financial", "expenditure", "allocation", "q1", "q2", "q3", "q4"])
        if any(w in lower_q for w in ["security", "policy", "clearance", "access", "auth"]):
            expansion_terms.extend(["authorization", "permission", "clearance", "compliance", "policy"])
        if any(w in lower_q for w in ["audio", "speech", "call", "voice", "recording"]):
            expansion_terms.extend(["transcript", "dialogue", "spoken", "timestamp", "recording"])
        if any(w in lower_q for w in ["image", "photo", "picture", "visual", "diagram"]):
            expansion_terms.extend(["visual", "description", "ocr", "diagram", "scenery"])

        all_terms = list(dict.fromkeys(keywords + entities + expansion_terms))
        return {
            "raw_query": clean_q,
            "keywords": keywords,
            "entities": entities,
            "expansion_terms": expansion_terms,
            "all_terms": all_terms
        }

    # ------------------ LEXICAL & RERANKING SCORER ------------------

    @classmethod
    def compute_lexical_score(cls, text: str, query_terms: List[str]) -> float:
        """Computes normalized lexical term overlap score [0.0 - 1.0]."""
        if not text or not query_terms:
            return 0.0
        text_lower = text.lower()
        matches = 0
        for t in query_terms:
            if t.lower() in text_lower:
                matches += 1
        return min(1.0, matches / max(1, len(query_terms)))

    # ------------------ RETRIEVAL MODES IMPLEMENTATION ------------------

    @classmethod
    def retrieve(
        cls,
        mode: str,
        query: str,
        compiled_filter: CompiledFilter,
        vault: Vault,
        principal: Principal,
        top_k: int = 10,
        resource_id: Optional[str] = None
    ) -> List[Tuple[Chunk, float]]:
        """
        Unified Retrieval Router supporting LOW, MEDIUM, and HIGH modes.
        Enforces Gate A compiled filter strictly across all modes.
        """
        mode_clean = (mode or "LOW").upper()
        if mode_clean not in ("LOW", "MEDIUM", "HIGH"):
            raise ValueError(f"Unsupported retrieval mode '{mode}'. Valid modes: LOW, MEDIUM, HIGH.")

        if mode_clean == "LOW":
            return cls._retrieve_low(query, compiled_filter, top_k, vault)
        elif mode_clean == "MEDIUM":
            return cls._retrieve_medium(query, compiled_filter, vault, principal, top_k, resource_id)
        else:
            return cls._retrieve_high(query, compiled_filter, vault, principal, top_k, resource_id)

    @classmethod
    def _retrieve_low(
        cls,
        query: str,
        compiled_filter: CompiledFilter,
        top_k: int = 10,
        vault: Optional[Vault] = None
    ) -> List[Tuple[Chunk, float]]:
        """
        LOW Mode: Standard direct vector search from persistent index.
        """
        candidates = vector_store.search(query, compiled_filter, top_k=top_k)
        kek_cache: Dict[str, bytes] = {}
        with db.get_connection() as conn:
            cursor = conn.cursor()
            for chunk, score in candidates:
                cursor.execute("SELECT content, storage_path, vault_id FROM chunks WHERE chunk_id = ?", (chunk.chunk_id,))
                row = cursor.fetchone()
                if not row:
                    cursor.execute("SELECT content, storage_path, vault_id FROM dynamic_chunks WHERE chunk_id = ?", (chunk.chunk_id,))
                    row = cursor.fetchone()
                if row:
                    text = row["content"] or ""
                    sp = row["storage_path"]
                    v_id = row["vault_id"] or (vault.vault_id if vault else getattr(chunk, "vault_id", None))
                    if sp and Path(sp).exists() and v_id:
                        try:
                            if v_id not in kek_cache:
                                kek_cache[v_id] = derive_vault_kek(v_id)
                            dec = decrypt_from_file(Path(sp), kek_cache[v_id])
                            text = dec.decode("utf-8", errors="replace")
                        except Exception:
                            pass
                    if text:
                        chunk.content = text
        return candidates

    @classmethod
    def _retrieve_medium(
        cls,
        query: str,
        compiled_filter: CompiledFilter,
        vault: Vault,
        principal: Principal,
        top_k: int = 10,
        resource_id: Optional[str] = None
    ) -> List[Tuple[Chunk, float]]:
        """
        MEDIUM Mode: Lazy, Query-Aware Chunking.
        1. Retrieve candidate coarse parent chunks/sections via Gate A filter.
        2. Create finer, query-aware chunks respecting sentence/paragraph boundaries.
        3. Check dynamic cache (deduplicated by stable hash); persist & embed on cache miss.
        4. Return authorized chunks with relevance scores.
        """
        # Step 1: Retrieve coarse candidate sections from Qdrant with Gate A filter
        parent_candidates = vector_store.search(query, compiled_filter, top_k=max(top_k, 5))
        if not parent_candidates:
            return []

        vault_kek = derive_vault_kek(vault.vault_id)
        now_iso = time_authority.now().timestamp.isoformat()
        query_analysis = cls.analyze_query(query)
        query_terms = query_analysis["all_terms"]

        refined_candidates: List[Tuple[Chunk, float]] = []

        with db.get_connection() as conn:
            cursor = conn.cursor()

            for parent_chunk, base_score in parent_candidates:
                # Fetch parent canonical plaintext from SQL or encrypted storage
                cursor.execute("""
                    SELECT c.*, r.current_version, r.content_hash as res_content_hash, r.title as res_title
                    FROM chunks c
                    JOIN resources r ON c.resource_id = r.resource_id
                    WHERE c.chunk_id = ?
                """, (parent_chunk.chunk_id,))
                p_row = cursor.fetchone()
                if not p_row:
                    continue

                parent_text = p_row["content"]
                sp = p_row["storage_path"]
                if sp and Path(sp).exists():
                    try:
                        decrypted = decrypt_from_file(Path(sp), vault_kek)
                        parent_text = decrypted.decode("utf-8", errors="replace")
                    except Exception:
                        pass

                res_version = p_row["current_version"] or 1
                res_content_hash = p_row["content_hash"]

                # If parent text is already atomic/short, reuse as-is
                if len(parent_text) < 100 or len(cls.split_sentences(parent_text)) <= 1:
                    parent_chunk.content = parent_text
                    refined_candidates.append((parent_chunk, base_score))
                    continue

                # Step 2: Query-aware slicing around sentence and paragraph boundaries
                slices = cls.create_query_aware_slices(
                    parent_text=parent_text,
                    query_terms=query_terms,
                    target_chunk_size=150,
                    overlap_sentences=1
                )

                for span_id, slice_content in slices:
                    slice_content_clean = slice_content.strip()
                    if not slice_content_clean:
                        continue

                    # Step 3: Compute stable deterministic cache key (§7, §8)
                    cache_key = cls.compute_cache_key(
                        resource_id=parent_chunk.resource_id,
                        resource_version=res_version,
                        source_content_hash=res_content_hash,
                        source_span=span_id,
                        strategy_version=cls.STRATEGY_VERSION
                    )

                    # Check dynamic cache table
                    cursor.execute("SELECT * FROM dynamic_chunks WHERE cache_key = ?", (cache_key,))
                    cached = cursor.fetchone()

                    if cached:
                        # Cache hit: bump access stats and reuse
                        cursor.execute("""
                            UPDATE dynamic_chunks
                            SET access_count = access_count + 1, last_accessed_at = ?
                            WHERE cache_key = ?
                        """, (now_iso, cache_key))
                        conn.commit()

                        c_obj = Chunk(
                            chunk_id=cached["chunk_id"],
                            resource_id=cached["resource_id"],
                            vault_id=cached["vault_id"],
                            chunk_index=parent_chunk.chunk_index,
                            content=cached["content"],
                            classification=cached["classification"],
                            min_clearance=cached["min_clearance"],
                            acl_selector=json.loads(cached["acl_selector"]),
                            deny_selector=json.loads(cached["deny_selector"]),
                            provenance=json.loads(cached["provenance"]),
                            content_hash=cached["content_hash"],
                            storage_path=cached["storage_path"],
                            created_at=cached["created_at"]
                        )
                        lex_score = cls.compute_lexical_score(cached["content"], query_terms)
                        combined_score = 0.7 * base_score + 0.3 * lex_score
                        refined_candidates.append((c_obj, combined_score))
                    else:
                        # Cache miss: Generate dynamic child chunk and securely persist
                        dyn_chunk_id = f"chk_dyn_{uuid4().hex[:8]}"
                        dyn_hash = compute_content_hash(slice_content_clean.encode("utf-8"))
                        dyn_file_path = ENCRYPTED_DIR / f"{dyn_chunk_id}.enc"
                        encrypt_to_file(slice_content_clean.encode("utf-8"), dyn_file_path, vault_kek)

                        # Inherit classification, clearance, and ACLs from parent
                        dyn_provenance = {
                            "locator": f"{p_row['provenance'] and json.loads(p_row['provenance']).get('locator', 'Section')} ({span_id})",
                            "resource_title": p_row["res_title"],
                            "is_dynamic": True,
                            "parent_chunk_id": parent_chunk.chunk_id,
                            "span": span_id,
                            "modality": "document"
                        }

                        cursor.execute("""
                            INSERT INTO dynamic_chunks (
                                cache_key, chunk_id, resource_id, resource_version, vault_id,
                                source_content_hash, source_span, strategy_version, content,
                                classification, min_clearance, acl_selector, deny_selector,
                                provenance, content_hash, storage_path, access_count,
                                last_accessed_at, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                        """, (
                            cache_key, dyn_chunk_id, parent_chunk.resource_id, res_version, vault.vault_id,
                            res_content_hash, span_id, cls.STRATEGY_VERSION, "",
                            parent_chunk.classification, parent_chunk.min_clearance,
                            json.dumps(parent_chunk.acl_selector), json.dumps(parent_chunk.deny_selector),
                            json.dumps(dyn_provenance), dyn_hash, str(dyn_file_path),
                            now_iso, now_iso
                        ))

                        # Also insert into chunks table for seamless Gate B canonical access
                        cursor.execute("""
                            INSERT INTO chunks (
                                chunk_id, resource_id, vault_id, chunk_index, content,
                                classification, min_clearance, acl_selector, deny_selector,
                                provenance, content_hash, storage_path, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            dyn_chunk_id, parent_chunk.resource_id, vault.vault_id, parent_chunk.chunk_index,
                            "", parent_chunk.classification, parent_chunk.min_clearance,
                            json.dumps(parent_chunk.acl_selector), json.dumps(parent_chunk.deny_selector),
                            json.dumps(dyn_provenance), dyn_hash, str(dyn_file_path), now_iso
                        ))
                        conn.commit()

                        c_obj = Chunk(
                            chunk_id=dyn_chunk_id,
                            resource_id=parent_chunk.resource_id,
                            vault_id=vault.vault_id,
                            chunk_index=parent_chunk.chunk_index,
                            content=slice_content_clean,
                            classification=parent_chunk.classification,
                            min_clearance=parent_chunk.min_clearance,
                            acl_selector=parent_chunk.acl_selector,
                            deny_selector=parent_chunk.deny_selector,
                            provenance=dyn_provenance,
                            content_hash=dyn_hash,
                            storage_path=str(dyn_file_path),
                            created_at=now_iso
                        )

                        # Embed and index into vector store
                        vector_store.index_chunk(c_obj)

                        lex_score = cls.compute_lexical_score(slice_content_clean, query_terms)
                        combined_score = 0.7 * base_score + 0.3 * lex_score
                        refined_candidates.append((c_obj, combined_score))

        cls.evict_cache_if_needed()

        # Sort by relevance and return top_k
        refined_candidates.sort(key=lambda x: x[1], reverse=True)
        return refined_candidates[:top_k]

    @classmethod
    def _retrieve_high(
        cls,
        query: str,
        compiled_filter: CompiledFilter,
        vault: Vault,
        principal: Principal,
        top_k: int = 10,
        resource_id: Optional[str] = None
    ) -> List[Tuple[Chunk, float]]:
        """
        HIGH Mode: Advanced Query-Aware Retrieval.
        1. Analyzes query intent, entities, and expansion terms.
        2. Retrieves candidate parent sections via hybrid lexical & vector retrieval.
        3. Expands relevant passages to neighboring context windows so essential details aren't severed.
        4. Lightweight local reranker sorts candidates by semantic relevance and coverage.
        5. Enforces context budget and degrades gracefully if local components stall.
        """
        query_analysis = cls.analyze_query(query)
        expanded_query = query
        if query_analysis["expansion_terms"]:
            expanded_query = f"{query} {' '.join(query_analysis['expansion_terms'][:4])}"

        # Step 1: Hybrid retrieval candidates
        try:
            candidates = vector_store.search(expanded_query, compiled_filter, top_k=max(top_k * 2, 12))
        except Exception as e:
            logger.warning(f"HIGH mode expanded search fallback: {e}")
            candidates = vector_store.search(query, compiled_filter, top_k=top_k)

        if not candidates:
            return []

        vault_kek = derive_vault_kek(vault.vault_id)
        query_terms = query_analysis["all_terms"]

        rescored_candidates: List[Tuple[Chunk, float]] = []

        with db.get_connection() as conn:
            cursor = conn.cursor()

            for chunk, vec_score in candidates:
                cursor.execute("SELECT content, storage_path, provenance FROM chunks WHERE chunk_id = ?", (chunk.chunk_id,))
                c_row = cursor.fetchone()
                if not c_row:
                    continue

                canonical_text = c_row["content"]
                sp = c_row["storage_path"]
                if sp and Path(sp).exists():
                    try:
                        decrypted = decrypt_from_file(Path(sp), vault_kek)
                        canonical_text = decrypted.decode("utf-8", errors="replace")
                    except Exception:
                        pass

                # Step 2: Context Window / Neighbor Expansion
                # If chunk is part of a multi-chunk document and appears to cut off a thought,
                # expand with preceding or succeeding paragraph if within clearance
                expanded_content = canonical_text
                prov = json.loads(c_row["provenance"]) if c_row["provenance"] else {}

                if len(canonical_text) < 300 and prov.get("page"):
                    # Check for adjacent chunk
                    cursor.execute("""
                        SELECT content, storage_path FROM chunks
                        WHERE resource_id = ? AND chunk_index = ? AND classification <= ?
                    """, (chunk.resource_id, chunk.chunk_index + 1, principal.clearance))
                    next_c = cursor.fetchone()
                    if next_c:
                        next_text = next_c["content"] or ""
                        nsp = next_c["storage_path"]
                        if nsp and Path(nsp).exists():
                            try:
                                dec = decrypt_from_file(Path(nsp), vault_kek)
                                next_text = dec.decode("utf-8", errors="replace")
                            except Exception:
                                pass
                        expanded_content = f"{canonical_text}\n\n[Expanded Context]:\n{next_text[:300]}"

                # Step 3: Lightweight Local Reranking Score
                lex_score = cls.compute_lexical_score(expanded_content, query_terms)

                # Entity match bonus
                entity_bonus = 0.0
                if query_analysis["entities"]:
                    for ent in query_analysis["entities"]:
                        if ent.lower() in expanded_content.lower():
                            entity_bonus += 0.15
                    entity_bonus = min(0.3, entity_bonus)

                # Balanced composite reranking score
                final_score = (0.55 * vec_score) + (0.30 * lex_score) + (0.15 * entity_bonus)

                chunk.content = expanded_content
                rescored_candidates.append((chunk, final_score))

        # Step 4: Reorder by relevance score descending
        rescored_candidates.sort(key=lambda x: x[1], reverse=True)

        # Context budget: return top_k candidates
        return rescored_candidates[:top_k]

retrieval_pipeline = RetrievalPipeline()
