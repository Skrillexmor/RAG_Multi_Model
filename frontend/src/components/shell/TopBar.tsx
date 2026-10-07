import {
  Shield,
  Search,
  Clock,
  Wifi,
  ChevronDown,
  Check,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
  Cpu,
  LogIn,
  UserPlus,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { DEMO_PERSONAS } from "../../lib/personas"
import { Badge } from "../ui/badge"
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

export const TopBar: React.FC = () => {
  const {
    persona,
    switchPersona,
    selectedVault,
    leaseSecondsRemaining,
    timeStatus,
    sidebarCollapsed,
    setSidebarCollapsed,
    setCommandPaletteOpen,
    currentView,
    navigate,
    llmStatus,
    setIsLlmModalOpen,
    setIsAuthModalOpen,
  } = useApp()

  // Format lease seconds
  const formatLease = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  const isLeaseExpiring = leaseSecondsRemaining < 60

  return (
    <header className="h-14 border-b border-border bg-surface-raised/80 backdrop-blur-md px-4 flex items-center justify-between select-none z-30 shrink-0">
      {/* Left: Sidebar toggle + Workspace Breadcrumb */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="text-muted-foreground hover:text-foreground"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>

        <div className="flex items-center gap-2 text-sm">
          <span
            onClick={() => navigate("chat")}
            className="font-semibold text-foreground tracking-tight cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1.5"
          >
            <Shield className="h-4 w-4 text-emerald-400" />
            <span>PrivateRAG</span>
          </span>

          <span className="text-muted-foreground/40">/</span>

          <span className="text-muted-foreground capitalize">
            {currentView === "chat" ? (
              <span className="text-foreground flex items-center gap-1.5">
                <span>{selectedVault?.display_name || "General Scope"}</span>
                {selectedVault && (
                  <Badge variant="clearance" className="text-[10px] py-0 px-1.5">
                    L{selectedVault.classification_ceiling}
                  </Badge>
                )}
              </span>
            ) : (
              currentView.replace("-", " ")
            )}
          </span>
        </div>
      </div>

      {/* Center: Command Palette Trigger */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full h-8 px-3 rounded-md bg-surface-subtle border border-border/80 text-muted-foreground text-xs flex items-center justify-between hover:border-border hover:text-foreground transition-all"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Search conversations, vaults, sources...</span>
          </span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded bg-secondary px-1.5 font-mono text-[10px] text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Right: Security & Network Telemetry + Persona */}
      <div className="flex items-center gap-2">
        {/* Local Offline LLM Status Chip */}
        <button
          type="button"
          onClick={() => setIsLlmModalOpen(true)}
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
            llmStatus?.connected
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
              : "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
          }`}
          title="Click to view Local LLM status, setup guide, and model commands"
        >
          <Cpu className="h-3 w-3" />
          <span>
            {llmStatus?.connected ? `Ollama (${llmStatus.active_model})` : "Local LLM: Safe Extractive"}
          </span>
        </button>

        {/* Offline LAN Telemetry */}
        <div
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-subtle border border-border text-[11px] text-muted-foreground"
          title="Air-gapped local area network: zero cloud connectivity"
        >
          <Wifi className="h-3 w-3 text-emerald-400" />
          <span className="font-medium text-foreground">LAN Native</span>
        </div>

        {/* Time Authority Telemetry */}
        <div
          className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-subtle border border-border text-[11px] text-muted-foreground"
          title="Cryptographic trusted time authority (§18)"
        >
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span>Clock {timeStatus?.status === "OK" ? "Verified" : "Skewed"}</span>
        </div>

        {/* Authorization Lease Indicator */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono transition-colors ${
            isLeaseExpiring
              ? "bg-rose-950/40 border-rose-800/60 text-rose-300 animate-pulse"
              : "bg-surface-subtle border-border text-foreground"
          }`}
          title="Active authorization lease TTL: token auto-expires when counter reaches zero"
        >
          <Lock className="h-3 w-3 text-emerald-400" />
          <span>{formatLease(leaseSecondsRemaining)}</span>
        </div>

        {/* Persona Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 p-1 pl-1.5 pr-2 rounded-full hover:bg-secondary border border-border/80 transition-colors focus:outline-none">
              <Avatar className="h-6 w-6 text-xs bg-emerald-950 text-emerald-300 border border-emerald-800/40">
                <AvatarFallback>{persona.name[0]}</AvatarFallback>
              </Avatar>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-medium leading-none text-foreground flex items-center gap-1">
                  <span>{persona.name}</span>
                  <Badge variant="clearance" className="px-1 py-0 text-[9px] h-3.5">
                    L{persona.clearanceLevel}
                  </Badge>
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-0.5" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-semibold leading-none">{persona.name}</p>
                <p className="text-[11px] leading-none text-muted-foreground">
                  {persona.roleTitle} · Clearance Level {persona.clearanceLevel}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Custom Account & LLM Actions */}
            <DropdownMenuItem
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 py-1.5 text-xs cursor-pointer font-medium text-emerald-400"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In / Register User</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setIsLlmModalOpen(true)}
              className="flex items-center gap-2 py-1.5 text-xs cursor-pointer text-foreground"
            >
              <Cpu className="h-3.5 w-3.5 text-emerald-400" />
              <span>Local LLM Setup & Models</span>
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
                  <div className="text-[11px] text-muted-foreground">{p.roleTitle}</div>
                </div>
                {p.username === persona.username && (
                  <Check className="h-4 w-4 text-emerald-400" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
