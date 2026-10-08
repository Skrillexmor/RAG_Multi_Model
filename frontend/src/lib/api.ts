import {
  Principal,
  Vault,
  VaultDocument,
  Grant,
  AccessRequest,
  RagQueryResponse,
  AuditEvent,
  FederationNode,
  SecurityTestResult,
  TimeStatus,
  LlmStatus,
  RetrievalSecurityTrace,
} from "../types"

const API_BASE = ""

class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

class ApiClient {
  private token: string | null = null

  constructor() {
    this.token = sessionStorage.getItem("rag_token")
  }

  setToken(token: string | null) {
    this.token = token
    if (token) {
      sessionStorage.setItem("rag_token", token)
    } else {
      sessionStorage.removeItem("rag_token")
    }
  }

  getToken(): string | null {
    return this.token
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    }

    if (this.token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${this.token}`
    }

    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json"
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    })

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`
      let errorCode: string | undefined
      try {
        const rawText = await response.text()
        try {
          const errorData = JSON.parse(rawText)
          errorMsg = errorData.detail || errorData.message || rawText || errorMsg
          errorCode = errorData.reason || errorData.code
        } catch {
          errorMsg = rawText || errorMsg
        }
      } catch {
        // stream read fallback
      }
      throw new ApiError(errorMsg, response.status, errorCode)
    }

