import React from "react"
import {
  Aperture,
  Verify,
  GateClosed,
  Sheet,
  Lock,
  ChevronRight,
  Frame,
  Reel,
  Wave,
  Brackets,
  Play,
  Session,
} from "../../glyphs"
import { Message, CitationRef } from "../../types"
import { useApp } from "../../context/AppContext"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Strata } from "../ui/strata"
import { cn } from "../../lib/utils"
import { AuthenticatedMedia } from "../media/AuthenticatedMedia"
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover"
import { Info, Gauge, CheckCircle2 } from "lucide-react"

interface MessageItemProps {
  message: Message
  onRequestAccess?: (vaultSlug?: string) => void
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onRequestAccess,
}) => {
  const { openEvidenceInspector, openTraceInspector, persona, vaults } = useApp()

  if (message.role === "user") {
    return (
      <div className="w-full py-3.5 flex justify-end">
        <div className="max-w-2xl px-4 py-2.5 rounded-2xl bg-secondary text-foreground text-sm leading-relaxed shadow-xs">
          {message.content}
        </div>
      </div>
    )
  }

  const isRefusal =
    message.mode === "REFUSAL" ||
    (message.refusalReason && message.refusalReason !== "NONE")

  const targetVault = vaults.find((v) => v.slug === message.vaultSlug)
  const ceiling = targetVault?.classification_ceiling || 3

  // Enhanced Markdown & Citation parser per DESIGN.md §6.5
  const renderFormattedContent = (content: string, citations?: CitationRef[]) => {
    if (!content) return null

    const renderInline = (text: string) => {
      const tokens = text.split(/(\[[A-Z][0-9]+\]|\*\*[^*]+\*\*|`[^`]+`)/g)
      return tokens.map((token, idx) => {
        // Citation check
        const citMatch = token.match(/\[([A-Z][0-9]+)\]/)
        if (citMatch) {
          const citId = citMatch[1]
          const cit = citations?.find((c) => c.citation_id === citId)
          return (
            <button
              key={idx}
              onClick={() => {
                if (cit && message.evidenceItems) {
                  const ev = message.evidenceItems.find(
                    (e) => e.evidence_id === cit.evidence_id
                  )
                  if (ev) openEvidenceInspector(ev)
                }
              }}
              className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-[11px] font-mono rounded-md bg-trust/15 text-trust border border-trust/30 hover:bg-trust/25 transition-all cursor-pointer select-none font-medium align-baseline sealed"
              title={`Citation ${citId}: Click to inspect verified evidence proof`}
            >
              {token}
            </button>
          )
        }
        // Bold check
        if (token.startsWith("**") && token.endsWith("**")) {
          return (
            <strong key={idx} className="font-semibold text-foreground">
              {token.slice(2, -2)}
            </strong>
          )
        }
        // Inline code
        if (token.startsWith("`") && token.endsWith("`")) {
          return (
            <code
              key={idx}
              className="px-1 py-0.5 rounded bg-secondary border border-border text-foreground font-mono text-xs"
            >
              {token.slice(1, -1)}
            </code>
          )
        }
        return <span key={idx}>{token}</span>
      })
    }

    const lines = content.split("\n")
    return (
      <div className="space-y-3 leading-relaxed text-[15px] font-sans">
        {lines.map((line, idx) => {
          if (!line.trim()) return <div key={idx} className="h-1.5" />

          // Unordered list item
          if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
            return (
              <div key={idx} className="flex items-start gap-2.5 pl-2">
                <span className="w-1.5 h-1.5 rounded-full bg-beam mt-2 shrink-0" />
                <div className="flex-1">{renderInline(line.trim().slice(2))}</div>
              </div>
            )
          }

          // Numbered list item
          const numMatch = line.match(/^([0-9]+)\.\s+(.*)/)
          if (numMatch) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="font-mono text-xs text-muted-foreground font-medium mt-1">
                  {numMatch[1]}.
                </span>
                <div className="flex-1">{renderInline(numMatch[2])}</div>
              </div>
            )
          }

          // Standard paragraph
          return <p key={idx}>{renderInline(line)}</p>
        })}
      </div>
    )
  }

  return (
    <div className="w-full py-4 border-b border-border/40 last:border-none">
      <div className="max-w-3xl mx-auto space-y-3.5">
        {/* Assistant Header Badge */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground select-none">
          <div className="h-5 w-5 rounded-md bg-secondary border border-border flex items-center justify-center">
            <Aperture size={13} accent="hsl(var(--beam))" />
          </div>
          <span className="font-medium text-foreground">PrivateRAG</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-[11px]">
            {isRefusal
              ? message.refusalReason === "FOLDER_EMPTY"
                ? "Folder Notice"
                : "Outside Clearance"
              : "Verified, Grounded Synthesis"}
          </span>
        </div>

        {/* The Closed Gate Refusal State (§6.6) */}
        {isRefusal ? (
          message.refusalReason === "FOLDER_EMPTY" ? (
            <div className="p-4 rounded-xl border border-border bg-secondary/40 text-foreground space-y-3">
              <div className="flex items-start gap-2.5">
                <Sheet size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-semibold text-foreground">
                    Folder is Empty
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {message.content}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                <div className="text-[11px] text-muted-foreground">
                  Status: <span className="font-mono text-muted-foreground">FOLDER_EMPTY</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-deny/30 bg-deny/5 text-foreground space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-deny/15 text-deny shrink-0">
                  <GateClosed size={20} />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-foreground">
                    Outside your clearance
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {message.content ||
                      "This record is classified above your authorization level. Gate A excluded it before retrieval, so nothing restricted reached the model."}
                  </p>

                  {/* Strata Clearance Gap Diagram */}
                  <div className="mt-3.5 flex items-center gap-3">
                    <Strata
                      level={persona.clearanceLevel}
                      ceiling={ceiling}
                      size="lg"
                    />
                    <span className="text-xs text-muted-foreground">
                      Compartment ceiling: L{ceiling}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-deny/20 flex items-center justify-between text-xs">
                <div className="text-[11px] text-muted-foreground font-mono">
                  Reason:{" "}
                  <span className="text-foreground">
                    {message.refusalReason || "UNAUTHORIZED_SCOPE"}
                  </span>
                </div>
                {onRequestAccess && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRequestAccess(message.vaultSlug)}
                    className="text-xs h-7 border-hold/40 text-hold hover:bg-hold/10"
                  >
                    <Session size={12} className="mr-1.5" />
                    Request Temporary Access
                  </Button>
                )}
              </div>
            </div>
          )
        ) : (
          /* Normal Grounded Answer */
          <div className="text-foreground">
            {renderFormattedContent(message.content, message.citations)}
          </div>
        )}

        {/* Sources Used Block (§6.5) */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-3.5 pt-3.5 border-t border-border/40 space-y-2.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>Sources Used</span>
              <span className="text-[10px] text-trust flex items-center gap-1 font-mono">
                <Verify size={12} />
                Exact quotes verified
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {message.citations.map((cit, idx) => {
                const ev = message.evidenceItems?.find(
                  (e) => e.evidence_id === cit.evidence_id
                )
                const prov = ev?.provenance || {}
                const modality = cit.modality || prov.modality || "document"
                const mediaUrl = cit.media_url || prov.media_url
                const keyframeUrl = cit.keyframe_url || prov.keyframe_url
                const timestamp = cit.timestamp || prov.timestamp

                const isImage = modality === "image"
                const isVideo = modality === "video"
                const isAudio = modality === "audio"
                const isCode = modality === "code"

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (ev) openEvidenceInspector(ev)
                    }}
                    className="text-left p-2.5 rounded-xl border border-border/80 bg-surface hover:bg-secondary/60 hover:border-trust/40 transition-all group flex items-start justify-between gap-2.5 cursor-pointer sealed"
                  >
                    {/* Multimodal Preview Thumbnail / Glyph */}
                    {isImage && mediaUrl ? (
                      <div className="h-12 w-12 rounded-lg overflow-hidden border border-border shrink-0 bg-black/40">
                        <AuthenticatedMedia
                          mediaUrl={mediaUrl}
                          alt="Evidence thumbnail"
                          modality="image"
                          className="h-full w-full"
                          imageClassName="h-full w-full object-cover"
                          allowZoom={false}
                        />
                      </div>
                    ) : isVideo && keyframeUrl ? (
                      <div className="relative h-12 w-16 rounded-lg overflow-hidden border border-border shrink-0 bg-black/40">
                        <AuthenticatedMedia
                          mediaUrl={keyframeUrl}
                          alt="Video keyframe"
                          modality="image"
                          className="h-full w-full"
                          imageClassName="h-full w-full object-cover"
                          allowZoom={false}
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
                          <Play size={14} className="text-white fill-white/80" />
                        </div>
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border border-border bg-secondary mt-0.5 text-muted-foreground group-hover:text-foreground">
                        {isImage ? (
                          <Frame size={16} />
                        ) : isVideo ? (
                          <Reel size={16} />
                        ) : isAudio ? (
                          <Wave size={16} />
                        ) : isCode ? (
                          <Brackets size={16} />
                        ) : (
                          <Sheet size={16} />
                        )}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground group-hover:text-trust transition-colors">
                        <span className="truncate">{cit.vault_name || "Document"}</span>
                        <Badge
                          variant="clearance"
                          className="text-[9px] py-0 px-1 font-mono"
                        >
                          {cit.locator || `[${cit.citation_id}]`}
                        </Badge>
                        {timestamp && (
                          <span className="text-[9px] font-mono px-1 rounded border border-border text-muted-foreground bg-secondary">
                            {timestamp}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 italic">
                        "{cit.quote}"
                      </p>
                    </div>

                    <ChevronRight size={14} className="text-muted-foreground/60 group-hover:text-foreground shrink-0 mt-1" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Security Summary & Run Details Component */}
        {message.securityTrace && (
          <div className="pt-1.5 flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => openTraceInspector(message.securityTrace!)}
                className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors group cursor-pointer"
              >
                <Verify size={13} className="text-trust" />
                <span>Gate Path:</span>
                <span className="font-mono text-foreground font-medium">
                  Gate A ({message.securityTrace.gate_a?.candidates_count ?? 0}) ▸ Gate B (
                  {message.securityTrace.gate_b?.authorized_count ?? 0})
                </span>
                <span className="text-muted-foreground">· Inspect trace</span>
              </button>

              {/* Per-Answer Run Details Popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary/80 hover:bg-secondary text-foreground text-[10px] font-mono border border-border/60 transition-colors"
                  >
                    <Info className="h-3 w-3 text-primary" />
                    <span>Run details</span>
                    {typeof message.securityTrace.elapsed_seconds === "number" && (
                      <span className="text-muted-foreground">
                        ({message.securityTrace.elapsed_seconds.toFixed(2)}s)
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-80 p-3 space-y-2.5 text-xs bg-surface-raised border border-border shadow-xl">
                  <div className="font-semibold text-foreground flex items-center justify-between border-b border-border/40 pb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5 text-primary" />
                      Execution Run Details
                    </span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">
                      {message.securityTrace.effective_retrieval_mode || message.retrievalMode || "LOW"}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 text-[11px] font-mono">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Requested Mode:</span>
                      <span className="text-foreground font-semibold">{message.retrievalMode || "LOW"}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Effective Mode:</span>
                      <span className="text-foreground font-semibold">
                        {message.securityTrace.effective_retrieval_mode || message.securityTrace.retrieval_mode || message.retrievalMode || "LOW"}
                      </span>
                    </div>
                    {typeof message.securityTrace.elapsed_seconds === "number" && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Elapsed Time:</span>
                        <span className="text-foreground font-semibold">
                          {message.securityTrace.elapsed_seconds.toFixed(2)} s
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Vault Scope:</span>
                      <span className="text-foreground truncate max-w-[150px]">
                        {message.vaultSlug || "default"}
                      </span>
                    </div>
                    {message.selectedFileName && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>File Scope:</span>
                        <span className="text-foreground truncate max-w-[150px]">
                          {message.selectedFileName}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-muted-foreground">
                      <span>Gate A Candidates:</span>
                      <span className="text-foreground font-semibold">
                        {message.securityTrace.gate_a?.candidates_count ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Gate B Authorized:</span>
                      <span className="text-foreground font-semibold">
                        {message.securityTrace.gate_b?.authorized_count ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Verified Citations:</span>
                      <span className="text-foreground font-semibold">
                        {message.citations?.length || message.securityTrace.grounding?.citations_count || 0}
                      </span>
                    </div>
                  </div>
                  <div className="pt-1.5 border-t border-border/40 text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-trust" />
                    <span>Mode locked and executed deterministically</span>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              {(message.securityTrace as any)?.lease_deadline && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  Lease: {new Date((message.securityTrace as any).lease_deadline).toLocaleTimeString()}
                </span>
              )}
              <span className="text-[10px] font-mono text-trust flex items-center gap-1">
                <Lock size={10} />
                Closed world · sealed
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
