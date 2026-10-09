import React, { useState, useRef, useEffect } from "react"
import {
  ArrowUp,
  FolderLock,
  ChevronDown,
  Layers,
  FileText,
  X,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { VaultDocument } from "../../types"
import { Badge } from "../ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { api } from "../../lib/api"
import { RetrievalMode } from "../../types"

interface ComposerProps {
  onSendMessage: (
    text: string,
    purpose?: string,
    fileId?: string,
    fileName?: string,
    retrievalMode?: RetrievalMode
  ) => void
  isLoading?: boolean
  disabled?: boolean
  retrievalMode?: RetrievalMode
  onRetrievalModeChange?: (mode: RetrievalMode) => void
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isLoading = false,
  disabled = false,
  retrievalMode: controlledMode,
  onRetrievalModeChange,
}) => {
  const {
    vaults,
    selectedVault,
    setSelectedVault,
    persona,
    selectedTargetFile,
    setSelectedTargetFile,
  } = useApp()

  const [input, setInput] = useState("")
  const [purpose, setPurpose] = useState("general_query")
  const [localRetrievalMode, setLocalRetrievalMode] = useState<RetrievalMode>("LOW")
  const activeRetrievalMode = controlledMode || localRetrievalMode

  const handleModeChange = (mode: RetrievalMode) => {
    setLocalRetrievalMode(mode)
    if (onRetrievalModeChange) {
      onRetrievalModeChange(mode)
    }
  }
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch documents for the selected vault
  useEffect(() => {
    if (!selectedVault) {
      setVaultDocs([])
      return
    }

    if (selectedVault.documents && selectedVault.documents.length > 0) {
      setVaultDocs(selectedVault.documents)
    } else {
      api
        .getVaultDocuments(selectedVault.slug)
        .then((res) => {
          setVaultDocs(res.documents || [])
        })
        .catch(() => {
          setVaultDocs([])
        })
    }
  }, [selectedVault])

  // Auto resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        180
      )}px`
    }
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSubmit = () => {
    if (!input.trim() || isLoading || disabled) return
    onSendMessage(
      input.trim(),
      purpose,
      selectedTargetFile?.id,
      selectedTargetFile?.name,
      activeRetrievalMode
    )
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  const getDetectedModel = () => {
    if (!selectedTargetFile?.name) {
      return {
        badge: "💬 Gemma 3 4B",
        name: "Gemma 3 4B",
        label: "Neural LLM",
        colorClass: "bg-blue-500/10 border-blue-500/30 text-blue-300",
        dotClass: "bg-blue-400",
      }
    }
    const ext = selectedTargetFile.name.split(".").pop()?.toLowerCase() || ""
    if (["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(ext)) {
      return {
        badge: "🎙️ Whisper Base",
        name: "Whisper Base",
        label: "Speech-to-Text",
        colorClass: "bg-amber-500/10 border-amber-500/30 text-amber-300",
        dotClass: "bg-amber-400 animate-pulse",
      }
    }
    if (["png", "jpg", "jpeg", "webp", "bmp", "tiff"].includes(ext)) {
      return {
        badge: "👁️ Qwen 2.5-VL",
        name: "Qwen 2.5-VL 3B",
        label: "Vision AI",
        colorClass: "bg-purple-500/10 border-purple-500/30 text-purple-300",
        dotClass: "bg-purple-400 animate-pulse",
      }
    }
    if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) {
      return {
        badge: "🎬 Whisper + Qwen-VL",
        name: "Whisper + Qwen-VL",
        label: "Video AI",
        colorClass: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300",
        dotClass: "bg-cyan-400 animate-pulse",
      }
    }
    return {
      badge: "💬 Gemma 3 4B",
      name: "Gemma 3 4B",
      label: "Document LLM",
      colorClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
      dotClass: "bg-emerald-400",
    }
  }

  const detectedEngine = getDetectedModel()

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      <div className="relative rounded-2xl border border-border/80 bg-surface-raised shadow-xl focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all overflow-hidden">
        {/* Loading Progress Bar */}
        {isLoading && (
          <div className="absolute top-0 inset-x-0 h-0.5 bg-secondary overflow-hidden rounded-t-2xl z-10">
            <div className="w-full h-full bg-emerald-500 animate-[indeterminate_1.5s_infinite_linear]" />
          </div>
        )}

        {/* Dynamic Model & Scope Banner */}
        {selectedTargetFile && (
          <div className="px-3.5 py-1.5 bg-surface-subtle/80 border-b border-border/60 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground">Target:</span>
              <span className="font-semibold text-foreground truncate max-w-[200px]">
                {selectedTargetFile.name}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground hidden sm:inline">Engine:</span>
              <span className={`font-semibold px-2 py-0.5 rounded border text-[10px] flex items-center gap-1 ${detectedEngine.colorClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${detectedEngine.dotClass}`} />
                {detectedEngine.badge}
              </span>
              <span className="text-[9px] text-muted-foreground/80 font-mono hidden md:inline">
                (Exclusive RAM)
              </span>
            </div>
          </div>
        )}

        {/* Input Area */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            selectedTargetFile
              ? `Ask question about "${selectedTargetFile.name}"...`
              : `Ask ${selectedVault?.display_name || "knowledge base"}...`
          }
          disabled={disabled || isLoading}
          rows={1}
          className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none max-h-48 leading-relaxed"
        />

        {/* Bottom Context Controls & Send Button */}
        <div className="px-3 pb-2.5 pt-1.5 flex items-center justify-between gap-2 border-t border-border/40 text-xs">
          {/* Left Context: Vault & File Scope Selectors */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Vault Switcher Chip */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-subtle hover:bg-secondary border border-border/70 text-muted-foreground hover:text-foreground text-[11px] transition-colors">
                  <FolderLock className="h-3 w-3 text-emerald-400" />
                  <span className="font-semibold text-foreground truncate max-w-[130px]">
                    {selectedVault?.display_name || "Select Vault"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 text-xs">
                <DropdownMenuLabel className="text-[11px]">
                  Knowledge Workspaces
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {vaults.map((v) => (
                  <DropdownMenuItem
                    key={v.vault_id}
                    onClick={() => {
                      setSelectedVault(v)
                      setSelectedTargetFile(null)
                    }}
                    className="flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div className="min-w-0 pr-1">
                      <div className="font-medium truncate">{v.display_name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        Ceiling: L{v.classification_ceiling}
                      </div>
                    </div>
                    {selectedVault?.vault_id === v.vault_id && (
                      <Badge variant="success" className="text-[9px] py-0 px-1 shrink-0">
                        Active
                      </Badge>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Scope / File Selector Chip */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                    selectedTargetFile
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium"
                      : "bg-surface-subtle hover:bg-secondary border-border/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {selectedTargetFile ? (
                    <FileText className="h-3 w-3 text-emerald-400 shrink-0" />
                  ) : (
                    <Layers className="h-3 w-3 text-emerald-400 shrink-0" />
                  )}
                  <span className="truncate max-w-[140px]">
                    {selectedTargetFile ? selectedTargetFile.name : "All Files in Folder"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 max-h-60 overflow-y-auto text-xs">
                <DropdownMenuLabel className="text-[11px]">Query Scope</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => setSelectedTargetFile(null)}
                  className="flex items-center justify-between text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-emerald-400" />
                    <span>All Files in Folder</span>
                  </div>
                  {!selectedTargetFile && (
                    <Badge variant="success" className="text-[9px] py-0 px-1">
                      Active
                    </Badge>
                  )}
                </DropdownMenuItem>

                {vaultDocs.length > 0 && <DropdownMenuSeparator />}

                {vaultDocs.map((doc) => {
                  const isSelected = selectedTargetFile?.id === doc.resource_id
                  return (
                    <DropdownMenuItem
                      key={doc.resource_id}
                      onClick={() =>
                        setSelectedTargetFile({ id: doc.resource_id, name: doc.title })
                      }
                      className="flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        <FileText className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{doc.title}</span>
                      </div>
                      {isSelected && (
                        <Badge variant="success" className="text-[9px] py-0 px-1 shrink-0">
                          Active
                        </Badge>
                      )}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Quick Remove File Scope Button if file is selected */}
            {selectedTargetFile && (
              <button
                type="button"
                onClick={() => setSelectedTargetFile(null)}
                className="h-6 w-6 rounded-md hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
                title="Reset scope to all files"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Purpose Tag */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-subtle hover:bg-secondary border border-border/70 text-muted-foreground hover:text-foreground text-[11px] transition-colors">
                  <span>Purpose:</span>
                  <span className="text-foreground font-mono capitalize">
                    {purpose.replace("_", " ")}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 text-xs">
                <DropdownMenuItem onClick={() => setPurpose("general_query")}>
                  General Query
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPurpose("project_analysis")}>
                  Project Analysis
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPurpose("audit_review")}>
                  Audit Review
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPurpose("incident_investigation")}>
                  Incident Response
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Clearance Indicator */}
            <Badge variant="clearance" className="hidden sm:inline-flex text-[10px] py-0 font-mono">
              L{persona.clearanceLevel}
            </Badge>

            {/* Retrieval Mode Segmented Selector (§Part 1) */}
            <div
              className="flex items-center rounded-lg bg-surface-subtle border border-border/70 p-0.5 text-[10px]"
              title={`Retrieval Mode: ${activeRetrievalMode}\nLOW: Standard vector retrieval\nMEDIUM: Lazy query-aware chunking & secure caching\nHIGH: Advanced hybrid retrieval & local reranking`}
            >
              <button
                type="button"
                onClick={() => handleModeChange("LOW")}
                className={`px-1.5 py-0.5 rounded font-mono font-medium transition-all cursor-pointer ${
                  activeRetrievalMode === "LOW"
                    ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
                title="LOW Mode: Standard Pre-indexed Vector Search (Fast, minimal compute)"
              >
                LOW
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("MEDIUM")}
                className={`px-1.5 py-0.5 rounded font-mono font-medium transition-all cursor-pointer ${
                  activeRetrievalMode === "MEDIUM"
                    ? "bg-blue-500/20 text-blue-300 font-bold border border-blue-500/40 shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
                title="MEDIUM Mode: Lazy, Query-Aware Chunking (On-demand sentence slicing & caching)"
              >
                MED
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("HIGH")}
                className={`px-1.5 py-0.5 rounded font-mono font-medium transition-all cursor-pointer ${
                  activeRetrievalMode === "HIGH"
                    ? "bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40 shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
                title="HIGH Mode: Advanced Query-Aware Retrieval (Intent analysis, hybrid scoring & local reranking)"
              >
                HIGH
              </button>
            </div>
          </div>

          {/* Right: Send Button */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60 hidden sm:inline-block font-mono">
              ↵ Send
            </span>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading || disabled}
              className="h-7.5 w-7.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 flex items-center justify-center disabled:opacity-40 disabled:hover:bg-emerald-600 transition-all shadow-sm"
              title="Send prompt"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Retrieval Mode Description & Speed/Quality Tradeoff */}
        <div className="px-3.5 py-1 bg-surface-subtle/50 border-t border-border/30 flex items-center justify-between text-[10px] text-muted-foreground select-none">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-foreground/80">Mode [{activeRetrievalMode}]:</span>
            <span className="truncate">
              {activeRetrievalMode === "LOW" && "Standard FastEmbed vector search from persistent index"}
              {activeRetrievalMode === "MEDIUM" && "Lazy query-aware boundary slicing + deterministic content-hash cache"}
              {activeRetrievalMode === "HIGH" && "Advanced intent analysis, hybrid scoring, context expansion & local reranking"}
            </span>
          </div>
          <span className="font-mono text-[9px] opacity-75 shrink-0 hidden md:inline ml-2">
            {activeRetrievalMode === "LOW" ? "Speed: High · Compute: Low" : activeRetrievalMode === "MEDIUM" ? "Speed: Medium · Precision: High" : "Speed: Balanced · Quality: Maximum"}
          </span>
        </div>
      </div>
    </div>
  )
}
