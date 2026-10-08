import React, { useState, useEffect } from "react"
import { KeyRound, ShieldAlert, Check, Loader2, FolderLock, FileText, UserCheck, ShieldCheck } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { api } from "../../lib/api"
import { useApp } from "../../context/AppContext"
import { VaultDocument } from "../../types"
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
  const { vaults, persona } = useApp()
  const [step, setStep] = useState<1 | 2>(1)
  
  const initialV = vaults.find((v) => v.slug === initialVaultSlug) || vaults[0]
  const [vaultId, setVaultId] = useState<string>(initialV?.vault_id || "v_alpha")
  
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string>("ALL")
  const [durationMinutes, setDurationMinutes] = useState<number>(60)
  const [purpose, setPurpose] = useState<string>("project_collaboration")
  const [justification, setJustification] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const currentVault = vaults.find((v) => v.vault_id === vaultId) || initialV

  // Load documents for current vault
  useEffect(() => {
    if (!currentVault) return
    if (currentVault.documents && currentVault.documents.length > 0) {
      setVaultDocs(currentVault.documents)
    } else {
      api
        .getVaultDocuments(currentVault.slug)
        .then((res) => setVaultDocs(res.documents || []))
        .catch(() => setVaultDocs([]))
    }
  }, [vaultId, currentVault])

  const handleSubmit = async () => {
    if (!justification.trim()) {
      toast.error("Please provide a business justification.")
      return
    }

    setIsSubmitting(true)
    try {
      const selectedDoc = vaultDocs.find((d) => d.resource_id === selectedDocId)
      const selector = selectedDocId === "ALL" ? { all: true } : { resource_id: selectedDocId, filename: selectedDoc?.title }

      await api.createAccessRequest({
        vault_id: vaultId,
        requested_actions: ["action:query_rag", "action:retrieve_evidence", "action:view_source"],
        duration_minutes: durationMinutes,
        purpose: `${purpose}: ${justification.trim()}`,
      })

      const targetLabel = selectedDoc ? selectedDoc.title : currentVault?.display_name || "folder"
      toast.success("Access request submitted!", {
        description: `Request for ${targetLabel} sent to owner (${currentVault?.owner_id || "system"}) for review.`,
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

  const selectedDocObj = vaultDocs.find((d) => d.resource_id === selectedDocId)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-lg bg-surface-raised border-border text-foreground shadow-2xl p-6">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Request Temporary JIT Access
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Step {step} of 2: {step === 1 ? "Target Folder, Owner & File Scope" : "Purpose & Security Justification"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-3 text-xs space-y-4">
          {step === 1 ? (
            /* Step 1: Target Folder, Owner, and File Scope */
            <div className="space-y-3.5">
              {/* Folder Selector */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Target Knowledge Folder
                </label>
                <select
                  value={vaultId}
                  onChange={(e) => {
                    setVaultId(e.target.value)
                    setSelectedDocId("ALL")
                  }}
                  className="w-full h-8.5 px-2.5 rounded-lg bg-surface-subtle border border-border text-xs text-foreground outline-none"
                >
                  {vaults.map((v) => (
                    <option key={v.vault_id} value={v.vault_id}>
                      {v.display_name} ({v.slug}) - Ceiling L{v.classification_ceiling}
                    </option>
                  ))}
                </select>
              </div>

              {/* Folder Owner & Metadata Card */}
              {currentVault && (
                <div className="p-3 rounded-xl border border-border/70 bg-surface-subtle/50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                      <FolderLock className="h-3.5 w-3.5 text-emerald-400" />
                      {currentVault.display_name}
                    </span>
                    <Badge variant="clearance" className="text-[10px] py-0 px-1 font-mono">
                      Ceiling L{currentVault.classification_ceiling}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="h-3 w-3 text-emerald-400" />
                      <span>
                        Folder Owner:{" "}
                        <strong className="text-foreground font-mono">
                          {currentVault.owner_id || "System"}
                        </strong>
                      </span>
                    </div>
                    <div>
                      <span>Origin: </span>
                      <strong className="text-foreground capitalize">{currentVault.origin || "Local"}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* File Scope Selector */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Which File Do You Want Access To?
                </label>
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full h-8.5 px-2.5 rounded-lg bg-surface-subtle border border-border text-xs text-foreground outline-none"
                >
                  <option value="ALL">📁 All Files in this Folder</option>
                  {vaultDocs.map((doc) => (
                    <option key={doc.resource_id} value={doc.resource_id}>
                      📄 {doc.title} (Clearance L{doc.classification})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {selectedDocId === "ALL"
                    ? "Requests umbrella query access to all authorized documents in this folder."
                    : `Scoped strictly to document: ${selectedDocObj?.title || selectedDocId}`}
                </p>
              </div>

              {/* Access Duration */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Access Duration
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full h-8.5 px-2.5 rounded-lg bg-surface-subtle border border-border text-xs text-foreground outline-none"
                >
                  <option value={15}>15 Minutes (Emergency incident inspection)</option>
                  <option value={30}>30 Minutes</option>
                  <option value={60}>1 Hour (Standard research query)</option>
                  <option value={120}>2 Hours</option>
                  <option value={240}>4 Hours (Half day)</option>
                  <option value={1440}>24 Hours (Full day)</option>
                </select>
              </div>

              <div className="p-2.5 rounded-lg border border-border/70 bg-surface-subtle/30 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">Requested Permissions:</span> Query RAG, Retrieve Evidence, View Source.
              </div>
            </div>
          ) : (
            /* Step 2: Purpose & Justification */
            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Business Purpose
                </label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full h-8.5 px-2.5 rounded-lg bg-surface-subtle border border-border text-xs text-foreground outline-none"
                >
                  <option value="project_collaboration">Project Collaboration & Review</option>
                  <option value="quarterly_audit_reconciliation">Quarterly Audit Reconciliation</option>
                  <option value="security_incident_investigation">Security Incident Investigation</option>
                  <option value="engineering_architecture_review">Engineering Architecture Review</option>
                  <option value="regulatory_compliance_check">Regulatory Compliance Check</option>
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
                  placeholder="Explain why your role requires temporary access to this file or folder..."
                  className="w-full p-2.5 rounded-lg bg-surface-subtle border border-border text-xs text-foreground outline-none resize-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Peer Review Workflow</span>
                </div>
                <p className="text-muted-foreground leading-relaxed text-[10px]">
                  Request will be routed to folder owner (<span className="text-foreground font-mono">{currentVault?.owner_id}</span>) and security administrators. Once approved, you will receive signed cryptographic authorization.
                </p>
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
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium gap-1.5"
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
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
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
