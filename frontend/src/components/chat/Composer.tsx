import React, { useState, useRef, useEffect } from "react"
import {
  ArrowUp,
  FolderLock,
  ChevronDown,
  Sparkles,
  Paperclip,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { Badge } from "../ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"

interface ComposerProps {
  onSendMessage: (text: string, purpose?: string) => void
  isLoading?: boolean
  disabled?: boolean
}

export const Composer: React.FC<ComposerProps> = ({
  onSendMessage,
  isLoading = false,
  disabled = false,
}) => {
  const { vaults, selectedVault, setSelectedVault, persona } = useApp()
  const [input, setInput] = useState("")
  const [purpose, setPurpose] = useState("project_analysis")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    onSendMessage(input.trim(), purpose)
    setInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-4">
      <div className="relative rounded-xl border border-border bg-surface-raised shadow-lg focus-within:border-border/80 focus-within:ring-1 focus-within:ring-border transition-all">
        {/* Loading Progress Bar */}
        {isLoading && (
          <div className="absolute top-0 inset-x-0 h-0.5 bg-secondary overflow-hidden rounded-t-xl">
            <div className="w-full h-full bg-emerald-500 animate-[indeterminate_1.5s_infinite_linear]" />
          </div>
        )}

        {/* Input Area */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask ${selectedVault?.display_name || "knowledge base"}...`}
          disabled={disabled || isLoading}
          rows={1}
          className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none max-h-48 leading-relaxed"
        />

        {/* Bottom Context Controls & Send Button */}
        <div className="px-3 pb-2.5 pt-1 flex items-center justify-between gap-2 border-t border-border/40 text-xs">
          {/* Left Context: Vault & Purpose Selectors */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Vault Switcher Chip */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-subtle hover:bg-secondary border border-border/60 text-muted-foreground hover:text-foreground text-[11px] transition-colors">
                  <FolderLock className="h-3 w-3 text-emerald-400" />
                  <span className="font-medium text-foreground">
                    {selectedVault?.display_name || "Select Vault"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-[11px]">
                  Authorized Workspaces
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {vaults.map((v) => (
                  <DropdownMenuItem
                    key={v.vault_id}
                    onClick={() => setSelectedVault(v)}
                    className="flex items-center justify-between text-xs cursor-pointer"
                  >
                    <div>
                      <div className="font-medium">{v.display_name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        Ceiling: L{v.classification_ceiling}
                      </div>
                    </div>
                    {selectedVault?.vault_id === v.vault_id && (
                      <Badge variant="success" className="text-[9px] py-0 px-1">
                        Active
                      </Badge>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Purpose Tag */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-subtle hover:bg-secondary border border-border/60 text-muted-foreground hover:text-foreground text-[11px] transition-colors">
                  <span>Purpose:</span>
                  <span className="text-foreground font-mono capitalize">
                    {purpose.replace("_", " ")}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 text-xs">
                <DropdownMenuItem onClick={() => setPurpose("project_analysis")}>
                  Project Analysis
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPurpose("audit_review")}>
                  Audit Review
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPurpose("incident_investigation")}>
                  Incident Response
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPurpose("general_query")}>
                  General Query
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Clearance Indicator */}
            <Badge variant="clearance" className="hidden sm:inline-flex text-[10px] py-0">
              Clearance: L{persona.clearanceLevel}
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
              className="h-7 w-7 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center disabled:opacity-40 disabled:hover:bg-primary transition-all shadow-sm"
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
