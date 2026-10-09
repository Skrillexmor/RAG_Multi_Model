import React from "react"
import {
  Aperture,
  Search,
  Session,
  Lan,
  ChevronDown,
  Check,
  PanelLeftClose,
  PanelLeftOpen,
  Cpu,
  LogIn,
  LogOut,
} from "../../glyphs"
import { useApp } from "../../context/AppContext"
import { DEMO_PERSONAS } from "../../lib/personas"
import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { Avatar, AvatarFallback } from "../ui/avatar"
import { EngineChip } from "../ui/engine-chip"
import { SessionRing } from "../ui/session-ring"
import { Strata } from "../ui/strata"

export const TopBar: React.FC = () => {
  const {
    persona,
    switchPersona,
    selectedVault,
    timeStatus,
    sidebarCollapsed,
    setSidebarCollapsed,
    setCommandPaletteOpen,
    currentView,
    navigate,
    setIsLlmModalOpen,
    setIsAuthModalOpen,
    selectedTargetFile,
    sessionRemainingSeconds,
    isSessionWarning,
    renewSession,
    logout,
  } = useApp()

  return (
    <header className="h-[52px] border-b border-border bg-surface-raised/90 backdrop-blur-md px-3.5 flex items-center justify-between select-none z-30 shrink-0">
      {/* Left: Sidebar toggle + Brand Lockup & Breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0">
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>

        {/* Brand Lockup per DESIGN.md §6.3 */}
        <div className="flex items-center gap-2 text-sm shrink-0">
          <button
            type="button"
            onClick={() => navigate("chat")}
            className="flex items-center gap-2 font-semibold text-foreground tracking-tight hover:opacity-85 transition-opacity cursor-pointer group"
          >
            <Aperture size={18} accent="hsl(var(--beam))" />
            <span className="font-sans font-medium text-sm">PrivateRAG</span>
            <span className="font-mono text-[10px] text-muted-foreground/80 border-l border-border pl-2 tracking-wider">
              DARS
            </span>
          </button>

          <span className="text-border mx-0.5">/</span>

          <span className="text-muted-foreground text-xs truncate">
            {currentView === "chat" ? (
              <span className="text-foreground flex items-center gap-1.5 truncate">
                <span className="truncate">
                  {selectedVault?.display_name || "General Scope"}
                </span>
                {selectedVault && (
                  <Strata
                    level={selectedVault.classification_ceiling}
                    size="sm"
                  />
                )}
              </span>
            ) : (
              <span className="capitalize">{currentView.replace("-", " ")}</span>
            )}
          </span>
        </div>
      </div>

      {/* Center: Command Palette Trigger */}
      <div className="flex-1 max-w-sm mx-4 hidden lg:block">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full h-8 px-3 rounded-lg bg-surface border border-border text-muted-foreground text-xs flex items-center justify-between hover:border-trust/60 hover:bg-secondary/70 transition-all cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">Search documents, vaults, chunks...</span>
          </span>
          <kbd className="pointer-events-none inline-flex h-4.5 select-none items-center gap-0.5 rounded bg-secondary border border-border/70 px-1.5 font-mono text-[10px] text-muted-foreground shrink-0 ml-2">
            <span>⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Right: Gatelight Status Strip */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Dynamic Engine Chip */}
        <EngineChip
          fileName={selectedTargetFile?.name}
          onClick={() => setIsLlmModalOpen(true)}
          className="hidden sm:inline-flex"
        />

        {/* Air-gap telemetry chip */}
        <div
          className="hidden md:flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-surface border border-border text-xs text-muted-foreground whitespace-nowrap"
          title="Air-gapped LAN: Zero external cloud egress"
        >
          <Lan size={14} className="text-permit" />
          <span className="font-medium text-foreground text-[11px]">Air-gap</span>
        </div>

        {/* Time authority chip */}
        <div
          className="hidden 2xl:flex items-center gap-1.5 px-2.5 h-8 rounded-lg bg-surface border border-border text-xs text-muted-foreground whitespace-nowrap"
          title="Cryptographic trusted time authority (§18)"
        >
          <Session size={14} className="text-muted-foreground" />
          <span className="text-[11px] font-mono">
            Time: {timeStatus?.status === "OK" ? "Verified" : "Syncing"}
          </span>
        </div>

        {/* Gatelight Session Ring */}
        <SessionRing
          remaining={sessionRemainingSeconds}
          warning={isSessionWarning}
          onRenew={renewSession}
        />

        {/* Persona Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-lg hover:bg-secondary border border-border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trust">
              <Avatar className="h-6 w-6 text-xs rounded-md bg-secondary text-foreground border border-border">
                <AvatarFallback className="rounded-md font-medium text-[11px]">
                  {persona.name[0]}
                </AvatarFallback>
              </Avatar>
              <div className="text-left hidden sm:flex items-center gap-1.5">
                <span className="text-xs font-medium text-foreground">
                  {persona.name}
                </span>
                <Strata level={persona.clearanceLevel} size="sm" />
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-0.5" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold leading-none text-foreground">
                    {persona.name}
                  </p>
                  <Strata level={persona.clearanceLevel} size="sm" />
                </div>
                <p className="text-[11px] leading-none text-muted-foreground">
                  {persona.roleTitle}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 py-1.5 text-xs cursor-pointer font-medium text-trust"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Login / Register User</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setIsLlmModalOpen(true)}
              className="flex items-center gap-2 py-1.5 text-xs cursor-pointer text-foreground"
            >
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Local Engines & RAM Guard</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={logout}
              className="flex items-center gap-2 py-1.5 text-xs cursor-pointer text-deny hover:text-deny hover:bg-deny/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out (Revoke Session)</span>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Switch Persona (Demo Mode)
            </div>

            {DEMO_PERSONAS.map((p) => (
              <DropdownMenuItem
                key={p.username}
                onClick={() => switchPersona(p.username)}
                className="flex items-center justify-between py-2 text-xs cursor-pointer"
              >
                <div>
                  <div className="font-medium text-foreground flex items-center gap-1.5">
                    <span>{p.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      (L{p.clearanceLevel})
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.roleTitle}
                  </div>
                </div>
                {p.username === persona.username && (
                  <Check className="h-4 w-4 text-permit" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
