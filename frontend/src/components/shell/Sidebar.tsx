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
  Image as ImageIcon,
  Video as VideoIcon,
  Music as MusicIcon,
  Code2,
  Sparkles,
  Layers,
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

  const getConversationVisual = (conv: Conversation) => {
    const fileName = conv.selectedFileName?.toLowerCase() || ""
    if (fileName.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp)$/)) {
      return {
        Icon: ImageIcon,
        badgeBg: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
        fileColor: "text-amber-400",
        label: "Image",
      }
    }
    if (fileName.match(/\.(mp4|mov|avi|mkv|webm)$/)) {
      return {
        Icon: VideoIcon,
        badgeBg: "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30",
        fileColor: "text-fuchsia-400",
        label: "Video",
      }
    }
    if (fileName.match(/\.(mp3|wav|ogg|m4a|flac)$/)) {
      return {
        Icon: MusicIcon,
        badgeBg: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
        fileColor: "text-rose-400",
        label: "Audio",
      }
    }
    if (fileName.match(/\.(py|ts|js|jsx|tsx|html|css|json|sql|sh)$/)) {
      return {
        Icon: Code2,
        badgeBg: "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30",
        fileColor: "text-cyan-400",
        label: "Code",
      }
    }
    if (fileName.match(/\.(pdf|docx|doc|txt|md|csv|xlsx|pptx)$/)) {
      return {
        Icon: FileText,
        badgeBg: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
        fileColor: "text-emerald-400",
        label: "Document",
      }
    }
    if (conv.selectedFileName) {
      return {
        Icon: FileText,
        badgeBg: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
        fileColor: "text-emerald-400",
        label: "File",
      }
    }
    if (conv.vaultSlug) {
      return {
        Icon: Layers,
        badgeBg: "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30",
        fileColor: "text-indigo-400",
        label: "Folder",
      }
    }
    return {
      Icon: Sparkles,
      badgeBg: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
      fileColor: "text-sky-400",
      label: "General",
    }
  }

  const renderConversationItem = (conv: Conversation) => {
    const isActive = activeConversationId === conv.id && currentView === "chat"
    const isEditing = editingId === conv.id
    const visual = getConversationVisual(conv)
    const ItemIcon = visual.Icon

    if (sidebarCollapsed) {
      return (
        <Tooltip key={conv.id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => selectConversation(conv.id)}
              className={`w-9 h-9 mx-auto rounded-md flex items-center justify-center transition-colors mb-1 ${
                isActive
                  ? "bg-secondary text-foreground font-medium ring-1 ring-border"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              <ItemIcon className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="font-medium text-xs">{conv.title}</p>
            {conv.selectedFileName ? (
              <p className={`text-[10px] font-mono ${visual.fileColor}`}>
                {visual.label}: {conv.selectedFileName}
              </p>
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
        className={`group relative flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors mb-1 cursor-pointer ${
          isActive
            ? "bg-secondary/90 text-foreground font-medium shadow-xs ring-1 ring-border/50"
            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
        }`}
        onClick={() => {
          if (!isEditing) selectConversation(conv.id)
        }}
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1 mr-1">
          {/* Distinct Visual Avatar Badge */}
          <div
            className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${visual.badgeBg}`}
            title={visual.label}
          >
            {conv.pinned ? (
              <Pin className="h-3 w-3 text-emerald-400" />
            ) : (
              <ItemIcon className="h-3.5 w-3.5" />
            )}
          </div>

          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
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
                className="text-emerald-400 hover:text-emerald-300 p-0.5"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
              <span className="truncate text-[12px] font-medium leading-snug">{conv.title}</span>
              <div className="flex items-center gap-1 text-[10px] mt-0.5 text-muted-foreground">
                {conv.selectedFileName ? (
                  <span className={`flex items-center gap-1 font-mono truncate ${visual.fileColor} font-medium`}>
                    <ItemIcon className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{conv.selectedFileName}</span>
                  </span>
                ) : (
                  <span className="truncate font-mono opacity-70">
                    {conv.vaultSlug} · All files
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Menu (Anchored, Never Squashed) */}
        {!isEditing && (
          <div
            className="shrink-0 z-20 flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ml-1"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-1.5 rounded-md hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border/60 shadow-xs"
                  aria-label="Conversation options"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36 text-xs">
                <DropdownMenuItem
                  onClick={() => pinConversation(conv.id)}
                  className="text-xs cursor-pointer"
                >
                  <Pin className="h-3.5 w-3.5 mr-2 text-emerald-400" />
                  {conv.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStartRename(conv)}
                  className="text-xs cursor-pointer"
                >
                  <Edit2 className="h-3.5 w-3.5 mr-2 text-sky-400" />
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
