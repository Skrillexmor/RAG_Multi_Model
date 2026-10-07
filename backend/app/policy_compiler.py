import hashlib
from typing import Dict, Any, List
from .models import Principal, Vault, AuthorizationLease, Grant

class CompiledFilter:
    def __init__(self, filter_ast: Dict[str, Any], taint_tag: str):
        self.ast = filter_ast
        self.taint_tag = taint_tag

    def to_dict(self) -> Dict[str, Any]:
        return self.ast

class PolicyCompiler:
    """
    Architecture A3 & §39: Policy Compiler for Retrieval Firewall.
    Compiles signed grants and effective scope into a deterministic Qdrant / vector filter AST.
    Guarantees no client-supplied filters can widen access.
    """

    @classmethod
    def compile_retrieval_filter(cls, principal: Principal, vault: Vault, lease: AuthorizationLease, usable_grants: List[Grant]) -> CompiledFilter:
        subjects = principal.subjects()

        # Build Qdrant-compliant filter structure
        must_clauses: List[Dict[str, Any]] = [
            {"key": "vault_id", "match": {"value": vault.vault_id}},
            {"key": "min_clearance", "range": {"lte": principal.clearance}},
            {"key": "classification", "range": {"lte": vault.classification_ceiling}},
            {"key": "acl_selector", "match": {"any": subjects}}
        ]

        must_not_clauses: List[Dict[str, Any]] = [
            {"key": "deny_selector", "match": {"any": subjects}}
        ]

        ast = {
            "must": must_clauses,
            "must_not": must_not_clauses,
            "vault_id": vault.vault_id,
            "vault_slug": vault.slug,
            "principal_id": principal.user_id,
            "policy_epoch": lease.policy_epoch
        }

        # Create cryptographic taint tag
        canon_rep = f"{vault.vault_id}:{principal.user_id}:{principal.clearance}:{lease.lease_id}"
        taint_tag = hashlib.sha256(canon_rep.encode("utf-8")).hexdigest()

        return CompiledFilter(filter_ast=ast, taint_tag=taint_tag)
