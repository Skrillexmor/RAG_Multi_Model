import React, { useState } from "react"
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
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { Vault } from "../../types"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { UploadModal } from "./UploadModal"

export const SourcesView: React.FC = () => {
  const { vaults, setSelectedVault, startNewChat, refreshVaults, navigate } = useApp()
  const [search, setSearch] = useState("")
  const [selectedUploadVault, setSelectedUploadVault] = useState<string | null>(null)
  const [expandedVaults, setExpandedVaults] = useState<Record<string, boolean>>({})

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

  const handleAskVault = (vault: Vault, initialPrompt?: string) => {
    setSelectedVault(vault)
    startNewChat(vault.slug)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            Knowledge Workspaces & Data Sources
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Browse compartmentalized knowledge vaults, inspect encrypted documents, and query authorized sources.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setSelectedUploadVault(vaults[0]?.slug || "project-alpha")}
          className="gap-1.5 text-xs h-8"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload PDF Document</span>
        </Button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search workspaces & documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-8"
          />
        </div>
      </div>

      {/* Vault Grid */}
      <div className="space-y-4">
        {filteredVaults.map((vault) => {
          const docCount = vault.documents?.length ?? vault.document_count ?? 0
          const chunkCount = vault.chunk_count ?? 0
          const isExpanded = expandedVaults[vault.vault_id] ?? true // expanded by default

          return (
            <div
              key={vault.vault_id}
              className="p-5 rounded-xl border border-border bg-surface-raised hover:border-border/80 transition-all space-y-4 shadow-sm"
            >
              {/* Vault Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-surface-subtle border border-border flex items-center justify-center shrink-0">
                    <FolderLock className="h-4.5 w-4.5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {vault.display_name}
                      </h3>
                      <Badge variant="clearance" className="text-[10px] py-0">
                        Ceiling: L{vault.classification_ceiling}
                      </Badge>
                    </div>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {vault.slug} · Origin: {vault.origin}
                    </p>
                  </div>
                </div>

                {/* Badges & Actions */}
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] gap-1 py-0.5">
                    <FileText className="h-3 w-3" />
                    <span>{docCount} {docCount === 1 ? "Document" : "Documents"}</span>
                  </Badge>

                  {chunkCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] gap-1 py-0.5">
                      <Layers className="h-3 w-3" />
                      <span>{chunkCount} Chunks</span>
                    </Badge>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedUploadVault(vault.slug)}
                    className="text-xs h-7 gap-1 px-2.5 ml-1"
                  >
                    <Upload className="h-3 w-3" />
                    <span>Upload PDF</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleAskVault(vault)}
                    className="text-xs h-7 gap-1 px-2.5"
                  >
                    <MessageSquare className="h-3 w-3" />
                    <span>Ask Vault</span>
                  </Button>

                  <button
                    type="button"
                    onClick={() => toggleExpand(vault.vault_id)}
                    className="p-1 rounded hover:bg-surface-subtle text-muted-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Ingested Documents List */}
              {isExpanded && (
                <div className="pt-2 border-t border-border/50 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Ingested Documents & Provenance in Vault</span>
                    <span className="text-[10px]">AES-256-GCM Encrypted Canonical Storage</span>
                  </div>

                  {vault.documents && vault.documents.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {vault.documents.map((doc) => (
                        <div
                          key={doc.resource_id}
                          className="flex items-center justify-between p-3 rounded-lg border border-border/70 bg-surface-subtle/50 hover:bg-surface-subtle transition-all gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                              <FileText className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-foreground truncate">
                                  {doc.title}
                                </span>
                                <Badge variant="clearance" className="text-[9px] py-0 px-1">
                                  L{doc.classification}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                                <span>{doc.chunks_count} Chunks</span>
                                <span>•</span>
                                <span className="flex items-center gap-0.5 text-emerald-400/90">
                                  <Lock className="h-2.5 w-2.5" />
                                  Indexed & Encrypted
                                </span>
                                <span>•</span>
                                <span>
                                  {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : "Active"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAskVault(vault)}
                            className="text-[11px] h-7 gap-1 text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <MessageSquare className="h-3 w-3" />
                            <span>Ask This Doc</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg border border-dashed border-border/80 bg-surface-subtle/30 text-center space-y-2">
                      <p className="text-xs text-muted-foreground">
                        No documents ingested into this workspace yet.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedUploadVault(vault.slug)}
                        className="text-xs h-7 gap-1.5"
                      >
                        <Upload className="h-3 w-3 text-emerald-400" />
                        <span>Upload Your First PDF</span>
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

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
