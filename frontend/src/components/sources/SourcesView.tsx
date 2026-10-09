import React, { useState, useEffect } from "react"
import {
  FolderLock,
  Search,
  Upload,
  MessageSquare,
  FileText,
  Shield,
  Layers,
  CheckCircle2,
  Lock,
  Calendar,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Plus,
  Edit2,
  Trash2,
  Share2,
  Users,
  Key,
  ShieldCheck,
  AlertTriangle,
  Clock,
  MoreVertical,
  ExternalLink,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as AudioIcon,
  Code as CodeIcon,
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
import { ShareAccessModal } from "../common/ShareAccessModal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu"
import { UploadModal } from "./UploadModal"
import { api } from "../../lib/api"
import { toast } from "sonner"

export const SourcesView: React.FC = () => {
  const { vaults, setSelectedVault, startNewChat, refreshVaults } = useApp()
  const [search, setSearch] = useState("")
  const [selectedUploadVault, setSelectedUploadVault] = useState<string | null>(null)
  const [expandedVaults, setExpandedVaults] = useState<Record<string, boolean>>({})

  // CRUD Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingVault, setEditingVault] = useState<Vault | null>(null)
  const [deletingVault, setDeletingVault] = useState<Vault | null>(null)
  const [sharingVault, setSharingVault] = useState<Vault | null>(null)
  const [sharingDoc, setSharingDoc] = useState<VaultDocument | null>(null)
  const [deletingDoc, setDeletingDoc] = useState<{ vaultSlug: string; doc: VaultDocument } | null>(null)

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

  // Share / Assign form state
  const [vaultMembers, setVaultMembers] = useState<VaultMemberGrant[]>([])
  const [selectedAssigneeType, setSelectedAssigneeType] = useState<"user" | "role">("user")
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("")
  const [selectedRole, setSelectedRole] = useState("analyst")
  const [assignDurationHours, setAssignDurationHours] = useState(72)
  const [assignActions, setAssignActions] = useState<string[]>([
    "action:query_rag",
    "action:retrieve_evidence",
  ])
  const [assignDelegable, setAssignDelegable] = useState(false)
  const [isAssigning, setIsAssigning] = useState(false)
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Load system users
  useEffect(() => {
    api
      .getUsers()
      .then((res) => {
        setSystemUsers(res.users || [])
        if (res.users?.length > 0 && !selectedAssigneeId) {
          setSelectedAssigneeId(res.users[0].user_id)
        }
      })
      .catch((err) => console.warn("Failed to load users list", err))
  }, [])

  const toggleExpand = (vaultId: string) => {
    setExpandedVaults((prev) => {
      const current = prev[vaultId] ?? true
      return { ...prev, [vaultId]: !current }
    })
  }

  const filteredVaults = vaults.filter(
    (v) =>
      v.display_name.toLowerCase().includes(search.toLowerCase()) ||
      v.slug.toLowerCase().includes(search.toLowerCase())
  )

  const handleAskVault = (vault: Vault, doc?: VaultDocument) => {
    setSelectedVault(vault)
    if (doc) {
      startNewChat(vault.slug, { id: doc.resource_id, name: doc.title })
    } else {
      startNewChat(vault.slug, null)
    }
  }

  // --- Create Folder Handler ---
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newVaultName.trim()) return

    setIsCreating(true)
    try {
      const slug =
        newVaultSlug.trim() ||
        newVaultName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")

      await api.createVault({
        name: newVaultName.trim(),
        slug,
        description: newVaultDesc.trim(),
        classification_ceiling: newVaultCeiling,
        assigned_user_ids: newVaultAssignedUsers,
      })

      toast.success(`Knowledge folder "${newVaultName}" created!`, {
        description: `Classification ceiling Level ${newVaultCeiling} applied.`,
      })

      setIsCreateModalOpen(false)
      setNewVaultName("")
      setNewVaultSlug("")
      setNewVaultDesc("")
      setNewVaultAssignedUsers([])
      await refreshVaults()
    } catch (err: any) {
      toast.error(`Failed to create folder: ${err.message}`)
    } finally {
      setIsCreating(false)
    }
  }

  // --- Edit Folder Handler ---
  const handleOpenEdit = (vault: Vault) => {
    setEditingVault(vault)
    setEditName(vault.display_name)
    setEditDesc("")
    setEditCeiling(vault.classification_ceiling)
  }

  const handleUpdateFolder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingVault || !editName.trim()) return

    setIsEditing(true)
    try {
      await api.updateVault(editingVault.slug, {
        name: editName.trim(),
        description: editDesc.trim(),
        classification_ceiling: editCeiling,
      })

      toast.success(`Folder updated successfully!`)
      setEditingVault(null)
      await refreshVaults()
    } catch (err: any) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setIsEditing(false)
    }
  }

  // --- Delete Folder Handler ---
  const handleDeleteFolder = async () => {
    if (!deletingVault) return

    try {
      await api.deleteVault(deletingVault.slug)
      toast.success(`Folder "${deletingVault.display_name}" and its documents shredded.`)
      setDeletingVault(null)
      await refreshVaults()
    } catch (err: any) {
      toast.error(`Failed to delete folder: ${err.message}`)
    }
  }

  // --- Open Share / Assign Modal ---
  const handleOpenShare = (vault: Vault, doc?: VaultDocument | null) => {
    setSharingVault(vault)
    setSharingDoc(doc || null)
  }

  // --- Delete Single Document ---
  const handleDeleteDoc = async () => {
    if (!deletingDoc) return

    try {
      await api.deleteDocument(deletingDoc.doc.resource_id)
      toast.success(`Document "${deletingDoc.doc.title}" shredded.`)
      setDeletingDoc(null)
      await refreshVaults()
    } catch (err: any) {
      toast.error(`Failed to delete document: ${err.message}`)
    }
  }

  const toggleAssignAction = (action: string) => {
    setAssignActions((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-6xl mx-auto w-full">
      {/* Header with Title and Create Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <FolderLock className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground tracking-tight">
                Knowledge Folders & Sources
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage folder structure, upload documents, assign access, and query with verified zero-trust proofs.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            className="gap-1.5 text-xs h-8.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Create Folder</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedUploadVault(vaults[0]?.slug || "project-alpha")}
            className="gap-1.5 text-xs h-8.5 border-border hover:bg-secondary font-medium"
          >
            <Upload className="h-3.5 w-3.5 text-emerald-400" />
            <span>Upload Document</span>
          </Button>
        </div>
      </div>

      {/* Filter / Search Bar & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search folders, documents, or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs h-8.5 bg-surface-raised border-border"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <span className="px-2.5 py-1 rounded-md bg-surface-subtle border border-border">
            {vaults.length} {vaults.length === 1 ? "Folder" : "Folders"}
          </span>
          <span className="px-2.5 py-1 rounded-md bg-surface-subtle border border-border">
            {vaults.reduce((acc, v) => acc + (v.documents?.length || v.document_count || 0), 0)}{" "}
            Total Docs
          </span>
        </div>
      </div>

      {/* Folders List */}
      <div className="space-y-4">
        {filteredVaults.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-surface-raised/40 space-y-3">
            <FolderLock className="h-10 w-10 text-muted-foreground/50 mx-auto" />
            <h3 className="text-sm font-semibold text-foreground">No folders found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Create a new knowledge folder to organize your files and assign access to users.
            </p>
            <Button
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Your First Folder</span>
            </Button>
          </div>
        ) : (
          filteredVaults.map((vault) => {
            const docCount = vault.documents?.length ?? vault.document_count ?? 0
            const chunkCount = vault.chunk_count ?? 0
            const isExpanded = expandedVaults[vault.vault_id] ?? true

            return (
              <div
                key={vault.vault_id}
                className="group rounded-2xl border border-border/80 bg-surface-raised hover:border-emerald-500/40 transition-all duration-200 shadow-sm overflow-hidden"
              >
                {/* Vault Header Bar */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-surface-raised to-surface-raised/70">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleExpand(vault.vault_id)}
                      className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center shrink-0 hover:bg-emerald-500/20 transition-all text-emerald-400"
                    >
                      <FolderLock className="h-5 w-5" />
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-foreground tracking-tight truncate">
                          {vault.display_name}
                        </h3>
                        <Badge variant="clearance" className="text-[10px] py-0 px-1.5 font-mono">
                          Ceiling L{vault.classification_ceiling}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-0 px-1.5 font-mono text-muted-foreground"
                        >
                          {vault.slug}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {docCount} {docCount === 1 ? "File" : "Files"}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {chunkCount} Chunks
                        </span>
                        <span>•</span>
                        <span className="text-[10px] font-mono opacity-80">
                          Origin: {vault.origin || "local"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Vault Actions Toolbar */}
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedUploadVault(vault.slug)}
                      className="text-xs h-7.5 gap-1.5 px-2.5 border-border hover:bg-secondary"
                    >
                      <Upload className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Upload</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAskVault(vault)}
                      className="text-xs h-7.5 gap-1.5 px-3 bg-surface-subtle hover:bg-secondary text-foreground font-medium"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Ask Folder</span>
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenShare(vault)}
                      className="text-xs h-7.5 gap-1.5 px-2.5 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <Share2 className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Assign / Share</span>
                    </Button>

                    {/* Folder More Actions */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="h-7.5 w-7.5 rounded-lg border border-border flex items-center justify-center hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44 text-xs">
                        <DropdownMenuItem
                          onClick={() => handleOpenEdit(vault)}
                          className="cursor-pointer gap-2"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          <span>Edit / Rename</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleOpenShare(vault)}
                          className="cursor-pointer gap-2"
                        >
                          <Users className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Manage Permissions</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeletingVault(vault)}
                          className="cursor-pointer gap-2 text-rose-400 focus:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete Folder</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <button
                      type="button"
                      onClick={() => toggleExpand(vault.vault_id)}
                      className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors ml-1"
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Content: Files in Folder */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 pt-1 border-t border-border/50 bg-surface/30 space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Contained Documents in {vault.display_name}</span>
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 flex items-center gap-1">
                        <Lock className="h-3 w-3 text-emerald-400" />
                        AES-256-GCM Encrypted & FastEmbed Indexed
                      </span>
                    </div>

                    {vault.documents && vault.documents.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2">
                        {vault.documents.map((doc) => {
                          const ext = doc.title.split(".").pop()?.toLowerCase() || ""
                          const isImage = ["png", "jpg", "jpeg", "webp", "bmp", "tiff"].includes(ext) || doc.resource_type === "IMAGE_OCR"
                          const isVideo = ["mp4", "mkv", "mov", "avi", "webm"].includes(ext) || doc.resource_type === "VIDEO"
                          const isAudio = ["mp3", "wav", "m4a", "ogg", "flac"].includes(ext) || doc.resource_type === "AUDIO"
                          const isCode = ["py", "js", "ts", "tsx", "jsx", "json", "csv", "sql", "html", "css"].includes(ext) || doc.resource_type === "CODE"

                          return (
                            <div
                              key={doc.resource_id}
                              className="group/item flex items-center justify-between p-3 rounded-xl border border-border/70 bg-surface-subtle/40 hover:bg-surface-subtle hover:border-emerald-500/30 transition-all gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${
                                  isImage ? "bg-indigo-500/10 border-indigo-500/25 text-indigo-400" :
                                  isVideo ? "bg-amber-500/10 border-amber-500/25 text-amber-400" :
                                  isAudio ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" :
                                  isCode ? "bg-sky-500/10 border-sky-500/25 text-sky-400" :
                                  "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                }`}>
                                  {isImage ? <ImageIcon className="h-4 w-4" /> :
                                   isVideo ? <VideoIcon className="h-4 w-4" /> :
                                   isAudio ? <AudioIcon className="h-4 w-4" /> :
                                   isCode ? <CodeIcon className="h-4 w-4" /> :
                                   <FileText className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-foreground truncate">
                                      {doc.title}
                                    </span>
                                    <Badge
                                      variant="clearance"
                                      className="text-[9px] py-0 px-1 font-mono"
                                    >
                                      L{doc.classification}
                                    </Badge>
                                    <span className={`text-[9px] font-mono px-1 py-0.2 rounded border uppercase font-medium ${
                                      isImage ? "border-indigo-500/30 text-indigo-300 bg-indigo-500/5" :
                                      isVideo ? "border-amber-500/30 text-amber-300 bg-amber-500/5" :
                                      isAudio ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/5" :
                                      isCode ? "border-sky-500/30 text-sky-300 bg-sky-500/5" :
                                      "border-border/60 text-muted-foreground bg-surface-raised"
                                    }`}>
                                      {isImage ? "IMAGE OCR" : isVideo ? "VIDEO" : isAudio ? "AUDIO" : isCode ? "CODE" : "DOC"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                                    <span>{doc.chunks_count} Chunks</span>
                                    <span>•</span>
                                    <span className="font-mono text-[9px] text-muted-foreground/80">
                                      ID: {doc.resource_id}
                                    </span>
                                    <span>•</span>
                                    <span>
                                      {doc.created_at
                                        ? new Date(doc.created_at).toLocaleDateString()
                                        : "Indexed"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleAskVault(vault, doc)}
                                  className="text-xs h-7 gap-1 px-2.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 font-medium"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" />
                                  <span>Ask This File</span>
                                </Button>

                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenShare(vault, doc)}
                                  className="text-xs h-7 gap-1 px-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 font-medium"
                                  title="Share access to this specific file"
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                  <span>Share File</span>
                                </Button>

                                <button
                                  onClick={() =>
                                    setDeletingDoc({ vaultSlug: vault.slug, doc })
                                  }
                                  className="p-1.5 rounded-md hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-colors"
                                  title="Delete document"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="p-5 rounded-xl border border-dashed border-border/80 bg-surface-subtle/20 text-center space-y-2">
                        <p className="text-xs text-muted-foreground">
                          No documents or media ingested into this folder yet.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedUploadVault(vault.slug)}
                          className="text-xs h-7.5 gap-1.5 border-border"
                        >
                          <Upload className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Upload Files & Media</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* CREATE FOLDER MODAL */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md bg-surface-raised border-border text-foreground shadow-2xl p-6">
          <DialogHeader className="space-y-1.5 pb-2 border-b border-border/40">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <FolderLock className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Create Knowledge Folder
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Establish a secure folder carrying mandatory clearance ceilings and ACLs.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleCreateFolder} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Folder Name</label>
              <Input
                placeholder="e.g. Research Papers, GATE Materials"
                value={newVaultName}
                onChange={(e) => {
                  setNewVaultName(e.target.value)
                  if (!newVaultSlug) {
                    setNewVaultSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-|-$/g, "")
                    )
                  }
                }}
                className="text-xs h-8"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Folder Slug / ID</label>
                <Input
                  placeholder="e.g. research-papers"
                  value={newVaultSlug}
                  onChange={(e) => setNewVaultSlug(e.target.value)}
                  className="text-xs h-8 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Classification Ceiling
                </label>
                <select
                  value={newVaultCeiling}
                  onChange={(e) => setNewVaultCeiling(Number(e.target.value))}
                  className="w-full text-xs h-8 rounded-md bg-surface-subtle border border-border px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value={1}>L1 - Public / Unclassified</option>
                  <option value={2}>L2 - Internal Documents</option>
                  <option value={3}>L3 - Confidential Project Data</option>
                  <option value={4}>L4 - Secret High-Integrity</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Description (Optional)</label>
              <Input
                placeholder="Purpose and contents of this folder"
                value={newVaultDesc}
                onChange={(e) => setNewVaultDesc(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            {/* Initial User Assignments */}
            {systemUsers.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-border/40">
                <label className="text-xs font-medium text-foreground flex items-center justify-between">
                  <span>Grant Initial Access to Users:</span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Owner is granted automatically
                  </span>
                </label>
                <div className="max-h-28 overflow-y-auto space-y-1 p-2 rounded-lg bg-surface-subtle/50 border border-border/60">
                  {systemUsers.map((u) => {
                    const isChecked = newVaultAssignedUsers.includes(u.user_id)
                    return (
                      <label
                        key={u.user_id}
                        className="flex items-center justify-between text-xs cursor-pointer hover:bg-surface-subtle p-1 rounded"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewVaultAssignedUsers([...newVaultAssignedUsers, u.user_id])
                              } else {
                                setNewVaultAssignedUsers(
                                  newVaultAssignedUsers.filter((id) => id !== u.user_id)
                                )
                              }
                            }}
                            className="rounded border-border text-emerald-500 focus:ring-emerald-500"
                          />
                          <span className="font-medium text-foreground">{u.username}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({Array.from(new Set(u.roles)).join(", ")})
                          </span>
                        </div>
                        <Badge variant="clearance" className="text-[9px] py-0 px-1">
                          L{u.clearance_level}
                        </Badge>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreating || !newVaultName.trim()}
                size="sm"
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                {isCreating ? "Creating Folder..." : "Create Folder"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT FOLDER MODAL */}
      <Dialog open={!!editingVault} onOpenChange={(open) => !open && setEditingVault(null)}>
        <DialogContent className="sm:max-w-md bg-surface-raised border-border text-foreground shadow-2xl p-6">
          <DialogHeader className="space-y-1.5 pb-2 border-b border-border/40">
            <DialogTitle className="text-base font-semibold">
              Edit Knowledge Folder
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Modify folder display properties and security ceiling.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateFolder} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Folder Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-xs h-8"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Classification Ceiling
              </label>
              <select
                value={editCeiling}
                onChange={(e) => setEditCeiling(Number(e.target.value))}
                className="w-full text-xs h-8 rounded-md bg-surface-subtle border border-border px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value={1}>L1 - Public / Unclassified</option>
                <option value={2}>L2 - Internal Documents</option>
                <option value={3}>L3 - Confidential Project Data</option>
                <option value={4}>L4 - Secret High-Integrity</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Description</label>
              <Input
                placeholder="Update description"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="text-xs h-8"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditingVault(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isEditing || !editName.trim()}
                size="sm"
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                {isEditing ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE FOLDER MODAL */}
      <Dialog open={!!deletingVault} onOpenChange={(open) => !open && setDeletingVault(null)}>
        <DialogContent className="sm:max-w-md bg-surface-raised border-border text-foreground shadow-2xl p-6">
          <DialogHeader className="space-y-2 pb-2">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-base font-semibold">
                Delete Knowledge Folder?
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {deletingVault?.display_name}
              </span>
              ? This action will permanently shred all documents, chunks, access grants, and Qdrant vector points associated with this folder.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingVault(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteFolder}
              className="text-xs bg-rose-600 hover:bg-rose-500"
            >
              Shred & Delete Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* UNIFIED SHARE & ASSIGN MODAL */}
      <ShareAccessModal
        isOpen={!!sharingVault}
        onClose={() => {
          setSharingVault(null)
          setSharingDoc(null)
        }}
        vault={sharingVault}
        initialDoc={sharingDoc}
        onSuccess={refreshVaults}
      />

      {/* DELETE DOCUMENT MODAL */}
      <Dialog open={!!deletingDoc} onOpenChange={(open) => !open && setDeletingDoc(null)}>
        <DialogContent className="sm:max-w-md bg-surface-raised border-border text-foreground shadow-2xl p-6">
          <DialogHeader className="space-y-2 pb-2">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-base font-semibold">
                Delete Document?
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {deletingDoc?.doc.title}
              </span>
              ? This will remove all chunks and vector points from the system.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingDoc(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteDoc}
              className="text-xs bg-rose-600 hover:bg-rose-500"
            >
              Shred Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      {selectedUploadVault && (
        <UploadModal
          isOpen={!!selectedUploadVault}
          onClose={() => setSelectedUploadVault(null)}
          vaultSlug={selectedUploadVault}
          onUploadSuccess={refreshVaults}
        />
      )}
    </div>
  )
}
