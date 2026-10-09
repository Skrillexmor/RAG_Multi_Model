import React, { useState, useEffect, useCallback } from "react"
import {
  KeyRound,
  Shield,
  Plus,
  Trash2,
  Check,
  X,
  Clock,
  AlertCircle,
  Loader2,
  Search,
  Filter,
  Layers,
  FileText,
  UserCheck,
  ShieldCheck,
  User,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Info,
} from "lucide-react"
import { SystemGrantRecord, AccessRequest } from "../../types"
import { api } from "../../lib/api"
import { useApp } from "../../context/AppContext"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { RequestAccessModal } from "./RequestAccessModal"
import { IssueGrantModal } from "./IssueGrantModal"
import { TimeBar } from "../ui/time-bar"
import { Strata } from "../ui/strata"
import { Seal } from "../ui/seal"
import { cn } from "../../lib/utils"
import { DEMO_PERSONAS } from "../../lib/personas"
import { toast } from "sonner"

export const AccessView: React.FC = () => {
  const { persona, principal, leaseSecondsRemaining, vaults } = useApp()

  const [grants, setGrants] = useState<SystemGrantRecord[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<"grants" | "requests" | "matrix">("grants")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "revoked" | "expired">("active")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [vaultFilter, setVaultFilter] = useState<string>("all")
  const [isIssueModalOpen, setIsIssueModalOpen] = useState<boolean>(false)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const isAdmin =
    (principal?.roles || persona.roles || []).some(
      (r) => r === "admin" || r === "security_admin"
    )

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [gRes, rRes] = await Promise.all([
        api.getSystemGrants().catch(() => ({ grants: [] })),
        api.getAccessRequests().catch(() => ({ requests: [] })),
      ])
      setGrants(gRes.grants || [])
      setRequests(rRes.requests || [])
    } catch (err: any) {
      toast.error(`Failed to load access records: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData, persona.username])

  const handleRevoke = async (grantId: string) => {
    setActionInProgress(grantId)
    try {
      await api.revokeGrant(grantId, "Administrator revocation via Access Console")
      toast.success("Grant revoked successfully", {
        description: "Descendant sub-grants cascade-invalidated; dynamic chunk cache purged.",
      })
      await loadData()
    } catch (err: any) {
      toast.error(`Revocation failed: ${err.message}`)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleApprove = async (requestId: string) => {
    setActionInProgress(requestId)
    try {
      await api.approveAccessRequest(requestId)
      toast.success("Access request approved!", {
        description: "New active signed grant generated.",
      })
      await loadData()
    } catch (err: any) {
      toast.error(`Approval failed: ${err.message}`)
    } finally {
      setActionInProgress(null)
    }
  }

  // Filtered grants
  const filteredGrants = grants.filter((g) => {
    const matchesStatus = statusFilter === "all" || g.state === statusFilter
    const matchesVault = vaultFilter === "all" || g.vault_id === vaultFilter || g.vault_slug === vaultFilter
    const q = searchQuery.toLowerCase().trim()
    const matchesQuery =
      !q ||
      g.grant_id.toLowerCase().includes(q) ||
      g.grantee_username?.toLowerCase().includes(q) ||
      g.grantee_id.toLowerCase().includes(q) ||
      g.vault_name?.toLowerCase().includes(q) ||
      g.resource_title?.toLowerCase().includes(q) ||
      g.purpose?.toLowerCase().includes(q)
    return matchesStatus && matchesVault && matchesQuery
  })

  const activeGrantsCount = grants.filter((g) => g.state === "active").length
  const delegableCount = grants.filter((g) => g.delegable && g.state === "active").length
  const pendingRequestsCount = requests.filter((r) => r.state === "pending").length

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-6xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-light text-foreground tracking-tight">
              Access Governance & JIT Grants
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border">
              NIST SP 800-162
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Authoritative Ed25519-signed permission lifecycle, granular file-level scoping, and delegation control.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={isLoading}
            className="text-xs h-8 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsRequestModalOpen(true)}
            className="text-xs h-8 gap-1.5 border-border"
          >
            <Clock className="h-3.5 w-3.5 text-hold" />
            <span>Request Access</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsIssueModalOpen(true)}
            className="text-xs h-8 gap-1.5 font-medium bg-foreground text-background hover:bg-foreground/90 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Issue Direct Grant</span>
          </Button>
        </div>
      </div>

      {/* KPI Instruments */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-surface space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground uppercase font-medium">Active Grants</span>
            <div className="w-2 h-2 rounded-full bg-permit animate-pulse" />
          </div>
          <div className="text-2xl font-light font-mono text-foreground">{activeGrantsCount}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{grants.length} total recorded</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground uppercase font-medium">Delegable</span>
            <Sparkles className="h-3 w-3 text-beam" />
          </div>
          <div className="text-2xl font-light font-mono text-beam">{delegableCount}</div>
          <div className="text-[10px] text-muted-foreground font-mono">Sub-delegation enabled</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground uppercase font-medium">Pending Requests</span>
            {pendingRequestsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-hold/20 text-hold text-[10px] font-mono">
                Action Req
              </span>
            )}
          </div>
          <div className="text-2xl font-light font-mono text-hold">{pendingRequestsCount}</div>
          <div className="text-[10px] text-muted-foreground font-mono">Separation of duties (§37)</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface space-y-1 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground uppercase font-medium">Session Lease</span>
            <Clock className="h-3 w-3 text-permit" />
          </div>
          <div className="text-2xl font-light font-mono text-foreground">
            {Math.floor(leaseSecondsRemaining / 60)}m {leaseSecondsRemaining % 60}s
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">Current lease window</div>
        </div>
      </div>

      {/* Navigation Tabs with Sliding Underline Style */}
      <div className="flex items-center gap-1 border-b border-border pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("grants")}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[5px]",
            activeTab === "grants"
              ? "border-beam text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <KeyRound className="h-3.5 w-3.5 text-permit" />
          <span>Grants</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-secondary font-mono">
            {filteredGrants.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("requests")}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[5px]",
            activeTab === "requests"
              ? "border-beam text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Clock className="h-3.5 w-3.5 text-hold" />
          <span>Requests</span>
          {pendingRequestsCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-hold/20 text-hold font-mono font-semibold">
              {pendingRequestsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("matrix")}
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-[5px]",
            activeTab === "matrix"
              ? "border-beam text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-trust" />
          <span>Clearance & Role Matrix</span>
        </button>
      </div>

      {/* TAB 1: GRANTS TABLE */}
      {activeTab === "grants" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filter by user, file, grant ID, or purpose..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-8 bg-surface-raised"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-surface-raised border border-border rounded-lg p-0.5">
                {(["active", "all", "revoked", "expired"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2 py-1 rounded-md text-[11px] capitalize transition-colors ${
                      statusFilter === s
                        ? "bg-secondary text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <select
                value={vaultFilter}
                onChange={(e) => setVaultFilter(e.target.value)}
                className="bg-surface-raised border border-border rounded-lg px-2.5 py-1 text-xs text-foreground focus:outline-none"
              >
                <option value="all">All Workspaces</option>
                {vaults.map((v) => (
                  <option key={v.vault_id} value={v.vault_id}>
                    {v.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table Container */}
          {isLoading ? (
            <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
              <span>Querying cryptographic access ledger...</span>
            </div>
          ) : filteredGrants.length === 0 ? (
            <div className="p-12 rounded-xl border border-border/80 bg-surface-raised/40 text-center text-xs text-muted-foreground space-y-2">
              <Shield className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="font-medium text-foreground">No grants matching current filters</p>
              <p className="text-[11px]">
                {statusFilter !== "all"
                  ? `There are no ${statusFilter} grants for the selected criteria.`
                  : "Issue a new grant using the button above to delegate file or workspace permissions."}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-surface-raised overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-subtle text-muted-foreground border-b border-border text-[11px]">
                    <tr>
                      <th className="p-3 font-medium">Grantee & Issuer</th>
                      <th className="p-3 font-medium">Target Scope</th>
                      <th className="p-3 font-medium">Permissions</th>
                      <th className="p-3 font-medium">Validity & Schedule</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredGrants.map((g) => {
                      const isRevoked = g.state === "revoked"
                      const isExpired = g.state === "expired"
                      const isActive = g.state === "active"

                      return (
                        <tr key={g.grant_id} className="hover:bg-surface-subtle/50 transition-colors">
                          {/* Grantee & Issuer */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center font-bold text-[10px] text-foreground shrink-0">
                                {g.grantee_username?.charAt(0).toUpperCase() || "U"}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-foreground truncate">
                                  {g.grantee_username || g.grantee_id}
                                </div>
                                <div className="text-[10px] text-muted-foreground truncate">
                                  by <span className="font-mono">{g.issuer_id}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Target Scope */}
                          <td className="p-3">
                            <div className="space-y-0.5 max-w-[200px]">
                              <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                                <Layers className="h-3 w-3 text-indigo-400 shrink-0" />
                                <span className="truncate">{g.vault_name || g.vault_id}</span>
                              </div>
                              {g.resource_title ? (
                                <div className="text-[11px] text-emerald-400 font-mono truncate flex items-center gap-1 font-medium">
                                  <FileText className="h-2.5 w-2.5 shrink-0" />
                                  <span className="truncate" title={g.resource_title}>
                                    {g.resource_title}
                                  </span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-muted-foreground/70 font-mono">
                                  All Files (Folder Grant)
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Permissions */}
                          <td className="p-3">
                            <div className="flex gap-1 flex-wrap items-center">
                              {g.actions.map((act, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-[9px] py-0 border-emerald-500/30 text-emerald-400 uppercase font-mono"
                                >
                                  {act}
                                </Badge>
                              ))}
                              {g.delegable && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] py-0 border-sky-500/30 text-sky-400"
                                >
                                  Delegable
                                </Badge>
                              )}
                            </div>
                            {g.purpose && (
                              <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[150px]" title={g.purpose}>
                                {g.purpose}
                              </div>
                            )}
                          </td>

                          {/* Validity with TimeBar */}
                          <td className="p-3 font-mono text-[11px]">
                            {g.valid_until ? (
                              <div className="space-y-1.5 min-w-[130px]">
                                <TimeBar from={g.valid_from} until={g.valid_until} />
                                <div className={isExpired ? "text-deny line-through text-[10px]" : "text-foreground text-[10px]"}>
                                  Until {new Date(g.valid_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Permanent</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="p-3">
                            <Badge
                              variant={
                                isActive ? "success" : isRevoked ? "destructive" : "warning"
                              }
                              className="text-[9px] py-0 uppercase font-medium"
                            >
                              {g.state}
                            </Badge>
                          </td>

                          {/* Action */}
                          <td className="p-3 text-right">
                            {isActive ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRevoke(g.grant_id)}
                                disabled={actionInProgress === g.grant_id}
                                className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 text-xs h-7 px-2.5 gap-1"
                              >
                                {actionInProgress === g.grant_id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                <span>Revoke</span>
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/60 italic font-mono">
                                {isRevoked ? "Revoked" : "Expired"}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACCESS REQUESTS */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Pending Access Requests (Peer Governance)
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Separation of Duties enforced (§37, §38)
            </span>
          </div>

          {requests.length === 0 ? (
            <div className="p-12 rounded-xl border border-border/80 bg-surface-raised/40 text-center text-xs text-muted-foreground space-y-2">
              <Check className="h-8 w-8 mx-auto text-emerald-400/60" />
              <p className="font-medium text-foreground">No pending access requests</p>
              <p className="text-[11px]">All submitted permission requests have been evaluated.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {requests.map((req) => (
                <div
                  key={req.request_id}
                  className="p-4 rounded-xl border border-border bg-surface-raised flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">
                        {req.requester_id}
                      </span>
                      <span className="text-muted-foreground">requests access to</span>
                      <Badge variant="vault" className="text-[10px] py-0 font-mono">
                        {req.vault_id}
                      </Badge>
                      <Badge
                        variant={req.state === "pending" ? "warning" : "success"}
                        className="text-[10px] py-0 uppercase"
                      >
                        {req.state}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Purpose: <span className="text-foreground font-medium">{req.purpose}</span> · Duration:{" "}
                      <span className="font-mono text-emerald-400">{req.duration_minutes}m</span>
                    </p>
                    <div className="text-[10px] text-muted-foreground">
                      Requested actions:{" "}
                      <span className="font-mono text-foreground">
                        {req.requested_actions?.join(", ") || "read"}
                      </span>
                    </div>
                  </div>

                  {req.state === "pending" && (
                    <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                      {principal?.user_id === req.requester_id || persona.username === req.requester_id ? (
                        <span
                          className="text-[11px] text-muted-foreground italic px-2 py-1 bg-secondary rounded border border-border"
                          title="Separation of Duties (§37): You cannot approve your own access request."
                        >
                          Self-approval restricted (SoD §37)
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleApprove(req.request_id)}
                          disabled={actionInProgress === req.request_id}
                          className="text-xs h-8 gap-1.5 bg-foreground text-background hover:bg-foreground/90 font-medium shadow-sm"
                        >
                          {actionInProgress === req.request_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          <span>Approve Request</span>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ROLE & CLEARANCE MATRIX */}
      {activeTab === "matrix" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-xs text-indigo-300 flex items-start gap-3">
            <Info className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">NIST SP 800-162 RBAC + ABAC + DAC Zero-Trust Policy</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Every chunk access requires clearance level ceiling compliance AND either ownership, an active cryptographic grant, or folder-wide role ACL verification.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-subtle text-muted-foreground border-b border-border text-[11px]">
                <tr>
                  <th className="p-3 font-medium">User Persona</th>
                  <th className="p-3 font-medium">Clearance Level</th>
                  <th className="p-3 font-medium">Assigned Roles</th>
                  <th className="p-3 font-medium">Accessible Default Workspaces</th>
                  <th className="p-3 font-medium">Security Capabilities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {DEMO_PERSONAS.map((p) => {
                  const isCurrent = p.username.toLowerCase() === persona.username.toLowerCase()
                  return (
                    <tr
                      key={p.username}
                      className={cn(
                        "transition-colors",
                        isCurrent ? "bg-beam/5 border-l-2 border-l-beam font-medium" : "hover:bg-surface-subtle/40"
                      )}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-[10px] text-foreground">
                            {p.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground flex items-center gap-1.5">
                              <span>{p.name}</span>
                              {isCurrent && (
                                <Badge variant="secondary" className="text-[8px] py-0 px-1 border-beam/50 text-beam font-mono">
                                  Active Session
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{p.roleTitle}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        <Strata level={p.clearanceLevel} size="sm" />
                      </td>

                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {p.roles.map((r, i) => (
                            <span key={i} className="text-[9px] py-0.5 px-1.5 rounded bg-secondary border border-border text-muted-foreground font-mono">
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {p.accessibleVaults.map((v, i) => (
                            <span key={i} className="text-[10px] text-foreground bg-surface border border-border px-1.5 py-0.5 rounded font-mono inline-flex items-center gap-1">
                              <Seal state="verified" size={10} />
                              {v}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="p-3 text-[11px] text-muted-foreground max-w-xs leading-relaxed">
                        {p.description}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <IssueGrantModal
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        onGrantCreated={loadData}
      />

      <RequestAccessModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onRequestSubmitted={loadData}
      />
    </div>
  )
}
