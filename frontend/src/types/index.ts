export type Role = string

export interface Principal {
  user_id: string
  username: string
  roles: string[]
  clearance_level: number
  tenant_id: string
  auth_epoch?: number
  is_active?: boolean
}

export interface DemoPersona {
  username: string
  name: string
  roleTitle: string
  roles: string[]
  clearanceLevel: number
  description: string
  accessibleVaults: string[]
}

export interface Vault {
  vault_id: string
  slug: string
  display_name: string
  owner_id: string
  classification_ceiling: number
  status: string
  origin: string
  vault_epoch?: number
  created_at: string
  discoverable?: boolean
  document_count?: number
}

export interface Grant {
  grant_id: string
  vault_id: string
  grantee_id: string
  issuer_id: string
  actions: string[]
  selector?: {
    include_tags?: string[]
    exclude_tags?: string[]
    max_classification?: number
  }
  valid_from: string
  valid_until: string
  schedule?: Record<string, any>
  quota_remaining?: number
  delegable: boolean
  max_depth?: number
  parent_grant_id?: string | null
  state: "active" | "revoked" | "expired"
  signature?: string
  vault_epoch?: number
}

export interface AccessRequest {
  request_id: string
  vault_id: string
  requester_id: string
  requested_actions: string[]
  duration_minutes: number
  purpose: string
  state: "pending" | "approved" | "denied"
  approver_id?: string
  approved_at?: string
  created_at: string
}

export interface CitationRef {
  citation_id: string
  evidence_id: string
  vault_name: string
  locator: string
  quote: string
}

export interface ClaimItem {
  text: string
  citation_ids: string[]
}

export interface AuthorizationProofObject {
  evidence_id: string
  principal_id: string
  vault_id: string
  resource_id: string
  grant_id?: string
  grant_chain?: string[]
  grant_deadline?: string
  policy_version: number
  acl_version: number
  vault_epoch: number
  decision: "ALLOW" | "DENY"
  matched_rules?: string[]
  time_status: string
  checked_at: string
  hash: string
}

export interface EvidenceItem {
  evidence_id: string
  chunk_id: string
  resource_id: string
  vault_id: string
  vault_name: string
  content: string
  classification: number
  provenance: {
    page?: number
    locator?: string
    bbox?: any
  }
  score: number
  proof: AuthorizationProofObject
}

export interface RetrievalSecurityTrace {
  request_id: string
  principal: string
  vault: string
  gate_a: {
    compiled_filter_valid: boolean
    candidates_count: number
  }
  gate_b: {
    evaluated_count: number
    authorized_count: number
    excluded_count: number
  }
  grounding: {
    claims_count: number
    citations_count: number
    status: string
  }
}

export interface RagQueryResponse {
  answer: string
  claims: ClaimItem[]
  citations: CitationRef[]
  evidence_items: EvidenceItem[]
  mode: "GROUNDED" | "SAFE_EXTRACTIVE_MODE" | "REFUSAL"
  refusal_reason?: string
  security_trace?: RetrievalSecurityTrace
  lease_deadline?: string
}

export interface AuditEvent {
  event_id: string
  request_id: string
  actor_id: string
  action: string
  object_type: string
  object_id: string
  decision: "ALLOW" | "DENY"
  reason_code: string
  policy_version: number
  prev_hash: string
  current_hash: string
  timestamp: string
}

export interface FederationNode {
  node_id: string
  display_name: string
  network_address: string
  status: "trusted" | "online" | "offline"
  last_seen: string
}

export interface SecurityTestResult {
  test_id: string
  title: string
  category: string
  passed: boolean
  details: string
}

export interface TimeStatus {
  timestamp: string
  status: "OK" | "CLOCK_ROLLBACK" | "CLOCK_JUMP"
  skew_seconds: number
  is_simulated: boolean
}

// Conversation and Chat UI types
export interface Message {
  id: string
  role: "user" | "assistant" | "system"
  content: string
  createdAt: string
  citations?: CitationRef[]
  evidenceItems?: EvidenceItem[]
  securityTrace?: RetrievalSecurityTrace
  status?: "pending" | "complete" | "error"
  mode?: "GROUNDED" | "SAFE_EXTRACTIVE_MODE" | "REFUSAL"
  refusalReason?: string
  vaultSlug?: string
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  vaultSlug: string
  persona: string
  preview: string
  messages: Message[]
  pinned?: boolean
}
