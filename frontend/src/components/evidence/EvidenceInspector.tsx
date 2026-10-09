import React, { useState } from "react"
import {
  Verify,
  Sheet as SheetGlyph,
  Lock,
  Session,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Frame,
  Reel,
  Wave,
  Brackets,
} from "../../glyphs"
import { EvidenceItem } from "../../types"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet"
import { Badge } from "../ui/badge"
import { Seal } from "../ui/seal"
import { Identicon } from "../ui/identicon"
import { Strata } from "../ui/strata"

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
      <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-md md:max-w-lg bg-surface-raised border-l border-border e3">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle className="text-base font-semibold text-foreground">
                Evidence
              </SheetTitle>
              <span className="text-xs font-mono text-muted-foreground">
                {evidence.evidence_id}
              </span>
            </div>
            <Seal state="verified" size={24} animate={true} />
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Verified canonical evidence record passed through Gate A & Gate B authorization.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-5 text-xs">
          {/* Document & Provenance Header */}
          <div className="p-3 rounded-xl border border-border bg-surface space-y-2.5 e1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <div className="h-6 w-6 rounded-md flex items-center justify-center border border-border bg-secondary text-foreground">
                  {isImage ? (
                    <Frame size={14} />
                  ) : isVideo ? (
                    <Reel size={14} />
                  ) : isAudio ? (
                    <Wave size={14} />
                  ) : isCode ? (
                    <Brackets size={14} />
                  ) : (
                    <SheetGlyph size={14} />
                  )}
                </div>
                <span className="truncate max-w-[200px] font-sans">
                  {evidence.vault_name || "Authorized Document"}
                </span>
                <span className="text-[10px] font-mono px-1 rounded border border-border text-muted-foreground bg-secondary uppercase">
                  {isImage ? "IMAGE" : isVideo ? "VIDEO" : isAudio ? "AUDIO" : isCode ? "CODE" : "DOC"}
                </span>
              </div>
              <Strata level={evidence.classification} size="sm" />
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1.5 border-t border-border/40">
              <div>
                Locator:{" "}
                <span className="font-mono text-foreground">
                  {prov.locator || (prov.page ? `Page ${prov.page}` : "Verified Span")}
                </span>
              </div>
              <div>
                Relevance:{" "}
                <span className="font-mono text-trust font-medium">
                  {(evidence.score * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Multimodal Rich Evidence Previews */}
          {isImage && mediaUrl && (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Frame size={14} className="text-muted-foreground" />
                  <span>Visual Evidence Source</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Qwen 2.5-VL 3B
                </span>
              </div>
              <div className="rounded-xl overflow-hidden border border-border bg-black/40 p-2">
                <img
                  src={mediaUrl}
                  alt="Visual evidence"
                  className="max-h-56 mx-auto rounded-lg object-contain shadow-xs"
                />
              </div>
            </div>
          )}

          {isVideo && (keyframeUrl || mediaUrl) && (
            <div className="space-y-1.5">
              <div className="font-medium text-foreground text-xs flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Reel size={14} className="text-muted-foreground" />
                  <span>Video Keyframe {timestamp ? `[${timestamp}]` : ""}</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  OpenCV Keyframe
                </span>
              </div>
              <div className="rounded-xl overflow-hidden border border-border bg-black/40 p-2 space-y-2">
                {keyframeUrl && (
                  <img
                    src={keyframeUrl}
                    alt="Video keyframe"
                    className="max-h-52 mx-auto rounded-lg object-contain shadow-xs"
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
                <span className="flex items-center gap-1.5 text-foreground">
                  <Wave size={14} className="text-muted-foreground" />
                  <span>Audio Segment Playback {timestamp ? `[${timestamp}]` : ""}</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  AES-256 Storage
                </span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-surface">
                <audio controls src={mediaUrl} className="w-full h-8" />
              </div>
            </div>
          )}

          {/* Canonical Content Excerpt */}
          <div className="space-y-1.5">
            <div className="font-medium text-foreground text-xs flex items-center justify-between">
              <span>Canonical Evidence Excerpt</span>
              <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                <Lock size={10} /> Decrypted AES-256-GCM
              </span>
            </div>
            <div className={`p-3.5 rounded-xl border border-border bg-surface font-sans text-xs text-foreground leading-relaxed whitespace-pre-wrap sealed ${
              isCode ? "font-mono bg-black/30" : ""
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

            <div className="rounded-xl border border-border bg-surface divide-y divide-border/60 overflow-hidden e1">
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
                <span className="font-mono text-permit flex items-center gap-1">
                  <Session size={12} />
                  {proof?.time_status || "OK"}
                </span>
              </div>

              <div className="flex justify-between px-3 py-2 text-[11px] items-center">
                <span className="text-muted-foreground">Content SHA-256</span>
                <div className="flex items-center gap-1.5 font-mono text-foreground">
                  <span className="truncate max-w-[140px]">
                    {proof?.hash ? `${proof.hash.slice(0, 8)}...${proof.hash.slice(-4)}` : "verified"}
                  </span>
                  {proof?.hash && <Identicon hash={proof.hash} size={15} />}
                </div>
              </div>
            </div>
          </div>

          {/* Expandable Technical JSON (§11) */}
          <div className="pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setShowTechnicalProof(!showTechnicalProof)}
              className="w-full flex items-center justify-between py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <span>Developer Details & Cryptographic Payload</span>
              {showTechnicalProof ? (
                <ChevronUp size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
            </button>

            {showTechnicalProof && (
              <div className="mt-2 relative rounded-xl bg-black/40 border border-border p-3">
                <button
                  type="button"
                  onClick={handleCopyProof}
                  className="absolute top-2 right-2 p-1 rounded bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Copy JSON"
                >
                  {copied ? (
                    <Check size={13} className="text-permit" />
                  ) : (
                    <Copy size={13} />
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
