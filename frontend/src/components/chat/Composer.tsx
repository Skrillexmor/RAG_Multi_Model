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

interface ComposerProps {
  onSendMessage: (
    text: string,
    purpose?: string,
    fileId?: string,
    fileName?: string
  ) => void
  isLoading?: boolean
  disabled?: boolean
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isLoading = false,
  disabled = false,
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
      selectedTargetFile?.name
    )
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      <div className="relative rounded-2xl border border-border/80 bg-surface-raised shadow-xl focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all">
        {/* Loading Progress Bar */}
        {isLoading && (
          <div className="absolute top-0 inset-x-0 h-0.5 bg-secondary overflow-hidden rounded-t-2xl">
            <div className="w-full h-full bg-emerald-500 animate-[indeterminate_1.5s_infinite_linear]" />
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
      </div>
    </div>
  )
}
