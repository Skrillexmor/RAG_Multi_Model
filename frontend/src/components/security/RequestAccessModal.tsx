import React, { useState } from "react"
import { KeyRound, ShieldAlert, Check, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog"
import { Button } from "../ui/button"
import { api } from "../../lib/api"
import { useApp } from "../../context/AppContext"
import { toast } from "sonner"

interface RequestAccessModalProps {
  isOpen: boolean
  onClose: () => void
  initialVaultSlug?: string
  onRequestSubmitted: () => void
}

export const RequestAccessModal: React.FC<RequestAccessModalProps> = ({
  isOpen,
  onClose,
  initialVaultSlug,
  onRequestSubmitted,
}) => {
  const { vaults } = useApp()
  const [step, setStep] = useState<1 | 2>(1)
  const [vaultId, setVaultId] = useState<string>(
    vaults.find((v) => v.slug === initialVaultSlug)?.vault_id || vaults[0]?.vault_id || "v_alpha"
  )
  const [durationMinutes, setDurationMinutes] = useState<number>(60)
  const [purpose, setPurpose] = useState<string>("quarterly_audit_reconciliation")
  const [justification, setJustification] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const handleSubmit = async () => {
    if (!justification.trim()) {
      toast.error("Please provide a business justification.")
      return
    }

    setIsSubmitting(true)
    try {
      await api.createAccessRequest({
        vault_id: vaultId,
        requested_actions: ["query_rag", "retrieve_evidence", "view_source"],
        duration_minutes: durationMinutes,
        purpose: `${purpose}: ${justification.trim()}`,
      })
      toast.success("Access request submitted!", {
        description: "A peer approval from a data owner or security admin is required.",
      })
      onRequestSubmitted()
      onClose()
      setStep(1)
      setJustification("")
    } catch (err: any) {
      toast.error(`Request failed: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-400" />
            <DialogTitle className="text-base font-semibold">
              Request Temporary JIT Access (§14)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Step {step} of 2: {step === 1 ? "Target Workspace & Duration" : "Purpose & Justification"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 text-xs space-y-4">
          {step === 1 ? (
            /* Step 1: Target & Duration */
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Target Vault / Workspace
                </label>
                <select
                  value={vaultId}
                  onChange={(e) => setVaultId(e.target.value)}
                  className="w-full h-8 px-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none"
                >
                  {vaults.map((v) => (
                    <option key={v.vault_id} value={v.vault_id}>
                      {v.display_name} ({v.slug}) - Ceiling L{v.classification_ceiling}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Access Duration
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full h-8 px-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none"
                >
                  <option value={15}>15 Minutes (Emergency incident)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>60 Minutes (Standard audit)</option>
                  <option value={120}>2 Hours</option>
                </select>
              </div>

              <div className="p-3 rounded-lg border border-border bg-surface-subtle/50 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Requested Permissions:</span>{" "}
                Query RAG, Retrieve Evidence, View Source. (Export/Download prohibited by policy).
              </div>
            </div>
          ) : (
            /* Step 2: Purpose & Justification */
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Standard Business Purpose
                </label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full h-8 px-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none"
                >
                  <option value="quarterly_audit_reconciliation">
                    Quarterly Audit Reconciliation
                  </option>
                  <option value="security_incident_investigation">
                    Security Incident Investigation
                  </option>
                  <option value="engineering_architecture_review">
                    Engineering Architecture Review
                  </option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Specific Justification (Audited)
                </label>
                <textarea
                  rows={3}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explain why this access is required for your role..."
                  className="w-full p-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none resize-none"
                />
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-800/40 bg-amber-950/20 text-[11px] text-amber-300">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Four-Eyes Rule: Requester cannot approve their own request.</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 2 ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
                className="text-xs"
              >
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!justification.trim() || isSubmitting}
                className="text-xs gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Submit Request</span>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => setStep(2)}
                className="text-xs"
              >
                Continue
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
