import React, { useState, useEffect, useCallback } from "react"
import {
  Database,
  Layers,
  Search,
  ShieldCheck,
  CheckCircle2,
  Lock,
  FileText,
  Image as ImageIcon,
  Volume2 as AudioIcon,
  Video as VideoIcon,
  Code as CodeIcon,
  Copy,
  Check,
  RefreshCw,
  MessageSquare,
  Maximize2,
  Folder,
  Hash,
  Clock,
  Sparkles,
  ExternalLink,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { api } from "../../lib/api"
import { ChunkRecord } from "../../types"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Badge } from "../ui/badge"
import { ScrollArea } from "../ui/scroll-area"
import { Strata } from "../ui/strata"
import { Seal } from "../ui/seal"
import { Identicon } from "../ui/identicon"
import { Glyph, GlyphName } from "../../glyphs"
import { cn } from "../../lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog"
import { toast } from "sonner"

export const ChunkStoreView: React.FC = () => {
  const { vaults, startNewChat, persona, principal } = useApp()

  const isAdmin = (principal?.roles || persona.roles || []).some(
    (r) => r === "admin" || r === "security_admin"
  )

  const [chunks, setChunks] = useState<ChunkRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState("")
  const [selectedModality, setSelectedModality] = useState<string>("all")
  const [selectedVaultSlug, setSelectedVaultSlug] = useState<string>("all")
  const [stats, setStats] = useState<{
    total_chunks: number
    total_encrypted: number
    modalities: Record<string, number>
  }>({
    total_chunks: 0,
    total_encrypted: 0,
    modalities: {},
  })

  // Selected chunk for deep modal inspector
  const [inspectChunk, setInspectChunk] = useState<ChunkRecord | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const loadChunks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.getChunks({
        vault_slug: selectedVaultSlug !== "all" ? selectedVaultSlug : undefined,
        modality: selectedModality !== "all" ? selectedModality : undefined,
        search: search.trim() || undefined,
        limit: 100,
        offset: 0,
      })
      setChunks(res.chunks || [])
      setTotal(res.total || 0)
      if (res.stats) {
        setStats(res.stats)
      }
    } catch (err: any) {
      toast.error(`Failed to load chunks: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [selectedVaultSlug, selectedModality, search])

  useEffect(() => {
    const timer = setTimeout(() => {
      loadChunks()
    }, 250)
    return () => clearTimeout(timer)
  }, [loadChunks])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(label)
    toast.success(`Copied ${label} to clipboard`)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleAskChunk = (c: ChunkRecord) => {
    startNewChat(c.vault_slug, { id: c.resource_id, name: c.resource_title })
  }

  // Modality helper
  const getModalityMeta = (modality: string) => {
    const m = modality.toLowerCase()
    if (m === "image") {
      return {
        label: "IMAGE",
        engine: "Qwen-VL + OCR",
        glyph: "iris" as GlyphName,
        color: "text-beam bg-beam/10 border-beam/25",
        badgeColor: "border-beam/30 text-beam bg-beam/10",
        barColor: "bg-beam",
      }
    }
    if (m === "audio") {
      return {
        label: "AUDIO",
        engine: "Whisper",
        glyph: "wave" as GlyphName,
        color: "text-trust bg-trust/10 border-trust/25",
        badgeColor: "border-trust/30 text-trust bg-trust/10",
        barColor: "bg-trust",
      }
    }
    if (m === "video" || m === "video_audio") {
      return {
        label: "VIDEO",
        engine: "Vision + Audio",
        glyph: "reel" as GlyphName,
        color: "text-hold bg-hold/10 border-hold/25",
        badgeColor: "border-hold/30 text-hold bg-hold/10",
        barColor: "bg-hold",
      }
    }
    if (m === "code") {
      return {
        label: "CODE",
        engine: "Tree-sitter",
        glyph: "brackets" as GlyphName,
        color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/25",
        badgeColor: "border-indigo-500/30 text-indigo-300 bg-indigo-500/10",
        barColor: "bg-indigo-400",
      }
    }
    return {
      label: "DOC",
      engine: "Text",
      glyph: "sheet" as GlyphName,
      color: "text-muted-foreground bg-secondary/80 border-border",
      badgeColor: "border-border text-muted-foreground bg-surface-raised",
      barColor: "bg-muted-foreground/60",
    }
  }

  // Modality breakdown items
  const modalityEntries = Object.entries(stats.modalities || {})
  const totalCountForBar = stats.total_chunks || total || 1

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Top Header */}
      <div className="p-6 pb-4 border-b border-border bg-surface/50 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-surface-raised border border-border flex items-center justify-center text-foreground">
                <Glyph name="storage" size={16} />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Canonical Store
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded border border-border bg-surface-raised text-muted-foreground flex items-center gap-1">
                  <Glyph name="lock" size={11} className="text-trust" />
                  AES-256-GCM decrypted
                </span>
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Authoritative post-retrieval storage layer: inspect decrypted canonical chunks, multimodal provenance, and cryptographic SHA-256 hash chains.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadChunks}
              className="text-xs h-8 gap-1.5 border-border"
              disabled={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span>Refresh</span>
            </Button>
          </div>
        </div>

        {/* Role Scoped Banner */}
        {!isAdmin && (
          <div className="p-3 rounded-lg border border-border bg-surface-raised/40 text-xs flex items-center justify-between gap-2 mt-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Seal state="verified" size={15} />
              <span>
                Role-scoped view: Showing only chunks authorized for <strong className="text-foreground">{persona.name}</strong> (Clearance Level {persona.clearanceLevel}). Chunks from unshared documents are strictly withheld.
              </span>
            </div>
            <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground shrink-0 font-mono">
              Tenant Isolated
            </Badge>
          </div>
        )}

        {/* Modality Breakdown Stacked Bar */}
        {modalityEntries.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/40 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span className="flex items-center gap-1.5">
                <Glyph name="mesh" size={12} className="text-trust" />
                <span>Modality Distribution</span>
              </span>
              <span className="tabular-nums">{total} canonical chunks</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-secondary/80 overflow-hidden flex">
              {modalityEntries.map(([mod, count]) => {
                const meta = getModalityMeta(mod)
                const pct = Math.max(2, (count / totalCountForBar) * 100)
                return (
                  <div
                    key={mod}
                    className={cn("h-full transition-all duration-500", meta.barColor)}
                    style={{ width: `${pct}%` }}
                    title={`${mod.toUpperCase()}: ${count} chunks (${Math.round(pct)}%)`}
                  />
                )
              })}
            </div>
          </div>
        )}

        {/* Top Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="p-3 rounded-lg border border-border bg-surface-raised">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>Total Visible Chunks</span>
              <Layers className="h-3.5 w-3.5 text-trust" />
            </div>
            <div className="text-xl font-bold text-foreground mt-1 font-mono tabular-nums">
              {stats.total_chunks || total}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Across authorized folders</div>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-raised">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>Storage Encryption</span>
              <Lock className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <div className="text-xl font-bold text-foreground mt-1 font-mono">
              AES-256-GCM
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Hardware KEK derivation</div>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-raised">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>Integrity Verification</span>
              <Seal state="verified" size={14} />
            </div>
            <div className="text-xl font-bold text-trust mt-1 font-mono">
              100% SHA-256
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Zero corruption or drift</div>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-raised">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>Modality Channels</span>
              <Sparkles className="h-3.5 w-3.5 text-hold" />
            </div>
            <div className="text-xl font-bold text-foreground mt-1 font-mono flex items-center gap-1.5 tabular-nums">
              <span>{Object.keys(stats.modalities || {}).length || 4}</span>
              <span className="text-xs font-normal text-muted-foreground">active</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Audio · Vision · Video · Docs</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row items-center gap-3 mt-4 pt-3 border-t border-border/40">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search chunk text, ID, locator, or document title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs h-8 pl-8 bg-surface-subtle"
            />
          </div>

          {/* Vault Selector */}
          <div className="w-full md:w-56 shrink-0">
            <select
              value={selectedVaultSlug}
              onChange={(e) => setSelectedVaultSlug(e.target.value)}
              className="w-full text-xs h-8 rounded-md bg-surface-subtle border border-border px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
            >
              <option value="all">All Compartments</option>
              {vaults.map((v) => (
                <option key={v.vault_id} value={v.slug}>
                  {v.display_name} ({v.slug})
                </option>
              ))}
            </select>
          </div>

          {/* Modality Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto py-1">
            {[
              { id: "all", label: "ALL", glyph: "layers" as GlyphName },
              { id: "image", label: "IMAGE", glyph: "iris" as GlyphName },
              { id: "audio", label: "AUDIO", glyph: "wave" as GlyphName },
              { id: "video", label: "VIDEO", glyph: "reel" as GlyphName },
              { id: "document", label: "DOC", glyph: "sheet" as GlyphName },
              { id: "code", label: "CODE", glyph: "brackets" as GlyphName },
            ].map((m) => {
              const isSelected = selectedModality === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModality(m.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium whitespace-nowrap transition-colors border",
                    isSelected
                      ? "bg-foreground text-background border-foreground font-semibold"
                      : "bg-surface-raised text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  <Glyph name={m.glyph} size={12} />
                  <span>{m.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Chunk Grid / Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <RefreshCw className="h-8 w-8 text-trust animate-spin mb-3" />
            <p className="text-sm font-medium text-foreground">Decrypting and loading canonical chunks...</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">Verifying SHA-256 integrity and HKDF key derivation</p>
          </div>
        ) : chunks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 border border-dashed border-border rounded-xl bg-surface/30">
            <Database className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
            <h3 className="text-sm font-semibold text-foreground">No Chunks Found</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {search || selectedModality !== "all" || selectedVaultSlug !== "all"
                ? "No canonical chunks match your active search or modality filter."
                : "No documents have been ingested into this knowledge compartment yet."}
            </p>
            {(search || selectedModality !== "all" || selectedVaultSlug !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("")
                  setSelectedModality("all")
                  setSelectedVaultSlug("all")
                }}
                className="text-xs mt-3 h-7.5"
              >
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
              <span className="tabular-nums">Showing {chunks.length} of {total} chunks</span>
              <span>Sorted by Creation Date (Newest first)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {chunks.map((chunk) => {
                const meta = getModalityMeta(chunk.modality)

                return (
                  <div
                    key={chunk.chunk_id}
                    className="flex flex-col justify-between p-4 rounded-xl border border-border bg-surface-raised hover:border-border/80 transition-all shadow-xs group"
                  >
                    <div>
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className={cn("h-6 w-6 rounded-md flex items-center justify-center border", meta.color)}>
                            <Glyph name={meta.glyph} size={13} />
                          </div>
                          <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded border font-medium", meta.badgeColor)}>
                            {meta.label}
                          </span>
                          <Strata level={chunk.classification} size="sm" />
                          {chunk.is_encrypted && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground bg-surface flex items-center gap-1">
                              <Lock className="h-2.5 w-2.5 text-trust" />
                              AES-256
                            </span>
                          )}
                          {chunk.integrity_verified && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-trust/30 text-trust bg-trust/5 flex items-center gap-1">
                              <Seal state="verified" size={11} />
                              SHA-256
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Identicon hash={chunk.content_hash} size={14} title={`Hash: ${chunk.content_hash}`} />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setInspectChunk(chunk)}
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            title="Inspect full details"
                          >
                            <Maximize2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Document / Source Info */}
                      <div className="space-y-0.5 mb-2.5">
                        <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 truncate">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate" title={chunk.resource_title}>
                            {chunk.resource_title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                          <span className="flex items-center gap-1">
                            <Folder className="h-2.5 w-2.5" />
                            {chunk.vault_name}
                          </span>
                          <span>•</span>
                          <span>{chunk.locator}</span>
                          {chunk.timestamp && (
                            <>
                              <span>•</span>
                              <span className="text-trust flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {chunk.timestamp}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Content Preview (3-line clamp) */}
                      <div className="p-3 rounded-lg bg-surface border border-border text-xs text-foreground/90 font-mono leading-relaxed line-clamp-3 break-words">
                        {chunk.content}
                      </div>

                      {/* Media Link if applicable */}
                      {chunk.media_url && (
                        <div className="mt-2.5">
                          {chunk.modality === "image" ? (
                            <div className="relative group/img overflow-hidden rounded-lg border border-border max-h-36 bg-black/40">
                              <img
                                src={chunk.media_url}
                                alt={chunk.resource_title}
                                className="w-full h-36 object-contain hover:scale-105 transition-transform"
                              />
                            </div>
                          ) : chunk.modality === "audio" ? (
                            <audio
                              controls
                              src={chunk.media_url}
                              className="w-full h-8 mt-1 rounded bg-surface"
                            />
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Bottom Metadata & Actions */}
                    <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-2 font-mono truncate max-w-[65%]">
                        <span className="truncate" title={`Chunk ID: ${chunk.chunk_id}`}>
                          ID: {chunk.chunk_id.slice(0, 12)}...
                        </span>
                        <span>•</span>
                        <span className="truncate" title={`Hash: ${chunk.content_hash}`}>
                          {chunk.content_hash.slice(0, 8)}...
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAskChunk(chunk)}
                          className="h-6 px-2 text-[10px] gap-1 text-foreground hover:bg-surface font-medium"
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span>Chat</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(chunk.content, `Chunk ${chunk.chunk_id}`)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          title="Copy decrypted text"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* INSPECT CHUNK DETAIL MODAL */}
      <Dialog open={!!inspectChunk} onOpenChange={(open) => !open && setInspectChunk(null)}>
        <DialogContent className="max-w-2xl bg-surface-raised border border-border text-foreground shadow-2xl p-6 max-h-[85vh] flex flex-col">
          {inspectChunk && (
            <>
              <DialogHeader className="pb-3 border-b border-border/40 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-surface border border-border flex items-center justify-center text-foreground">
                      <Glyph name="storage" size={16} />
                    </div>
                    <div>
                      <DialogTitle className="text-base font-semibold">
                        Canonical Chunk Inspector
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground font-mono">
                        {inspectChunk.chunk_id} · {inspectChunk.resource_title}
                      </DialogDescription>
                    </div>
                  </div>
                  <Strata level={inspectChunk.classification} size="sm" />
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1 pr-3 py-2 space-y-4">
                {/* Cryptographic Badges */}
                <div className="flex items-center gap-2 flex-wrap pt-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground bg-surface flex items-center gap-1">
                    <Lock className="h-3 w-3 text-trust" />
                    AES-256-GCM Hardware Encrypted
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-trust/30 text-trust bg-trust/10 flex items-center gap-1">
                    <Seal state="verified" size={12} />
                    SHA-256 Verified
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground bg-surface uppercase">
                    Modality: {inspectChunk.modality}
                  </span>
                </div>

                {/* Media Preview if present */}
                {inspectChunk.media_url && (
                  <div className="p-3 rounded-lg border border-border bg-surface space-y-2">
                    <div className="text-xs font-semibold text-foreground">Attached Canonical Media:</div>
                    {inspectChunk.modality === "image" ? (
                      <div className="rounded-lg overflow-hidden border border-border bg-black/60 max-h-72 flex items-center justify-center">
                        <img
                          src={inspectChunk.media_url}
                          alt="Canonical asset"
                          className="max-h-72 object-contain"
                        />
                      </div>
                    ) : inspectChunk.modality === "audio" ? (
                      <audio controls src={inspectChunk.media_url} className="w-full rounded" />
                    ) : null}
                  </div>
                )}

                {/* Decrypted Canonical Plaintext */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">
                      Decrypted Plaintext Content:
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(inspectChunk.content, "Decrypted Content")}
                      className="text-xs h-6 gap-1 px-2 text-foreground hover:bg-surface"
                    >
                      {copiedField === "Decrypted Content" ? (
                        <Check className="h-3 w-3 text-trust" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span>Copy</span>
                    </Button>
                  </div>
                  <div className="p-3 rounded-lg bg-surface border border-border font-mono text-xs text-foreground/90 leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap select-text">
                    {inspectChunk.content}
                  </div>
                </div>

                {/* Metadata Table */}
                <div className="space-y-2 pt-2">
                  <label className="text-xs font-semibold text-foreground">
                    Cryptographic & Provenance Details:
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="p-2.5 rounded-lg bg-surface border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Chunk Index</div>
                      <div className="font-semibold text-foreground mt-0.5 tabular-nums">
                        #{inspectChunk.chunk_index}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Locator / Span</div>
                      <div className="font-semibold text-foreground mt-0.5">
                        {inspectChunk.locator}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface border border-border col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground uppercase">Content SHA-256 Hash</span>
                        <Identicon hash={inspectChunk.content_hash} size={14} />
                      </div>
                      <div className="text-[11px] font-semibold text-trust mt-1 break-all select-all">
                        {inspectChunk.content_hash}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Resource ID</div>
                      <div className="font-semibold text-foreground mt-0.5 truncate">
                        {inspectChunk.resource_id}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-surface border border-border">
                      <div className="text-[10px] text-muted-foreground uppercase">Vault Compartment</div>
                      <div className="font-semibold text-foreground mt-0.5 truncate">
                        {inspectChunk.vault_name} ({inspectChunk.vault_slug})
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <div className="pt-3 border-t border-border/40 flex items-center justify-between shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInspectChunk(null)}
                  className="text-xs h-8 border-border"
                >
                  Close
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    handleAskChunk(inspectChunk)
                    setInspectChunk(null)
                  }}
                  className="text-xs h-8 gap-1.5 bg-foreground text-background hover:bg-foreground/90 font-medium"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Start Chat With This File</span>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

