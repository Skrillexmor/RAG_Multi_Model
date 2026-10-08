import json
import base64
from typing import Dict, Any, List
from .models import Principal, Vault, AuthorizationLease, Grant
from .crypto import sign_data, verify_signature, get_system_public_key_bytes

class CompiledFilter:
    """Opaque, server-compiled cryptographic retrieval filter envelope (§19, §273)."""
    def __init__(self, filter_ast: Dict[str, Any], signature_b64: str):
        self.ast = filter_ast
        self.signature_b64 = signature_b64
        self.taint_tag = signature_b64

    def to_dict(self) -> Dict[str, Any]:
        return self.ast

    def is_valid(self) -> bool:
        """Cryptographically verifies that this filter was compiled by the authoritative server."""
        try:
            canonical_bytes = json.dumps(self.ast, sort_keys=True, separators=(",", ":")).encode("utf-8")
            sig = base64.b64decode(self.signature_b64)
            return verify_signature(get_system_public_key_bytes(), canonical_bytes, sig)
        except Exception:
            return False

class PolicyCompiler:
    """
    Architecture A3 & §39: Policy Compiler for Retrieval Firewall Gate A.
    Compiles effective scope, signed grants, and user attributes into a signed Qdrant filter AST.
    """

    @classmethod
    def compile_retrieval_filter(
        cls,
        principal: Principal,
        vault: Vault,
        lease: AuthorizationLease,
        usable_grants: List[Grant],
        resource_id: Optional[str] = None
    ) -> CompiledFilter:
        subjects = principal.subjects()

        # Calculate effective classification ceiling from vault and grant selectors (§19, §20)
        matching_grants = [g for g in usable_grants if g.vault_id == vault.vault_id]
        max_class_from_grants = None
        for g in matching_grants:
            if g.selector and "max_classification" in g.selector:
                sel_mc = g.selector["max_classification"]
                if max_class_from_grants is None or sel_mc > max_class_from_grants:
                    max_class_from_grants = sel_mc

        effective_ceiling = vault.classification_ceiling
        if max_class_from_grants is not None:
            effective_ceiling = min(effective_ceiling, max_class_from_grants)

        # 1. Base mandatory clauses
        must_clauses: List[Dict[str, Any]] = [
            {"key": "vault_id", "match": {"value": vault.vault_id}},
            {"key": "min_clearance", "range": {"lte": principal.clearance}},
            {"key": "classification", "range": {"lte": effective_ceiling}},
            {"key": "acl_selector", "match": {"any": subjects}}
        ]

        if resource_id:
            must_clauses.append({"key": "resource_id", "match": {"value": resource_id}})

        must_not_clauses: List[Dict[str, Any]] = [
            {"key": "deny_selector", "match": {"any": subjects}}
        ]

        # 2. Selector Attenuation from Grants (§19, §20)
        matching_grants = [g for g in usable_grants if g.vault_id == vault.vault_id]
        exclude_tags = set()
        for g in matching_grants:
            if g.selector:
                for tag in g.selector.get("exclude_tags", []):
                    exclude_tags.add(tag)

        for tag in exclude_tags:
            must_not_clauses.append({"key": "acl_selector", "match": {"value": tag}})

        ast = {
            "must": must_clauses,
            "must_not": must_not_clauses,
            "vault_id": vault.vault_id,
            "vault_slug": vault.slug,
            "principal_id": principal.user_id,
            "policy_epoch": lease.policy_epoch,
            "lease_id": lease.lease_id,
            "timestamp": lease.issued_at
        }

        # Sign the compiled AST with system Ed25519 key (§273)
        canonical_bytes = json.dumps(ast, sort_keys=True, separators=(",", ":")).encode("utf-8")
        sig = sign_data(canonical_bytes)
        sig_b64 = base64.b64encode(sig).decode("utf-8")

        return CompiledFilter(filter_ast=ast, signature_b64=sig_b64)
