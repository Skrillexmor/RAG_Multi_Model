import React, { useState } from "react"
import {
  Plus,
  MessageSquare,
  FileText,
  ShieldCheck,
  KeyRound,
  Network,
  History,
  ShieldAlert,
  Database,
  Settings,
  Pin,
  Trash2,
  Edit2,
  Check,
  MoreVertical,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { Conversation } from "../../types"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { Separator } from "../ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { Badge } from "../ui/badge"

export const Sidebar: React.FC = () => {
  const {
    conversations,
    activeConversationId,
    selectConversation,
    startNewChat,
    deleteConversation,
    renameConversation,
    pinConversation,
    sidebarCollapsed,
    currentView,
    navigate,
  } = useApp()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState<string>("")

  // Group conversations: Today, Yesterday, Earlier
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000

  const pinnedConversations = conversations.filter((c) => c.pinned)
  const todayConversations = conversations.filter(
    (c) => !c.pinned && new Date(c.createdAt).getTime() >= todayStart
  )
  const yesterdayConversations = conversations.filter(
    (c) =>
      !c.pinned &&
      new Date(c.createdAt).getTime() >= yesterdayStart &&
      new Date(c.createdAt).getTime() < todayStart
  )
  const earlierConversations = conversations.filter(
    (c) => !c.pinned && new Date(c.createdAt).getTime() < yesterdayStart
  )

  const handleStartRename = (conv: Conversation) => {
    setEditingId(conv.id)
    setEditTitle(conv.title)
  }

  const handleSaveRename = (id: string) => {
    if (editTitle.trim()) {
      renameConversation(id, editTitle.trim())
    }
    setEditingId(null)
  }

  const renderConversationItem = (conv: Conversation) => {
    const isActive = activeConversationId === conv.id && currentView === "chat"
    const isEditing = editingId === conv.id

    if (sidebarCollapsed) {
      return (
        <Tooltip key={conv.id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => selectConversation(conv.id)}
              className={`w-9 h-9 mx-auto rounded-md flex items-center justify-center transition-colors mb-1 ${
                isActive
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="font-medium text-xs">{conv.title}</p>
            {conv.selectedFileName ? (
              <p className="text-[10px] text-emerald-400 font-mono">📄 {conv.selectedFileName}</p>
            ) : (
              <p className="text-[10px] text-muted-foreground">{conv.vaultSlug} · All files</p>
            )}
          </TooltipContent>
        </Tooltip>
      )
    }

    return (
      <div
        key={conv.id}
        className={`group relative flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors mb-0.5 cursor-pointer ${
          isActive
            ? "bg-secondary text-foreground font-medium"
            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
        }`}
        onClick={() => {
          if (!isEditing) selectConversation(conv.id)
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
          {conv.pinned ? (
            <Pin className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <MessageSquare className="h-3 w-3 shrink-0 opacity-70 mt-0.5" />
          )}

          {isEditing ? (
            <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveRename(conv.id)
                  if (e.key === "Escape") setEditingId(null)
                }}
                autoFocus
                className="w-full bg-surface-subtle border border-border rounded px-1.5 py-0.5 text-xs text-foreground outline-none"
              />
              <button
                onClick={() => handleSaveRename(conv.id)}
                className="text-emerald-400 hover:text-emerald-300"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate leading-snug">{conv.title}</span>
              <div className="flex items-center gap-1 text-[10px] mt-0.5">
                {conv.selectedFileName ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-mono truncate font-medium">
                    <FileText className="h-2.5 w-2.5 shrink-0" />
                    {conv.selectedFileName}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60 truncate font-mono">
                    {conv.vaultSlug} · All files
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Menu */}
        {!isEditing && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem
                  onClick={() => pinConversation(conv.id)}
                  className="text-xs cursor-pointer"
                >
                  <Pin className="h-3.5 w-3.5 mr-2" />
                  {conv.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStartRename(conv)}
                  className="text-xs cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => deleteConversation(conv.id)}
                  className="text-xs text-rose-400 focus:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    )
  }

  const navLinks = [
    { id: "chat", label: "Chat", icon: MessageSquare, category: "WORKSPACE" },
    { id: "sources", label: "Sources", icon: FileText, category: "WORKSPACE" },
    { id: "vaults", label: "Vaults", icon: ShieldCheck, category: "WORKSPACE" },
    { id: "access", label: "Access & Grants", icon: KeyRound, category: "SECURITY" },
    { id: "federation", label: "LAN Federation", icon: Network, category: "SECURITY" },
    { id: "audit", label: "Audit Trail", icon: History, category: "SECURITY" },
    { id: "chunks", label: "Chunk Store", icon: Database, category: "SECURITY", badge: "Live" },
    { id: "settings", label: "Settings", icon: Settings, category: "SYSTEM" },
  ]

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={`border-r border-border bg-surface flex flex-col justify-between transition-all duration-200 z-20 shrink-0 ${
          sidebarCollapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Top: New Chat Action */}
        <div className="p-3">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => startNewChat()}
                  size="icon"
                  className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New chat</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              onClick={() => startNewChat()}
              className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium h-9"
            >
              <Plus className="h-4 w-4" />
              <span>New chat</span>
            </Button>
          )}
        </div>

        {/* Middle: Conversation History */}
        <ScrollArea className="flex-1 px-2.5">
          {pinnedConversations.length > 0 && (
            <div className="mb-4">
              {!sidebarCollapsed && (
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Pinned
                </div>
              )}
              {pinnedConversations.map(renderConversationItem)}
            </div>
          )}

          {todayConversations.length > 0 && (
            <div className="mb-4">
              {!sidebarCollapsed && (
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Today
                </div>
              )}
              {todayConversations.map(renderConversationItem)}
            </div>
          )}

          {yesterdayConversations.length > 0 && (
            <div className="mb-4">
              {!sidebarCollapsed && (
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Yesterday
                </div>
              )}
              {yesterdayConversations.map(renderConversationItem)}
            </div>
          )}

          {earlierConversations.length > 0 && (
            <div className="mb-4">
              {!sidebarCollapsed && (
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Earlier
                </div>
              )}
              {earlierConversations.map(renderConversationItem)}
            </div>
          )}
        </ScrollArea>

        {/* Bottom: Main Section Navigation */}
        <div className="p-2 border-t border-border bg-surface-subtle/50">
          <div className="space-y-0.5">
            {navLinks.map((item) => {
              const Icon = item.icon
              const isSelected = currentView === item.id

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => navigate(item.id as any)}
                        className={`w-9 h-9 mx-auto rounded-md flex items-center justify-center transition-colors ${
                          isSelected
                            ? "bg-secondary text-foreground font-medium"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label} {item.badge && `(${item.badge})`}
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id as any)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                    isSelected
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-3.5 w-3.5 opacity-80" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <Badge variant="success" className="text-[9px] py-0 px-1 font-mono">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
