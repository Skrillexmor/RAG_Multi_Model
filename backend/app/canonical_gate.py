import json
import hashlib
from datetime import datetime
from typing import List, Tuple, Dict, Any
from .models import Principal, Vault, Chunk, EvidenceItem, AuthorizationProofObject, ResourceManifest, Grant
from .database import db
from .policy_engine import PolicyEngine
from .time_authority import time_authority
from uuid import uuid4

class CanonicalGate:
    """
    Gate B — Post-Retrieval Canonical Authorization Gate (§1.7, §14, A3, A6, A10).
    Authoritative database boundary. Ensures no candidate enters the LLM context
    unless current resource manifest, fresh ACL, active grant, and time deadline are satisfied.
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

        # Context deadline check: Fail closed if time has passed lease deadline
        if now_iso > lease_deadline:
            return [], len(candidates)

        authorized_items: List[EvidenceItem] = []
        excluded_count = 0

        with db.get_connection() as conn:
            cursor = conn.cursor()

            for chunk, score in candidates:
                # 1. Fetch fresh canonical resource manifest from authoritative SQL store
                cursor.execute("SELECT * FROM resource_manifests WHERE resource_id = ?", (chunk.resource_id,))
                m_row = cursor.fetchone()
                if not m_row:
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

                # 2. Point-in-time canonical decision
                decision, reason, matched_rules = PolicyEngine.decide(
                    principal=principal,
                    action="rag_context",
                    manifest=manifest,
                    usable_grants=usable_grants
                )

                if decision != "ALLOW":
                    excluded_count += 1
                    continue

                # 3. Locate matching grant for proof object
                matching_grant = None
                for g in usable_grants:
                    if g.vault_id == vault.vault_id and "rag_context" in g.actions:
                        matching_grant = g
                        break

                grant_id = matching_grant.grant_id if matching_grant else "direct_acl"
                grant_chain = [grant_id]
                if matching_grant and matching_grant.parent_grant_id:
                    grant_chain.append(matching_grant.parent_grant_id)

                evidence_id = f"ev_{uuid4().hex[:8]}"

                # 4. Generate Authorization Proof Object v3 (§A18)
                proof_data = f"{evidence_id}:{principal.user_id}:{vault.vault_id}:{chunk.resource_id}:{grant_id}:{now_iso}"
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

                # 5. Field / Column Projection & Redaction (§1.8, §2.6)
                # If grant selector has field exclusions or projections
                content_text = chunk.content
                if matching_grant and matching_grant.selector:
                    exclude_tags = matching_grant.selector.get("exclude_tags", [])
                    if "hr-bank" in exclude_tags and "BANK:" in content_text:
                        content_text = content_text.split("BANK:")[0] + "[REDACTED: BANK DETAILS]"

                item = EvidenceItem(
                    evidence_id=evidence_id,
                    chunk_id=chunk.chunk_id,
                    resource_id=chunk.resource_id,
                    vault_id=vault.vault_id,
                    vault_name=vault.display_name,
                    content=content_text,
                    classification=chunk.classification,
                    provenance=chunk.provenance,
                    score=score,
                    proof=proof
                )
                authorized_items.append(item)

        return authorized_items, excluded_count

canonical_gate = CanonicalGate()
