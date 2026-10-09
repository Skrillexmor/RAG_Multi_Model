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
  LogOut,
  RefreshCw,
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
    selectedTargetFile,
    sessionRemainingSeconds,
    isSessionWarning,
    renewSession,
    logout,
  } = useApp()

  // Format seconds into MM:SS
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  // Dynamic live model auto-detection based on selected file extension
  const getActiveModelInfo = () => {
    if (!selectedTargetFile?.name) {
      return {
        badge: "💬 Gemma 3 4B",
        title: "Gemma 3 4B (Neural LLM)",
        modality: "Neural LLM",
        colorClass: "bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20",
        dotClass: "bg-blue-400",
        tag: "LLM Active",
      }
    }
    const ext = selectedTargetFile.name.split(".").pop()?.toLowerCase() || ""
    if (["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(ext)) {
      return {
        badge: "🎙️ Whisper Base",
        title: "Whisper Base (Speech-to-Text)",
        modality: "Audio STT",
        colorClass: "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20",
        dotClass: "bg-amber-400 animate-pulse",
        tag: "Whisper Active",
      }
    }
    if (["png", "jpg", "jpeg", "webp", "bmp", "tiff"].includes(ext)) {
      return {
        badge: "👁️ Qwen 2.5-VL",
        title: "Qwen 2.5-VL 3B (Multimodal Vision)",
        modality: "Vision AI",
        colorClass: "bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20",
        dotClass: "bg-purple-400 animate-pulse",
        tag: "Qwen-VL Active",
      }
    }
    if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) {
      return {
        badge: "🎬 Whisper + Qwen-VL",
        title: "Whisper + Qwen-VL (Video Multimodal)",
        modality: "Video AI",
        colorClass: "bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20",
        dotClass: "bg-cyan-400 animate-pulse",
        tag: "Video AI Active",
      }
    }
    return {
      badge: "💬 Gemma 3 4B",
      title: "Gemma 3 4B (Document Synthesis)",
      modality: "Document LLM",
      colorClass: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20",
      dotClass: "bg-emerald-400",
      tag: "LLM Active",
    }
  }

  const liveModel = getActiveModelInfo()

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
      <div className="flex-1 max-w-sm mx-auto hidden lg:block">
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="w-full h-8 px-3 rounded-lg bg-surface-subtle/80 border border-border/70 text-muted-foreground text-xs flex items-center justify-between hover:border-emerald-500/40 hover:bg-surface-raised transition-all shadow-xs"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
            <span className="truncate">Search all documents, vaults, chunks...</span>
          </span>
          <kbd className="pointer-events-none inline-flex h-4.5 select-none items-center gap-0.5 rounded bg-secondary/80 border border-border/50 px-1.5 font-mono text-[10px] text-muted-foreground shrink-0 ml-2">
            <span>⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Right: Security & Network Telemetry + Persona */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {/* Dynamic Multi-Modal Live Model Indicator */}
        <button
          type="button"
          onClick={() => setIsLlmModalOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 h-8 rounded-lg border text-xs font-medium transition-all cursor-pointer whitespace-nowrap shadow-xs ${liveModel.colorClass}`}
          title={`Active Model: ${liveModel.title} · RAM Guard: Single-Model Active (Click to inspect)`}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${liveModel.dotClass}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${liveModel.dotClass}`} />
          </span>
          <span className="font-semibold tracking-tight">{liveModel.badge}</span>
          <span className="text-[10px] opacity-75 font-mono hidden md:inline px-1 py-0 rounded bg-background/40">
            {liveModel.modality}
          </span>
        </button>

        {/* Offline LAN Telemetry */}
        <div
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 h-8 rounded-lg bg-surface-subtle border border-border/70 text-xs text-muted-foreground whitespace-nowrap"
          title="Air-gapped local area network: zero external cloud connectivity"
        >
          <Wifi className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="font-medium text-foreground text-[11px]">LAN</span>
        </div>

        {/* Time Authority Telemetry */}
        <div
          className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 h-8 rounded-lg bg-surface-subtle border border-border/70 text-xs text-muted-foreground whitespace-nowrap"
          title="Cryptographic trusted time authority (§18)"
        >
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[11px]">Time: {timeStatus?.status === "OK" ? "Verified" : "Syncing"}</span>
        </div>

        {/* Authoritative Session Inactivity Countdown Capsule */}
        <button
          type="button"
          onClick={renewSession}
          className={`group flex items-center gap-1.5 px-2.5 py-1 h-8 rounded-lg border text-xs font-mono transition-all cursor-pointer whitespace-nowrap ${
            isSessionWarning
              ? "bg-amber-950/80 border-amber-500 text-amber-200 animate-pulse shadow-sm shadow-amber-500/30"
              : "bg-surface-subtle border-border/80 text-foreground hover:border-emerald-500/50 hover:bg-secondary/70 shadow-xs"
          }`}
          title="Authoritative 5-minute inactivity session. Resets on mouse, keyboard, or scroll. Click to extend."
        >
          <Clock className={`h-3.5 w-3.5 shrink-0 ${isSessionWarning ? "text-amber-400" : "text-emerald-400"}`} />
          <span className="text-muted-foreground text-[11px] hidden sm:inline">Session:</span>
          <span className="font-semibold tracking-tight">{formatTime(sessionRemainingSeconds)}</span>
          <RefreshCw className="h-3 w-3 text-muted-foreground/60 group-hover:text-emerald-400 group-hover:rotate-180 transition-all ml-0.5" />
        </button>


        {/* Divider */}
        <div className="h-4 w-px bg-border/60 mx-0.5 hidden xs:block" />

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
              <span>Login / Register User</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setIsLlmModalOpen(true)}
              className="flex items-center gap-2 py-1.5 text-xs cursor-pointer text-foreground"
            >
              <Cpu className="h-3.5 w-3.5 text-emerald-400" />
              <span>Local LLM Setup & Models</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={logout}
              className="flex items-center gap-2 py-1.5 text-xs cursor-pointer text-rose-400 hover:text-rose-300 hover:bg-rose-950/20"
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
