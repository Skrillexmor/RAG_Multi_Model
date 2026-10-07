import React, { useState } from "react"
import {
  FolderLock,
  Search,
  Upload,
  MessageSquare,
  FileText,
  Shield,
  ArrowUpRight,
  Filter,
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

  const filteredVaults = vaults.filter(
    (v) =>
      v.display_name.toLowerCase().includes(search.toLowerCase()) ||
      v.slug.toLowerCase().includes(search.toLowerCase())
  )

  const handleAskVault = (vault: Vault) => {
    setSelectedVault(vault)
    startNewChat(vault.slug)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            Knowledge Workspaces & Sources
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Browse compartmentalized knowledge vaults and inspect authorized data sources.
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setSelectedUploadVault(vaults[0]?.slug || "project-alpha")}
          className="gap-1.5 text-xs h-8"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>Upload Document</span>
        </Button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search workspaces & sources..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-8"
          />
        </div>
      </div>

      {/* Vault Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {filteredVaults.map((vault) => (
          <div
            key={vault.vault_id}
            className="p-4 rounded-xl border border-border bg-surface-raised hover:border-border/80 transition-all flex flex-col justify-between space-y-3"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-surface-subtle border border-border flex items-center justify-center">
                    <FolderLock className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {vault.display_name}
                    </h3>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {vault.slug}
                    </p>
                  </div>
                </div>

                <Badge variant="clearance" className="text-[10px] py-0">
                  Ceiling: L{vault.classification_ceiling}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground mt-3 pt-2 border-t border-border/40">
                <div>
                  Origin:{" "}
                  <span className="font-mono text-foreground capitalize">
                    {vault.origin}
                  </span>
                </div>
                <div>
                  Status:{" "}
                  <span className="text-emerald-400 font-mono capitalize">
                    {vault.status}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedUploadVault(vault.slug)}
                className="text-xs h-7 text-muted-foreground hover:text-foreground"
              >
                <Upload className="h-3 w-3 mr-1.5" />
                Ingest Data
              </Button>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleAskVault(vault)}
                className="text-xs h-7 gap-1"
              >
                <MessageSquare className="h-3 w-3" />
                <span>Ask Vault</span>
              </Button>
            </div>
          </div>
        ))}
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
