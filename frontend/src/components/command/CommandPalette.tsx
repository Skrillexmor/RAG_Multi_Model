import React, { useEffect } from "react"
import { Command } from "cmdk"
import {
  MessageSquare,
  FileText,
  ShieldCheck,
  KeyRound,
  Network,
  History,
  ShieldAlert,
  Settings,
  Plus,
  User,
  RotateCw,
  CheckCircle2,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { DEMO_PERSONAS } from "../../lib/personas"

export const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    navigate,
    startNewChat,
    switchPersona,
    vaults,
    setSelectedVault,
  } = useApp()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  if (!commandPaletteOpen) return null

  const handleSelect = (callback: () => void) => {
    callback()
    setCommandPaletteOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in-0 duration-150">
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface-raised shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="w-full bg-transparent text-foreground">
          <div className="flex items-center px-3 border-b border-border">
            <Command.Input
              placeholder="Type a command or search..."
              className="w-full h-11 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
          </div>

          <Command.List className="max-h-72 overflow-y-auto p-2 text-xs space-y-1">
            <Command.Empty className="p-4 text-center text-xs text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Quick Actions */}
            <Command.Group heading="Quick Actions" className="text-[10px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">
              <Command.Item
                onSelect={() => handleSelect(() => startNewChat())}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
              >
                <Plus className="h-4 w-4 text-emerald-400" />
                <span>Start New Chat</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("tests"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
              >
                <RotateCw className="h-4 w-4 text-emerald-400" />
                <span>Run 84 Security Invariant Tests</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("audit"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>Verify Cryptographic Audit Hash Chain</span>
              </Command.Item>
            </Command.Group>

            {/* Navigation */}
            <Command.Group heading="Navigation" className="text-[10px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">
              <Command.Item
                onSelect={() => handleSelect(() => navigate("chat"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
              >
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>Chat Workspace</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("sources"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
              >
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>Knowledge Sources</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("access"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
              >
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <span>Access & Grants</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("federation"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
              >
                <Network className="h-4 w-4 text-muted-foreground" />
                <span>LAN Federation</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("audit"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
              >
                <History className="h-4 w-4 text-muted-foreground" />
                <span>Audit Trail</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("settings"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span>Settings</span>
              </Command.Item>
            </Command.Group>

            {/* Switch Personas */}
            <Command.Group heading="Switch Demo Persona" className="text-[10px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">
              {DEMO_PERSONAS.map((p) => (
                <Command.Item
                  key={p.username}
                  onSelect={() => handleSelect(() => switchPersona(p.username))}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{p.name} ({p.roleTitle})</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Level {p.clearanceLevel}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Switch Vaults */}
            <Command.Group heading="Authorized Workspaces" className="text-[10px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">
              {vaults.map((v) => (
                <Command.Item
                  key={v.vault_id}
                  onSelect={() =>
                    handleSelect(() => {
                      setSelectedVault(v)
                      navigate("chat")
                    })
                  }
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-secondary cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>{v.display_name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Ceiling L{v.classification_ceiling}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>

      <div
        className="fixed inset-0 -z-10"
        onClick={() => setCommandPaletteOpen(false)}
      />
    </div>
  )
}
