import React, { useState, useEffect } from "react"
import {
  KeyRound,
  Lock,
  Plus,
  Trash2,
  Share2,
  Check,
  X,
  Clock,
  Shield,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { Grant, AccessRequest } from "../../types"
import { api } from "../../lib/api"
import { useApp } from "../../context/AppContext"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { RequestAccessModal } from "./RequestAccessModal"
import { toast } from "sonner"

export const AccessView: React.FC = () => {
  const { persona, leaseSecondsRemaining } = useApp()
  const [grants, setGrants] = useState<Grant[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [gRes, rRes] = await Promise.all([
        api.getMyGrants(),
        api.getAccessRequests(),
      ])
      setGrants(gRes.grants || [])
      setRequests(rRes.requests || [])
    } catch (err: any) {
      toast.error(`Failed to load access records: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [persona.username])

  const handleRevoke = async (grantId: string) => {
    try {
      await api.revokeGrant(grantId, "User initiated revocation from Access Console")
      toast.success("Grant revoked successfully", {
        description: "Descendant grants recursively invalidated; vault epoch incremented.",
      })
      loadData()
    } catch (err: any) {
      toast.error(`Revocation failed: ${err.message}`)
    }
  }

  const handleApprove = async (requestId: string) => {
    try {
      await api.approveAccessRequest(requestId)
      toast.success("Access request approved!", {
        description: "New active signed grant generated.",
      })
      loadData()
    } catch (err: any) {
      toast.error(`Approval failed: ${err.message}`)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            Access Control & JIT Grants (§13)
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Manage active permissions, time-bound leases, and peer approval workflows.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setIsRequestModalOpen(true)}
          className="gap-1.5 text-xs h-8"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Request Access</span>
        </Button>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-surface-raised space-y-1">
          <div className="text-[11px] text-muted-foreground">Active Grants</div>
          <div className="text-xl font-semibold font-mono text-foreground">
            {grants.length}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface-raised space-y-1">
          <div className="text-[11px] text-muted-foreground">Pending Requests</div>
          <div className="text-xl font-semibold font-mono text-amber-300">
            {requests.filter((r) => r.state === "pending").length}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface-raised space-y-1">
          <div className="text-[11px] text-muted-foreground">Authorization Lease</div>
          <div className="text-xl font-semibold font-mono text-emerald-400">
            {Math.floor(leaseSecondsRemaining / 60)}m {leaseSecondsRemaining % 60}s
          </div>
        </div>
      </div>

      {/* Pending Access Requests Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Pending Access Requests (Peer Governance)
          </h3>
          <span className="text-[11px] text-muted-foreground">
            Separation of Duties enforced (§37, §38)
          </span>
        </div>

        {requests.length === 0 ? (
          <div className="p-6 rounded-xl border border-border/60 bg-surface-raised/40 text-center text-xs text-muted-foreground">
            No pending access requests. You're all clear.
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => (
              <div
                key={req.request_id}
                className="p-3.5 rounded-xl border border-border bg-surface-raised flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">
                      {req.requester_id}
                    </span>
                    <span className="text-muted-foreground">requests access to</span>
                    <Badge variant="vault" className="text-[10px] py-0">
                      {req.vault_id}
                    </Badge>
                    <Badge
                      variant={req.state === "pending" ? "warning" : "success"}
                      className="text-[10px] py-0"
                    >
                      {req.state}
                    </Badge>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Purpose: <span className="text-foreground">{req.purpose}</span> · Duration:{" "}
                    <span className="font-mono text-foreground">{req.duration_minutes}m</span>
                  </p>
                </div>

                {req.state === "pending" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="security"
                      onClick={() => handleApprove(req.request_id)}
                      className="text-xs h-7 gap-1"
                    >
                      <Check className="h-3 w-3" />
                      <span>Approve</span>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Grants Section */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Active Ed25519-Signed Grants (§35, §36)
        </h3>

        {grants.length === 0 ? (
          <div className="p-6 rounded-xl border border-border/60 bg-surface-raised/40 text-center text-xs text-muted-foreground">
            No active temporary grants found for current identity.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-surface-subtle text-muted-foreground border-b border-border text-[11px]">
                  <tr>
                    <th className="p-3 font-medium">Grant ID</th>
                    <th className="p-3 font-medium">Workspace</th>
                    <th className="p-3 font-medium">Granted Actions</th>
                    <th className="p-3 font-medium">Valid Until</th>
                    <th className="p-3 font-medium">Delegable</th>
                    <th className="p-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {grants.map((g) => (
                    <tr key={g.grant_id} className="hover:bg-surface-subtle/50 transition-colors">
                      <td className="p-3 font-mono text-[11px] text-foreground">
                        {g.grant_id}
                      </td>
                      <td className="p-3 font-medium">{g.vault_id}</td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {g.actions.map((act, i) => (
                            <Badge key={i} variant="clearance" className="text-[9px] py-0">
                              {act}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-muted-foreground text-[11px]">
                        {new Date(g.valid_until).toLocaleTimeString()}
                      </td>
                      <td className="p-3">
                        {g.delegable ? (
                          <Badge variant="success" className="text-[9px] py-0">
                            Yes
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">No</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevoke(g.grant_id)}
                          className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 text-xs h-7 px-2"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Revoke
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <RequestAccessModal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        onRequestSubmitted={loadData}
      />
    </div>
  )
}
