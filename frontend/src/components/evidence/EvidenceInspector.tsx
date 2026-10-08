import React, { useState } from "react"
import {
  CheckCircle2,
  ShieldCheck,
  FileText,
  Lock,
  Hash,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as AudioIcon,
  Code as CodeIcon,
  Volume2,
} from "lucide-react"
import { EvidenceItem } from "../../types"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"

interface EvidenceInspectorProps {
  evidence: EvidenceItem | null
  isOpen: boolean
  onClose: () => void
}

export const EvidenceInspector: React.FC<EvidenceInspectorProps> = ({
  evidence,
  isOpen,
  onClose,
}) => {
  const [showTechnicalProof, setShowTechnicalProof] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!evidence) return null

  const proof = evidence.proof
  const prov = evidence.provenance || {}
  const modality = prov.modality || "document"
  const mediaUrl = prov.media_url
  const keyframeUrl = prov.keyframe_url
  const timestamp = prov.timestamp

  const isImage = modality === "image"
  const isVideo = modality === "video"
  const isAudio = modality === "audio"
  const isCode = modality === "code"

  const handleCopyProof = () => {
    navigator.clipboard.writeText(JSON.stringify(proof, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-md md:max-w-lg">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <SheetTitle className="text-base font-semibold">
              Evidence & Provenance Inspector
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            Verified canonical evidence record passed through Gate A & Gate B authorization.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-5 text-xs">
          {/* Document & Provenance Header */}
          <div className="p-3 rounded-xl border border-border bg-surface-subtle space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <div className={`h-6 w-6 rounded-md flex items-center justify-center border ${
                  isImage ? "bg-indigo-500/10 border-indigo-500/25 text-indigo-400" :
                  isVideo ? "bg-amber-500/10 border-amber-500/25 text-amber-400" :
                  isAudio ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-400" :
                  isCode ? "bg-sky-500/10 border-sky-500/25 text-sky-400" :
                  "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                }`}>
                  {isImage ? <ImageIcon className="h-3.5 w-3.5" /> :
                   isVideo ? <VideoIcon className="h-3.5 w-3.5" /> :
                   isAudio ? <AudioIcon className="h-3.5 w-3.5" /> :
                   isCode ? <CodeIcon className="h-3.5 w-3.5" /> :
                   <FileText className="h-3.5 w-3.5" />}
                </div>
                <span className="truncate max-w-[200px]">{evidence.vault_name || "Authorized Document"}</span>
                <span className={`text-[9px] font-mono px-1 py-0.2 rounded border uppercase font-medium ${
                  isImage ? "border-indigo-500/30 text-indigo-300 bg-indigo-500/5" :
                  isVideo ? "border-amber-500/30 text-amber-300 bg-amber-500/5" :
                  isAudio ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/5" :
                  isCode ? "border-sky-500/30 text-sky-300 bg-sky-500/5" :
                  "border-border/60 text-muted-foreground bg-surface-raised"
                }`}>
                  {isImage ? "IMAGE" : isVideo ? "VIDEO" : isAudio ? "AUDIO" : isCode ? "CODE" : "DOC"}
                </span>
              </div>
              <Badge variant="clearance">L{evidence.classification}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
              <div>
                Locator:{" "}
                <span className="font-mono text-foreground">
                  {prov.locator || (prov.page ? `Page ${prov.page}` : "Verified Span")}
                </span>
              </div>
              <div>
                Relevance:{" "}
                <span className="font-mono text-emerald-400 font-medium">
                  {(evidence.score * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Multimodal Rich Evidence Previews */}
          {isImage && mediaUrl && (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-indigo-300">
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>Visual Evidence Source</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Gemma 3 Vision + EasyOCR
                </span>
              </div>
              <div className="rounded-xl overflow-hidden border border-border bg-black/40 p-2">
                <img
                  src={mediaUrl}
                  alt="Visual evidence"
                  className="max-h-56 mx-auto rounded-lg object-contain shadow-sm"
                />
              </div>
            </div>
          )}

          {isVideo && (keyframeUrl || mediaUrl) && (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-amber-300">
                  <VideoIcon className="h-3.5 w-3.5" />
                  <span>Video Keyframe {timestamp ? `[${timestamp}]` : ""}</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  OpenCV Keyframe & OCR
                </span>
              </div>
              <div className="rounded-xl overflow-hidden border border-border bg-black/40 p-2 space-y-2">
                {keyframeUrl && (
                  <img
                    src={keyframeUrl}
                    alt="Video keyframe"
                    className="max-h-52 mx-auto rounded-lg object-contain shadow-sm"
                  />
                )}
                {mediaUrl && (
                  <video src={mediaUrl} controls className="w-full rounded-lg" />
                )}
              </div>
            </div>
          )}

          {isAudio && mediaUrl && (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Audio Segment Playback {timestamp ? `[${timestamp}]` : ""}</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  AES-256 Storage
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-surface-subtle">
                <audio controls src={mediaUrl} className="w-full h-8" />
              </div>
            </div>
          )}

          {/* Canonical Content Excerpt */}
          <div className="space-y-1.5">
            <div className="font-medium text-foreground text-xs flex items-center justify-between">
              <span>Canonical Evidence Excerpt</span>
              <span className="text-[10px] text-emerald-400 font-mono">
                Decrypted AES-256-GCM
              </span>
            </div>
            <div className={`p-3.5 rounded-xl border border-border/80 bg-surface-raised font-sans text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap ${
              isCode ? "font-mono bg-black/30 border-sky-950/40" : ""
            }`}>
              {evidence.content || "Empty content"}
            </div>
          </div>

          {/* Authorization Proof Object Table (§22, §271) */}
          <div className="space-y-2">
            <div className="font-medium text-foreground text-xs flex items-center justify-between">
              <span>Authorization Proof Object</span>
              <Badge variant="success" className="text-[10px] py-0 px-1.5">
                {proof?.decision || "ALLOW"}
              </Badge>
            </div>

            <div className="rounded-xl border border-border bg-surface-subtle/40 divide-y divide-border/60 overflow-hidden">
              <div className="flex justify-between px-3 py-2 text-[11px]">
                <span className="text-muted-foreground">Evidence ID</span>
                <span className="font-mono text-foreground truncate max-w-[180px]">
                  {evidence.evidence_id}
                </span>
              </div>

              <div className="flex justify-between px-3 py-2 text-[11px]">
                <span className="text-muted-foreground">Principal</span>
                <span className="font-mono text-foreground">
                  {proof?.principal_id || "authenticated"}
                </span>
              </div>

              <div className="flex justify-between px-3 py-2 text-[11px]">
                <span className="text-muted-foreground">Policy & ACL Epoch</span>
                <span className="font-mono text-foreground">
                  v{proof?.policy_version || 1} / epoch {proof?.vault_epoch || 1}
                </span>
              </div>

              <div className="flex justify-between px-3 py-2 text-[11px]">
                <span className="text-muted-foreground">Clock Status</span>
                <span className="font-mono text-emerald-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {proof?.time_status || "OK"}
                </span>
              </div>

              <div className="flex justify-between px-3 py-2 text-[11px]">
                <span className="text-muted-foreground">Content SHA-256</span>
                <span className="font-mono text-foreground truncate max-w-[160px]">
                  {proof?.hash || "verified"}
                </span>
              </div>
            </div>
          </div>

          {/* Expandable Technical JSON (§11) */}
          <div className="pt-2 border-t border-border/60">
            <button
              onClick={() => setShowTechnicalProof(!showTechnicalProof)}
              className="w-full flex items-center justify-between py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Developer Details & Cryptographic Payload</span>
              {showTechnicalProof ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showTechnicalProof && (
              <div className="mt-2 relative rounded-xl bg-black/40 border border-border/80 p-3">
                <button
                  onClick={handleCopyProof}
                  className="absolute top-2 right-2 p-1 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
                  title="Copy JSON"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
                <pre className="font-mono text-[10px] text-muted-foreground overflow-x-auto max-h-48">
                  {JSON.stringify(proof, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
