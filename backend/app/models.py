from typing import List, Dict, Any, Optional, Literal, Tuple
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID, uuid4

# Security Classifications
# 0: Public, 1: Internal, 2: Confidential, 3: Restricted / Secret
ClassificationLevel = Literal[0, 1, 2, 3]

CLASSIFICATION_NAMES = {
    0: "PUBLIC",
    1: "INTERNAL",
    2: "CONFIDENTIAL",
    3: "RESTRICTED"
}

# Principal Context
class Principal(BaseModel):
    user_id: str
    tenant_id: str = "default_tenant"
    username: str
    roles: List[str] = Field(default_factory=list)
    groups: List[str] = Field(default_factory=list)
    department: str = "General"
    clearance: int = 1  # 0 to 3
    is_active: bool = True
    auth_epoch: int = 1

    def subjects(self) -> List[str]:
        res = [f"user:{self.user_id}", f"dept:{self.department}"]
        for r in self.roles:
            res.append(f"role:{r}")
        for g in self.groups:
            res.append(f"group:{g}")
        return res

# Vault Model (Architecture v3 A2, V2)
class Vault(BaseModel):
    vault_id: str
    tenant_id: str = "default_tenant"
    slug: str
    display_name: str
    owner_id: str
    steward_role_id: Optional[str] = None
    classification_ceiling: int = 2
    status: Literal["draft", "active", "frozen", "archived", "shredded"] = "active"
    scope_mode: Literal["strict_single", "federated_opt_in"] = "strict_single"
    discoverable: bool = True
    allow_delegation: bool = True
    max_delegation_depth: int = 1
    retention: Dict[str, Any] = Field(default_factory=dict)
    key_id: str = "vault_kek"
    origin: Literal["native", "imported"] = "native"
    import_terms: Optional[Dict[str, Any]] = None
    vault_epoch: int = 1
    created_at: str

# Grant Model (Architecture v3 A4, A5, V5)
class Grant(BaseModel):
    grant_id: str
    vault_id: str
    grantee_type: Literal["user", "role", "group", "node"]
    grantee_id: str  # e.g., "analyst", "bob", "finance"
    selector: Dict[str, Any] = Field(default_factory=lambda: {"all": True})
    # actions: rag_context, view, download, export, share, delegate
    actions: List[str] = Field(default_factory=lambda: ["rag_context", "view"])
    valid_from: str
    valid_until: Optional[str] = None
    schedule: Optional[Dict[str, Any]] = None  # e.g., {"windows": [{"days": "Mon-Fri", "from": "09:00", "to": "18:00"}]}
    quota: Optional[Dict[str, Any]] = None  # e.g., {"max_queries": 100, "max_evidence": 500}
    conditions: Optional[Dict[str, Any]] = None
    purpose: str = "business_inquiry"
    delegable: bool = False
    depth: int = 0
    parent_grant_id: Optional[str] = None
    issuer_id: str
    state: Literal["approved", "active", "suspended", "expired", "revoked"] = "active"
    revoked_at: Optional[str] = None
    revoked_by: Optional[str] = None
    revoke_reason: Optional[str] = None
    signature: str = ""
    created_at: str

# Authorization Lease (Architecture v3 A6)
class AuthorizationLease(BaseModel):
    lease_id: str
    principal_id: str
    grants: List[str]  # IDs of active usable grants
    policy_epoch: int
    vault_epochs: Dict[str, int]
    issued_at: str
    deadline: str  # ISO timestamp
    time_status: Literal["OK", "DEGRADED", "CLOCK_ROLLBACK", "CLOCK_JUMP_QUARANTINE"]

# Rag Scope (Architecture v3 A2)
class RagScope(BaseModel):
    vault_ids: List[str]
    prompt_profile: Dict[str, Any] = Field(default_factory=lambda: {"allow_general_knowledge": False})
    namespace: str

# Resource Manifest (Architecture 1.2)
class ResourceManifest(BaseModel):
    resource_id: str
    vault_id: str
    tenant_id: str = "default_tenant"
    classification: int = 1
    allowed_roles: List[str] = Field(default_factory=list)
    allowed_groups: List[str] = Field(default_factory=list)
    allowed_users: List[str] = Field(default_factory=list)
    denied_users: List[str] = Field(default_factory=list)
    denied_roles: List[str] = Field(default_factory=list)
    min_clearance: int = 1
    operations: List[str] = Field(default_factory=lambda: ["read", "rag_context"])
    policy_version: int = 1
    acl_version: int = 1

# Chunk (Architecture 1.3, 1.4)
class Chunk(BaseModel):
    chunk_id: str
    resource_id: str
    vault_id: str
    chunk_index: int
    content: str
    classification: int
    min_clearance: int
    acl_selector: List[str]  # e.g., ["role:analyst", "user:alice"]
    deny_selector: List[str]
    provenance: Dict[str, Any]  # {page: int, line_start: int, line_end: int, file_hash: str, bbox: ...}
    content_hash: str
    created_at: str

# Evidence Envelope (Architecture §1.14.3, A18)
class AuthorizationProofObject(BaseModel):
    evidence_id: str
    principal_id: str
    vault_id: str
    resource_id: str
    grant_id: str
    grant_chain: List[str]
    grant_deadline: Optional[str]
    policy_version: int
    acl_version: int
    vault_epoch: int
    decision: Literal["ALLOW", "DENY", "REDACT"]
    matched_rules: List[str]
    time_status: str
    checked_at: str
    hash: str
    prev_hash: Optional[str] = None

class EvidenceItem(BaseModel):
    evidence_id: str
    chunk_id: str
    resource_id: str
    vault_id: str
    vault_name: str
    content: str
    classification: int
    provenance: Dict[str, Any]
    score: float
    proof: AuthorizationProofObject

# JIT Access Request (Architecture v3 A9, V6)
class AccessRequest(BaseModel):
    request_id: str
    vault_id: str
    requester_id: str
    selector: Dict[str, Any]
    actions: List[str]
    duration_minutes: int
    purpose: str
    justification: str
    state: Literal["requested", "approved", "denied", "cancelled", "expired"] = "requested"
    required_approvals: int = 1
    created_at: str

class AccessRequestApproval(BaseModel):
    request_id: str
    approver_id: str
    decision: Literal["approve", "deny"]
    decided_at: str

# Query API Contract
class QueryRequest(BaseModel):
    vault_slug: str
    query: str
    purpose: str = "rag_context"
    # Note: Client CANNOT pass custom filters. Any user-supplied filter is rejected/ignored.
    client_supplied_filter: Optional[Dict[str, Any]] = None

class Citation(BaseModel):
    citation_id: str
    evidence_id: str
    vault_name: str
    locator: str
    quote: str
    verified: bool = False

class Claim(BaseModel):
    text: str
    citation_ids: List[str]

class RetrievalSecurityTrace(BaseModel):
    user_id: str
    role: str
    vault_slug: str
    policy_epoch: int
    vector_filter_applied: Dict[str, Any]
    gate_a_candidates_count: int
    gate_b_canonical_verified_count: int
    excluded_candidates_count: int
    citations_validated_count: int
    citations_total_count: int
    answer_status: Literal["GROUNDED", "REFUSED", "CITATION_MISMATCH"]
    refusal_reason: Optional[str] = None

class QueryResponse(BaseModel):
    query: str
    vault_slug: str
    answer: str
    claims: List[Claim]
    citations: List[Citation]
    evidence_items: List[EvidenceItem]
    security_trace: RetrievalSecurityTrace
    lease_deadline: str
