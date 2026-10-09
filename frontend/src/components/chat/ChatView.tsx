import React, { useState, useRef, useEffect } from "react"
import {
  Aperture,
  Sheet,
  Compartment,
  Close,
} from "../../glyphs"
import { useApp } from "../../context/AppContext"
import { Message, Conversation, RetrievalMode } from "../../types"
import { api, ApiError } from "../../lib/api"
import { generateConversationTitle } from "../../lib/storage"
import { MessageItem } from "./MessageItem"
import { Composer } from "./Composer"
import { StarterPrompts } from "./StarterPrompts"
import { Strata } from "../ui/strata"
import { GatePath } from "../ui/gate-path"
import { EngineChip } from "../ui/engine-chip"
import { toast } from "sonner"

interface ChatViewProps {
  onRequestAccess?: (vaultSlug?: string) => void
}

export const ChatView: React.FC<ChatViewProps> = ({ onRequestAccess }) => {
  const {
    selectedVault,
    activeConversation,
    saveConversation,
    persona,
    selectedTargetFile,
    setSelectedTargetFile,
    setIsLlmModalOpen,
  } = useApp()

  const [isLoading, setIsLoading] = useState(false)
  const [retrievalMode, setRetrievalMode] = useState<RetrievalMode>("LOW")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [activeConversation?.messages, isLoading])

  const handleSendMessage = async (
    text: string,
    purpose = "general_query",
    fileId?: string,
    fileName?: string,
    modeParam?: RetrievalMode
  ) => {
    if (!selectedVault) {
      toast.error("Please select an authorized vault first.")
      return
    }

    const effectiveMode = modeParam || retrievalMode
    if (modeParam && modeParam !== retrievalMode) {
      setRetrievalMode(modeParam)
    }

    const effectiveFileId = fileId !== undefined ? fileId : selectedTargetFile?.id
    const effectiveFileName = fileName !== undefined ? fileName : selectedTargetFile?.name

    const userMessage: Message = {
      id: `msg_${Date.now()}_u`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      vaultSlug: selectedVault.slug,
      selectedFileId: effectiveFileId,
      selectedFileName: effectiveFileName,
      retrievalMode: effectiveMode,
    }

    // Prepare conversation
    let conv: Conversation
    if (activeConversation) {
      conv = {
        ...activeConversation,
        updatedAt: new Date().toISOString(),
        messages: [...activeConversation.messages, userMessage],
      }
    } else {
      conv = {
        id: `conv_${Date.now()}`,
        title: generateConversationTitle(text),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vaultSlug: selectedVault.slug,
        selectedFileId: effectiveFileId,
        selectedFileName: effectiveFileName,
        preview: text.slice(0, 60),
        messages: [userMessage],
        persona: persona.username,
      }
    }

    saveConversation(conv)
    setIsLoading(true)

    try {
      const response = await api.queryRag(
        selectedVault.slug,
        text,
        purpose,
        effectiveFileId,
        undefined,
        effectiveMode
      )

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_a`,
        role: "assistant",
        content: response.answer,
        createdAt: new Date().toISOString(),
        citations: response.citations,
        evidenceItems: response.evidence_items,
        mode: response.mode,
        refusalReason: response.refusal_reason,
        securityTrace: response.security_trace,
        vaultSlug: selectedVault.slug,
        selectedFileId: effectiveFileId,
        selectedFileName: effectiveFileName,
        retrievalMode: response.retrieval_mode || effectiveMode,
      }

      conv = {
        ...conv,
        updatedAt: new Date().toISOString(),
        messages: [...conv.messages, assistantMessage],
      }

      saveConversation(conv)
    } catch (error) {
      const err = error as ApiError
      const errorMessage: Message = {
        id: `msg_${Date.now()}_err`,
        role: "assistant",
        content:
          err.message ||
          "Failed to process query through the local security pipeline.",
        createdAt: new Date().toISOString(),
        mode: "REFUSAL",
        refusalReason: err.code || "REQUEST_FAILED",
        vaultSlug: selectedVault.slug,
        selectedFileId: effectiveFileId,
        selectedFileName: effectiveFileName,
      }

      conv = {
        ...conv,
        updatedAt: new Date().toISOString(),
        messages: [...conv.messages, errorMessage],
      }

      saveConversation(conv)
      toast.error(`Query failed: ${err.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const messages = activeConversation?.messages || []
  const hasMessages = messages.length > 0
  const activeScopedFileName =
    activeConversation?.selectedFileName || selectedTargetFile?.name

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        {!hasMessages ? (
          /* Empty / Antechamber State per DESIGN.md §6.5 */
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center my-auto py-12">
            <div className="h-14 w-14 rounded-2xl bg-surface border border-border flex items-center justify-center mb-5 shadow-xs e1">
              <Aperture size={32} accent="hsl(var(--beam))" />
            </div>

            <h1 className="text-3xl md:text-4xl font-light tracking-tight text-foreground font-sans">
              Ask your private knowledge.
            </h1>

            <p className="text-xs text-muted-foreground mt-2.5 max-w-md leading-relaxed font-sans">
              Queries run locally with zero cloud network egress. Every citation is strictly grounded and verified by the two-gate retrieval firewall.
            </p>

            <div className="mt-5 flex items-center gap-2 flex-wrap justify-center text-xs">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-surface text-foreground font-medium">
                <Compartment size={13} className="text-muted-foreground" />
                <span>{selectedVault?.display_name || "Project Alpha"}</span>
              </div>

              {activeScopedFileName ? (
                <>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-surface text-foreground font-medium">
                    <Sheet size={13} className="text-muted-foreground" />
                    <span>Target: {activeScopedFileName}</span>
                  </div>
                  <EngineChip
                    fileName={activeScopedFileName}
                    onClick={() => setIsLlmModalOpen(true)}
                  />
                </>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border bg-surface text-muted-foreground">
                  <Sheet size={13} />
                  <span>Scope: All files in compartment</span>
                </div>
              )}

              <Strata level={persona.clearanceLevel} size="md" />
            </div>

            <StarterPrompts
              onSelectPrompt={(prompt) => handleSendMessage(prompt)}
              scopedFileName={activeScopedFileName}
            />
          </div>
        ) : (
          /* Conversation Message Stream */
          <div className="max-w-3xl mx-auto space-y-4 pb-6">
            {/* Scoped File Header Banner */}
            {activeScopedFileName && (
              <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-surface border border-border text-xs shadow-xs e1">
                <div className="flex items-center gap-2 min-w-0">
                  <Sheet size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground text-[11px]">Scope:</span>
                  <span className="font-medium text-foreground font-mono text-xs truncate max-w-[200px]">
                    {activeScopedFileName}
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
                <div className="flex items-center gap-2 shrink-0">
                  <EngineChip
                    fileName={activeScopedFileName}
                    compact
                    onClick={() => setIsLlmModalOpen(true)}
                  />
                  <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                    {selectedVault?.slug}
                  </span>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                onRequestAccess={onRequestAccess}
              />
            ))}

            {/* Live Gate Path Loading State (§A13, §6.4) */}
            {isLoading && (
              <div className="py-3">
                <GatePath pending={true} depth={retrievalMode} />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Persistent Composer Anchor */}
      <Composer
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        disabled={!selectedVault}
        retrievalMode={retrievalMode}
        onRetrievalModeChange={setRetrievalMode}
      />
    </div>
  )
}
