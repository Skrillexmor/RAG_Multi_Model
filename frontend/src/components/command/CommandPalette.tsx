import React, { useEffect } from "react"
import { Command } from "cmdk"
import {
  Ask,
  Sheet,
  Compartment,
  Grant,
  Mesh,
  Ledger,
  Verify,
  Tune,
  Add,
  People,
  Refresh,
} from "../../glyphs"
import { useApp } from "../../context/AppContext"
import { DEMO_PERSONAS } from "../../lib/personas"

export const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    navigate,
    startNewChat,
    switchPersona,
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[4px] flex items-center justify-center p-4 animate-in fade-in-0 duration-150">
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface-raised shadow-2xl overflow-hidden e3"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="w-full bg-transparent text-foreground">
          <div className="flex items-center px-3.5 border-b border-border">
            <Command.Input
              placeholder="Type a command or jump to view..."
              className="w-full h-11 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none font-sans"
              autoFocus
            />
          </div>

          <Command.List className="max-h-72 overflow-y-auto p-2 text-xs space-y-1">
            <Command.Empty className="p-4 text-center text-xs text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Quick Actions */}
            <Command.Group
              heading="Quick Actions"
              className="text-[10.5px] font-medium text-muted-foreground px-2 py-1 tracking-tight"
            >
              <Command.Item
                onSelect={() => handleSelect(() => startNewChat())}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Add size={14} className="text-muted-foreground" />
                <span>Start New Chat</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("tests"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Verify size={14} className="text-trust" />
                <span>Run 84-Invariant Security Verification Suite</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("chunks"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Refresh size={14} className="text-muted-foreground" />
                <span>Inspect Canonical Chunk Store</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("audit"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Verify size={14} className="text-permit" />
                <span>Verify Cryptographic Audit Hash Chain</span>
              </Command.Item>
            </Command.Group>

            {/* Navigation */}
            <Command.Group
              heading="Navigation"
              className="text-[10.5px] font-medium text-muted-foreground px-2 py-1 tracking-tight"
            >
              <Command.Item
                onSelect={() => handleSelect(() => navigate("chat"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Ask size={14} className="text-muted-foreground" />
                <span>Chat Workspace</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("sources"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Sheet size={14} className="text-muted-foreground" />
                <span>Knowledge Sources</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("vaults"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Compartment size={14} className="text-muted-foreground" />
                <span>Security Compartments</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("access"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Grant size={14} className="text-muted-foreground" />
                <span>Access & Grants</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("federation"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Mesh size={14} className="text-muted-foreground" />
                <span>LAN Federation</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("audit"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Ledger size={14} className="text-muted-foreground" />
                <span>Audit Ledger</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("tests"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Verify size={14} className="text-trust" />
                <span>Security Invariants & Tests</span>
              </Command.Item>
              <Command.Item
                onSelect={() => handleSelect(() => navigate("settings"))}
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
              >
                <Tune size={14} className="text-muted-foreground" />
                <span>Settings</span>
              </Command.Item>
            </Command.Group>

            {/* Switch Personas */}
            <Command.Group
              heading="Switch Demo Persona"
              className="text-[10.5px] font-medium text-muted-foreground px-2 py-1 tracking-tight"
            >
              {DEMO_PERSONAS.map((p) => (
                <Command.Item
                  key={p.username}
                  onSelect={() => handleSelect(() => switchPersona(p.username))}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-secondary cursor-pointer text-foreground"
                >
                  <div className="flex items-center gap-2.5">
                    <People size={14} className="text-muted-foreground" />
                    <span>
                      {p.name} ({p.roleTitle})
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    L{p.clearanceLevel}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
