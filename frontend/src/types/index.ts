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

export interface VaultDocument {
  resource_id: string
  vault_id: string
  title: string
  resource_type: string
  classification: number
  status: string
  chunks_count: number
  created_at: string
  owner_user_id?: string
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
  chunk_count?: number
  documents?: VaultDocument[]
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
  modality?: string
  media_url?: string
  keyframe_url?: string
  timestamp?: string
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
    modality?: string
    media_url?: string
    keyframe_url?: string
    timestamp?: string
    line_start?: number
    line_end?: number
  }
  score: number
  proof: AuthorizationProofObject
}

export type RetrievalMode = "LOW" | "MEDIUM" | "HIGH"

export interface SessionStatus {
  active: boolean
  is_active?: boolean
  remaining_seconds: number
  inactivity_timeout_seconds?: number
  warning_threshold_seconds?: number
  is_warning: boolean
  last_active_at?: string
  expires_at?: string
  username?: string
  user_id?: string
  reason?: string
}

export interface RetrievalSecurityTrace {
  request_id: string
  principal: string
  vault: string
  retrieval_mode?: RetrievalMode
  effective_retrieval_mode?: RetrievalMode
  elapsed_seconds?: number
  conversation_id?: string
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
  retrieval_mode?: RetrievalMode
  effective_retrieval_mode?: RetrievalMode
  elapsed_seconds?: number
  conversation_id?: string
}

export interface AuthConfig {
  app_name: string
  demo_mode: boolean
  offline_mode: boolean
  inactivity_timeout_seconds: number
  clock_status: string
}

export interface MediaTicketResponse {
  ticket: string
  expires_in_seconds: number
  media_url: string
}

export interface AuditEvent {
  event_id: string
  request_id: string
  actor_id: string
  action: string
  object_type: string
  object_id: string
  decision: "ALLOW" | "DENY" | "PERMIT" | string
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

export interface LlmStatus {
  connected: boolean
  runtime: string
  endpoint: string
  active_model: string
  installed_models: string[]
  recommended_models: string[]
  multimodal_models?: {
    vision?: string
    chat?: string
    audio?: string
  }
  single_model_policy_active?: boolean
  current_working_model?: string
  setup_guide: {
    step1: string
    step2: string
    step3: string
  }
}

export interface MultimodalModelStatus {
  active_model: string | null
  state: "ACTIVE" | "IDLE_ON_REST"
  ram_protection: string
  supported_modalities: {
    audio: string
    video: string
    image: string
    document: string
  }
  available_models: {
    vision: string
    llm: string
    speech: string
  }
}

export interface ModelDetectionResult {
  model_id: string
  model_name: string
  modality: "audio" | "image" | "video" | "document"
  badge: string
  description: string
  ram_mode?: string
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
  retrievalMode?: RetrievalMode
  vaultSlug?: string
  selectedFileId?: string
  selectedFileName?: string
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
  selectedFileId?: string
  selectedFileName?: string
  tenant_id?: string
  owner_user_id?: string
  memory?: {
    rolling_summary?: string
    recent_turns?: Array<{ role: string; content: string }>
  }
}

export interface UserSummary {
  user_id: string
  username: string
  roles: string[]
  clearance_level: number
  department?: string
  is_active: boolean
}

export interface VaultMemberGrant {
  grant_id: string
  grantee_id: string
  actions: string[]
  valid_from: string
  valid_until: string
  delegable: boolean
  state: string
}

export interface ChunkRecord {
  chunk_id: string
  resource_id: string
  resource_title: string
  resource_type: string
  vault_id: string
  vault_slug: string
  vault_name: string
  chunk_index: number
  content: string
  content_hash: string
  classification: number
  min_clearance: number
  is_encrypted: boolean
  integrity_verified: boolean
  modality: "audio" | "image" | "video" | "document" | "code" | string
  locator: string
  media_url?: string | null
  timestamp?: string | null
  page?: number | null
  created_at: string
}

export interface ChunkListResponse {
  total: number
  limit: number
  offset: number
  chunks: ChunkRecord[]
  stats: {
    total_chunks: number
    total_encrypted: number
    modalities: Record<string, number>
  }
}

export interface SystemMetrics {
  hardware: {
    ram_total_gb: number
    ram_used_gb: number
    ram_percent: number
    cpu_percent: number
    cpu_cores: number
    cpu_freq_mhz?: number
    disk_total_gb: number
    disk_used_gb: number
    disk_percent: number
  }
  process: {
    pid: number
    python_version: string
    platform: string
    process_rss_mb: number
    uptime_seconds: number
    egress_mode: string
  }
  storage: {
    db_size_mb: number
    total_chunks: number
    total_resources: number
    total_vaults: number
    active_grants: number
  }
  security: {
    total_events: number
    permits: number
    denies: number
    permit_rate: number
    deny_rate: number
  }
}

export interface SystemGrantRecord {
  grant_id: string
  vault_id: string
  vault_slug?: string
  vault_name?: string
  grantee_type?: string
  grantee_id: string
  grantee_username?: string
  issuer_id: string
  actions: string[]
  selector?: any
  resource_id?: string | null
  resource_title?: string | null
  valid_from: string
  valid_until: string
  delegable: boolean
  revoked: boolean
  revocation_reason?: string | null
  is_expired?: boolean
  state: "active" | "revoked" | "expired"
  purpose?: string
  signature?: string
}

