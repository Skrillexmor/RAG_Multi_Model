import React, { useState, useRef, useEffect } from "react"
import {
  Send,
  Compartment,
  ChevronDown,
  Sheet,
  Close,
} from "../../glyphs"
import { useApp } from "../../context/AppContext"
import { VaultDocument } from "../../types"
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
import { Strata } from "../ui/strata"
import { EngineChip } from "../ui/engine-chip"
import { cn } from "../../lib/utils"

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

  // Vault document list for scoping dropdown
  const [vaultDocs, setVaultDocs] = useState<VaultDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (selectedVault) {
      setLoadingDocs(true)
      api
        .getVaultDocuments(selectedVault.slug)
        .then((res) => {
          setVaultDocs(res.documents || [])
        })
        .catch(() => {
          setVaultDocs([])
        })
        .finally(() => {
          setLoadingDocs(false)
        })
    } else {
      setVaultDocs([])
    }
  }, [selectedVault])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        180
      )}px`
    }
  }, [input])

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const modes: { key: RetrievalMode; label: string; rings: number; desc: string; speed: string }[] = [
    {
      key: "LOW",
      label: "Low",
      rings: 1,
      desc: "Standard FastEmbed vector search over persistent index",
      speed: "Speed: High · Compute: Low",
    },
    {
      key: "MEDIUM",
      label: "Med",
      rings: 2,
      desc: "Lazy query-aware boundary slicing + deterministic cache",
      speed: "Speed: Med · Precision: High",
    },
    {
      key: "HIGH",
      label: "High",
      rings: 3,
      desc: "Advanced intent analysis, hybrid search & local reranking",
      speed: "Speed: Balanced · Quality: Max",
    },
  ]

  const activeModeObj = modes.find((m) => m.key === activeRetrievalMode) || modes[0]

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      <div className="relative rounded-2xl border border-border/80 bg-surface-raised shadow-xl focus-within:border-trust/60 focus-within:ring-1 focus-within:ring-trust/30 transition-all overflow-hidden e2">
        {/* Loading Progress Bar with keyframe indeterminate (§A5, §8.3) */}
        {isLoading && (
          <div className="absolute top-0 inset-x-0 h-0.5 bg-secondary overflow-hidden rounded-t-2xl z-10">
            <div className="w-full h-full bg-beam animate-indeterminate" />
          </div>
        )}

        {/* Dynamic Model & Scope Banner */}
        {selectedTargetFile && (
          <div className="px-3.5 py-1.5 bg-secondary/60 border-b border-border/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Sheet size={13} className="text-muted-foreground shrink-0" />
              <span className="text-muted-foreground text-[11px]">Scope:</span>
              <span className="font-medium text-foreground truncate max-w-[200px]">
                {selectedTargetFile.name}
              </span>
              <button
                type="button"
                onClick={() => setSelectedTargetFile(null)}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
                title="Clear file scope"
              >
                <Close size={12} />
              </button>
            </div>
            <EngineChip fileName={selectedTargetFile.name} compact />
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
          className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none max-h-48 leading-relaxed font-sans"
        />

        {/* Bottom Context Controls & Send Button */}
        <div className="px-3 pb-2.5 pt-1.5 flex items-center justify-between gap-2 border-t border-border/40 text-xs">
          {/* Left Context: Vault & File Scope Selectors */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Vault Switcher Chip */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-secondary border border-border text-muted-foreground hover:text-foreground text-[11px] transition-colors cursor-pointer">
                  <Compartment size={13} className="text-muted-foreground" />
                  <span className="font-medium text-foreground truncate max-w-[130px]">
                    {selectedVault?.display_name || "Select Compartment"}
                  </span>
                  <ChevronDown size={11} className="opacity-60 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 text-xs">
                <DropdownMenuLabel className="text-[11px]">
                  Compartments
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {vaults.map((v) => (
                  <DropdownMenuItem
                    key={v.slug}
                    onClick={() => {
                      setSelectedVault(v)
                      setSelectedTargetFile(null)
                    }}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <span className="truncate">{v.display_name}</span>
                    <Strata level={v.classification_ceiling} size="sm" />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* File/Scope Selector Chip */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={!selectedVault}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/80 hover:bg-secondary border border-border text-muted-foreground hover:text-foreground text-[11px] transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Sheet size={13} className="text-muted-foreground" />
                  <span className="truncate max-w-[120px]">
                    {selectedTargetFile ? selectedTargetFile.name : "All Files"}
                  </span>
                  <ChevronDown size={11} className="opacity-60 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 max-h-60 overflow-y-auto text-xs">
                <DropdownMenuLabel className="text-[11px]">
                  Scope by Resource
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setSelectedTargetFile(null)}
                  className="cursor-pointer"
                >
                  <span>All Compartment Files (Default)</span>
                </DropdownMenuItem>
                {loadingDocs ? (
                  <div className="p-2 text-center text-muted-foreground text-[11px]">
                    Loading files...
                  </div>
                ) : (
                  vaultDocs.map((doc) => (
                    <DropdownMenuItem
                      key={doc.resource_id}
                      onClick={() =>
                        setSelectedTargetFile({
                          id: doc.resource_id,
                          name: doc.title,
                        })
                      }
                      className="cursor-pointer flex items-center justify-between"
                    >
                      <span className="truncate max-w-[160px]">{doc.title}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        L{doc.classification}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Purpose Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/80 hover:bg-secondary border border-border text-muted-foreground hover:text-foreground text-[11px] transition-colors cursor-pointer">
                  <span className="capitalize">{purpose.replace("_", " ")}</span>
                  <ChevronDown size={11} className="opacity-60 ml-0.5" />
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
            <Strata level={persona.clearanceLevel} size="sm" className="hidden sm:inline-flex" />

            {/* Gatelight Depth Dial (3-Segment Pill with Ring Glyphs) */}
            <div
              className="flex items-center rounded-lg bg-secondary border border-border p-0.5 text-[10px] select-none"
              title={`Retrieval Depth: ${activeRetrievalMode}\nLOW: Fast vector search\nMEDIUM: Lazy query chunking & cache\nHIGH: Intent analysis & local reranking`}
            >
              {modes.map((m) => {
                const isSelected = activeRetrievalMode === m.key
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => handleModeChange(m.key)}
                    className={cn(
                      "flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-medium transition-all cursor-pointer",
                      isSelected
                        ? "bg-surface text-foreground font-semibold border border-border shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="flex items-center gap-0.5">
                      {[1, 2, 3].map((r) => (
                        <i
                          key={r}
                          className={cn(
                            "w-1.5 h-1.5 rounded-full border border-trust",
                            r <= m.rings ? "bg-trust" : "bg-transparent"
                          )}
                        />
                      ))}
                    </span>
                    <span>{m.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right: Send Button */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted-foreground hidden sm:inline-block font-mono">
              ↵ Send
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading || disabled}
              className="h-7 w-7 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-40 transition-all shadow-xs cursor-pointer"
              title="Send prompt"
            >
              <Send size={14} />
            </button>
          </div>
        </div>

        {/* Retrieval Mode Description Footer */}
        <div className="px-3.5 py-1 bg-surface border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground select-none">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-medium text-foreground">
              Depth [{activeRetrievalMode}]:
            </span>
            <span className="truncate">{activeModeObj.desc}</span>
          </div>
          <span className="font-mono text-[9px] text-muted-foreground shrink-0 hidden md:inline ml-2">
            {activeModeObj.speed}
          </span>
        </div>
      </div>
    </div>
  )
}
