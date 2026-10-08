import React, { useState, useRef, useEffect } from "react"
import { Shield, Sparkles, FolderLock, Plus, FileText, Layers, X } from "lucide-react"
import { useApp } from "../../context/AppContext"
import { Message, Conversation } from "../../types"
import { api, ApiError } from "../../lib/api"
import { generateConversationTitle } from "../../lib/storage"
import { MessageItem } from "./MessageItem"
import { Composer } from "./Composer"
import { StarterPrompts } from "./StarterPrompts"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
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
  } = useApp()

  const [isLoading, setIsLoading] = useState(false)
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
    fileName?: string
  ) => {
    if (!selectedVault) {
      toast.error("Please select an authorized vault first.")
      return
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
    }

    // Prepare conversation
    let conv: Conversation
    if (activeConversation) {
      conv = {
        ...activeConversation,
        selectedFileId: effectiveFileId || activeConversation.selectedFileId,
        selectedFileName: effectiveFileName || activeConversation.selectedFileName,
        updatedAt: new Date().toISOString(),
        messages: [...activeConversation.messages, userMessage],
      }
    } else {
      const convId = `conv_${Date.now()}`
      conv = {
        id: convId,
        title: generateConversationTitle(text),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vaultSlug: selectedVault.slug,
        selectedFileId: effectiveFileId,
        selectedFileName: effectiveFileName,
        persona: persona.username,
        preview: text.slice(0, 60),
        messages: [userMessage],
      }
    }

    saveConversation(conv)
    setIsLoading(true)

    try {
      const res = await api.queryRag(
        selectedVault.slug,
        text,
        purpose,
        effectiveFileId
      )

      const assistantMessage: Message = {
        id: `msg_${Date.now()}_a`,
        role: "assistant",
        content: res.answer,
        createdAt: new Date().toISOString(),
        citations: res.citations,
        evidenceItems: res.evidence_items,
        securityTrace: res.security_trace,
        mode: res.mode,
        refusalReason: res.refusal_reason,
        vaultSlug: selectedVault.slug,
        selectedFileId: effectiveFileId,
        selectedFileName: effectiveFileName,
      }

      conv = {
        ...conv,
        updatedAt: new Date().toISOString(),
        messages: [...conv.messages, assistantMessage],
        preview: res.answer ? res.answer.slice(0, 60) : conv.preview,
      }

      saveConversation(conv)
    } catch (err: any) {
      const errorMessage: Message = {
        id: `msg_${Date.now()}_err`,
        role: "assistant",
        content: `Query could not be completed: ${err.message}`,
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
          /* Empty / Home State */
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center my-auto py-12">
            <div className="h-11 w-11 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mb-4 shadow-sm text-emerald-400">
              <Shield className="h-6 w-6" />
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Private Knowledge Assistant
            </h1>

            <p className="text-xs text-muted-foreground mt-2 max-w-md leading-relaxed">
              Ask direct questions to your local knowledge base. Queries are strictly isolated,
              evaluated with zero external network calls, and cryptographically verified.
            </p>

            <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
              <Badge variant="vault" className="text-xs py-1 px-2.5">
                <FolderLock className="h-3 w-3 mr-1.5 text-emerald-400" />
                {selectedVault?.display_name || "Project Alpha"}
              </Badge>

              {activeScopedFileName ? (
                <Badge variant="outline" className="text-xs py-1 px-2.5 border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                  <FileText className="h-3 w-3 mr-1.5 text-emerald-400" />
                  Target: {activeScopedFileName}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs py-1 px-2.5">
                  <Layers className="h-3 w-3 mr-1.5 text-emerald-400" />
                  Scope: All Files in Folder
                </Badge>
              )}

              <Badge variant="clearance" className="text-xs py-1 px-2.5">
                Clearance: Level {persona.clearanceLevel}
              </Badge>
            </div>

            <StarterPrompts
              onSelectPrompt={(prompt) => handleSendMessage(prompt)}
              scopedFileName={activeScopedFileName}
            />
          </div>
        ) : (
          /* Conversation Message Stream */
          <div className="max-w-3xl mx-auto space-y-3 pb-6">
            {/* Scoped File Header Banner */}
            {activeScopedFileName && (
              <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-surface-raised/80 border border-emerald-500/20 text-xs shadow-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span className="text-muted-foreground text-[11px]">Active Query Target:</span>
                  <span className="font-semibold text-emerald-300 font-mono text-xs">
                    {activeScopedFileName}
                  </span>
                </div>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {selectedVault?.slug}
                </Badge>
              </div>
            )}

            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                onRequestAccess={onRequestAccess}
              />
            ))}

            {isLoading && (
              <div className="py-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-5 w-5 rounded-full bg-surface-subtle border border-border flex items-center justify-center">
                    <Shield className="h-3 w-3 text-emerald-400 animate-pulse" />
                  </div>
                  <span className="font-semibold text-foreground">PrivateRAG</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-[11px] animate-pulse">
                    Evaluating Gate A & B policies, searching chunks, generating answer...
                  </span>
                </div>
                <div className="h-12 rounded-xl bg-surface-subtle/50 border border-border/40 flex items-center px-4 gap-3 animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs text-muted-foreground font-mono">
                    Local model answering question...
                  </span>
                </div>
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
      />
    </div>
  )
}
