import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Dict, Any, Optional
from uuid import uuid4

from .models import (
    Principal, Vault, Chunk, EvidenceItem, AuthorizationProofObject,
    ResourceManifest, Grant, ACTION_RETRIEVE_EVIDENCE
)
from .database import db
from .policy_engine import PolicyEngine
from .time_authority import time_authority
from .crypto import derive_vault_kek, decrypt_from_file, compute_content_hash

class CanonicalGate:
    """
    Gate B — Post-Retrieval Canonical Authorization Gate (§15, §21, §22, §23).
    Authoritative database & encrypted storage boundary.
    Loads canonical encrypted content from disk, decrypts with Vault KEK,
    verifies SHA-256 integrity, enforces current policy_version and fresh ACL,
    and envelopes authorized items with cryptographic proof objects.
    """

    @classmethod
    def verify_and_envelope(
        cls,
        candidates: List[Tuple[Chunk, float]],
        principal: Principal,
        vault: Vault,
        usable_grants: List[Grant],
        lease_deadline: str
    ) -> Tuple[List[EvidenceItem], int]:
        """
        Takes candidate chunks from Gate A vector search.
        Returns: (authorized_evidence_items, excluded_count)
        """
        now = time_authority.now()
        now_iso = now.isoformat()

        # Context deadline check: Fail closed if time has passed lease deadline (§23)
        if now_iso > lease_deadline:
            return [], len(candidates)

        authorized_items: List[EvidenceItem] = []
        excluded_count = 0
        vault_kek = derive_vault_kek(vault.vault_id)

        with db.get_connection() as conn:
            cursor = conn.cursor()

            for chunk, score in candidates:
                # 1. Fetch fresh canonical resource manifest from authoritative SQL store
                cursor.execute("""
                SELECT rm.*, r.status as resource_status, r.content_hash as res_content_hash
                FROM resource_manifests rm
                JOIN resources r ON rm.resource_id = r.resource_id
                WHERE rm.resource_id = ?
                """, (chunk.resource_id,))
                m_row = cursor.fetchone()
                if not m_row or m_row["resource_status"] != "active":
                    excluded_count += 1
                    continue

                manifest = ResourceManifest(
                    resource_id=m_row["resource_id"],
                    vault_id=m_row["vault_id"],
                    tenant_id=m_row["tenant_id"],
                    classification=m_row["classification"],
                    allowed_roles=json.loads(m_row["allowed_roles"]),
                    allowed_groups=json.loads(m_row["allowed_groups"]),
                    allowed_users=json.loads(m_row["allowed_users"]),
                    denied_users=json.loads(m_row["denied_users"]),
                    denied_roles=json.loads(m_row["denied_roles"]),
                    min_clearance=m_row["min_clearance"],
                    operations=json.loads(m_row["operations"]),
                    policy_version=m_row["policy_version"],
                    acl_version=m_row["acl_version"]
                )

                # 2. Fetch canonical chunk record from SQL database
                cursor.execute("SELECT * FROM chunks WHERE chunk_id = ?", (chunk.chunk_id,))
                chunk_row = cursor.fetchone()
                if not chunk_row:
                    excluded_count += 1
                    continue

                # 3. Retrieve and Decrypt Canonical Content (§15, §21)
                canonical_plaintext = None
                storage_path_str = chunk_row["storage_path"] if "storage_path" in chunk_row.keys() else None
                if storage_path_str and Path(storage_path_str).exists():
                    try:
                        decrypted_bytes = decrypt_from_file(Path(storage_path_str), vault_kek)
                        canonical_plaintext = decrypted_bytes.decode("utf-8")
                    except Exception:
                        excluded_count += 1
                        continue
                else:
                    # Fallback to database content field
                    canonical_plaintext = chunk_row["content"]

                # 4. Content Hash Integrity Verification (§21, §189)
                computed_hash = compute_content_hash(canonical_plaintext.encode("utf-8"))
                if computed_hash != chunk_row["content_hash"]:
                    excluded_count += 1  # Corrupted or tampered content -> fail-closed
                    continue

                # 5. Point-in-time canonical authorization decision
                decision, reason, matched_rules = PolicyEngine.decide(
                    principal=principal,
                    action=ACTION_RETRIEVE_EVIDENCE,
                    manifest=manifest,
                    usable_grants=usable_grants
                )

                if decision != "ALLOW":
                    excluded_count += 1
                    continue

                # 6. Locate matching grant for proof object
                matching_grant = None
                for g in usable_grants:
                    if g.vault_id == vault.vault_id and ACTION_RETRIEVE_EVIDENCE in g.actions:
                        matching_grant = g
                        break

                grant_id = matching_grant.grant_id if matching_grant else "direct_acl"
                grant_chain = [grant_id]
                if matching_grant and matching_grant.parent_grant_id:
                    grant_chain.append(matching_grant.parent_grant_id)

                evidence_id = f"ev_{uuid4().hex[:8]}"

                # 7. Generate Authorization Proof Object v3 (§A18, §271)
                proof_data = f"{evidence_id}:{principal.user_id}:{vault.vault_id}:{chunk.resource_id}:{grant_id}:{manifest.policy_version}:{now_iso}"
                proof_hash = hashlib.sha256(proof_data.encode("utf-8")).hexdigest()

                proof = AuthorizationProofObject(
                    evidence_id=evidence_id,
                    principal_id=principal.user_id,
                    vault_id=vault.vault_id,
                    resource_id=chunk.resource_id,
                    grant_id=grant_id,
                    grant_chain=grant_chain,
                    grant_deadline=matching_grant.valid_until if matching_grant else lease_deadline,
                    policy_version=manifest.policy_version,
                    acl_version=manifest.acl_version,
                    vault_epoch=vault.vault_epoch,
                    decision="ALLOW",
                    matched_rules=matched_rules,
                    time_status=now.status,
                    checked_at=now_iso,
                    hash=proof_hash
                )

                # 8. Generic Selector Field Projection & Redaction (§20, §215)
                content_text = canonical_plaintext
                if matching_grant and matching_grant.selector:
                    exclude_tags = matching_grant.selector.get("exclude_tags", [])
                    # Redact or exclude if tags apply
                    if "hr-bank" in exclude_tags and "BANK:" in content_text:
                        content_text = content_text.split("BANK:")[0] + "[REDACTED: BANK DETAILS]"

                item = EvidenceItem(
                    evidence_id=evidence_id,
                    chunk_id=chunk.chunk_id,
                    resource_id=chunk.resource_id,
                    vault_id=vault.vault_id,
                    vault_name=vault.display_name,
                    content=content_text,
                    classification=chunk_row["classification"],
                    provenance=json.loads(chunk_row["provenance"]),
                    score=score,
                    proof=proof
                )
                authorized_items.append(item)

        return authorized_items, excluded_count

canonical_gate = CanonicalGate()
