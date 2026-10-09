import React, { useState, useEffect } from "react"
import {
  ShieldCheck,
  FolderLock,
  Plus,
  Search,
  MessageSquare,
  FileText,
  Key,
  Trash2,
  Edit2,
  Users,
  Clock,
  ExternalLink,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Lock,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Layers,
  Sparkles,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { Vault, VaultDocument, UserSummary, VaultMemberGrant } from "../../types"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu"
import { RequestAccessModal } from "../security/RequestAccessModal"
import { ShareAccessModal } from "../common/ShareAccessModal"
import { Strata } from "../ui/strata"
import { Seal } from "../ui/seal"
import { cn } from "../../lib/utils"
import { api } from "../../lib/api"
import { toast } from "sonner"

export const VaultsView: React.FC = () => {
  const { vaults, setSelectedVault, startNewChat, refreshVaults, navigate, persona, principal } = useApp()
  const [search, setSearch] = useState("")
  const [clearanceFilter, setClearanceFilter] = useState<number | "ALL">("ALL")
  const [viewMode, setViewMode] = useState<"grid" | "strata">("grid")
  const [expandedVaults, setExpandedVaults] = useState<Record<string, boolean>>({})

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingVault, setEditingVault] = useState<Vault | null>(null)
  const [deletingVault, setDeletingVault] = useState<Vault | null>(null)
  const [sharingVault, setSharingVault] = useState<Vault | null>(null)
  const [requestAccessVaultSlug, setRequestAccessVaultSlug] = useState<string | null>(null)

  // Users list for assignment
  const [systemUsers, setSystemUsers] = useState<UserSummary[]>([])

  // Create form state
  const [newVaultName, setNewVaultName] = useState("")
  const [newVaultSlug, setNewVaultSlug] = useState("")
  const [newVaultDesc, setNewVaultDesc] = useState("")
  const [newVaultCeiling, setNewVaultCeiling] = useState<number>(2)
  const [newVaultAssignedUsers, setNewVaultAssignedUsers] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [editCeiling, setEditCeiling] = useState<number>(2)
  const [isEditing, setIsEditing] = useState(false)

  // Sharing form state
  const [assignUserIds, setAssignUserIds] = useState<string[]>([])
  const [assignRoleNames, setAssignRoleNames] = useState<string[]>([])
  const [assignValidHours, setAssignValidHours] = useState<number>(24)
  const [activeGrants, setActiveGrants] = useState<VaultMemberGrant[]>([])
  const [isLoadingGrants, setIsLoadingGrants] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      const res = await api.getUsers()
      if (res && res.users) {
        setSystemUsers(res.users)
      }
    } catch {
      // Fallback
    }
  }

  const toggleExpand = (vaultId: string) => {
    setExpandedVaults((prev) => ({
      ...prev,
      [vaultId]: !prev[vaultId],
    }))
  }

  // Open Sharing / Assignment Modal
  const handleOpenSharing = (vault: Vault) => {
    setSharingVault(vault)
  }

  // Create Vault
  const handleCreateVault = async () => {
    if (!newVaultName.trim()) {
      toast.error("Folder / Vault name is required.")
      return
    }

    const slug = newVaultSlug.trim()
      ? newVaultSlug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")
      : newVaultName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-")

    setIsCreating(true)
    try {
      await api.createVault({
        slug,
        name: newVaultName.trim(),
        description: newVaultDesc.trim() || undefined,
        classification_ceiling: newVaultCeiling,
        assigned_user_ids: newVaultAssignedUsers.length > 0 ? newVaultAssignedUsers : undefined,
      })

      toast.success(`Vault compartment "${newVaultName}" created successfully.`)
      setIsCreateModalOpen(false)
      setNewVaultName("")
      setNewVaultSlug("")
      setNewVaultDesc("")
      setNewVaultCeiling(2)
      setNewVaultAssignedUsers([])
      await refreshVaults()
    } catch (err: any) {
      toast.error(`Failed to create vault: ${err.message}`)
    } finally {
      setIsCreating(false)
    }
  }

  // Edit Vault
  const handleOpenEdit = (vault: Vault) => {
    setEditingVault(vault)
    setEditName(vault.display_name)
    setEditDesc("")
    setEditCeiling(vault.classification_ceiling)
  }

  const handleUpdateVault = async () => {
    if (!editingVault) return
    if (!editName.trim()) {
      toast.error("Compartment name cannot be empty.")
      return
    }

    setIsEditing(true)
    try {
      await api.updateVault(editingVault.slug, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        classification_ceiling: editCeiling,
      })

      toast.success(`Vault "${editName}" updated successfully.`)
      setEditingVault(null)
      await refreshVaults()
    } catch (err: any) {
      toast.error(`Failed to update vault: ${err.message}`)
    } finally {
      setIsEditing(false)
    }
  }

  // Delete Vault
  const handleDeleteVault = async () => {
    if (!deletingVault) return
    try {
      await api.deleteVault(deletingVault.slug)
      toast.success(`Compartment "${deletingVault.display_name}" deleted and records scrubbed.`)
      setDeletingVault(null)
      await refreshVaults()
    } catch (err: any) {
      toast.error(`Failed to delete compartment: ${err.message}`)
    }
  }

  // Filter vaults
  const filteredVaults = vaults.filter((v) => {
    const matchesSearch =
      v.display_name.toLowerCase().includes(search.toLowerCase()) ||
      v.slug.toLowerCase().includes(search.toLowerCase()) ||
      (v.owner_id && v.owner_id.toLowerCase().includes(search.toLowerCase()))
    const matchesClearance =
      clearanceFilter === "ALL" || v.classification_ceiling === clearanceFilter
    return matchesSearch && matchesClearance
  })

  // Calculate statistics
  const totalVaults = vaults.length
  const maxCeiling = vaults.length > 0 ? Math.max(...vaults.map((v) => v.classification_ceiling)) : 4
  const totalDocuments = vaults.reduce((acc, v) => acc + (v.document_count || v.documents?.length || 0), 0)

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

  const renderVaultCard = (vault: Vault) => {
    const docCount = vault.document_count || vault.documents?.length || 0
    const isExpanded = !!expandedVaults[vault.vault_id]
    const isOwner = principal?.user_id === vault.owner_id || persona.username === vault.owner_id
    const isAdmin =
      persona.roles.includes("admin") ||
      (principal?.roles && principal.roles.includes("admin"))

    const stripeClass =
      vault.classification_ceiling === 4
        ? "border-l-foreground"
        : vault.classification_ceiling === 3
        ? "border-l-foreground/75"
        : vault.classification_ceiling === 2
        ? "border-l-foreground/50"
        : "border-l-foreground/25"

    return (
      <div
        key={vault.vault_id}
        className={cn(
          "rounded-2xl border border-border bg-surface hover:border-border/80 transition-all flex flex-col justify-between shadow-sm overflow-hidden border-l-4",
          stripeClass
        )}
      >
        {/* Card Header: Safe-door Tile */}
        <div className="p-4 border-b border-border/40">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-11 w-11 rounded-xl bg-secondary border border-border flex items-center justify-center text-foreground shrink-0 shadow-sm">
                <FolderLock className="h-5 w-5 text-trust" />
              </div>
              <div className="min-w-0">
                <h3 className="font-medium text-foreground text-sm truncate">
                  {vault.display_name}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {vault.slug}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60">·</span>
                  <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-1 py-0.2 rounded border border-border">
                    ep {vault.vault_epoch || 1}
                  </span>
                </div>
              </div>
            </div>

            {/* Dropdown Options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 text-xs">
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedVault(vault)
                    navigate("sources")
                  }}
                  className="cursor-pointer"
                >
                  <FileText className="h-3.5 w-3.5 mr-2 text-trust" />
                  Browse Files
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleOpenSharing(vault)}
                  className="cursor-pointer"
                >
                  <Key className="h-3.5 w-3.5 mr-2 text-hold" />
                  Assign Grants
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRequestAccessVaultSlug(vault.slug)}
                  className="cursor-pointer"
                >
                  <Clock className="h-3.5 w-3.5 mr-2 text-beam" />
                  Request JIT Access
                </DropdownMenuItem>
                {(isOwner || isAdmin) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleOpenEdit(vault)}
                      className="cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-2" />
                      Edit Compartment
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDeletingVault(vault)}
                      className="cursor-pointer text-deny focus:text-deny"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Delete Compartment
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Tags row */}
          <div className="flex items-center gap-1.5 flex-wrap mt-3">
            <Strata level={vault.classification_ceiling} size="sm" />
            <Badge variant="secondary" className="text-[10px] font-mono">
              Steward: {vault.owner_id || "alice"}
            </Badge>
            <Badge variant="outline" className="text-[10px] font-mono border-border">
              {vault.origin || "local_workstation"}
            </Badge>
          </div>
        </div>

        {/* Card Body & Document Preview with Doc Ghosts */}
        <div className="p-4 space-y-3 text-xs flex-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2 font-medium">
              <div className="flex items-center -space-x-1.5" aria-hidden="true">
                <div className="h-4.5 w-4.5 rounded border border-border bg-surface flex items-center justify-center text-muted-foreground text-[8px]">
                  <FileText className="h-2.5 w-2.5" />
                </div>
                <div className="h-4.5 w-4.5 rounded border border-border bg-surface flex items-center justify-center text-muted-foreground text-[8px]">
                  <FileText className="h-2.5 w-2.5" />
                </div>
                <div className="h-4.5 w-4.5 rounded border border-border bg-surface flex items-center justify-center text-muted-foreground text-[8px]">
                  <FileText className="h-2.5 w-2.5" />
                </div>
              </div>
              <span>Ingested Blobs</span>
            </span>
            <span className="font-mono text-foreground font-semibold">
              {docCount} {docCount === 1 ? "document" : "documents"}
            </span>
          </div>

          {/* Document Preview Snippet */}
          {vault.documents && vault.documents.length > 0 ? (
            <div className="space-y-1.5">
              {vault.documents.slice(0, isExpanded ? 50 : 2).map((doc) => (
                <div
                  key={doc.resource_id}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-subtle/80 border border-border/40 text-[11px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 text-trust shrink-0" />
                    <span className="font-mono text-foreground truncate">{doc.title}</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    L{doc.classification} · {doc.chunks_count} chunks
                  </span>
                </div>
              ))}

              {vault.documents.length > 2 && (
                <button
                  type="button"
                  onClick={() => toggleExpand(vault.vault_id)}
                  className="w-full text-center py-1 text-[11px] text-trust hover:underline font-medium flex items-center justify-center gap-1"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" /> Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" /> +{vault.documents.length - 2} more documents
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="p-2.5 rounded-lg bg-surface-subtle/40 border border-dashed border-border/60 text-center text-[11px] text-muted-foreground">
              No documents uploaded to this compartment yet.
            </div>
          )}
        </div>

        {/* Card Actions Footer */}
        <div className="p-3 bg-surface-subtle/40 border-t border-border/40 flex items-center gap-2">
          <Button
            onClick={() => {
              setSelectedVault(vault)
              startNewChat(vault.slug)
              navigate("chat")
            }}
            size="sm"
            className="flex-1 text-xs h-8 gap-1.5 bg-foreground text-background hover:bg-foreground/90 font-medium"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Start Chat</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedVault(vault)
              navigate("sources")
            }}
            className="text-xs h-8 gap-1"
            title="Manage and upload documents"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Files</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenSharing(vault)}
            className="text-xs h-8 gap-1 border-border hover:bg-secondary"
            title="Manage role and user grants"
          >
            <Key className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Grants</span>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* View Header */}
      <div className="border-b border-border bg-surface px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-secondary border border-border flex items-center justify-center text-foreground shadow-sm">
              <FolderLock className="h-4.5 w-4.5 text-trust" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-light text-foreground tracking-tight">
                  Compartments
                </h1>
                <span className="font-mono text-[11px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded border border-border">
                  §12–25
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cryptographically isolated knowledge compartments, classification boundaries & zero-trust stewardship.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshVaults()}
            className="text-xs h-8 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setRequestAccessVaultSlug(vaults[0]?.slug || "project-alpha")}
            className="text-xs h-8 gap-1.5 border-hold/30 text-hold hover:bg-hold/10"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Request JIT Access</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="text-xs h-8 gap-1.5 bg-foreground text-background hover:bg-foreground/90 font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Compartment</span>
          </Button>
        </div>
      </div>

      {/* Metrics Row - Gatelight Instruments */}
      <div className="px-6 py-3.5 border-b border-border/60 bg-surface-subtle/30 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3.5 rounded-xl border border-border bg-surface flex flex-col gap-1.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            Total Compartments
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-light font-mono text-foreground">{totalVaults}</span>
            <span className="text-[11px] text-permit font-mono">Scoped & Active</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface flex flex-col gap-1.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            Classification Ceiling
          </span>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl font-light font-mono text-foreground">L{maxCeiling}</span>
            <Strata level={maxCeiling} size="sm" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface flex flex-col gap-1.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            Documents Indexed
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-light font-mono text-foreground">{totalDocuments}</span>
            <span className="text-[11px] text-muted-foreground font-mono">Indexed blobs</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface flex flex-col gap-1.5 shadow-sm">
          <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
            Isolation Guarantee
          </span>
          <div className="flex items-center gap-2">
            <Seal state="verified" size={18} />
            <span className="text-sm font-semibold text-permit font-mono">0 Cross-Bleed</span>
            <span className="text-[10px] text-muted-foreground">Air-Gapped</span>
          </div>
        </div>
      </div>

      {/* Search, Filters, and Layout Mode Bar */}
      <div className="px-6 py-3 border-b border-border bg-surface/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search compartments or steward..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs bg-surface-subtle"
          />
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-muted-foreground mr-1">Ceiling:</span>
            {(["ALL", 1, 2, 3, 4] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => setClearanceFilter(filter)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors flex items-center gap-1.5",
                  clearanceFilter === filter
                    ? "bg-foreground text-background font-semibold"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {filter === "ALL" ? (
                  <span>All</span>
                ) : (
                  <>
                    <span>L{filter}</span>
                    <Strata level={filter} size="sm" />
                  </>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-lg border border-border p-0.5 bg-surface text-xs">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-colors",
                viewMode === "grid"
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("strata")}
              className={cn(
                "px-2.5 py-1 rounded-md transition-colors",
                viewMode === "strata"
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Strata Map
            </button>
          </div>
        </div>
      </div>

      {/* Main Compartments Container */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredVaults.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center max-w-sm mx-auto">
            <FolderLock className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold text-foreground">No Compartments Found</h3>
            <p className="text-xs text-muted-foreground mt-1">
              No security compartments match your active search or clearance filter.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("")
                setClearanceFilter("ALL")
              }}
              className="mt-4 text-xs h-8"
            >
              Reset Filters
            </Button>
          </div>
        ) : viewMode === "strata" ? (
          /* Strata Map View */
          <div className="space-y-6">
            {[4, 3, 2, 1].map((level) => {
              const vaultsAtLevel = filteredVaults.filter(
                (v) => v.classification_ceiling === level
              )
              if (vaultsAtLevel.length === 0 && clearanceFilter !== "ALL") return null

              return (
                <div key={level} className="space-y-3">
                  <div className="flex items-center gap-2.5 pb-2 border-b border-border/60">
                    <Strata level={level} size="sm" />
                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider font-mono">
                      Ceiling Level {level}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      ({vaultsAtLevel.length} {vaultsAtLevel.length === 1 ? "compartment" : "compartments"})
                    </span>
                  </div>

                  {vaultsAtLevel.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
                      No compartments at clearance level {level}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {vaultsAtLevel.map((vault) => renderVaultCard(vault))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* Standard Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVaults.map((vault) => renderVaultCard(vault))}
          </div>
        )}
      </div>

      {/* CREATE VAULT MODAL */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderLock className="h-5 w-5 text-emerald-400" />
              <span>Create Security Compartment</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Establish a cryptographically isolated storage compartment with strict clearance ceilings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Compartment Name *</label>
              <Input
                placeholder="e.g. Project Orion Secret Archive"
                value={newVaultName}
                onChange={(e) => {
                  setNewVaultName(e.target.value)
                  if (!newVaultSlug) {
                    setNewVaultSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))
                  }
                }}
                className="h-8 text-xs bg-surface-subtle"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Compartment Slug (ID) *</label>
              <Input
                placeholder="project-orion-archive"
                value={newVaultSlug}
                onChange={(e) => setNewVaultSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
                className="h-8 text-xs font-mono bg-surface-subtle"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Classification Ceiling</label>
              <select
                value={newVaultCeiling}
                onChange={(e) => setNewVaultCeiling(Number(e.target.value))}
                className="w-full h-8 px-2.5 rounded-md border border-border bg-surface-subtle text-xs text-foreground outline-none"
              >
                <option value={1}>Level 1 · Public Access</option>
                <option value={2}>Level 2 · Internal Use Only</option>
                <option value={3}>Level 3 · Confidential & Proprietary</option>
                <option value={4}>Level 4 · Top Secret / Restricted</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Initial Assigned Users (Optional)</label>
              <div className="max-h-28 overflow-y-auto border border-border rounded-md p-2 space-y-1 bg-surface-subtle">
                {systemUsers.map((u) => {
                  const checked = newVaultAssignedUsers.includes(u.user_id)
                  return (
                    <label key={u.user_id} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (checked) {
                            setNewVaultAssignedUsers((prev) => prev.filter((id) => id !== u.user_id))
                          } else {
                            setNewVaultAssignedUsers((prev) => [...prev, u.user_id])
                          }
                        }}
                        className="rounded border-border text-emerald-500 focus:ring-0"
                      />
                      <span className="font-mono text-foreground font-medium">{u.username}</span>
                      <span className="text-[10px] text-muted-foreground">({u.roles.join(", ")})</span>
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
              onClick={handleCreateVault}
              disabled={isCreating}
              className="text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isCreating ? "Creating..." : "Create Compartment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT VAULT MODAL */}
      <Dialog open={!!editingVault} onOpenChange={(open) => !open && setEditingVault(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-emerald-400" />
              <span>Edit Compartment Settings</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Display Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-xs bg-surface-subtle"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Classification Ceiling</label>
              <select
                value={editCeiling}
                onChange={(e) => setEditCeiling(Number(e.target.value))}
                className="w-full h-8 px-2.5 rounded-md border border-border bg-surface-subtle text-xs text-foreground outline-none"
              >
                <option value={1}>Level 1 · Public</option>
                <option value={2}>Level 2 · Internal</option>
                <option value={3}>Level 3 · Confidential</option>
                <option value={4}>Level 4 · Top Secret</option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingVault(null)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUpdateVault}
              disabled={isEditing}
              className="text-xs h-8 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isEditing ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UNIFIED SHARING & ACCESS MODAL */}
      <ShareAccessModal
        isOpen={!!sharingVault}
        onClose={() => setSharingVault(null)}
        vault={sharingVault}
        onSuccess={refreshVaults}
      />

      {/* DELETE CONFIRMATION MODAL */}
      <Dialog open={!!deletingVault} onOpenChange={(open) => !open && setDeletingVault(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <span>Delete Compartment?</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to permanently delete compartment &quot;{deletingVault?.display_name}&quot;?
              All associated document manifests, chunks, and grants will be cryptographically purged.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeletingVault(null)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteVault}
              className="text-xs h-8 bg-rose-600 hover:bg-rose-500 text-white"
            >
              Confirm Deletion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JIT REQUEST ACCESS MODAL */}
      {requestAccessVaultSlug && (
        <RequestAccessModal
          isOpen={!!requestAccessVaultSlug}
          onClose={() => setRequestAccessVaultSlug(null)}
          initialVaultSlug={requestAccessVaultSlug}
          onRequestSubmitted={refreshVaults}
        />
      )}
    </div>
  )
}
