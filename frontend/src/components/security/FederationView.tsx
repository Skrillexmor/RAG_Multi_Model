import React, { useState, useEffect } from "react"
import {
  Network,
  Download,
  Upload,
  CheckCircle2,
  Shield,
  Wifi,
  FileCheck,
  Server,
  Loader2,
} from "lucide-react"
import { FederationNode } from "../../types"
import { api } from "../../lib/api"
import { useApp } from "../../context/AppContext"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { toast } from "sonner"

export const FederationView: React.FC = () => {
  const { vaults } = useApp()
  const [nodes, setNodes] = useState<FederationNode[]>([])
  const [selectedVault, setSelectedVault] = useState<string>("v_alpha")
  const [recipientNode, setRecipientNode] = useState<string>("node_remote_01")
  const [exportedBundle, setExportedBundle] = useState<any>(null)
  const [importJson, setImportJson] = useState<string>("")
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [isImporting, setIsImporting] = useState<boolean>(false)

  useEffect(() => {
    api.getFederationNodes().then((res) => {
      setNodes(
        res.nodes?.length
          ? res.nodes
          : [
              {
                node_id: "node_local_primary",
                display_name: "Local Gateway (Primary)",
                network_address: "127.0.0.1:8000",
                status: "trusted",
                last_seen: new Date().toISOString(),
              },
              {
                node_id: "node_bangalore",
                display_name: "Node Bangalore (Core Cluster)",
                network_address: "192.168.1.104:8000",
                status: "trusted",
                last_seen: new Date().toISOString(),
              },
              {
                node_id: "node_remote_01",
                display_name: "Node Remote-01 (Offline Field Station)",
                network_address: "192.168.1.215:8000",
                status: "online",
                last_seen: new Date().toISOString(),
              },
            ]
      )
    })
  }, [])

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const bundle = await api.exportBundle(selectedVault, recipientNode)
      setExportedBundle(bundle)
      toast.success("Encrypted vault bundle exported successfully!", {
        description: `Signed with system Ed25519 key; recipient bound to ${recipientNode}.`,
      })
    } catch (err: any) {
      toast.error(`Export failed: ${err.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleImport = async () => {
    if (!importJson.trim()) return
    setIsImporting(true)
    try {
      const bundleData = JSON.parse(importJson.trim())
      const res = await api.importBundle(bundleData)
      toast.success("Vault bundle imported and verified!", {
        description: `Imported vault ID: ${res.imported_vault_id || "v_imported"} (Fail-Closed Validated)`,
      })
      setImportJson("")
    } catch (err: any) {
      toast.error(`Import rejected: ${err.message}`, {
        description: "Decryption or signature failed; fail-closed policy strictly enforced.",
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight">
          LAN Federation & Offline Bundles (§15, §47)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Zero-trust node topology and cryptographically signed offline dataset bundles.
        </p>
      </div>

      {/* Trusted LAN Topology */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
          Trusted LAN Topology
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {nodes.map((n) => (
            <div
              key={n.node_id}
              className="p-3.5 rounded-xl border border-border bg-surface-raised space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Server className="h-4 w-4 text-emerald-400" />
                  <span className="truncate">{n.display_name}</span>
                </div>
                <Badge variant="success" className="text-[9px] py-0">
                  {n.status}
                </Badge>
              </div>

              <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/40">
                {n.network_address}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Offline Vault Bundles Exchange */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Box */}
        <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-3.5 text-xs">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Download className="h-4 w-4 text-emerald-400" />
            <span className="text-sm">Export Encrypted Vault Bundle</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Packages vault chunks encrypted via derived KEK, signs header + manifest with Ed25519,
            and binds payload to recipient node identity.
          </p>

          <div className="space-y-2.5">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Source Vault
              </label>
              <select
                value={selectedVault}
                onChange={(e) => setSelectedVault(e.target.value)}
                className="w-full h-8 px-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none"
              >
                {vaults.map((v) => (
                  <option key={v.vault_id} value={v.vault_id}>
                    {v.display_name} ({v.slug})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Authorized Recipient Node
              </label>
              <select
                value={recipientNode}
                onChange={(e) => setRecipientNode(e.target.value)}
                className="w-full h-8 px-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none"
              >
                <option value="node_remote_01">Node Remote-01 (Offline Field Station)</option>
                <option value="node_bangalore">Node Bangalore (Core Cluster)</option>
                <option value="node_local_primary">Node Local Primary</option>
              </select>
            </div>

            <Button
              size="sm"
              onClick={handleExport}
              disabled={isExporting}
              className="w-full text-xs h-8 gap-1.5"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              <span>Export Signed Bundle (.rvault)</span>
            </Button>

            {exportedBundle && (
              <div className="p-3 rounded-lg border border-border bg-surface-subtle space-y-1">
                <div className="text-[10px] font-semibold text-emerald-400 uppercase">
                  ✓ Bundle Ready (Ed25519 Signed)
                </div>
                <div className="text-[11px] font-mono text-muted-foreground truncate">
                  Bundle ID: {exportedBundle.header?.bundle_id}
                </div>
                <div className="text-[11px] font-mono text-muted-foreground truncate">
                  Hash: {exportedBundle.manifest?.payload_sha256}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Import Box */}
        <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-3.5 text-xs">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Upload className="h-4 w-4 text-emerald-400" />
            <span className="text-sm">Import & Verify Vault Bundle</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Verifies Ed25519 signature, validates replay nonce store (§224), checks ciphertext hash,
            and imports into an isolated compartment.
          </p>

          <div className="space-y-2.5">
            <textarea
              rows={4}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste exported .rvault JSON bundle here..."
              className="w-full p-2 rounded-md bg-surface-subtle border border-border text-[11px] font-mono text-foreground outline-none resize-none"
            />

            <Button
              size="sm"
              variant="secondary"
              onClick={handleImport}
              disabled={!importJson.trim() || isImporting}
              className="w-full text-xs h-8 gap-1.5"
            >
              {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5" />}
              <span>Verify & Import Bundle</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
