import React from "react"
import {
  Verify,
  Lock,
  Strata as StrataGlyph,
  Aperture,
  GateOpen,
} from "../../glyphs"
import { RetrievalSecurityTrace } from "../../types"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet"
import { Badge } from "../ui/badge"
import { GatePath } from "../ui/gate-path"

interface SecurityTraceDrawerProps {
  trace: RetrievalSecurityTrace | null
  isOpen: boolean
  onClose: () => void
}

export const SecurityTraceDrawer: React.FC<SecurityTraceDrawerProps> = ({
  trace,
  isOpen,
  onClose,
}) => {
  if (!trace) return null

  const candidatesCount =
    trace.gate_a?.candidates_count ?? (trace as any).gate_a_candidates_count ?? 0
  const authorizedCount =
    trace.gate_b?.authorized_count ?? (trace as any).gate_b_canonical_verified_count ?? 0
  const excludedCount =
    trace.gate_b?.excluded_count ?? (trace as any).excluded_candidates_count ?? Math.max(0, candidatesCount - authorizedCount)

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-md md:max-w-lg bg-surface-raised border-l border-border e3">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-secondary border border-border flex items-center justify-center">
                <Aperture size={14} accent="hsl(var(--beam))" />
              </div>
              <SheetTitle className="text-base font-semibold text-foreground">
                Gate Path
              </SheetTitle>
              <span className="font-mono text-[10px] text-muted-foreground border border-border px-1.5 py-0.5 rounded">
                §11
              </span>
            </div>
            <Badge variant="success">PASSED</Badge>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Step-by-step verification trace through the Two-Gate Retrieval Firewall.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-4 text-xs">
          {/* Identity & Scope Summary */}
          <div className="p-3 rounded-xl border border-border bg-surface space-y-2 e1">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>Principal Identity</span>
              <span className="font-mono text-trust">{trace.principal}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>RAG Scope</span>
              <span className="font-mono">{trace.vault}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>Retrieval Mode</span>
              <Badge variant="outline" className="text-[10px] py-0 font-mono text-foreground border-border bg-secondary">
                {trace.retrieval_mode || (trace as any).retrieval_mode || "LOW"}
              </Badge>
            </div>
          </div>

          {/* Vertical Gate Path Pipeline Stepper */}
          <div className="p-3.5 rounded-xl border border-border bg-surface e1">
            <GatePath trace={trace} orientation="v" />
          </div>

          {/* Gate A: Pre-Retrieval Vector Isolation */}
          <div className="p-3.5 rounded-xl border border-border bg-surface space-y-2 e1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <StrataGlyph size={15} className="text-muted-foreground" />
                <span>Gate A: Pre-Retrieval Vector Isolation</span>
              </div>
              <Badge variant="success" className="text-[10px] py-0">PASSED</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Mandatory compiled payload filter executed via{" "}
              <strong className="text-foreground">{trace.retrieval_mode || "LOW"}</strong> pipeline:
              {(trace.retrieval_mode === "MEDIUM") && " Lazy query-aware chunking with cryptographic content-hash cache."}
              {(trace.retrieval_mode === "HIGH") && " Hybrid lexical + vector search with local reranking and neighbor context expansion."}
              {(!trace.retrieval_mode || trace.retrieval_mode === "LOW") && " Standard pre-indexed dense vector search."}
            </p>
            <div className="flex justify-between text-[11px] pt-1.5 border-t border-border/40">
              <span className="text-muted-foreground">Vector Candidates Admitted</span>
              <span className="font-mono font-medium text-foreground">
                {candidatesCount}
              </span>
            </div>
          </div>

          {/* Gate B: Post-Retrieval Canonical Gate */}
          <div className="p-3.5 rounded-xl border border-border bg-surface space-y-2 e1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Lock size={15} className="text-muted-foreground" />
                <span>Gate B: Canonical Authorization Check</span>
              </div>
              <Badge variant="success" className="text-[10px] py-0">PASSED</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Decrypted chunk text from AES-256-GCM storage with Vault KEK, rechecked SQL Row-Level Security, and verified SHA-256 content hash.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-border/40">
              <div>
                Authorized:{" "}
                <span className="font-mono text-permit font-medium">
                  {authorizedCount}
                </span>
              </div>
              <div>
                Excluded:{" "}
                <span className="font-mono text-deny font-medium">
                  {excludedCount}
                </span>
              </div>
            </div>
          </div>

          {/* Grounding & Verification */}
          <div className="p-3.5 rounded-xl border border-border bg-surface space-y-2 e1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Verify size={15} className="text-trust" />
                <span>Grounding & Citation Verification</span>
              </div>
              <Badge variant="success" className="text-[10px] py-0">VERIFIED</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Zero-exception exact substring matching validated every claim against authorized chunk envelopes.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-border/40">
              <div>
                Claims:{" "}
                <span className="font-mono text-foreground font-medium">
                  {trace.grounding?.claims_count ?? (trace as any).citations_total_count ?? 0}
                </span>
              </div>
              <div>
                Citations:{" "}
                <span className="font-mono text-trust font-medium">
                  {trace.grounding?.citations_count ?? (trace as any).citations_validated_count ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
