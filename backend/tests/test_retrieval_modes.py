import os
import sys
import json
import pytest
import hashlib
from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.database import db
from backend.app.config import ENCRYPTED_DIR
from backend.app.models import (
    Principal, Vault, Grant, Chunk, ResourceManifest,
    ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE
)
from backend.app.crypto import derive_vault_kek, encrypt_to_file, decrypt_from_file, compute_content_hash
from backend.app.policy_engine import PolicyEngine
from backend.app.policy_compiler import PolicyCompiler
from backend.app.vector_store import vector_store
from backend.app.canonical_gate import canonical_gate
from backend.app.retrieval_modes import retrieval_pipeline, RetrievalPipeline
from backend.app.time_authority import time_authority

@pytest.fixture(scope="module")
def setup_retrieval_fixture():
    now_iso = datetime.now(timezone.utc).isoformat()
    test_vault_id = "v_retrieval_test"
    test_res_id = "res_doc_retrieval_01"
    vault_kek = derive_vault_kek(test_vault_id)

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM dynamic_chunks WHERE vault_id = ?", (test_vault_id,))
        cursor.execute("DELETE FROM chunks WHERE vault_id = ?", (test_vault_id,))
        cursor.execute("DELETE FROM resource_manifests WHERE vault_id = ?", (test_vault_id,))
        cursor.execute("DELETE FROM resources WHERE vault_id = ?", (test_vault_id,))
        # Create test vault
        cursor.execute("""
            INSERT OR REPLACE INTO vaults (
                vault_id, tenant_id, slug, display_name, owner_id, steward_role_id,
                classification_ceiling, origin, vault_epoch, created_at
            ) VALUES (?, 'tenant_primary', 'retrieval-vault', 'Retrieval Test Vault', 'u_alice', 'r_analyst', 3, 'LOCAL', 1, ?)
        """, (test_vault_id, now_iso))

        # Create parent resource
        cursor.execute("""
            INSERT OR REPLACE INTO resources (
                resource_id, vault_id, tenant_id, title, resource_type, classification,
                content_hash, current_version, status, created_at
            ) VALUES (?, ?, 'tenant_primary', 'Comprehensive Financial Audit Report 2026', 'pdf', 2, 'hash_audit_parent_01', 1, 'active', ?)
        """, (test_res_id, test_vault_id, now_iso))

        # Create resource manifest
        cursor.execute("""
            INSERT OR REPLACE INTO resource_manifests (
                resource_id, vault_id, tenant_id, classification, min_clearance,
                allowed_roles, allowed_groups, allowed_users, denied_users, denied_roles,
                operations, policy_version, acl_version
            ) VALUES (?, ?, 'tenant_primary', 2, 2, '["analyst", "admin"]', '[]', '[]', '[]', '[]', '["QUERY_RAG", "RETRIEVE_EVIDENCE"]', 1, 1)
        """, (test_res_id, test_vault_id))

        # Create 3 chunks with structured paragraphs
        paragraphs = [
            "Section 1: Operating Revenue. The total operating revenue of the enterprise increased by 14.2 percent year-over-year. Revenue from confidential client contracts reached forty-two million dollars.",
            "Section 2: Capital Expenditures. In the second quarter, infrastructure investments accounted for twelve million dollars. Hardware acquisitions and server deployments were completed on schedule.",
            "Section 3: Compliance & Risk Factors. Regulatory compliance audits revealed zero major violations. All cryptographic keys are rotated according to NIST SP 800-57 guidelines every ninety days."
        ]

        chunks = []
        for i, text in enumerate(paragraphs):
            c_id = f"chk_retrieval_{i+1}"
            c_hash = compute_content_hash(text.encode("utf-8"))
            storage_path = str(ENCRYPTED_DIR / f"{c_id}.enc")
            encrypt_to_file(text.encode("utf-8"), Path(storage_path), vault_kek)

            cursor.execute("""
                INSERT OR REPLACE INTO chunks (
                    chunk_id, resource_id, vault_id, chunk_index, content, classification,
                    min_clearance, acl_selector, deny_selector, provenance, content_hash,
                    storage_path, created_at
                ) VALUES (?, ?, ?, ?, ?, 2, 2, '["role:analyst", "role:admin"]', '[]', ?, ?, ?, ?)
            """, (c_id, test_res_id, test_vault_id, i, text, json.dumps({"page": i+1, "section": f"Section {i+1}"}), c_hash, storage_path, now_iso))

            chunks.append(Chunk(
                chunk_id=c_id,
                resource_id=test_res_id,
                vault_id=test_vault_id,
                chunk_index=i,
                content=text,
                classification=2,
                min_clearance=2,
                acl_selector=["role:analyst", "role:admin"],
                deny_selector=[],
                provenance={"page": i+1, "section": f"Section {i+1}"},
                content_hash=c_hash,
                storage_path=storage_path,
                created_at=now_iso
            ))

        conn.commit()

    # Index chunks in vector store
    for c in chunks:
        vector_store.index_chunk(c)

    principal = Principal(
        user_id="u_alice",
        tenant_id="tenant_primary",
        username="alice",
        roles=["analyst"],
        clearance=3,
        clearance_level=3
    )

    vault = Vault(
        vault_id=test_vault_id,
        tenant_id="tenant_primary",
        display_name="Retrieval Test Vault",
        slug="retrieval-vault",
        owner_id="u_alice",
        classification_ceiling=3,
        vault_epoch=1,
        created_at=now_iso
    )

    yield {
        "vault": vault,
        "principal": principal,
        "resource_id": test_res_id
    }

    # Cleanup
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM dynamic_chunks WHERE vault_id = ?", (test_vault_id,))
        cursor.execute("DELETE FROM chunks WHERE vault_id = ?", (test_vault_id,))
        cursor.execute("DELETE FROM resource_manifests WHERE vault_id = ?", (test_vault_id,))
        cursor.execute("DELETE FROM resources WHERE vault_id = ?", (test_vault_id,))
        cursor.execute("DELETE FROM vaults WHERE vault_id = ?", (test_vault_id,))
        conn.commit()

