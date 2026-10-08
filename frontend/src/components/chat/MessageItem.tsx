import React from "react"
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Lock,
  ExternalLink,
  ChevronRight,
  Info,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as AudioIcon,
  Code as CodeIcon,
  Play,
} from "lucide-react"
import { Message, CitationRef, EvidenceItem } from "../../types"
import { useApp } from "../../context/AppContext"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"

interface MessageItemProps {
  message: Message
  onRequestAccess?: (vaultSlug?: string) => void
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onRequestAccess,
}) => {
  const { openEvidenceInspector, openTraceInspector } = useApp()

  if (message.role === "user") {
    return (
      <div className="w-full py-4 flex justify-end">
        <div className="max-w-2xl px-4 py-2.5 rounded-2xl bg-secondary text-foreground text-sm leading-relaxed shadow-sm">
          {message.content}
        </div>
      </div>
    )
  }

  const isRefusal =
    message.mode === "REFUSAL" ||
    (message.refusalReason && message.refusalReason !== "NONE")

  // Enhanced Markdown & Citation parser
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
              className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-[11px] font-mono rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors cursor-pointer select-none font-medium align-baseline"
              title={`Citation ${citId}: Click to inspect verified proof`}
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
        // Inline code check
        if (token.startsWith("`") && token.endsWith("`")) {
          return (
            <code
              key={idx}
              className="px-1.5 py-0.5 rounded bg-surface-subtle border border-border/60 text-emerald-300 font-mono text-xs"
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
      <div className="space-y-2 text-sm leading-relaxed text-foreground">
        {lines.map((line, idx) => {
          const trimmed = line.trim()
          if (!trimmed) {
            return <div key={idx} className="h-1.5" />
          }

          // Header 3 or 2 or 1
          if (trimmed.startsWith("### ")) {
            return (
              <h4 key={idx} className="text-sm font-bold text-foreground mt-2 pb-0.5">
                {renderInline(trimmed.replace(/^###\s+/, ""))}
              </h4>
            )
          }
          if (trimmed.startsWith("## ")) {
            return (
              <h3 key={idx} className="text-base font-bold text-foreground mt-3 pb-0.5">
                {renderInline(trimmed.replace(/^##\s+/, ""))}
              </h3>
            )
          }
          if (trimmed.startsWith("# ")) {
            return (
              <h2 key={idx} className="text-lg font-bold text-foreground mt-3 pb-1">
                {renderInline(trimmed.replace(/^#\s+/, ""))}
              </h2>
            )
          }

          // Bullet list items
          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="text-emerald-400 mt-1.5 text-xs">•</span>
                <div className="flex-1">
                  {renderInline(trimmed.replace(/^[-*]\s+/, ""))}
                </div>
              </div>
            )
          }

          // Numbered list items
          const numMatch = trimmed.match(/^([0-9]+)\.\s+(.*)/)
          if (numMatch) {
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className="font-mono text-xs text-emerald-400/90 font-medium mt-0.5">
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
    <div className="w-full py-4 border-b border-border/30 last:border-none">
      <div className="max-w-3xl mx-auto space-y-3.5">
        {/* Assistant Header Badge */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground select-none">
          <div className="h-5 w-5 rounded-full bg-surface-subtle border border-border flex items-center justify-center">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
          </div>
          <span className="font-medium text-foreground">PrivateRAG</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-[11px]">
            {isRefusal ? "Policy Boundary Refusal" : "Verified Grounded Synthesis"}
          </span>
        </div>

        {/* Controlled Refusal State (§8.3) */}
        {isRefusal ? (
          <div className="p-4 rounded-xl border border-amber-800/40 bg-amber-950/20 text-foreground space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-amber-300">
                  Access-Controlled Information Boundary
                </h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {message.content ||
                    "This question requested information outside your current authorization scope. No restricted evidence was provided to the local model."}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-amber-800/30 flex items-center justify-between text-xs">
              <div className="text-[11px] text-muted-foreground">
                Reason:{" "}
                <span className="font-mono text-amber-200">
                  {message.refusalReason || "UNAUTHORIZED_SCOPE"}
                </span>
              </div>
              {onRequestAccess && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRequestAccess(message.vaultSlug)}
                  className="text-xs h-7 border-amber-800/50 text-amber-300 hover:bg-amber-950/40"
                >
                  <Lock className="h-3 w-3 mr-1.5" />
                  Request Temporary Access
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Normal Grounded Answer */
          <div className="text-sm text-foreground">
            {renderFormattedContent(message.content, message.citations)}
          </div>
        )}

        {/* Sources Used Block (§8.2) */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center justify-between">
              <span>Sources Used</span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                <CheckCircle2 className="h-3 w-3" />
                Exact Canonical Quotes Verified
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
                    onClick={() => {
                      if (ev) openEvidenceInspector(ev)
                    }}
                    className="text-left p-2.5 rounded-xl border border-border/70 bg-surface-subtle/50 hover:bg-surface-subtle hover:border-emerald-500/40 transition-all group flex items-start justify-between gap-2.5"
                  >
                    {/* Multimodal Preview Thumbnail / Icon */}
                    {isImage && mediaUrl ? (
                      <div className="h-12 w-12 rounded-lg overflow-hidden border border-border shrink-0 bg-black/40">
                        <img src={mediaUrl} alt="Evidence thumbnail" className="h-full w-full object-cover" />
                      </div>
                    ) : isVideo && keyframeUrl ? (
                      <div className="relative h-12 w-16 rounded-lg overflow-hidden border border-border shrink-0 bg-black/40">
                        <img src={keyframeUrl} alt="Video keyframe" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <Play className="h-3.5 w-3.5 text-white fill-white/80" />
                        </div>
                      </div>
                    ) : (
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border mt-0.5 ${
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
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground group-hover:text-emerald-400 transition-colors">
                        <span className="truncate">{cit.vault_name || "Document"}</span>
                        <Badge
                          variant="clearance"
                          className="text-[9px] py-0 px-1 font-mono"
                        >
                          {cit.locator || `[${cit.citation_id}]`}
                        </Badge>
                        {timestamp && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded border border-amber-500/30 text-amber-300 bg-amber-500/5">
                            {timestamp}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 italic">
                        "{cit.quote}"
                      </p>
                    </div>

                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 group-hover:text-foreground shrink-0 mt-1" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Security Summary Component (§39) */}
        {message.securityTrace && (
          <div className="pt-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <button
              onClick={() => openTraceInspector(message.securityTrace!)}
              className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors group cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>
                Gate A:{" "}
                <span className="font-mono text-foreground">
                  {message.securityTrace.gate_a?.candidates_count ?? (message.securityTrace as any).gate_a_candidates_count ?? 0}
                </span>{" "}
                candidates · Gate B:{" "}
                <span className="font-mono text-foreground">
                  {message.securityTrace.gate_b?.authorized_count ?? (message.securityTrace as any).gate_b_canonical_verified_count ?? 0}
                </span>{" "}
                authorized
              </span>
              <span className="text-[10px] text-muted-foreground group-hover:underline ml-1">
                (View security trace)
              </span>
            </button>

            <span className="font-mono text-[10px] text-muted-foreground/60">
              Closed-World Invariant ✓
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