    return response.json()
  }

  // --- Auth APIs ---
  async login(username: string, password?: string): Promise<{ access_token: string; token_type: string; principal: Principal }> {
    const res = await this.request<{ access_token: string; token_type: string; principal: Principal }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password: password || `${username}123` }),
    })
    this.setToken(res.access_token)
    return res
  }

  async register(payload: {
    username: string
    password: string
    department?: string
    roles?: string[]
    clearance?: number
  }): Promise<{ access_token: string; token_type: string; principal: Principal; message: string }> {
    const res = await this.request<{ access_token: string; token_type: string; principal: Principal; message: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    })
    this.setToken(res.access_token)
    return res
  }

  async getMe(): Promise<{ principal: Principal; lease_deadline?: string }> {
    return this.request("/api/auth/me")
  }

  async switchPersona(username: string): Promise<{ access_token: string; principal: Principal }> {
    const res = await this.request<{ access_token: string; principal: Principal }>("/api/auth/switch-persona", {
      method: "POST",
      body: JSON.stringify({ username }),
    })
    this.setToken(res.access_token)
    return res
  }

  // --- Local LLM Status ---
  async getLlmStatus(): Promise<LlmStatus> {
    return this.request("/api/llm/status")
  }

  // --- Vaults & Ingestion ---
  async getVaults(): Promise<{ vaults: Vault[] }> {
    const res = await this.request<any>("/api/vaults")
    if (Array.isArray(res)) return { vaults: res }
    return res
  }

  async createVault(payload: {
    name: string
    slug?: string
    description?: string
    classification_ceiling?: number
    assigned_user_ids?: string[]
  }): Promise<{ message: string; vault: Vault }> {
    return this.request("/api/vaults", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async updateVault(
    vaultSlugOrId: string,
    payload: {
      name?: string
      description?: string
      classification_ceiling?: number
    }
  ): Promise<{ message: string; vault: Vault }> {
    return this.request(`/api/vaults/${vaultSlugOrId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    })
  }

  async deleteVault(vaultSlugOrId: string): Promise<{ message: string; vault_id: string }> {
    return this.request(`/api/vaults/${vaultSlugOrId}`, {
      method: "DELETE",
    })
  }

  async assignVault(
    vaultSlugOrId: string,
    payload: {
      user_ids?: string[]
      role_names?: string[]
      actions?: string[]
      valid_hours?: number
      is_delegable?: boolean
    }
  ): Promise<{ message: string; grants_created: number }> {
    return this.request(`/api/vaults/${vaultSlugOrId}/assign`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async getVaultMembers(vaultSlugOrId: string): Promise<{
    vault_id: string
    vault_name: string
    members: Array<{
      grant_id: string
      grantee_id: string
      actions: string[]
      valid_from: string
      valid_until: string
      delegable: boolean
      state: string
    }>
  }> {
    return this.request(`/api/vaults/${vaultSlugOrId}/members`)
  }

  async getVaultGrants(vaultSlugOrId: string): Promise<{
    grants: Array<{
      grant_id: string
      grantee_id: string
      actions: string[]
      valid_from: string
      valid_until: string
      delegable: boolean
      state: string
    }>
  }> {
    const res = await this.getVaultMembers(vaultSlugOrId)
    return { grants: res.members || [] }
  }

  async getVaultDocuments(vaultSlug: string): Promise<{ vault_slug: string; documents: VaultDocument[] }> {
    return this.request(`/api/vaults/${vaultSlug}/documents`)
  }

  async deleteDocument(resourceId: string): Promise<{ message: string; resource_id: string; chunks_deleted: number }> {
    return this.request(`/api/documents/${resourceId}`, {
      method: "DELETE",
    })
  }

  async getUsers(): Promise<{
    users: Array<{
      user_id: string
      username: string
      roles: string[]
      clearance_level: number
      department?: string
      is_active: boolean
      created_at?: string
    }>
  }> {
    return this.request("/api/users")
  }

  async createUser(payload: {
    username: string
    password: string
    department?: string
    clearance?: number
    roles?: string[]
  }): Promise<{ status: string; user_id: string; username: string }> {
    return this.request("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async updateUser(
    userId: string,
    payload: {
      department?: string
      clearance?: number
      roles?: string[]
      is_active?: boolean
      new_password?: string
    }
  ): Promise<{ status: string; user_id: string }> {
    return this.request(`/api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    })
  }

  async deleteUser(userId: string): Promise<{ status: string; user_id: string }> {
    return this.request(`/api/users/${userId}`, {
      method: "DELETE",
    })
  }

  async clearChunks(): Promise<{ status: string; chunks_deleted: number }> {
    return this.request("/api/maintenance/clear-chunks", {
      method: "POST",
    })
  }

  async uploadPdf(vaultSlug: string, file: File, classification = 1, minClearance = 1, allowedRoles?: string[]): Promise<any> {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("classification", classification.toString())
    formData.append("min_clearance", minClearance.toString())
    if (allowedRoles) {
      formData.append("allowed_roles", JSON.stringify(allowedRoles))
    }

    return this.request(`/api/vaults/${vaultSlug}/upload-pdf`, {
      method: "POST",
      body: formData,
    })
  }

  // --- RAG Query ---
  async queryRag(vaultSlug: string, query: string, purpose = "general_query", resourceId?: string): Promise<RagQueryResponse> {
    const payload: Record<string, any> = { query, purpose }
    if (resourceId) {
      payload.resource_id = resourceId
    }

    const res = await this.request<any>(`/api/rag/${vaultSlug}/query`, {
      method: "POST",
      body: JSON.stringify(payload),
    })

    const rawTrace = res.security_trace || {}
    const normalizedTrace: RetrievalSecurityTrace = {
      request_id: rawTrace.request_id || `req_${Date.now()}`,
      principal: rawTrace.user_id || "principal",
      vault: rawTrace.vault_slug || vaultSlug,
      gate_a: rawTrace.gate_a || {
        compiled_filter_valid: true,
        candidates_count: rawTrace.gate_a_candidates_count ?? 0,
      },
      gate_b: rawTrace.gate_b || {
        evaluated_count: rawTrace.gate_a_candidates_count ?? 0,
        authorized_count: rawTrace.gate_b_canonical_verified_count ?? 0,
        excluded_count: rawTrace.excluded_candidates_count ?? 0,
      },
      grounding: rawTrace.grounding || {
        claims_count: rawTrace.citations_total_count ?? 0,
        citations_count: rawTrace.citations_validated_count ?? 0,
        status: rawTrace.answer_status ?? "GROUNDED",
      },
      ...rawTrace,
    }

    return {
      answer: res.answer || "",
      claims: res.claims || [],
      citations: res.citations || [],
      evidence_items: res.evidence_items || [],
      mode: res.security_trace?.generation_mode || "GROUNDED",
      refusal_reason: res.security_trace?.refusal_reason,
      security_trace: normalizedTrace,
    }
  }

  // --- Grants & JIT Access ---
  async getMyGrants(): Promise<{ grants: Grant[] }> {
    const res = await this.request<any>("/api/me/grants")
    if (Array.isArray(res)) return { grants: res }
    return res
  }

  async delegateGrant(grantId: string, payload: { delegatee_id: string; actions: string[]; duration_minutes?: number }): Promise<any> {
    return this.request(`/api/grants/${grantId}/delegate`, {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async revokeGrant(grantId: string, reason = "User initiated revocation"): Promise<any> {
    return this.request(`/api/grants/${grantId}/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    })
  }

  async getAccessRequests(): Promise<{ requests: AccessRequest[] }> {
    const res = await this.request<any>("/api/access-requests")
    if (Array.isArray(res)) return { requests: res }
    return res
  }

  async createAccessRequest(payload: { vault_id: string; requested_actions: string[]; duration_minutes: number; purpose: string }): Promise<any> {
    return this.request("/api/access-requests", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }

  async approveAccessRequest(requestId: string): Promise<any> {
    return this.request(`/api/access-requests/${requestId}/approve`, {
      method: "POST",
    })
  }

  // --- Audit ---
  async getAuditEvents(limit = 100): Promise<{ events: AuditEvent[] }> {
    const res = await this.request<any>(`/api/audit/events?limit=${limit}`)
    if (Array.isArray(res)) return { events: res }
    return res
  }

  async verifyAuditChain(): Promise<{ valid: boolean; event_count: number; error: string | null }> {
    return this.request("/api/audit/verify-chain")
  }

  // --- Federation ---
  async getFederationNodes(): Promise<{ nodes: FederationNode[] }> {
    const res = await this.request<any>("/api/federation/nodes")
    if (Array.isArray(res)) return { nodes: res }
    return res
  }

  async exportBundle(vaultId: string, recipientNode: string): Promise<any> {
    return this.request("/api/bundles/export", {
      method: "POST",
      body: JSON.stringify({ vault_id: vaultId, recipient_node: recipientNode }),
    })
  }

  async importBundle(bundle: any): Promise<any> {
    return this.request("/api/bundles/import", {
      method: "POST",
      body: JSON.stringify({ bundle }),
    })
  }

  // --- Time Authority ---
  async getTimeStatus(): Promise<TimeStatus> {
    return this.request("/api/time/status")
  }

  async advanceTime(hours = 2): Promise<TimeStatus> {
    return this.request("/api/time/advance", {
      method: "POST",
      body: JSON.stringify({ hours }),
    })
  }

  async simulateRollback(hours = 2): Promise<TimeStatus> {
    return this.request("/api/time/simulate-rollback", {
      method: "POST",
      body: JSON.stringify({ hours }),
    })
  }

  async resetTime(): Promise<TimeStatus> {
    return this.request("/api/time/reset", {
      method: "POST",
    })
  }

  // --- Security Matrix Tests ---
  async runSecurityTests(): Promise<{ results: SecurityTestResult[]; total: number; passed: number; failed: number }> {
    return this.request("/api/security-tests/run", {
      method: "POST",
    })
  }
}

export const api = new ApiClient()
export { ApiError }