def test_retrieval_mode_parameter_validation(setup_retrieval_fixture):
    """Test that invalid retrieval mode raises ValueError."""
    data = setup_retrieval_fixture
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(data["principal"], now.timestamp)
    lease = PolicyEngine.issue_lease(data["principal"], usable, restricted=False)
    compiled_filter = PolicyCompiler.compile_retrieval_filter(
        principal=data["principal"],
        vault=data["vault"],
        lease=lease,
        usable_grants=usable
    )

    with pytest.raises(ValueError):
        retrieval_pipeline.retrieve(
            mode="ULTRA_FAST",
            query="revenue",
            compiled_filter=compiled_filter,
            vault=data["vault"],
            principal=data["principal"]
        )

def test_low_mode_preserves_standard_vector_retrieval(setup_retrieval_fixture):
    """LOW mode retrieves standard indexed chunks directly via compiled filter."""
    data = setup_retrieval_fixture
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(data["principal"], now.timestamp)
    lease = PolicyEngine.issue_lease(data["principal"], usable, restricted=False)
    compiled_filter = PolicyCompiler.compile_retrieval_filter(
        principal=data["principal"],
        vault=data["vault"],
        lease=lease,
        usable_grants=usable
    )

    results = retrieval_pipeline.retrieve(
        mode="LOW",
        query="operating revenue confidential client contracts",
        compiled_filter=compiled_filter,
        vault=data["vault"],
        principal=data["principal"],
        top_k=5
    )

    assert len(results) >= 1
    top_chunk, score = results[0]
    assert "operating revenue" in top_chunk.content.lower()
    assert top_chunk.classification <= data["principal"].clearance_level

