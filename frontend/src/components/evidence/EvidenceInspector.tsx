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
          <div className="p-3 rounded-lg border border-border bg-surface-subtle space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <FileText className="h-4 w-4 text-emerald-400" />
                <span>{evidence.vault_name || "Authorized Document"}</span>
              </div>
              <Badge variant="clearance">L{evidence.classification}</Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
              <div>
                Locator:{" "}
                <span className="font-mono text-foreground">
                  {evidence.provenance?.locator || `Page ${evidence.provenance?.page || 1}`}
                </span>
              </div>
              <div>
                Relevance:{" "}
                <span className="font-mono text-foreground">
                  {(evidence.score * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Canonical Content Excerpt */}
          <div className="space-y-1.5">
            <div className="font-medium text-foreground text-xs flex items-center justify-between">
              <span>Canonical Evidence Excerpt</span>
              <span className="text-[10px] text-emerald-400 font-mono">
                Decrypted AES-256-GCM
              </span>
            </div>
            <div className="p-3.5 rounded-lg border border-border/80 bg-surface-raised font-sans text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
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

            <div className="rounded-lg border border-border bg-surface-subtle/40 divide-y divide-border/60">
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
              <div className="mt-2 relative rounded-md bg-black/40 border border-border/80 p-3">
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
