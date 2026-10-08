import React, { useState } from "react"
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Music as AudioIcon,
  Code as CodeIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react"
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

type FileCategory = "document" | "image" | "video" | "audio" | "code"

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

  const getFileCategory = (filename: string): FileCategory => {
    const ext = filename.split(".").pop()?.toLowerCase() || ""
    if (["png", "jpg", "jpeg", "webp", "bmp", "tiff"].includes(ext)) return "image"
    if (["mp4", "mkv", "mov", "avi", "webm"].includes(ext)) return "video"
    if (["mp3", "wav", "m4a", "ogg", "flac"].includes(ext)) return "audio"
    if (["txt", "md", "json", "csv", "sql", "py", "html"].includes(ext)) return "code"
    return "document"
  }

  const category = file ? getFileCategory(file.name) : "document"

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    const cat = getFileCategory(file.name)

    if (cat === "image") {
      setUploadStep("Deep Learning OCR & Vision Analysis...")
    } else if (cat === "video") {
      setUploadStep("Sampling keyframes & extracting slide OCR...")
    } else if (cat === "audio") {
      setUploadStep("Audio segmentation & speech transcription...")
    } else {
      setUploadStep("Document quarantine & structure parsing...")
    }

    try {
      setTimeout(() => setUploadStep("Scanning for credentials & PII (§14)..."), 500)
      setTimeout(() => setUploadStep("AES-256-GCM chunk encryption & vector indexing (§15)..."), 1000)

      await api.uploadFile(vaultSlug, file, classification, minClearance)
      toast.success(`${file.name} ingested successfully!`, {
        description: `Stored as encrypted canonical chunks with classification Level ${classification}.`,
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

  const renderCategoryIcon = () => {
    switch (category) {
      case "image":
        return <ImageIcon className="h-8 w-8 mx-auto mb-2 text-indigo-400" />
      case "video":
        return <VideoIcon className="h-8 w-8 mx-auto mb-2 text-amber-400" />
      case "audio":
        return <AudioIcon className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
      case "code":
        return <CodeIcon className="h-8 w-8 mx-auto mb-2 text-sky-400" />
      default:
        return <FileText className="h-8 w-8 mx-auto mb-2 text-emerald-400/80" />
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isUploading && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Upload className="h-3.5 w-3.5 text-emerald-400" />
            </div>
            <DialogTitle className="text-base font-semibold">
              Universal Multimodal Ingestion
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Ingest into folder: <span className="font-mono text-foreground font-semibold">{vaultSlug}</span>.
            All documents, images, audio, video, and code are processed locally with zero-cloud leakage.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-4 text-xs">
          {/* File Picker Zone */}
          <div className="border-2 border-dashed border-border rounded-xl p-5 text-center hover:border-emerald-500/50 transition-colors bg-surface-subtle/40">
            <input
              type="file"
              id="multimodal-upload"
              accept=".pdf,.docx,.txt,.md,.json,.csv,.sql,.py,.html,.png,.jpg,.jpeg,.webp,.bmp,.tiff,.mp4,.mkv,.mov,.avi,.webm,.mp3,.wav,.m4a,.ogg,.flac"
              onChange={handleFileChange}
              disabled={isUploading}
              className="hidden"
            />
            <label htmlFor="multimodal-upload" className="cursor-pointer block">
              {renderCategoryIcon()}
              {file ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-center gap-2">
                    <p className="font-medium text-foreground text-xs truncate max-w-xs">
                      {file.name}
                    </p>
                    <Badge variant="secondary" className="text-[10px] uppercase font-mono py-0 px-1.5">
                      {category}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground">
                    Click to select file or drag here
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    PDF, DOCX, Code, Images (OCR+Vision), Audio, Video (Max 50 MB)
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
                className="w-full h-8 px-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none focus:border-emerald-500/50"
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
                className="w-full h-8 px-2 rounded-md bg-surface-subtle border border-border text-xs text-foreground outline-none focus:border-emerald-500/50"
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
            className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
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
