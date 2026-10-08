import React, { useState, useEffect } from "react"
import {
  Settings,
  Moon,
  Sun,
  Laptop,
  Shield,
  Server,
  Database,
  Lock,
  Wifi,
  Users,
  UserPlus,
  Trash2,
  Edit2,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  KeyRound,
  Layers,
  Sparkles,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { storage } from "../../lib/storage"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog"
import { api } from "../../lib/api"
import { toast } from "sonner"
import { UserSummary } from "../../types"

const AVAILABLE_ROLES = [
  "admin",
  "engineer",
  "security_officer",
  "compliance_auditor",
  "external_partner",
]

export const SettingsView: React.FC = () => {
  const { persona, principal, refreshVaults } = useApp()
  const [theme, setThemeState] = useState<"dark" | "light" | "system">(storage.getTheme())

  const isAdmin =
    persona.roles.includes("admin") ||
    persona.roles.includes("security_admin") ||
    Boolean(principal?.roles && (principal.roles.includes("admin") || principal.roles.includes("security_admin")))

  // Users CRUD state
  const [users, setUsers] = useState<UserSummary[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)

  // Create User Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newDepartment, setNewDepartment] = useState("")
  const [newClearance, setNewClearance] = useState<number>(2)
  const [newRoles, setNewRoles] = useState<string[]>(["engineer"])
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null)
  const [editDepartment, setEditDepartment] = useState("")
  const [editClearance, setEditClearance] = useState<number>(2)
  const [editRoles, setEditRoles] = useState<string[]>([])
  const [editIsActive, setEditIsActive] = useState<boolean>(true)
  const [editNewPassword, setEditNewPassword] = useState("")
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)

  // Delete User Modal
  const [deletingUser, setDeletingUser] = useState<UserSummary | null>(null)
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false)

  // Maintenance: Clear Chunks
  const [isClearChunksOpen, setIsClearChunksOpen] = useState(false)
  const [isClearingChunks, setIsClearingChunks] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setIsLoadingUsers(true)
    try {
      const res = await api.getUsers()
      if (res && res.users) {
        setUsers(res.users)
      }
    } catch (err: any) {
      toast.error(`Failed to load users: ${err.message}`)
    } finally {
      setIsLoadingUsers(false)
    }
  }

  const handleThemeChange = (newTheme: "dark" | "light" | "system") => {
    setThemeState(newTheme)
    storage.setTheme(newTheme)
  }

  // Create User
  const handleCreateUser = async () => {
    if (!newUsername.trim()) {
      toast.error("Username is required.")
      return
    }
    if (!newPassword || newPassword.length < 4) {
      toast.error("Password must be at least 4 characters.")
      return
    }
    if (newRoles.length === 0) {
      toast.error("Please assign at least one role.")
      return
    }

    setIsSubmittingCreate(true)
    try {
      await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        department: newDepartment.trim() || undefined,
        clearance: newClearance,
        roles: newRoles,
      })
      toast.success(`User "${newUsername}" created successfully.`)
      setIsCreateModalOpen(false)
      setNewUsername("")
      setNewPassword("")
      setNewDepartment("")
      setNewClearance(2)
      setNewRoles(["engineer"])
      await loadUsers()
    } catch (err: any) {
      toast.error(`Failed to create user: ${err.message}`)
    } finally {
      setIsSubmittingCreate(false)
    }
  }

  // Open Edit User
  const handleOpenEdit = (u: UserSummary) => {
    setEditingUser(u)
    setEditDepartment(u.department || "")
    setEditClearance(u.clearance_level)
    setEditRoles(u.roles || [])
    setEditIsActive(u.is_active)
    setEditNewPassword("")
  }

  // Submit Edit User
  const handleUpdateUser = async () => {
    if (!editingUser) return
    if (editRoles.length === 0) {
      toast.error("Please assign at least one role.")
      return
    }

    setIsSubmittingEdit(true)
    try {
      await api.updateUser(editingUser.user_id, {
        department: editDepartment.trim() || undefined,
        clearance: editClearance,
        roles: editRoles,
        is_active: editIsActive,
        new_password: editNewPassword.trim() || undefined,
      })
      toast.success(`User "${editingUser.username}" updated successfully.`)
      setEditingUser(null)
      await loadUsers()
    } catch (err: any) {
      toast.error(`Failed to update user: ${err.message}`)
    } finally {
      setIsSubmittingEdit(false)
    }
  }

  // Delete User
  const handleDeleteUser = async () => {
    if (!deletingUser) return
    setIsSubmittingDelete(true)
    try {
      await api.deleteUser(deletingUser.user_id)
      toast.success(`User "${deletingUser.username}" removed and credentials revoked.`)
      setDeletingUser(null)
      await loadUsers()
    } catch (err: any) {
      toast.error(`Failed to delete user: ${err.message}`)
    } finally {
      setIsSubmittingDelete(false)
    }
  }

  // Clear Chunks Maintenance
  const handleClearChunks = async () => {
    setIsClearingChunks(true)
    try {
      const res = await api.clearChunks()
      toast.success(`Vector maintenance complete: ${res.chunks_deleted || 0} chunks purged from Qdrant and SQLite.`)
      setIsClearChunksOpen(false)
      await refreshVaults()
    } catch (err: any) {
      toast.error(`Failed to clear chunks: ${err.message}`)
    } finally {
      setIsClearingChunks(false)
    }
  }

  const getClearanceBadge = (level: number) => {
    switch (level) {
      case 1:
        return <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]">L1 · Public</Badge>
      case 2:
        return <Badge variant="outline" className="border-sky-500/40 text-sky-400 bg-sky-500/10 text-[10px]">L2 · Internal</Badge>
      case 3:
        return <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]">L3 · Confidential</Badge>
      case 4:
        return <Badge variant="outline" className="border-rose-500/40 text-rose-400 bg-rose-500/10 text-[10px]">L4 · Top Secret</Badge>
      default:
        return <Badge variant="secondary" className="text-[10px]">L{level}</Badge>
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight flex items-center gap-2">
          <Settings className="h-5 w-5 text-emerald-400" />
          Settings & System Administration (§18..§45)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Manage local account identities, clearance tokens, maintenance actions, and offline security boundaries.
        </p>
      </div>

      {/* Conditionally Render Admin Panels vs Regular User Profile */}
      {isAdmin ? (
        <>
          {/* Account & User Management Section */}
          <div className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-emerald-400" />
                  Account & Identity Management
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Administer local user accounts, RBAC tokens, and security clearance ceilings.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadUsers}
                  disabled={isLoadingUsers}
                  className="h-8 text-xs gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoadingUsers ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Add Account</span>
                </Button>
              </div>
            </div>

            {/* Users Table */}
            <div className="border border-border rounded-lg overflow-hidden bg-surface-subtle">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/60 text-[11px] text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">Username</th>
                      <th className="py-2.5 px-3">Clearance</th>
                      <th className="py-2.5 px-3">Assigned Roles</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {users.map((u) => {
                      const isCurrent = principal?.user_id === u.user_id || persona.username === u.username
                      return (
                        <tr key={u.user_id} className="hover:bg-surface-raised/60 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                            <div className="flex items-center gap-1.5">
                              <span>{u.username}</span>
                              {isCurrent && (
                                <Badge variant="success" className="text-[9px] px-1 py-0 font-normal">
                                  Current
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {getClearanceBadge(u.clearance_level)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {u.roles.map((r) => (
                                <span
                                  key={r}
                                  className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-muted-foreground"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground font-mono text-[11px]">
                            {u.department || "General"}
                          </td>
                          <td className="py-2.5 px-3">
                            {u.is_active ? (
                              <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-rose-400 text-[11px]">
                                <XCircle className="h-3 w-3" /> Disabled
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEdit(u)}
                                className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                                title="Edit user roles and clearance"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              {!isCurrent && (
                                <button
                                onClick={() => setDeletingUser(u)}
                                className="p-1 rounded hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 transition-colors"
                                title="Delete user account"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Vector Storage & Chunks Maintenance Section */}
        <div className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-sm">
          <div>
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-400" />
              System Maintenance & Vector Storage
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Perform administrative maintenance on Qdrant local vector embeddings and SQLite chunk records.
            </p>
          </div>

          <div className="p-4 rounded-lg border border-border/80 bg-surface-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-xs">Purge Chunks & Reset Vector Index</span>
                <Badge variant="outline" className="border-amber-500/30 text-amber-300 text-[9px]">
                  Maintenance Action
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground max-w-xl leading-relaxed">
                Deletes all chunk embeddings from the local Qdrant collection and clears the chunks table.
                Uploaded PDF manifests remain safe. You can re-index anytime by re-uploading documents.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClearChunksOpen(true)}
              className="h-8 text-xs shrink-0 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear Chunks & Vectors</span>
            </Button>
          </div>
        </div>
      </>
    ) : (
      /* Regular Non-Admin User Card */
      <div className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-surface-subtle border border-border flex items-center justify-center text-emerald-400">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-sm">Personal Identity & Credentials</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Your authenticated workspace session and security clearance parameters.
              </p>
            </div>
          </div>

          {users.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const me = users.find((u) => u.username === persona.username || u.user_id === principal?.user_id) || users[0]
                handleOpenEdit(me)
              }}
              className="h-8 text-xs gap-1.5 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>Update My Password</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3 rounded-lg border border-border bg-surface-subtle space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">User Principal</span>
            <div className="font-mono text-sm font-semibold text-foreground">{persona.name} ({persona.username})</div>
            <div className="text-[11px] text-muted-foreground">Assigned Roles: {persona.roles.join(", ")}</div>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-subtle space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Clearance Ceiling</span>
            <div>{getClearanceBadge(persona.clearanceLevel)}</div>
            <div className="text-[11px] text-muted-foreground">Department: {persona.roleTitle || "General"}</div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-surface-subtle/50 border border-border/40 text-[11px] text-muted-foreground flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>Administrative management (User CRUD, Vector Purging) requires Security Officer or Admin role.</span>
        </div>
      </div>
    )}

      {/* Appearance Section */}
      <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-3.5 text-xs shadow-sm">
        <h3 className="font-semibold text-foreground text-sm">Appearance & Theme</h3>

        <div className="grid grid-cols-3 gap-2.5 max-w-md">
          <button
            onClick={() => handleThemeChange("dark")}
            className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-colors ${
              theme === "dark"
                ? "border-emerald-500 bg-surface-subtle text-foreground"
                : "border-border text-muted-foreground hover:bg-surface-subtle"
            }`}
          >
            <Moon className="h-4 w-4" />
            <span className="font-medium">Dark Mode</span>
          </button>

          <button
            onClick={() => handleThemeChange("light")}
            className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-colors ${
              theme === "light"
                ? "border-emerald-500 bg-surface-subtle text-foreground"
                : "border-border text-muted-foreground hover:bg-surface-subtle"
            }`}
          >
            <Sun className="h-4 w-4" />
            <span className="font-medium">Light Mode</span>
          </button>

          <button
            onClick={() => handleThemeChange("system")}
            className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-colors ${
              theme === "system"
                ? "border-emerald-500 bg-surface-subtle text-foreground"
                : "border-border text-muted-foreground hover:bg-surface-subtle"
            }`}
          >
            <Laptop className="h-4 w-4" />
            <span className="font-medium">System</span>
          </button>
        </div>
      </div>

      {/* Identity & Current Persona */}
      <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-3 text-xs shadow-sm">
        <h3 className="font-semibold text-foreground text-sm">Active Session Identity</h3>

        <div className="p-3 rounded-lg border border-border bg-surface-subtle space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground text-sm">{persona.name}</span>
            <Badge variant="clearance">Clearance Level {persona.clearanceLevel}</Badge>
          </div>
          <div className="text-muted-foreground">{persona.description}</div>
          <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/40">
            Role Tokens: {persona.roles.join(", ")}
          </div>
        </div>
      </div>

      {/* System & Architecture Diagnostics */}
      <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-3 text-xs shadow-sm">
        <h3 className="font-semibold text-foreground text-sm">Offline Diagnostics (§128)</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="p-3 rounded-lg border border-border bg-surface-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-emerald-400" />
              <span>External Egress</span>
            </div>
            <Badge variant="success">BLOCKED (ZERO CLOUD)</Badge>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-400" />
              <span>Vector Database</span>
            </div>
            <span className="font-mono text-foreground text-[11px]">Qdrant (Local Disk)</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-400" />
              <span>Canonical Storage</span>
            </div>
            <span className="font-mono text-foreground text-[11px]">AES-256-GCM Encrypted</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span>Password Algorithm</span>
            </div>
            <span className="font-mono text-foreground text-[11px]">Argon2id Salted</span>
          </div>
        </div>
      </div>

      {/* CREATE USER MODAL */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-emerald-400" />
              <span>Create User Account</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Provision a new account with custom clearance ceiling and RBAC roles.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Username *</label>
              <Input
                placeholder="e.g. dev_analyst"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="h-8 text-xs bg-surface-subtle font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Initial Password *</label>
              <Input
                type="password"
                placeholder="At least 4 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-8 text-xs bg-surface-subtle"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Department</label>
              <Input
                placeholder="e.g. R&D / Cryptography"
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                className="h-8 text-xs bg-surface-subtle"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Clearance Level</label>
              <select
                value={newClearance}
                onChange={(e) => setNewClearance(Number(e.target.value))}
                className="w-full h-8 px-2.5 rounded-md border border-border bg-surface-subtle text-xs text-foreground outline-none"
              >
                <option value={1}>Level 1 · Public</option>
                <option value={2}>Level 2 · Internal</option>
                <option value={3}>Level 3 · Confidential</option>
                <option value={4}>Level 4 · Top Secret</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Assigned Roles</label>
              <div className="border border-border rounded-md p-2 space-y-1.5 bg-surface-subtle">
                {AVAILABLE_ROLES.map((role) => {
                  const checked = newRoles.includes(role)
                  return (
                    <label key={role} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            setNewRoles((prev) => prev.filter((r) => r !== role))
                          } else {
                            setNewRoles((prev) => [...prev, role])
                          }
                        }}
                        className="rounded border-border text-emerald-500 focus:ring-0"
                      />
                      <span className="font-mono capitalize">{role.replace("_", " ")}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateUser}
              disabled={isSubmittingCreate}
              className="text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSubmittingCreate ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT USER MODAL */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-emerald-400" />
              <span>Edit Account: {editingUser?.username}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Department</label>
              <Input
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                className="h-8 text-xs bg-surface-subtle"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Clearance Level</label>
              <select
                value={editClearance}
                onChange={(e) => setNewClearance(Number(e.target.value))}
                className="w-full h-8 px-2.5 rounded-md border border-border bg-surface-subtle text-xs text-foreground outline-none"
              >
                <option value={1}>Level 1 · Public</option>
                <option value={2}>Level 2 · Internal</option>
                <option value={3}>Level 3 · Confidential</option>
                <option value={4}>Level 4 · Top Secret</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Reset Password (Optional)</label>
              <Input
                type="password"
                placeholder="Leave blank to keep existing password"
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                className="h-8 text-xs bg-surface-subtle"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Assigned Roles</label>
              <div className="border border-border rounded-md p-2 space-y-1.5 bg-surface-subtle">
                {AVAILABLE_ROLES.map((role) => {
                  const checked = editRoles.includes(role)
                  return (
                    <label key={role} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            setEditRoles((prev) => prev.filter((r) => r !== role))
                          } else {
                            setEditRoles((prev) => [...prev, role])
                          }
                        }}
                        className="rounded border-border text-emerald-500 focus:ring-0"
                      />
                      <span className="font-mono capitalize">{role.replace("_", " ")}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="font-medium text-foreground">Account Active</label>
              <input
                type="checkbox"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                className="rounded border-border text-emerald-500 focus:ring-0 h-4 w-4"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingUser(null)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUpdateUser}
              disabled={isSubmittingEdit}
              className="text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSubmittingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE USER MODAL */}
      <Dialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <span>Delete User Account?</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete account &quot;{deletingUser?.username}&quot;?
              Their security grants, tokens, and active session permissions will be permanently revoked.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingUser(null)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteUser}
              disabled={isSubmittingDelete}
              className="text-xs h-8 bg-rose-600 hover:bg-rose-500 text-white"
            >
              {isSubmittingDelete ? "Deleting..." : "Delete Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLEAR CHUNKS CONFIRMATION MODAL */}
      <Dialog open={isClearChunksOpen} onOpenChange={setIsClearChunksOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <span>Purge Vector Database & Chunks?</span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              This maintenance operation will erase all vectorized embeddings in local Qdrant and clear the SQLite chunks table.
              Original document PDF files are preserved, but search queries will not match until documents are re-indexed.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClearChunksOpen(false)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearChunks}
              disabled={isClearingChunks}
              className="text-xs h-8 bg-rose-600 hover:bg-rose-500 text-white"
            >
              {isClearingChunks ? "Purging Vectors..." : "Purge All Chunks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
