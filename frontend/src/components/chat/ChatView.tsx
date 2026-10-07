import React, { useState, useRef, useEffect } from "react"
import { Shield, Sparkles, FolderLock, Plus } from "lucide-react"
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
    startNewChat,
  } = useApp()

  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [activeConversation?.messages, isLoading])

  const handleSendMessage = async (text: string, purpose = "general_query") => {
    if (!selectedVault) {
      toast.error("Please select an authorized vault first.")
      return
    }

    const userMessage: Message = {
      id: `msg_${Date.now()}_u`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      vaultSlug: selectedVault.slug,
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
      const convId = `conv_${Date.now()}`
      conv = {
        id: convId,
        title: generateConversationTitle(text),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        vaultSlug: selectedVault.slug,
        persona: persona.username,
        preview: text.slice(0, 60),
        messages: [userMessage],
      }
    }

    saveConversation(conv)
    setIsLoading(true)

    try {
      const res = await api.queryRag(selectedVault.slug, text, purpose)

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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        {!hasMessages ? (
          /* Empty / Home State (§7) */
          <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center my-auto py-12">
            <div className="h-10 w-10 rounded-2xl bg-surface-raised border border-border flex items-center justify-center mb-4 shadow-sm">
              <Shield className="h-5 w-5 text-emerald-400" />
            </div>

            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Private Knowledge Workspace
            </h1>

            <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
              Query your authorized sources under deterministic zero-trust governance.
              Every factual assertion is grounded with exact canonical proofs.
            </p>

            <div className="mt-4 flex items-center gap-2">
              <Badge variant="vault" className="text-xs py-1 px-2.5">
                <FolderLock className="h-3 w-3 mr-1.5 text-emerald-400" />
                {selectedVault?.display_name || "Project Alpha"}
              </Badge>
              <Badge variant="clearance" className="text-xs py-1 px-2.5">
                Clearance: Level {persona.clearanceLevel}
              </Badge>
            </div>

            <StarterPrompts onSelectPrompt={(prompt) => handleSendMessage(prompt)} />
          </div>
        ) : (
          /* Conversation Message Stream */
          <div className="max-w-3xl mx-auto space-y-2 pb-6">
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
                  <span className="font-medium text-foreground">PrivateRAG</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-[11px] animate-pulse">
                    Retrieving authorized sources & generating response with Local LLM...
                  </span>
                </div>
                <div className="h-14 rounded-xl bg-surface-subtle/50 border border-border/40 flex items-center px-4 gap-3 animate-pulse">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs text-muted-foreground font-mono">Local model thinking and verifying citations...</span>
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
