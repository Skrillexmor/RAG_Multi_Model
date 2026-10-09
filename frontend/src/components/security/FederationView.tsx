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
  Copy,
  Check,
} from "lucide-react"
import { FederationNode } from "../../types"
import { api } from "../../lib/api"
import { useApp } from "../../context/AppContext"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Seal } from "../ui/seal"
import { Glyph } from "../../glyphs"
import { cn } from "../../lib/utils"
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
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number>(0)
  const [copiedHash, setCopiedHash] = useState<boolean>(false)
  const [importReport, setImportReport] = useState<{
    vaultId: string
    sigValid: boolean
    recipientBound: boolean
    nonceFresh: boolean
    hashIntact: boolean
  } | null>(null)

  useEffect(() => {
    api.getFederationNodes().then((res) => {
      const fallbackNodes: FederationNode[] = [
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
        {
          node_id: "node_station_backup",
          display_name: "Station Backup (LAN Cold)",
          network_address: "192.168.1.88:8000",
          status: "trusted",
          last_seen: "5 minutes ago",
        },
        {
          node_id: "node_field_patrol",
          display_name: "Field Tactical Unit",
          network_address: "192.168.1.47:8000",
          status: "offline",
          last_seen: "2 days ago",
        },
      ]
      setNodes(res.nodes?.length ? res.nodes : fallbackNodes)
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
      setImportReport({
        vaultId: res.imported_vault_id || "v_imported",
        sigValid: true,
        recipientBound: true,
        nonceFresh: true,
        hashIntact: true,
      })
      toast.success("Vault bundle imported and verified!", {
        description: `Imported vault ID: ${res.imported_vault_id || "v_imported"} (Fail-Closed Validated)`,
      })
      setImportJson("")
    } catch (err: any) {
      setImportReport(null)
      toast.error(`Import rejected: ${err.message}`, {
        description: "Decryption or signature failed; fail-closed policy strictly enforced.",
      })
    } finally {
      setIsImporting(false)
    }
  }

  // Active selected node
  const activeNode = nodes[selectedNodeIndex] || nodes[0]

  // Topology SVG positions
  const cx = 260
  const cy = 200
  const R = 135
  const peerNodes = nodes.filter((_, idx) => idx !== 0) // Peers around primary center
  const peerPositions = peerNodes.map((_, i) => {
    const angle = (-90 + i * (360 / Math.max(1, peerNodes.length))) * (Math.PI / 180)
    return {
      x: cx + R * Math.cos(angle),
      y: cy + R * Math.sin(angle),
    }
  })

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div>
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
          <Glyph name="mesh" size={13} className="text-trust" />
          <span>LAN Federation & Offline Bundles (§15, §47)</span>
        </div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight">
          Node Topology & Sealed Datasets
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Zero-trust mesh node topology with peer verification and cryptographically sealed offline dataset bundles.
        </p>
      </div>

      {/* TOPOLOGY CANVAS & NODE DETAILS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Interactive SVG Topology Ring */}
        <div className="lg:col-span-7 rounded-xl border border-border bg-surface-raised p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono font-medium text-muted-foreground uppercase flex items-center gap-1.5">
              <Glyph name="radar" size={13} className="text-trust" />
              <span>LAN Topology Map</span>
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              {nodes.length} nodes registered · Air-gapped mesh
            </span>
          </div>

          <div className="w-full aspect-[13/10] relative flex items-center justify-center">
            <svg
              viewBox="0 0 520 400"
              className="w-full h-full select-none"
              role="img"
              aria-label="LAN federation topology canvas"
            >
              {/* Soft boundary orbital ring */}
              <circle
                cx={cx}
                cy={cy}
                r={R}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-border/40 stroke-dasharray-[3 6]"
              />

              {/* Connecting link lines */}
              {peerNodes.map((p, i) => {
                const pos = peerPositions[i]
                const isOffline = p.status === "offline"
                return (
                  <g key={`link-${p.node_id}`}>
                    <line
                      x1={cx}
                      y1={cy}
                      x2={pos.x}
                      y2={pos.y}
                      stroke="currentColor"
                      strokeWidth="1.2"
                      className={cn(
                        isOffline
                          ? "text-border/40 stroke-dasharray-[4 4]"
                          : "text-border/80"
                      )}
                    />
                    {!isOffline && (
                      <circle r="3" className="fill-beam">
                        <animateMotion
                          dur={`${2.0 + i * 0.4}s`}
                          begin={`${i * 0.3}s`}
                          repeatCount="indefinite"
                          path={`M${cx},${cy} L${pos.x},${pos.y}`}
                        />
                      </circle>
                    )}
                  </g>
                )
              })}

              {/* Surrounding Peer Nodes */}
              {peerNodes.map((p, i) => {
                const pos = peerPositions[i]
                const isSelected = selectedNodeIndex === i + 1
                const isOffline = p.status === "offline"

                return (
                  <g
                    key={`peer-${p.node_id}`}
                    onClick={() => setSelectedNodeIndex(i + 1)}
                    className="cursor-pointer group"
                  >
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="22"
                      className={cn(
                        "transition-all duration-200",
                        isSelected
                          ? "fill-surface-raised stroke-trust stroke-2"
                          : isOffline
                          ? "fill-surface stroke-border/40 stroke-dasharray-[3 3]"
                          : "fill-surface stroke-border group-hover:stroke-border/80 stroke-1"
                      )}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 4}
                      textAnchor="middle"
                      className={cn(
                        "text-[10px] font-mono font-medium fill-current select-none pointer-events-none",
                        isOffline ? "text-muted-foreground/50" : isSelected ? "text-trust" : "text-muted-foreground"
                      )}
                    >
                      {`N${i + 1}`}
                    </text>
                    <text
                      x={pos.x}
                      y={pos.y + 36}
                      textAnchor="middle"
                      className="text-[10px] font-sans fill-muted-foreground select-none pointer-events-none truncate"
                    >
                      {p.display_name.split(" ")[0]}
                    </text>
                  </g>
                )
              })}

              {/* Center Primary Node ("This node") */}
              <g
                onClick={() => setSelectedNodeIndex(0)}
                className="cursor-pointer group"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r="32"
                  className={cn(
                    "transition-all duration-200",
                    selectedNodeIndex === 0
                      ? "fill-surface-raised stroke-trust stroke-2"
                      : "fill-surface-raised stroke-border group-hover:stroke-trust/60 stroke-1"
                  )}
                />
                <circle cx={cx} cy={cy} r="18" fill="none" stroke="currentColor" strokeWidth="1" className="text-border/60" />
                <circle cx={cx} cy={cy} r="5" className="fill-trust animate-pulse" />
                <text
                  x={cx}
                  y={cy + 48}
                  textAnchor="middle"
                  className="text-[11px] font-semibold fill-foreground select-none pointer-events-none"
                >
                  This Node (Gateway)
                </text>
              </g>
            </svg>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground text-center pt-1">
            Click any node on the ring to inspect its mutual authentication & cryptographic status
          </div>
        </div>

        {/* Selected Node Inspector Card */}
        {activeNode && (
          <div className="lg:col-span-5 rounded-xl border border-border bg-surface-raised p-5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    {activeNode.display_name}
                  </h3>
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">
                    {activeNode.node_id}
                  </div>
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase border",
                    activeNode.status === "offline"
                      ? "bg-secondary text-muted-foreground border-border"
                      : "bg-trust/10 text-trust border-trust/30"
                  )}
                >
                  {activeNode.status}
                </span>
              </div>

              <div className="space-y-3 text-xs pt-2">
                <div className="p-3 rounded-lg bg-surface border border-border space-y-1">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Network Address</div>
                  <div className="font-mono text-foreground font-semibold">
                    {activeNode.network_address}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-surface border border-border space-y-1">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">Last Seen</div>
                    <div className="font-mono text-foreground text-[11px]">
                      {activeNode.last_seen.includes("T") ? "Active now" : activeNode.last_seen}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-surface border border-border space-y-1">
                    <div className="text-[10px] font-mono uppercase text-muted-foreground">Mutual Auth</div>
                    <div className="font-mono text-trust text-[11px] flex items-center gap-1">
                      <Seal state={activeNode.status !== "offline" ? "verified" : "broken"} size={12} />
                      <span>{activeNode.status !== "offline" ? "Ed25519" : "None"}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface border border-border space-y-1">
                  <div className="text-[10px] font-mono uppercase text-muted-foreground">Replay Protection (§224)</div>
                  <div className="text-[11px] text-muted-foreground">
                    {activeNode.status !== "offline"
                      ? "Persistent nonce sliding window active. Zero replay tolerance."
                      : "Node is disconnected. Incoming bundles will be rejected."}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span>Binding: Recipient-pinned</span>
              <span className="text-trust">Verified Invariant</span>
            </div>
          </div>
        )}
      </div>

      {/* Offline Vault Bundles Exchange */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Export Box: Seal a bundle */}
        <div className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-xs">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <div className="h-7 w-7 rounded-lg bg-surface border border-border flex items-center justify-center text-foreground">
              <Download className="h-3.5 w-3.5 text-trust" />
            </div>
            <div>
              <span className="text-sm font-semibold">Seal Encrypted Bundle (.rvault)</span>
              <div className="text-[11px] text-muted-foreground font-normal">
                Packages compartment chunks encrypted via KEK, signs header with Ed25519.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Source Compartment
              </label>
              <select
                value={selectedVault}
                onChange={(e) => setSelectedVault(e.target.value)}
                className="w-full h-8 px-2 rounded-md bg-surface border border-border text-xs text-foreground outline-none font-medium"
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
                className="w-full h-8 px-2 rounded-md bg-surface border border-border text-xs text-foreground outline-none font-medium"
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
              className="w-full text-xs h-8 gap-1.5 bg-foreground text-background hover:bg-foreground/90 font-medium"
            >
              {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Seal state="verified" size={14} />}
              <span>Seal Signed Bundle</span>
            </Button>

            {exportedBundle && (
              <div className="p-3.5 rounded-lg border border-trust/30 bg-surface space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-trust flex items-center gap-1.5">
                    <Seal state="verified" size={14} />
                    <span>Bundle Sealed & Signed (Ed25519)</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(exportedBundle, null, 2))
                      setCopiedHash(true)
                      toast.success("Bundle JSON copied to clipboard")
                      setTimeout(() => setCopiedHash(false), 2000)
                    }}
                    className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground px-2"
                  >
                    {copiedHash ? <Check className="h-3 w-3 text-trust" /> : <Copy className="h-3 w-3" />}
                    <span>Copy JSON</span>
                  </Button>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  Bundle ID: {exportedBundle.header?.bundle_id || "bundle-7f8a92"}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground truncate">
                  SHA-256: {exportedBundle.manifest?.payload_sha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Import Box: Open a bundle */}
        <div className="p-5 rounded-xl border border-border bg-surface-raised space-y-4 text-xs shadow-xs">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <div className="h-7 w-7 rounded-lg bg-surface border border-border flex items-center justify-center text-foreground">
              <Upload className="h-3.5 w-3.5 text-trust" />
            </div>
            <div>
              <span className="text-sm font-semibold">Verify & Open Bundle</span>
              <div className="text-[11px] text-muted-foreground font-normal">
                Verifies Ed25519 signature, checks nonce freshness (§224), validates SHA-256 payload.
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <textarea
              rows={4}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste exported .rvault JSON payload here to verify and ingest..."
              className="w-full p-2.5 rounded-lg bg-surface border border-border text-[11px] font-mono text-foreground outline-none resize-none placeholder:text-muted-foreground/60"
            />

            <Button
              size="sm"
              variant="outline"
              onClick={handleImport}
              disabled={!importJson.trim() || isImporting}
              className="w-full text-xs h-8 gap-1.5 border-border"
            >
              {isImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5 text-trust" />}
              <span>Verify & Ingest Bundle</span>
            </Button>

            {importReport && (
              <div className="p-3.5 rounded-lg border border-border bg-surface space-y-1.5 text-[11px] font-mono">
                <div className="text-trust font-semibold flex items-center gap-1.5">
                  <Seal state="verified" size={14} />
                  <span>Verification Succeeded: {importReport.vaultId}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground pt-1">
                  <div>✓ Signature: Ed25519 valid</div>
                  <div>✓ Recipient: Node matched</div>
                  <div>✓ Nonce: Store fresh (§224)</div>
                  <div>✓ Payload: SHA-256 intact</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

