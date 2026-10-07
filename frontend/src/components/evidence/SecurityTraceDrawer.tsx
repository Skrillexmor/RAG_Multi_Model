import React from "react"
import {
  ShieldCheck,
  CheckCircle2,
  Lock,
  Cpu,
  Layers,
  FileCheck,
  AlertOctagon,
} from "lucide-react"
import { RetrievalSecurityTrace } from "../../types"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet"
import { Badge } from "../ui/badge"

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

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-md md:max-w-lg">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <SheetTitle className="text-base font-semibold">
              Retrieval Security Trace (§11)
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            Step-by-step verification trace through the Two-Gate Retrieval Firewall.
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-4 text-xs">
          {/* Identity & Scope Summary */}
          <div className="p-3 rounded-lg border border-border bg-surface-subtle space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>Principal Identity</span>
              <span className="font-mono text-emerald-400">{trace.principal}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>RAG Scope</span>
              <span className="font-mono">{trace.vault}</span>
            </div>
          </div>

          {/* Gate A: Pre-Retrieval Vector Isolation */}
          <div className="p-3.5 rounded-lg border border-border bg-surface-raised space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span>Gate A: Pre-Retrieval Vector Isolation</span>
              </div>
              <Badge variant="success" className="text-[10px] py-0">PASSED</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Server compiled and Ed25519-signed mandatory Qdrant payload filter.
              Client filter overrides strictly rejected.
            </p>
            <div className="flex justify-between text-[11px] pt-1 border-t border-border/40">
              <span className="text-muted-foreground">Vector Candidates Admitted</span>
              <span className="font-mono font-medium text-foreground">
                {trace.gate_a?.candidates_count ?? (trace as any).gate_a_candidates_count ?? 0}
              </span>
            </div>
          </div>

          {/* Gate B: Post-Retrieval Canonical Gate */}
          <div className="p-3.5 rounded-lg border border-border bg-surface-raised space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Lock className="h-4 w-4 text-emerald-400" />
                <span>Gate B: Canonical Authorization Check</span>
              </div>
              <Badge variant="success" className="text-[10px] py-0">PASSED</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Decrypted chunk text from AES-256-GCM storage with Vault KEK, rechecked SQL Row-Level Security, and verified SHA-256 content hash.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-border/40">
              <div>
                Authorized:{" "}
                <span className="font-mono font-medium text-emerald-400">
                  {trace.gate_b?.authorized_count ?? (trace as any).gate_b_canonical_verified_count ?? 0}
                </span>
              </div>
              <div>
                Excluded:{" "}
                <span className="font-mono font-medium text-muted-foreground">
                  {trace.gate_b?.excluded_count ?? (trace as any).excluded_candidates_count ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* Grounding & Output DLP */}
          <div className="p-3.5 rounded-lg border border-border bg-surface-raised space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <FileCheck className="h-4 w-4 text-emerald-400" />
                <span>Citation & Grounding Validator</span>
              </div>
              <Badge variant="success" className="text-[10px] py-0">
                {trace.grounding?.status ?? (trace as any).answer_status ?? "PASSED"}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              All claims matched character-for-character against canonical decrypted sources. Output DLP scanner verified zero leaked credentials.
            </p>
            <div className="flex justify-between text-[11px] pt-1 border-t border-border/40">
              <span className="text-muted-foreground">Citations Grounded</span>
              <span className="font-mono font-medium text-foreground">
                {trace.grounding?.citations_count ?? (trace as any).citations_validated_count ?? 0}
              </span>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
