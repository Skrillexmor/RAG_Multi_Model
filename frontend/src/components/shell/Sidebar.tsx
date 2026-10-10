import React, { useState } from "react"
import {
  Add,
  Ask,
  Sheet,
  Compartment,
  Grant,
  Mesh,
  Ledger,
  Verify,
  Tune,
  Pin,
  Trash,
  Edit,
  More,
  Frame,
  Reel,
  Wave,
  Brackets,
  Aperture,
} from "../../glyphs"
import { useApp } from "../../context/AppContext"
import { Conversation } from "../../types"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { cn } from "../../lib/utils"

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

  // Modality visual identities per DESIGN.md §3.3
  const getConversationVisual = (conv: Conversation) => {
    const fileName = conv.selectedFileName?.toLowerCase() || ""
    if (fileName.match(/\.(jpg|jpeg|png|webp|gif|svg|bmp)$/)) {
      return {
        Icon: Frame,
        badgeBg: "bg-permit/15 text-permit border border-permit/30",
        label: "Image",
      }
    }
    if (fileName.match(/\.(mp4|mov|avi|mkv|webm)$/)) {
      return {
        Icon: Reel,
        badgeBg: "bg-secondary text-foreground border border-border",
        label: "Video",
      }
    }
    if (fileName.match(/\.(mp3|wav|ogg|m4a|flac)$/)) {
      return {
        Icon: Wave,
        badgeBg: "bg-hold/15 text-hold border border-hold/30",
        label: "Audio",
      }
    }
    if (fileName.match(/\.(py|ts|js|jsx|tsx|html|css|json|sql|sh)$/)) {
      return {
        Icon: Brackets,
        badgeBg: "bg-trust/15 text-trust border border-trust/30",
        label: "Code",
      }
    }
    if (fileName.match(/\.(pdf|docx|doc|txt|md|csv|xlsx|pptx)$/) || conv.selectedFileName) {
      return {
        Icon: Sheet,
        badgeBg: "bg-secondary text-muted-foreground border border-border",
        label: "Document",
      }
    }
    if (conv.vaultSlug) {
      return {
        Icon: Compartment,
        badgeBg: "bg-secondary text-foreground border border-border",
        label: "Compartment",
      }
    }
    return {
      Icon: Aperture,
      badgeBg: "bg-secondary text-muted-foreground border border-border",
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
              className={cn(
                "w-9 h-9 mx-auto rounded-lg flex items-center justify-center transition-colors mb-1 cursor-pointer",
                isActive
                  ? "bg-secondary text-foreground ring-1 ring-border shadow-xs"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              <ItemIcon size={16} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p className="font-medium text-xs">{conv.title}</p>
            {conv.selectedFileName ? (
              <p className="text-[10px] font-mono text-muted-foreground">
                {visual.label}: {conv.selectedFileName}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                {conv.vaultSlug || "General scope"}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      )
    }

    return (
      <div
        key={conv.id}
        className={cn(
          "group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors mb-1 cursor-pointer gap-1.5",
          isActive
            ? "bg-secondary text-foreground font-medium border-l-2 border-beam pl-2 shadow-xs"
            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
        )}
        onClick={() => {
          if (!isEditing) selectConversation(conv.id)
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden mr-1">
          <div
            className={cn(
              "w-5 h-5 rounded flex items-center justify-center shrink-0",
              visual.badgeBg
            )}
            title={visual.label}
          >
            {conv.pinned ? (
              <Pin size={11} className="text-beam" />
            ) : (
              <ItemIcon size={12} />
            )}
          </div>

          {isEditing ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={() => handleSaveRename(conv.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveRename(conv.id)
                if (e.key === "Escape") setEditingId(null)
              }}
              autoFocus
              className="bg-background text-foreground text-xs px-1.5 py-0.5 rounded border border-border w-full focus:outline-none focus:ring-1 focus:ring-trust"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate text-xs select-none block min-w-0">{conv.title}</span>
          )}
        </div>

        {/* Action Menu Trigger (Discoverable on idle, keyboard focus, and touch) */}
        {!isEditing && (
          <div
            className="shrink-0 w-7 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Conversation options"
                  className={cn(
                    "p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring transition-opacity",
                    isActive ? "opacity-100 text-foreground" : "opacity-60 group-hover:opacity-100 focus:opacity-100"
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <More size={13} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36 text-xs bg-surface-raised border border-border">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    pinConversation(conv.id)
                  }}
                  className="text-xs cursor-pointer"
                >
                  <Pin size={13} className="mr-2 text-beam" />
                  {conv.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    handleStartRename(conv)
                  }}
                  className="text-xs cursor-pointer"
                >
                  <Edit size={13} className="mr-2 text-muted-foreground" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteConversation(conv.id)
                  }}
                  className="text-xs text-deny focus:text-deny cursor-pointer"
                >
                  <Trash size={13} className="mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    )
  }

  const navGroups = [
    {
      category: "Workspace",
      items: [
        { id: "chat", label: "Chat", icon: Ask },
        { id: "sources", label: "Sources", icon: Sheet },
        { id: "vaults", label: "Compartments", icon: Compartment },
      ],
    },
    {
      category: "Security",
      items: [
        { id: "access", label: "Access & Grants", icon: Grant },
        { id: "federation", label: "LAN Federation", icon: Mesh },
        { id: "audit", label: "Audit Ledger", icon: Ledger },
        { id: "chunks", label: "Chunk Store", icon: Verify, isLive: true },
        { id: "tests", label: "Verification", icon: Verify },
      ],
    },
    {
      category: "System",
      items: [{ id: "settings", label: "Settings", icon: Tune }],
    },
  ]

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "border-r border-border bg-surface flex flex-col justify-between transition-all duration-200 z-20 shrink-0 select-none",
          sidebarCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Top: New Chat Action */}
        <div className="p-3">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => startNewChat()}
                  size="icon"
                  className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg cursor-pointer shadow-xs"
                >
                  <Add size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New chat</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              onClick={() => startNewChat()}
              className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 rounded-lg cursor-pointer shadow-xs text-xs font-medium"
            >
              <Add size={15} />
              <span>New chat</span>
              <span className="font-mono text-[10px] text-primary-foreground/60 ml-auto">
                ⌘⇧O
              </span>
            </Button>
          )}
        </div>

        {/* Middle: Conversation History */}
        <ScrollArea className="flex-1 px-2.5">
          {pinnedConversations.length > 0 && (
            <div className="mb-3.5">
              {!sidebarCollapsed && (
                <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground/80 lowercase tracking-normal">
                  pinned
                </div>
              )}
              {pinnedConversations.map(renderConversationItem)}
            </div>
          )}

          {todayConversations.length > 0 && (
            <div className="mb-3.5">
              {!sidebarCollapsed && (
                <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground/80 lowercase tracking-normal">
                  today
                </div>
              )}
              {todayConversations.map(renderConversationItem)}
            </div>
          )}

          {yesterdayConversations.length > 0 && (
            <div className="mb-3.5">
              {!sidebarCollapsed && (
                <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground/80 lowercase tracking-normal">
                  yesterday
                </div>
              )}
              {yesterdayConversations.map(renderConversationItem)}
            </div>
          )}

          {earlierConversations.length > 0 && (
            <div className="mb-3.5">
              {!sidebarCollapsed && (
                <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground/80 lowercase tracking-normal">
                  earlier
                </div>
              )}
              {earlierConversations.map(renderConversationItem)}
            </div>
          )}
        </ScrollArea>

        {/* Bottom: Grouped Section Navigation */}
        <div className="p-2 border-t border-border bg-surface-raised/40 space-y-2">
          {navGroups.map((group) => (
            <div key={group.category} className="space-y-0.5">
              {!sidebarCollapsed && (
                <div className="px-2 pt-1 pb-0.5 text-[10.5px] font-medium text-muted-foreground/70 tracking-tight">
                  {group.category}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon
                const isSelected = currentView === item.id

                if (sidebarCollapsed) {
                  return (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => navigate(item.id as any)}
                          className={cn(
                            "w-9 h-9 mx-auto rounded-lg flex items-center justify-center transition-colors cursor-pointer relative",
                            isSelected
                              ? "bg-secondary text-foreground font-medium ring-1 ring-border"
                              : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                          )}
                        >
                          <Icon size={16} />
                          {item.isLive && (
                            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-trust animate-pulse" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  )
                }

                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id as any)}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer",
                      isSelected
                        ? "bg-secondary text-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon size={14} className="opacity-80" />
                      <span>{item.label}</span>
                    </div>
                    {item.isLive && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-trust">
                        <span className="w-1.5 h-1.5 rounded-full bg-trust animate-pulse" />
                        Live
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </aside>
    </TooltipProvider>
  )
}