def test_medium_mode_lazy_query_aware_chunking_and_caching(setup_retrieval_fixture):
    """MEDIUM mode performs query-aware slicing and deduplicated deterministic caching."""
    data = setup_retrieval_fixture
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(data["principal"], now.timestamp)
    lease = PolicyEngine.issue_lease(data["principal"], usable, restricted=False)
    compiled_filter = PolicyCompiler.compile_retrieval_filter(
        principal=data["principal"],
        vault=data["vault"],
        lease=lease,
        usable_grants=usable
    )

    # First query: should generate and cache dynamic chunks
    results_1 = retrieval_pipeline.retrieve(
        mode="MEDIUM",
        query="cryptographic keys NIST SP guidelines",
        compiled_filter=compiled_filter,
        vault=data["vault"],
        principal=data["principal"],
        top_k=5
    )

    assert len(results_1) >= 1
    top_chunk, score = results_1[0]
    assert "nist" in top_chunk.content.lower() or "keys" in top_chunk.content.lower()

    # Verify that dynamic chunks were recorded in SQLite table
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM dynamic_chunks WHERE vault_id = ?", (data["vault"].vault_id,))
        count_after_first = cursor.fetchone()["cnt"]
        assert count_after_first >= 1

    # Second identical query: should hit cache and reuse without increasing duplicate count
    results_2 = retrieval_pipeline.retrieve(
        mode="MEDIUM",
        query="cryptographic keys NIST SP guidelines",
        compiled_filter=compiled_filter,
        vault=data["vault"],
        principal=data["principal"],
        top_k=5
    )

    assert len(results_2) >= 1
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM dynamic_chunks WHERE vault_id = ?", (data["vault"].vault_id,))
        count_after_second = cursor.fetchone()["cnt"]
        # No duplicate bloat
        assert count_after_second == count_after_first

def test_medium_mode_lru_cache_eviction(setup_retrieval_fixture):
    """Enforces LRU cache eviction when capacity is exceeded."""
    data = setup_retrieval_fixture
    # Artificially insert excess dynamic chunks
    now_iso = datetime.now(timezone.utc).isoformat()
    with db.get_connection() as conn:
        cursor = conn.cursor()
        for i in range(10):
            k = f"test_evict_key_{i}"
            cid = f"chk_evict_{i}"
            cursor.execute("""
                INSERT OR REPLACE INTO dynamic_chunks (
                    cache_key, chunk_id, resource_id, vault_id, resource_version,
                    source_content_hash, source_span, strategy_version, classification, min_clearance,
                    acl_selector, deny_selector, provenance, content, content_hash, storage_path,
                    access_count, last_accessed_at, created_at
                ) VALUES (?, ?, ?, ?, 1, 'source_hash', 'span_0', 'v1', 1, 1, '[]', '[]', '{}', 'evict text', 'h', '', 1, ?, ?)
            """, (k, cid, data["resource_id"], data["vault"].vault_id, now_iso, now_iso))
        conn.commit()

    # Run eviction with small capacity limit (e.g. 5)
    RetrievalPipeline.evict_cache_if_needed(max_capacity=5)

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM dynamic_chunks WHERE vault_id = ?", (data["vault"].vault_id,))
        remaining = cursor.fetchone()["cnt"]
        assert remaining <= 5

def test_high_mode_intent_hybrid_and_reranking(setup_retrieval_fixture):
    """HIGH mode extracts intent, computes hybrid lexical+dense score, and reorders candidates."""
    data = setup_retrieval_fixture
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(data["principal"], now.timestamp)
    lease = PolicyEngine.issue_lease(data["principal"], usable, restricted=False)
    compiled_filter = PolicyCompiler.compile_retrieval_filter(
        principal=data["principal"],
        vault=data["vault"],
        lease=lease,
        usable_grants=usable
    )

    query = "What were the infrastructure investments and hardware acquisitions in Q2?"
    results = retrieval_pipeline.retrieve(
        mode="HIGH",
        query=query,
        compiled_filter=compiled_filter,
        vault=data["vault"],
        principal=data["principal"],
        top_k=5
    )

    assert len(results) >= 1
    top_chunk, score = results[0]
    assert "capital expenditures" in top_chunk.content.lower() or "infrastructure" in top_chunk.content.lower()

def test_security_inheritance_in_derived_chunks(setup_retrieval_fixture):
    """Dynamic chunks inherit the most restrictive classification and clearance ceiling."""
    data = setup_retrieval_fixture
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(data["principal"], now.timestamp)
    lease = PolicyEngine.issue_lease(data["principal"], usable, restricted=False)
    compiled_filter = PolicyCompiler.compile_retrieval_filter(
        principal=data["principal"],
        vault=data["vault"],
        lease=lease,
        usable_grants=usable
    )

    results = retrieval_pipeline.retrieve(
        mode="MEDIUM",
        query="operating revenue",
        compiled_filter=compiled_filter,
        vault=data["vault"],
        principal=data["principal"],
        top_k=5
    )

    for chunk, _ in results:
        assert chunk.classification >= 2  # inherited from parent resource manifest
        assert chunk.min_clearance >= 2
        assert "role:analyst" in chunk.acl_selector or "role:admin" in chunk.acl_selector
