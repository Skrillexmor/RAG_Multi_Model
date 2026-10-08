from typing import List, Dict, Any, Optional, Literal, Tuple
from pydantic import BaseModel, Field
from datetime import datetime

# Security Classifications (§164)
# 0: Public, 1: Internal, 2: Confidential, 3: Restricted, 4: Credential / Secret
ClassificationLevel = Literal[0, 1, 2, 3, 4]

CLASSIFICATION_NAMES = {
    0: "PUBLIC",
    1: "INTERNAL",
    2: "CONFIDENTIAL",
    3: "RESTRICTED",
    4: "CREDENTIAL"
}

# Granular Action Permissions (§7)
ACTION_DISCOVER_DATASET = "discover_dataset"
ACTION_QUERY_RAG = "query_rag"
ACTION_RETRIEVE_EVIDENCE = "retrieve_evidence"
ACTION_VIEW_SOURCE = "view_source"
ACTION_FETCH_PAGE = "fetch_page"
ACTION_FETCH_CHUNK = "fetch_chunk"
ACTION_FETCH_ROW = "fetch_row"
ACTION_FETCH_FIELD = "fetch_field"
ACTION_DOWNLOAD_DOCUMENT = "download_document"
ACTION_EXPORT_DATA = "export_data"
ACTION_SHARE_DATA = "share_data"
ACTION_DELEGATE_PERMISSION = "delegate_permission"
ACTION_EDIT_DATA = "edit_data"
ACTION_DELETE_DATA = "delete_data"
ACTION_MANAGE_POLICY = "manage_policy"
ACTION_APPROVE_ACCESS_REQUEST = "approve_access_request"
ACTION_VIEW_AUDIT = "view_audit"
ACTION_MANAGE_SYSTEM = "manage_system"
ACTION_FETCH_SECRET = "fetch_secret"

ALLOWED_PURPOSES = {
    "project_analysis",
    "incident_response",
    "audit",
    "maintenance",
    "research",
    "business_inquiry"
}

# Principal Context
class Principal(BaseModel):
    user_id: str
    tenant_id: str = "default_tenant"
    username: str
    roles: List[str] = Field(default_factory=list)
    groups: List[str] = Field(default_factory=list)
    department: str = "General"
    clearance: int = 1  # 0 to 4
    clearance_level: Optional[int] = None
    is_active: bool = True
    auth_epoch: int = 1

    def model_post_init(self, __context: Any) -> None:
        if self.clearance_level is None:
            self.clearance_level = self.clearance
        if self.roles:
            self.roles = list(dict.fromkeys(self.roles))
        if self.groups:
            self.groups = list(dict.fromkeys(self.groups))

    def subjects(self) -> List[str]:
        res = [f"user:{self.user_id}", f"dept:{self.department}"]
        for r in self.roles:
            res.append(f"role:{r}")
        for g in self.groups:
            res.append(f"group:{g}")
        return res

# Vault / Dataset Model (§4, §32)
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
    visibility: Literal["private", "role_shared", "public"] = "private"
    discoverable: bool = False
    allow_delegation: bool = True
    max_delegation_depth: int = 1
    retention: Dict[str, Any] = Field(default_factory=dict)
    key_id: str = "vault_kek"
    origin: Literal["native", "imported"] = "native"
    import_terms: Optional[Dict[str, Any]] = None
    vault_epoch: int = 1
    created_at: str

# Grant Model (§35, §36)
class Grant(BaseModel):
    grant_id: str
    vault_id: str
    grantee_type: Literal["user", "role", "group", "node"]
    grantee_id: str
    selector: Dict[str, Any] = Field(default_factory=lambda: {"all": True})
    actions: List[str] = Field(default_factory=lambda: [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE])
    valid_from: str
    valid_until: Optional[str] = None
    schedule: Optional[Dict[str, Any]] = None
    quota: Optional[Dict[str, Any]] = None
    conditions: Optional[Dict[str, Any]] = None
    purpose: str = "project_analysis"
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

# Authorization Lease
class AuthorizationLease(BaseModel):
    lease_id: str
    principal_id: str
    grants: List[str]
    policy_epoch: int
    vault_epochs: Dict[str, int]
    issued_at: str
    deadline: str
    time_status: Literal["OK", "DEGRADED", "CLOCK_ROLLBACK", "CLOCK_JUMP_QUARANTINE"]

# Resource Manifest (§8)
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
    operations: List[str] = Field(default_factory=lambda: [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE])
    policy_version: int = 1
    acl_version: int = 1

# Chunk Model
class Chunk(BaseModel):
    chunk_id: str
    resource_id: str
    vault_id: str
    chunk_index: int
    content: str
    classification: int
    min_clearance: int
    acl_selector: List[str]
    deny_selector: List[str]
    provenance: Dict[str, Any]
    content_hash: str
    storage_path: Optional[str] = None
    created_at: str

# Evidence Envelope (§22)
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

# Structured Records & Field Policies (§24, §26, §27)
class FieldPolicy(BaseModel):
    field_name: str
    classification: int = 1
    min_clearance: int = 1
    allowed_roles: List[str] = Field(default_factory=list)
    denied_roles: List[str] = Field(default_factory=list)
    is_sensitive: bool = False

# JIT Access Request
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
    approvals_count: int = 0
    created_at: str

# Query API Contract
class QueryRequest(BaseModel):
    vault_slug: Optional[str] = None
    query: str
    purpose: str = "project_analysis"
    resource_id: Optional[str] = None
    client_supplied_filter: Optional[Dict[str, Any]] = None
    history: Optional[List[Dict[str, Any]]] = None

class Citation(BaseModel):
    citation_id: str
    evidence_id: str
    vault_name: str
    locator: str
    quote: str
    verified: bool = False
    modality: Optional[str] = "document"
    media_url: Optional[str] = None
    keyframe_url: Optional[str] = None
    timestamp: Optional[str] = None

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
    generation_mode: Literal["LLM_GROUNDED", "SAFE_EXTRACTIVE_MODE", "ANSWER_BLOCKED"] = "LLM_GROUNDED"
    answer_status: Literal["GROUNDED", "REFUSED", "CITATION_MISMATCH", "SAFE_EXTRACTIVE"]
    refusal_reason: Optional[str] = None
    gate_a: Optional[Dict[str, Any]] = None
    gate_b: Optional[Dict[str, Any]] = None
    grounding: Optional[Dict[str, Any]] = None

class QueryResponse(BaseModel):
    query: str
    vault_slug: str
    answer: str
    claims: List[Claim]
    citations: List[Citation]
    evidence_items: List[EvidenceItem]
    security_trace: RetrievalSecurityTrace
    lease_deadline: str

class AuditCheckpoint(BaseModel):
    checkpoint_id: str
    event_count: int
    last_event_id: int
    checkpoint_hash: str
    signature: str
    created_at: str
