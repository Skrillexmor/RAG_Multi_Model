import React from "react"
import { cn } from "../../lib/utils"
import { RetrievalSecurityTrace } from "../../types"
import { Verify, GateOpen, GateClosed } from "../../glyphs"

export interface GatePathProps {
  trace?: RetrievalSecurityTrace | null
  pending?: boolean
  depth?: "LOW" | "MEDIUM" | "HIGH"
  orientation?: "h" | "v"
  className?: string
}

export const GatePath: React.FC<GatePathProps> = ({
  trace,
  pending = false,
  depth = "LOW",
  orientation = "h",
  className,
}) => {
  const isVertical = orientation === "v"

  const gateA = trace?.gate_a
  const gateB = trace?.gate_b
  const grounding = trace?.grounding

  const candidates = gateA?.candidates_count ?? 0
  const authorized = gateB?.authorized_count ?? 0
  const excluded = gateB?.excluded_count ?? Math.max(0, candidates - authorized)

  if (isVertical) {
    return (
      <div className={cn("flex flex-col gap-3 text-xs", className)}>
        {/* Step 1: Gate A */}
        <div className="flex items-start gap-3 relative pb-4">
          <div className="w-[1.5px] bg-border absolute left-3 top-6 bottom-0" />
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-secondary border border-border z-10 shrink-0">
            {pending ? (
              <span className="w-2 h-2 rounded-full bg-beam animate-ping" />
            ) : gateA?.compiled_filter_valid ? (
              <GateOpen size={13} className="text-permit" />
            ) : (
              <GateClosed size={13} className="text-deny" />
            )}
          </div>
          <div>
            <div className="font-medium text-foreground flex items-center gap-2">
              Gate A: Compiled Filter
              <span className="text-[11px] font-mono text-muted-foreground">
                {candidates} candidates
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Pre-retrieval identity & compartment ceiling validation
            </div>
          </div>
        </div>

        {/* Step 2: Gate B */}
        <div className="flex items-start gap-3 relative pb-4">
          <div className="w-[1.5px] bg-border absolute left-3 top-6 bottom-0" />
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-secondary border border-border z-10 shrink-0">
            {pending ? (
              <span className="w-2 h-2 rounded-full bg-beam" />
            ) : authorized > 0 ? (
              <GateOpen size={13} className="text-permit" />
            ) : (
              <GateClosed size={13} className="text-deny" />
            )}
          </div>
          <div>
            <div className="font-medium text-foreground flex items-center gap-2">
              Gate B: Canonical Recheck
              <span className="text-[11px] font-mono text-muted-foreground">
                {authorized} authorized • {excluded} excluded
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Post-retrieval chunk ACL & lease deadline verification
            </div>
          </div>
        </div>

        {/* Step 3: Grounding */}
        <div className="flex items-start gap-3 relative">
          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-secondary border border-border z-10 shrink-0">
            {grounding ? (
              <Verify size={13} className="text-trust" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            )}
          </div>
          <div>
            <div className="font-medium text-foreground flex items-center gap-2">
              Grounding & Provenance
              <span className="text-[11px] font-mono text-muted-foreground">
                {grounding?.citations_count ?? 0} citations
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Strict verbatim quotation check & DLP output guard
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Horizontal layout
  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-surface-raised p-3 text-xs flex flex-col gap-2.5",
        className
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="font-sans font-medium text-foreground">Gate Path</span>
          <span>•</span>
          <span>Mode: {depth}</span>
        </div>
        {pending ? (
          <span className="text-beam flex items-center gap-1.5 font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-beam animate-ping" />
            Passing security gates...
          </span>
        ) : (
          <span className="text-trust flex items-center gap-1 font-sans font-medium">
            <Verify size={13} /> Closed-world verified
          </span>
        )}
      </div>

      {/* Funnel bars */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Gate A Candidates</span>
            <span className="font-mono font-medium text-foreground">
              {candidates}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-trust rounded-full transition-all duration-500"
              style={{ width: candidates > 0 ? "100%" : "0%" }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Gate B Authorized</span>
            <span className="font-mono font-medium text-foreground">
              {authorized}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-permit rounded-full transition-all duration-500"
              style={{
                width: candidates > 0 ? `${Math.round((authorized / candidates) * 100)}%` : "0%",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
