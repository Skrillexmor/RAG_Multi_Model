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
  ArrowRight,
  Sliders,
  Eye,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { storage } from "../../lib/storage"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { Strata } from "../ui/strata"
import { Seal } from "../ui/seal"
import { Glyph } from "../../glyphs"
import { cn } from "../../lib/utils"
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
  const { persona, principal, refreshVaults, navigate } = useApp()
  const [theme, setThemeState] = useState<"dark" | "light" | "system">(storage.getTheme())
  const [density, setDensityState] = useState<"comfortable" | "compact">(storage.getDensity())
  const [motion, setMotionState] = useState<"system" | "on" | "off">(storage.getMotion())
  const [activeSection, setActiveSection] = useState<string>("users")

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

  const handleDensityChange = (newDensity: "comfortable" | "compact") => {
    setDensityState(newDensity)
    storage.setDensity(newDensity)
    toast.success(`Density set to ${newDensity}`)
  }

  const handleMotionChange = (newMotion: "system" | "on" | "off") => {
    setMotionState(newMotion)
    storage.setMotion(newMotion)
    toast.success(`Motion preference set to ${newMotion}`)
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

  const scrollToSection = (id: string) => {
    setActiveSection(id)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 max-w-6xl mx-auto w-full">
      {/* Top Header */}
      <div className="mb-6 pb-4 border-b border-border">
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
          <Glyph name="gear" size={13} className="text-trust" />
          <span>System Administration (§18..§45)</span>
        </div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight">
          Settings & Identity
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Manage local account identities, clearance tokens, appearance, and air-gapped security boundaries.
        </p>
      </div>

      {/* Two-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sticky Left Navigation Rail on Wide Screens */}
        <aside className="lg:col-span-3 sticky top-4 space-y-1 text-xs">
          <div className="text-[11px] font-mono text-muted-foreground uppercase px-2 py-1 font-semibold">
            Section Index
          </div>
          <button
            onClick={() => scrollToSection("users")}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between",
              activeSection === "users"
                ? "bg-secondary text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-subtle"
            )}
          >
            <span>{isAdmin ? "Account Identities" : "Personal Profile"}</span>
            {activeSection === "users" && <span className="h-1.5 w-1.5 rounded-full bg-beam" />}
          </button>
          <button
            onClick={() => scrollToSection("appearance")}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between",
              activeSection === "appearance"
                ? "bg-secondary text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-subtle"
            )}
          >
            <span>Appearance & Themes</span>
            {activeSection === "appearance" && <span className="h-1.5 w-1.5 rounded-full bg-beam" />}
          </button>
          <button
            onClick={() => scrollToSection("session")}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between",
              activeSection === "session"
                ? "bg-secondary text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-subtle"
            )}
          >
            <span>Active Session</span>
            {activeSection === "session" && <span className="h-1.5 w-1.5 rounded-full bg-beam" />}
          </button>
          <button
            onClick={() => scrollToSection("diagnostics")}
            className={cn(
              "w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between",
              activeSection === "diagnostics"
                ? "bg-secondary text-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-subtle"
            )}
          >
            <span>Offline Diagnostics</span>
            {activeSection === "diagnostics" && <span className="h-1.5 w-1.5 rounded-full bg-beam" />}
          </button>
          {isAdmin && (
            <button
              onClick={() => scrollToSection("maintenance")}
              className={cn(
                "w-full text-left px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between",
                activeSection === "maintenance"
                  ? "bg-secondary text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-subtle"
              )}
            >
              <span>Vector Maintenance</span>
              {activeSection === "maintenance" && <span className="h-1.5 w-1.5 rounded-full bg-beam" />}
            </button>
          )}
        </aside>

        {/* Right Content Column */}
        <div className="lg:col-span-9 space-y-6">
          {/* SECTION: ACCOUNTS / IDENTITY */}
          <div id="users">
            {isAdmin ? (
              <div className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                      <Users className="h-4 w-4 text-trust" />
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
                      className="h-8 text-xs gap-1.5 border-border"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", isLoadingUsers && "animate-spin")} />
                      <span>Refresh</span>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setIsCreateModalOpen(true)}
                      className="h-8 text-xs gap-1.5 bg-foreground text-background hover:bg-foreground/90 font-medium"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Add Account</span>
                    </Button>
                  </div>
                </div>

                {/* Users Table */}
                <div className="border border-border rounded-lg overflow-hidden bg-surface">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border bg-surface-subtle text-[11px] text-muted-foreground font-semibold">
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
                            <tr key={u.user_id} className="hover:bg-surface-subtle/50 transition-colors">
                              <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                                <div className="flex items-center gap-1.5">
                                  <span>{u.username}</span>
                                  {isCurrent && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-trust/10 text-trust border border-trust/30 font-mono">
                                      Current
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <Strata level={u.clearance_level} size="sm" />
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {u.roles.map((r) => (
                                    <span
                                      key={r}
                                      className="px-1.5 py-0.5 rounded bg-surface-raised border border-border text-[10px] font-mono text-muted-foreground"
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
                                  <span className="flex items-center gap-1 text-trust text-[11px]">
                                    <CheckCircle2 className="h-3 w-3" /> Active
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-deny text-[11px]">
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
                                      className="p-1 rounded hover:bg-deny/15 text-muted-foreground hover:text-deny transition-colors"
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
            ) : (
              <div className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-surface border border-border flex items-center justify-center text-trust">
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
                      className="h-8 text-xs gap-1.5 border-border"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      <span>Update Password</span>
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3.5 rounded-lg border border-border bg-surface space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">User Principal</span>
                    <div className="font-mono text-sm font-semibold text-foreground">{persona.name} ({persona.username})</div>
                    <div className="text-[11px] text-muted-foreground">Assigned Roles: {persona.roles.join(", ")}</div>
                  </div>

                  <div className="p-3.5 rounded-lg border border-border bg-surface space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Clearance Ceiling</span>
                    <div><Strata level={persona.clearanceLevel} size="sm" /></div>
                    <div className="text-[11px] text-muted-foreground">Department: {persona.roleTitle || "General"}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION: APPEARANCE & THEMES */}
          <div id="appearance" className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-xs">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-trust" />
              Appearance & Token System
            </h3>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Select visual theme, UI density, and animation behavior.
            </p>

            {/* Three Live Preview SVG Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Dark Theme Tile */}
              <button
                type="button"
                onClick={() => handleThemeChange("dark")}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all relative overflow-hidden group",
                  theme === "dark"
                    ? "border-foreground ring-1 ring-foreground bg-surface shadow-xs"
                    : "border-border bg-surface/40 hover:border-border/80"
                )}
              >
                <div className="w-full h-20 rounded-lg bg-[#0e1117] border border-white/10 p-2 flex flex-col justify-between mb-2.5">
                  <div className="flex items-center justify-between">
                    <div className="h-2 w-10 rounded bg-white/20" />
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <div className="h-1.5 w-16 rounded bg-white/30" />
                    <div className="h-1.5 w-12 rounded bg-white/15" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Dark Theme</span>
                  {theme === "dark" && <Seal state="verified" size={14} />}
                </div>
                <span className="text-[10px] text-muted-foreground">Zinc & OKLCH Deep Ink</span>
              </button>

              {/* Light Theme Tile */}
              <button
                type="button"
                onClick={() => handleThemeChange("light")}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all relative overflow-hidden group",
                  theme === "light"
                    ? "border-foreground ring-1 ring-foreground bg-surface shadow-xs"
                    : "border-border bg-surface/40 hover:border-border/80"
                )}
              >
                <div className="w-full h-20 rounded-lg bg-[#f8fafc] border border-black/10 p-2 flex flex-col justify-between mb-2.5">
                  <div className="flex items-center justify-between">
                    <div className="h-2 w-10 rounded bg-black/20" />
                    <div className="h-2 w-2 rounded-full bg-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <div className="h-1.5 w-16 rounded bg-black/30" />
                    <div className="h-1.5 w-12 rounded bg-black/15" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">Light Theme</span>
                  {theme === "light" && <Seal state="verified" size={14} />}
                </div>
                <span className="text-[10px] text-muted-foreground">Alabaster & Crisp Ink</span>
              </button>

              {/* System Theme Tile */}
              <button
                type="button"
                onClick={() => handleThemeChange("system")}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all relative overflow-hidden group",
                  theme === "system"
                    ? "border-foreground ring-1 ring-foreground bg-surface shadow-xs"
                    : "border-border bg-surface/40 hover:border-border/80"
                )}
              >
                <div className="w-full h-20 rounded-lg border border-border p-2 flex flex-col justify-between mb-2.5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0e1117] via-[#0e1117] to-[#f8fafc] opacity-90" />
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="h-2 w-10 rounded bg-white/30" />
                    <Laptop className="h-3 w-3 text-white/70" />
                  </div>
                  <div className="relative z-10 space-y-1">
                    <div className="h-1.5 w-14 rounded bg-white/30" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-foreground">System Auto</span>
                  {theme === "system" && <Seal state="verified" size={14} />}
                </div>
                <span className="text-[10px] text-muted-foreground">Follow OS settings</span>
              </button>
            </div>

            {/* Density & Motion Preferences */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-border/50">
              {/* Density Toggle */}
              <div>
                <label className="text-[11px] font-semibold text-foreground block mb-1.5">
                  Information Density
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-surface border border-border">
                  <button
                    type="button"
                    onClick={() => handleDensityChange("comfortable")}
                    className={cn(
                      "py-1.5 text-center rounded-md font-medium transition-colors text-[11px]",
                      density === "comfortable"
                        ? "bg-secondary text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Comfortable
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDensityChange("compact")}
                    className={cn(
                      "py-1.5 text-center rounded-md font-medium transition-colors text-[11px]",
                      density === "compact"
                        ? "bg-secondary text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Compact (SOC)
                  </button>
                </div>
              </div>

              {/* Reduce Motion Toggle */}
              <div>
                <label className="text-[11px] font-semibold text-foreground block mb-1.5">
                  Motion & Animations
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-surface border border-border">
                  {(["system", "on", "off"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleMotionChange(m)}
                      className={cn(
                        "py-1.5 text-center rounded-md font-medium capitalize transition-colors text-[11px]",
                        motion === m
                          ? "bg-secondary text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SECTION: ACTIVE SESSION */}
          <div id="session" className="p-5 rounded-xl border border-border bg-surface-raised space-y-3.5 text-xs shadow-xs">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-trust" />
              Active Session Identity
            </h3>

            <div className="p-3.5 rounded-lg border border-border bg-surface space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-sm">{persona.name}</span>
                <Strata level={persona.clearanceLevel} size="sm" />
              </div>
              <div className="text-muted-foreground leading-relaxed">{persona.description}</div>
              <div className="text-[11px] font-mono text-muted-foreground pt-2 border-t border-border/50">
                Role Tokens: {persona.roles.join(", ")}
              </div>
            </div>
          </div>

          {/* SECTION: OFFLINE DIAGNOSTICS */}
          <div id="diagnostics" className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                  <Lock className="h-4 w-4 text-trust" />
                  Offline Security Diagnostics (§128)
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Live verification of zero-trust invariants and cryptographic protections.
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate("tests")}
                className="h-8 text-xs gap-1.5 border-border"
              >
                <span>Verification Suite</span>
                <ArrowRight className="h-3 w-3 text-trust" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="p-3.5 rounded-lg border border-border bg-surface flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Seal state="verified" size={16} />
                  <div>
                    <div className="font-medium text-foreground">External Egress</div>
                    <div className="text-[10px] text-muted-foreground font-mono">Air-gapped local boundary</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-trust/10 text-trust border border-trust/30">
                  BLOCKED (ZERO CLOUD)
                </span>
              </div>

              <div className="p-3.5 rounded-lg border border-border bg-surface flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Seal state="verified" size={16} />
                  <div>
                    <div className="font-medium text-foreground">Vector Database</div>
                    <div className="text-[10px] text-muted-foreground font-mono">Local disk embeddings</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-semibold text-foreground">
                  Qdrant Local
                </span>
              </div>

              <div className="p-3.5 rounded-lg border border-border bg-surface flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Seal state="verified" size={16} />
                  <div>
                    <div className="font-medium text-foreground">Canonical Storage</div>
                    <div className="text-[10px] text-muted-foreground font-mono">Hardware KEK derivation</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-semibold text-foreground">
                  AES-256-GCM
                </span>
              </div>

              <div className="p-3.5 rounded-lg border border-border bg-surface flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Seal state="verified" size={16} />
                  <div>
                    <div className="font-medium text-foreground">Credential Algorithm</div>
                    <div className="text-[10px] text-muted-foreground font-mono">Salted memory-hard hash</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-semibold text-foreground">
                  Argon2id
                </span>
              </div>
            </div>
          </div>

          {/* SECTION: VECTOR STORAGE & MAINTENANCE (ADMIN ONLY) */}
          {isAdmin && (
            <div id="maintenance" className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-xs">
              <div>
                <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                  <Database className="h-4 w-4 text-trust" />
                  System Maintenance & Vector Storage
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Administrative maintenance on Qdrant vector embeddings and SQLite chunk records.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-border bg-surface flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground text-xs">Purge Chunks & Reset Vector Index</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-hold/10 text-hold border border-hold/30">
                      Maintenance
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground max-w-xl leading-relaxed">
                    Deletes all chunk embeddings from the local Qdrant collection and clears the chunks table.
                    Source manifests remain safe. You can re-index anytime by re-uploading documents.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsClearChunksOpen(true)}
                  className="h-8 text-xs shrink-0 border-deny/30 text-deny hover:bg-deny/10 hover:text-deny gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Purge Chunks</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CREATE USER MODAL */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md bg-surface-raised border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-trust" />
              <span>Create User Account</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
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
                className="h-8 text-xs bg-surface font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Initial Password *</label>
              <Input
                type="password"
                placeholder="At least 4 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-8 text-xs bg-surface"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Department</label>
              <Input
                placeholder="e.g. R&D / Cryptography"
                value={newDepartment}
                onChange={(e) => setNewDepartment(e.target.value)}
                className="h-8 text-xs bg-surface"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Clearance Level</label>
              <select
                value={newClearance}
                onChange={(e) => setNewClearance(Number(e.target.value))}
                className="w-full h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-foreground outline-none font-medium"
              >
                <option value={1}>Level 1 · Public</option>
                <option value={2}>Level 2 · Internal</option>
                <option value={3}>Level 3 · Confidential</option>
                <option value={4}>Level 4 · Top Secret</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Assigned Roles</label>
              <div className="border border-border rounded-md p-2 space-y-1.5 bg-surface">
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
                        className="rounded border-border text-primary focus:ring-0"
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
              className="text-xs h-8 border-border"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateUser}
              disabled={isSubmittingCreate}
              className="text-xs h-8 bg-foreground text-background hover:bg-foreground/90 font-medium"
            >
              {isSubmittingCreate ? "Creating..." : "Create Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT USER MODAL */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-md bg-surface-raised border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-trust" />
              <span>Edit Account: {editingUser?.username}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Department</label>
              <Input
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                className="h-8 text-xs bg-surface"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Clearance Level</label>
              <select
                value={editClearance}
                onChange={(e) => setEditClearance(Number(e.target.value))}
                className="w-full h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-foreground outline-none font-medium"
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
                className="h-8 text-xs bg-surface"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Assigned Roles</label>
              <div className="border border-border rounded-md p-2 space-y-1.5 bg-surface">
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
                        className="rounded border-border text-primary focus:ring-0"
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
                className="rounded border-border text-primary focus:ring-0 h-4 w-4"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingUser(null)}
              className="text-xs h-8 border-border"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUpdateUser}
              disabled={isSubmittingEdit}
              className="text-xs h-8 bg-foreground text-background hover:bg-foreground/90 font-medium"
            >
              {isSubmittingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DELETE USER MODAL */}
      <Dialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <DialogContent className="max-w-sm bg-surface-raised border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-deny">
              <AlertTriangle className="h-5 w-5" />
              <span>Delete User Account?</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete account &quot;{deletingUser?.username}&quot;?
              Their security grants, tokens, and active session permissions will be permanently revoked.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingUser(null)}
              className="text-xs h-8 border-border"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteUser}
              disabled={isSubmittingDelete}
              className="text-xs h-8 bg-deny text-white hover:bg-deny/90"
            >
              {isSubmittingDelete ? "Deleting..." : "Delete Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CLEAR CHUNKS CONFIRMATION MODAL */}
      <Dialog open={isClearChunksOpen} onOpenChange={setIsClearChunksOpen}>
        <DialogContent className="max-w-md bg-surface-raised border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-deny">
              <AlertTriangle className="h-5 w-5" />
              <span>Purge Vector Database & Chunks?</span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
              This maintenance operation will erase all vectorized embeddings in local Qdrant and clear the SQLite chunks table.
              Original document manifests are preserved, but search queries will not match until documents are re-indexed.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClearChunksOpen(false)}
              className="text-xs h-8 border-border"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearChunks}
              disabled={isClearingChunks}
              className="text-xs h-8 bg-deny text-white hover:bg-deny/90"
            >
              {isClearingChunks ? "Purging Vectors..." : "Purge All Chunks"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
