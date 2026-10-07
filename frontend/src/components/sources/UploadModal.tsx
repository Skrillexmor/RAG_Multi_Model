import React, { useState } from "react"
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { api } from "../../lib/api"
import { toast } from "sonner"

interface UploadModalProps {
  isOpen: boolean
  onClose: () => void
  vaultSlug: string
  onUploadSuccess: () => void
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  vaultSlug,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null)
  const [classification, setClassification] = useState<number>(1) // INTERNAL
  const [minClearance, setMinClearance] = useState<number>(1)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadStep, setUploadStep] = useState<string>("")

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setUploadStep("Quarantine validation (§11)...")

    try {
      setTimeout(() => setUploadStep("Scanning for credentials & PII (§14)..."), 400)
      setTimeout(() => setUploadStep("AES-256-GCM chunk encryption & indexing (§15)..."), 800)

      const res = await api.uploadPdf(vaultSlug, file, classification, minClearance)
      toast.success("Document ingested securely!", {
        description: `Stored as encrypted canonical chunk with classification Level ${classification}.`,
      })
      onUploadSuccess()
      onClose()
      setFile(null)
    } catch (err: any) {
      toast.error(`Ingestion failed: ${err.message}`)
    } finally {
      setIsUploading(false)
      setUploadStep("")
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isUploading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-emerald-400" />
            <DialogTitle className="text-base font-semibold">
              Secure Document Ingestion
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Upload document into workspace: <span className="font-mono text-foreground">{vaultSlug}</span>.
            All files are quarantined, secret-scanned, and stored in AES-256-GCM encrypted format.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-4 text-xs">
          {/* File Picker Zone */}
          <div className="border-2 border-dashed border-border rounded-lg p-5 text-center hover:border-border/80 transition-colors bg-surface-subtle/40">
            <input
              type="file"
              id="doc-upload"
              accept=".pdf,.csv,.txt"
              onChange={handleFileChange}
              disabled={isUploading}
              className="hidden"
            />
            <label htmlFor="doc-upload" className="cursor-pointer block">
              <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/70" />
              {file ? (
                <div className="space-y-1">
                  <p className="font-medium text-foreground text-xs truncate max-w-xs mx-auto">
                    {file.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    Click to select file or drag here
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    PDF, CSV, or Text (Max 25 MB)
                  </p>
                </div>
              )}
            </label>
          </div>

          {/* Classification & Clearance Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Classification Level
              </label>
              <select
                value={classification}
                onChange={(e) => setClassification(Number(e.target.value))}
                disabled={isUploading}
                className="w-full h-8 px-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none"
              >
                <option value={0}>0 - Public</option>
                <option value={1}>1 - Internal</option>
                <option value={2}>2 - Confidential</option>
                <option value={3}>3 - Restricted</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Minimum Clearance Required
              </label>
              <select
                value={minClearance}
                onChange={(e) => setMinClearance(Number(e.target.value))}
                disabled={isUploading}
                className="w-full h-8 px-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none"
              >
                <option value={0}>Level 0 (Guest)</option>
                <option value={1}>Level 1 (Engineer)</option>
                <option value={2}>Level 2 (Analyst / HR)</option>
                <option value={3}>Level 3 (Admin)</option>
              </select>
            </div>
          </div>

          {/* Ingestion Pipeline Stepper */}
          {isUploading && (
            <div className="p-3 rounded-lg border border-emerald-800/40 bg-emerald-950/20 text-xs flex items-center gap-2 text-emerald-300">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>{uploadStep}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isUploading}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="text-xs gap-1.5"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Ingesting...</span>
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Securely</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
