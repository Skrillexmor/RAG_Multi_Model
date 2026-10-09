import React, { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import {
  Share2,
  Clock,
  Shield,
  User,
  Users,
  FileText,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "../../lib/api"
import { Vault, VaultDocument } from "../../types"

interface SystemUser {
  user_id: string
  username: string
  roles: string[]
  clearance_level: number
  department?: string
  is_active: boolean
}

interface MemberGrant {
  grant_id: string
  vault_id?: string
  grantee_type?: string
  grantee_id: string
  actions: string[]
  valid_from: string
  valid_until: string
  state: string
  username?: string
  department?: string
  clearance?: number
  resource_id?: string | null
  resource_title?: string | null
  selector?: any
}

interface ShareAccessModalProps {
  isOpen: boolean
  onClose: () => void
  vault: Vault | null
  initialDoc?: VaultDocument | null
  onSuccess?: () => void
}

export const ShareAccessModal: React.FC<ShareAccessModalProps> = ({
  isOpen,
  onClose,
  vault,
  initialDoc,
  onSuccess,
}) => {
  const [activeMembers, setActiveMembers] = useState<MemberGrant[]>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null)

  // Target file selection
  const [targetScope, setTargetScope] = useState<"folder" | "file">("folder")
  const [selectedDoc, setSelectedDoc] = useState<VaultDocument | null>(null)

  // Assignee selection
  const [assigneeType, setAssigneeType] = useState<"user" | "role">("user")
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [selectedRole, setSelectedRole] = useState<string>("analyst")

  // Permissions & Duration
  const [assignActions, setAssignActions] = useState<string[]>([
    "query_rag",
    "retrieve_evidence",
  ])
  const [validHours, setValidHours] = useState<number>(72)
  const [isDelegable, setIsDelegable] = useState<boolean>(false)
  const [isAssigning, setIsAssigning] = useState<boolean>(false)

  // 1. Load users & member grants whenever modal opens
  const loadData = useCallback(async () => {
    if (!vault) return
    setIsLoadingMembers(true)
    try {
      const [membersRes, usersRes] = await Promise.all([
        api.getVaultMembers(vault.slug || vault.vault_id).catch(() => ({ members: [] })),
        api.getUsers().catch(() => ({ users: [] })),
      ])

      setActiveMembers(membersRes.members || [])
      const users = usersRes.users || []
      setSystemUsers(users)

      if (users.length > 0 && !selectedUserId) {
        setSelectedUserId(users[0].user_id)
      }
    } catch (err: any) {
      console.warn("Error loading share modal data", err)
    } finally {
      setIsLoadingMembers(false)
    }
  }, [vault, selectedUserId])

  useEffect(() => {
    if (isOpen && vault) {
      if (initialDoc) {
        setTargetScope("file")
        setSelectedDoc(initialDoc)
      } else {
        setTargetScope("folder")
        setSelectedDoc(vault.documents && vault.documents.length > 0 ? vault.documents[0] : null)
      }
      loadData()
    }
  }, [isOpen, vault, initialDoc, loadData])

  // Handle Revoke Grant
  const handleRevokeGrant = async (grantId: string, granteeName: string) => {
    setRevokingGrantId(grantId)
    try {
      await api.revokeGrant(grantId, "Revoked by folder steward via Access Manager")
      toast.success(`Access grant for "${granteeName}" revoked successfully.`, {
        description: "Permissions terminated across Gate A and Gate B in real time.",
      })
      // Optimistically update active members
      setActiveMembers((prev) => prev.filter((m) => m.grant_id !== grantId))
      onSuccess?.()
    } catch (err: any) {
      toast.error(`Failed to revoke grant: ${err.message}`)
    } finally {
      setRevokingGrantId(null)
    }
  }

  // Handle Grant Submission
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vault) return

    if (assigneeType === "user" && !selectedUserId) {
      toast.error("Please choose a user to assign access.")
      return
    }

    if (assignActions.length === 0) {
      toast.error("Please select at least one permission.")
      return
    }

    setIsAssigning(true)
    try {
      const payload: any = {
        actions: assignActions,
        valid_hours: validHours,
        is_delegable: isDelegable,
        resource_id: targetScope === "file" && selectedDoc ? selectedDoc.resource_id : undefined,
      }

      if (assigneeType === "user") {
        payload.user_ids = [selectedUserId]
      } else {
        payload.role_names = [selectedRole]
      }

      const res = await api.assignVault(vault.slug || vault.vault_id, payload)
      
      const targetLabel = targetScope === "file" && selectedDoc
        ? `File "${selectedDoc.title}"`
        : `Folder "${vault.display_name}"`
      
      toast.success(`Access granted for ${targetLabel}!`, {
        description: `Created signed cryptographic authorization grant (${validHours}h validity).`,
      })

      // Refresh members
      await loadData()
      onSuccess?.()
    } catch (err: any) {
      toast.error(`Assignment failed: ${err.message}`)
    } finally {
      setIsAssigning(false)
    }
  }

  const toggleAction = (act: string) => {
    setAssignActions((prev) =>
      prev.includes(act) ? prev.filter((a) => a !== act) : [...prev, act]
    )
  }

  if (!vault) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto border-border bg-surface shadow-2xl">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base text-foreground font-semibold">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Share2 className="h-4 w-4" />
            </div>
            <span>Assign & Share Access</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Folder: <span className="font-semibold text-foreground">{vault.display_name}</span> ({vault.slug})
            {targetScope === "file" && selectedDoc && (
              <span className="block mt-0.5 text-emerald-400 font-medium">
                Target File: {selectedDoc.title} ({selectedDoc.resource_id})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Active Members & Grants Section */}
          <div className="rounded-lg border border-border/80 bg-surface-subtle/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                Active Members & Grants
              </span>
              <Badge variant="outline" className="text-[10px] px-2 py-0 border-border text-muted-foreground">
                {activeMembers.length} active grant{activeMembers.length === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
              {isLoadingMembers ? (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                  <span>Loading active grants...</span>
                </div>
              ) : activeMembers.length > 0 ? (
                activeMembers.map((m) => {
                  const isRevoking = revokingGrantId === m.grant_id
                  const displayName = m.username
                    ? `${m.username} (L${m.clearance || 1})`
                    : m.grantee_id
                  const isFileGrant = !!m.resource_id || !!m.resource_title

                  return (
                    <div
                      key={m.grant_id}
                      className="flex items-center justify-between p-2 rounded-md bg-surface-raised border border-border/70 text-xs transition-colors hover:border-border"
                    >
                      <div className="space-y-0.5 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-foreground text-xs flex items-center gap-1">
                            {m.grantee_type === "user" ? (
                              <User className="h-3 w-3 text-emerald-400" />
                            ) : (
                              <Users className="h-3 w-3 text-cyan-400" />
                            )}
                            {displayName}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[9px] py-0 px-1 bg-surface-subtle text-muted-foreground font-mono"
                          >
                            {isFileGrant ? (
                              <span className="text-emerald-400 truncate max-w-[140px]">
                                File: {m.resource_title || m.resource_id}
                              </span>
                            ) : (
                              "Entire Folder"
                            )}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-2 flex-wrap">
                          <span>Actions: {m.actions.map(a => a.replace("action:", "")).join(", ")}</span>
                          <span className="text-[9px] text-muted-foreground/80">
                            · Until: {new Date(m.valid_until).toLocaleDateString()} {new Date(m.valid_until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isRevoking}
                          onClick={() => handleRevokeGrant(m.grant_id, displayName)}
                          className="h-7 px-2 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20"
                          title="Revoke this grant immediately"
                        >
                          {isRevoking ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="h-3 w-3 mr-1" />
                              Revoke
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2.5">
                  No active access grants assigned yet. Issue a grant below.
                </p>
              )}
            </div>
          </div>

          {/* Form: Assign New Grant */}
          <form onSubmit={handleAssignSubmit} className="space-y-3.5 pt-1 border-t border-border/40">
            {/* Target Scope Selection */}
            <div className="p-2.5 rounded-lg bg-surface-subtle/70 border border-border/60 space-y-2">
              <label className="text-xs font-medium text-foreground flex items-center justify-between">
                <span>Access Scope:</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {targetScope === "file" && selectedDoc ? "Specific File Granted" : "All Folder Files Granted"}
                </span>
              </label>

              <div className="flex items-center gap-5 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="scopeRadio"
                    checked={targetScope === "folder"}
                    onChange={() => setTargetScope("folder")}
                    className="text-emerald-500 focus:ring-0"
                  />
                  <span>Entire Folder ({vault.documents?.length || 0} files)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="scopeRadio"
                    checked={targetScope === "file"}
                    onChange={() => {
                      setTargetScope("file")
                      if (!selectedDoc && vault.documents && vault.documents.length > 0) {
                        setSelectedDoc(vault.documents[0])
                      }
                    }}
                    className="text-emerald-500 focus:ring-0"
                    disabled={!vault.documents || vault.documents.length === 0}
                  />
                  <span>Particular File</span>
                </label>
              </div>

              {targetScope === "file" && vault.documents && vault.documents.length > 0 && (
                <div className="pt-1">
                  <label className="text-[11px] text-muted-foreground block mb-1">Select File to Share:</label>
                  <select
                    value={selectedDoc?.resource_id || vault.documents[0].resource_id}
                    onChange={(e) => {
                      const found = vault.documents?.find((d) => d.resource_id === e.target.value)
                      if (found) setSelectedDoc(found)
                    }}
                    className="w-full text-xs h-8 rounded-md bg-surface border border-border px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
                  >
                    {vault.documents.map((d) => (
                      <option key={d.resource_id} value={d.resource_id}>
                        {d.title} (ID: {d.resource_id} · {d.chunks_count} chunks)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Assignee Type: User or Role */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-5 text-xs font-medium">
                <span>Assign To:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="assigneeRadio"
                    checked={assigneeType === "user"}
                    onChange={() => setAssigneeType("user")}
                    className="text-emerald-500 focus:ring-0"
                  />
                  <span>Individual User</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="assigneeRadio"
                    checked={assigneeType === "role"}
                    onChange={() => setAssigneeType("role")}
                    className="text-emerald-500 focus:ring-0"
                  />
                  <span>System Role</span>
                </label>
              </div>

              {assigneeType === "user" ? (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Select User</label>
                  <select
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="w-full text-xs h-8 rounded-md bg-surface-subtle border border-border px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {systemUsers.map((u) => (
                      <option key={u.user_id} value={u.user_id}>
                        {u.username} — L{u.clearance_level} ({u.department || "General"}) ({Array.from(new Set(u.roles)).join(", ")})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Select Role</label>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="w-full text-xs h-8 rounded-md bg-surface-subtle border border-border px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="analyst">Analyst</option>
                    <option value="engineer">Engineer</option>
                    <option value="hr">HR Specialist</option>
                    <option value="auditor">Auditor</option>
                    <option value="admin">Administrator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              )}
            </div>

            {/* Allowed Permissions */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Allowed Permissions</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 p-1.5 rounded bg-surface-subtle/60 border border-border/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignActions.includes("query_rag")}
                    onChange={() => toggleAction("query_rag")}
                    className="rounded text-emerald-500 focus:ring-0"
                  />
                  <span>Query RAG</span>
                </label>
                <label className="flex items-center gap-2 p-1.5 rounded bg-surface-subtle/60 border border-border/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignActions.includes("retrieve_evidence")}
                    onChange={() => toggleAction("retrieve_evidence")}
                    className="rounded text-emerald-500 focus:ring-0"
                  />
                  <span>Retrieve Evidence</span>
                </label>
                <label className="flex items-center gap-2 p-1.5 rounded bg-surface-subtle/60 border border-border/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignActions.includes("view_source")}
                    onChange={() => toggleAction("view_source")}
                    className="rounded text-emerald-500 focus:ring-0"
                  />
                  <span>View Source</span>
                </label>
                <label className="flex items-center gap-2 p-1.5 rounded bg-surface-subtle/60 border border-border/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignActions.includes("download_document")}
                    onChange={() => toggleAction("download_document")}
                    className="rounded text-emerald-500 focus:ring-0"
                  />
                  <span>Download Doc</span>
                </label>
                <label className="flex items-center gap-2 p-1.5 rounded bg-surface-subtle/60 border border-border/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignActions.includes("share_data")}
                    onChange={() => toggleAction("share_data")}
                    className="rounded text-emerald-500 focus:ring-0"
                  />
                  <span>Share Data</span>
                </label>
              </div>
            </div>

            {/* Duration (TTL) & Re-delegation */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Grant Time Limit (TTL):
                </label>
                <select
                  value={validHours}
                  onChange={(e) => setValidHours(Number(e.target.value))}
                  className="w-full text-xs h-8 rounded-md bg-surface-subtle border border-border px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                >
                  <option value={1}>1 Hour</option>
                  <option value={4}>4 Hours</option>
                  <option value={8}>8 Hours (Workshift)</option>
                  <option value={24}>24 Hours (1 Day)</option>
                  <option value={72}>72 Hours (3 Days)</option>
                  <option value={168}>7 Days (1 Week)</option>
                  <option value={720}>30 Days (1 Month)</option>
                  <option value={8760}>365 Days (1 Year)</option>
                </select>
              </div>

              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDelegable}
                    onChange={(e) => setIsDelegable(e.target.checked)}
                    className="rounded text-emerald-500 focus:ring-0"
                  />
                  <span>Allow Re-delegation</span>
                </label>
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs h-8"
              >
                Close
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isAssigning}
                className="text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                {isAssigning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    Issuing Grant...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Grant Access
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
