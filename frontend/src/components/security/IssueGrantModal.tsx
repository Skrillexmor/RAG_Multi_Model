import React, { useState, useEffect } from "react"
import {
  KeyRound,
  ShieldCheck,
  Check,
  Loader2,
  FolderLock,
  FileText,
  User,
  Clock,
  Sparkles,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { api } from "../../lib/api"
import { useApp } from "../../context/AppContext"
import { DEMO_PERSONAS } from "../../lib/personas"
import { VaultDocument } from "../../types"
import { toast } from "sonner"

interface IssueGrantModalProps {
  isOpen: boolean
  onClose: () => void
  onGrantCreated: () => void
}

export const IssueGrantModal: React.FC<IssueGrantModalProps> = ({
  isOpen,
  onClose,
  onGrantCreated,
}) => {
  const { vaults, persona } = useApp()

  const [selectedGrantee, setSelectedGrantee] = useState<string>("charlie")
  const [selectedVaultId, setSelectedVaultId] = useState<string>("")
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string>("ALL")
  const [durationMinutes, setDurationMinutes] = useState<number>(60)
  const [isDelegable, setIsDelegable] = useState<boolean>(false)
  const [purpose, setPurpose] = useState<string>("ad_hoc_analysis")
  const [customPurpose, setCustomPurpose] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Initialize selected vault
  useEffect(() => {
    if (vaults.length > 0 && !selectedVaultId) {
      setSelectedVaultId(vaults[0].vault_id)
    }
  }, [vaults, selectedVaultId])

  // Fetch documents when vault changes
  useEffect(() => {
    if (!selectedVaultId) return
    const v = vaults.find((vault) => vault.vault_id === selectedVaultId)
    if (!v) return

    if (v.documents && v.documents.length > 0) {
      setVaultDocs(v.documents)
    } else {
      api
        .getVaultDocuments(v.slug)
        .then((res) => setVaultDocs(res.documents || []))
        .catch(() => setVaultDocs([]))
    }
    setSelectedDocId("ALL")
  }, [selectedVaultId, vaults])

  const handleSubmit = async () => {
    if (!selectedVaultId) {
      toast.error("Please select a target folder/vault.")
      return
    }

    const effectivePurpose =
      purpose === "custom"
        ? customPurpose.trim() || "Manual grant issued via console"
        : purpose.replace(/_/g, " ")

    setIsSubmitting(true)
    try {
      await api.createGrantDirect({
        grantee_id: selectedGrantee,
        vault_id: selectedVaultId,
        resource_id: selectedDocId !== "ALL" ? selectedDocId : undefined,
        actions: ["read"],
        duration_minutes: durationMinutes,
        delegable: isDelegable,
        purpose: effectivePurpose,
      })

      const targetDoc = vaultDocs.find((d) => d.resource_id === selectedDocId)
      toast.success("Cryptographic Grant Issued!", {
        description: `Signed with Ed25519 for ${selectedGrantee} on ${
          targetDoc ? targetDoc.title : "All Files"
        }`,
      })

      onGrantCreated()
      onClose()
    } catch (err: any) {
      toast.error(`Failed to issue grant: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const durationOptions = [
    { label: "30 Mins", minutes: 30 },
    { label: "1 Hour", minutes: 60 },
    { label: "4 Hours", minutes: 240 },
    { label: "24 Hours", minutes: 1440 },
    { label: "7 Days", minutes: 10080 },
  ]

  const purposeOptions = [
    { id: "ad_hoc_analysis", label: "Ad-hoc Evidence Analysis" },
    { id: "incident_response", label: "Security Incident Investigation" },
    { id: "cross_dept_collab", label: "Cross-Department Collaboration" },
    { id: "compliance_audit", label: "Formal Compliance Audit" },
    { id: "custom", label: "Custom Purpose" },
  ]

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-surface-raised border border-border text-foreground">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Issue Cryptographic Access Grant
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Issue an Ed25519-signed, time-bound JIT authorization grant (§35, NIST SP 800-162).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Grantee Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
              <User className="h-3 w-3 text-emerald-400" />
              <span>Grantee (Recipient)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEMO_PERSONAS.map((p) => {
                const isSelected = selectedGrantee.toLowerCase() === p.username.toLowerCase()
                return (
                  <button
                    key={p.username}
                    type="button"
                    onClick={() => setSelectedGrantee(p.username)}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-medium"
                        : "bg-surface border-border hover:bg-surface-subtle text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center font-bold text-[10px] shrink-0">
                      {p.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] leading-tight">{p.name}</div>
                      <div className="text-[9px] text-muted-foreground truncate">{p.roleTitle}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Vault Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
              <FolderLock className="h-3 w-3 text-indigo-400" />
              <span>Target Workspace / Folder</span>
            </label>
            <select
              value={selectedVaultId}
              onChange={(e) => setSelectedVaultId(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-emerald-500/50"
            >
              {vaults.map((v) => (
                <option key={v.vault_id} value={v.vault_id}>
                  {v.display_name} ({v.slug}) — Owner: {v.owner_id}
                </option>
              ))}
            </select>
          </div>

          {/* Granular File Scope */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-amber-400" />
                <span>Scope: File-Level or Folder-Wide</span>
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {selectedDocId === "ALL" ? "All Files Granted" : "1 Specific File"}
              </span>
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-emerald-500/50"
            >
              <option value="ALL">📁 All Files in this Folder (Folder-Wide Grant)</option>
              {vaultDocs.map((doc) => (
                <option key={doc.resource_id} value={doc.resource_id}>
                  📄 {doc.title} (Level {doc.classification})
                </option>
              ))}
            </select>
          </div>

          {/* Duration Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-sky-400" />
              <span>Time-Bound Duration (Automatic Expiry)</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {durationOptions.map((opt) => (
                <button
                  key={opt.minutes}
                  type="button"
                  onClick={() => setDurationMinutes(opt.minutes)}
                  className={`px-3 py-1 rounded-md text-xs border transition-colors ${
                    durationMinutes === opt.minutes
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-medium"
                      : "bg-surface border-border text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Purpose & Delegability */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                Justification Purpose
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-emerald-500/50"
              >
                {purposeOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 flex flex-col justify-end">
              <label className="flex items-center gap-2 p-2 rounded-lg border border-border bg-surface cursor-pointer hover:bg-surface-subtle">
                <input
                  type="checkbox"
                  checked={isDelegable}
                  onChange={(e) => setIsDelegable(e.target.checked)}
                  className="rounded border-border text-emerald-500 focus:ring-emerald-500 h-3.5 w-3.5"
                />
                <div className="text-[11px]">
                  <span className="font-medium text-foreground">Allow Sub-Delegation</span>
                  <div className="text-[9px] text-muted-foreground leading-tight">
                    Recipient can delegate to teammates
                  </div>
                </div>
              </label>
            </div>
          </div>

          {purpose === "custom" && (
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Custom Justification</label>
              <Input
                placeholder="e.g. Q4 Security audit review"
                value={customPurpose}
                onChange={(e) => setCustomPurpose(e.target.value)}
                className="text-xs h-8 bg-surface"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/60">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting} className="text-xs">
            Cancel
          </Button>
          <Button
            variant="security"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="gap-1.5 text-xs h-8"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            <span>Sign & Issue Grant</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
