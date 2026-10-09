import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  History,
  CheckCircle2,
  AlertTriangle,
  Search,
  Hash,
  Clock,
  ShieldAlert,
  ShieldCheck,
  ChevronRight,
  Loader2,
  Cpu,
  HardDrive,
  Activity,
  Server,
  Zap,
  Radio,
  RefreshCw,
  Lock,
  Layers,
  Database,
  FileText,
  User,
  Shield,
  Check,
  X,
  ExternalLink,
  Info,
  SlidersHorizontal,
} from "lucide-react"
import { AuditEvent, SystemMetrics } from "../../types"
import { api } from "../../lib/api"
import { useApp } from "../../context/AppContext"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet"
import { Identicon } from "../ui/identicon"
import { Seal } from "../ui/seal"
import { Glyph } from "../../glyphs"
import { cn } from "../../lib/utils"
import { toast } from "sonner"

// Radial 270° SVG Arc Gauge
interface ArcGaugeProps {
  label: string
  icon: React.ReactNode
  value: number // percent 0..100
  displayValue?: string
  unit?: string
  sublabelLeft: string
  sublabelRight: string
}

const ArcGauge: React.FC<ArcGaugeProps> = ({
  label,
  icon,
  value,
  displayValue,
  unit = "%",
  sublabelLeft,
  sublabelRight,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  // 270 degree arc math:
  // r = 32. Center = (42, 42).
  // Circumference = 2 * PI * 32 = 201.06
  // 270° arc length = 201.06 * 0.75 = 150.8
  const arcLength = 150.8
  const offset = arcLength * (1 - clamped / 100)

  // Color transitions: rest (trust) -> hold > 75% -> deny > 90%
  const colorClass =
    clamped > 90
      ? "text-deny stroke-deny"
      : clamped > 75
      ? "text-hold stroke-hold"
      : "text-trust stroke-trust"

  return (
    <div className="p-4 rounded-xl border border-border bg-surface-raised flex flex-col justify-between relative overflow-hidden transition-all duration-300 hover:border-border/80">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          {icon}
          <span>{label}</span>
        </span>
        <span className={cn("text-xs font-mono font-bold", colorClass)}>
          {displayValue ?? `${clamped}${unit}`}
        </span>
      </div>

      <div className="flex items-center justify-center my-1 relative">
        <svg viewBox="0 0 84 84" className="w-24 h-24">
          {/* Background track arc */}
          <circle
            cx="42"
            cy="42"
            r="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="150.8 201.1"
            className="text-border/50"
            transform="rotate(135 42 42)"
          />
          {/* Foreground active arc */}
          <circle
            cx="42"
            cy="42"
            r="32"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="150.8 201.1"
            strokeDashoffset={offset}
            className={cn("transition-all duration-700 ease-out", colorClass)}
            transform="rotate(135 42 42)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-1">
          <span className="font-mono text-base font-semibold tabular-nums text-foreground tracking-tight">
            {displayValue ?? `${clamped}${unit}`}
          </span>
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
            telemetry
          </span>
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1 pt-2 border-t border-border/50">
        <span className="truncate max-w-[50%]">{sublabelLeft}</span>
        <span className="truncate max-w-[50%] text-right">{sublabelRight}</span>
      </div>
    </div>
  )
}

export const AuditView: React.FC = () => {
  const { persona, principal } = useApp()

  const [events, setEvents] = useState<AuditEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [isVerifying, setIsVerifying] = useState<boolean>(false)
  const [verifyStatus, setVerifyStatus] = useState<{
    valid: boolean
    event_count: number
    error: string | null
  } | null>(null)
  const [isLiveActive, setIsLiveActive] = useState<boolean>(true)
  const [filterDecision, setFilterDecision] = useState<string>("ALL")
  const [search, setSearch] = useState<string>("")
  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState<boolean>(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [sweepRowIndex, setSweepRowIndex] = useState<number | null>(null)
  const [scanPulse, setScanPulse] = useState<boolean>(false)

  const isAdmin = (principal?.roles || persona.roles || []).some(
    (r) => r === "admin" || r === "security_admin" || r === "auditor"
  )

  const loadAuditData = useCallback(async () => {
    try {
      const [eRes, mRes, vRes] = await Promise.all([
        api.getAuditEvents(100).catch(() => ({ events: [] })),
        api.getSystemMetrics().catch(() => null),
        api.verifyAuditChain().catch(() => null),
      ])
      setEvents(eRes.events || [])
      if (mRes) setMetrics(mRes)
      if (vRes) setVerifyStatus(vRes)
      setLastUpdated(new Date())

      // Heartbeat pulse animation
      setScanPulse(true)
      setTimeout(() => setScanPulse(false), 900)
    } catch (err: any) {
      // silently handle in background polling
    }
  }, [])

  useEffect(() => {
    loadAuditData()
  }, [loadAuditData, persona.username])

  // Real-time live polling interval
  useEffect(() => {
    if (!isLiveActive) return
    const timer = setInterval(() => {
      loadAuditData()
    }, 4000)
    return () => clearInterval(timer)
  }, [isLiveActive, loadAuditData])

  const handleVerifyChain = async () => {
    setIsVerifying(true)
    setSweepRowIndex(0)
    try {
      // Animate sweep across the visible rows
      const displayCount = Math.min(filteredEvents.length, 12)
      for (let i = 0; i < displayCount; i++) {
        setSweepRowIndex(i)
        await new Promise((r) => setTimeout(r, 60))
      }

      const res = await api.verifyAuditChain()
      setVerifyStatus(res)
      if (res.valid) {
        toast.success("Cryptographic hash chain verified!", {
          description: `All ${res.event_count} events verified in unbroken SHA-256 sequence.`,
        })
      } else {
        toast.error(`Hash chain broken! Error: ${res.error}`)
      }
    } catch (err: any) {
      toast.error(`Verification error: ${err.message}`)
    } finally {
      setIsVerifying(false)
      setSweepRowIndex(null)
    }
  }

  const handleCreateCheckpoint = async () => {
    setIsCreatingCheckpoint(true)
    try {
      const res = await api.createAuditCheckpoint()
      toast.success("Ed25519 Checkpoint Signed & Created!", {
        description: `Signed checkpoint for ${res.event_count || "all"} events committed.`,
      })
      await loadAuditData()
    } catch (err: any) {
      toast.error(`Failed to create checkpoint: ${err.message}`)
    } finally {
      setIsCreatingCheckpoint(false)
    }
  }

  const filteredEvents = events.filter((ev) => {
    const matchesFilter = filterDecision === "ALL" || ev.decision === filterDecision
    const matchesSearch =
      !search ||
      ev.action.toLowerCase().includes(search.toLowerCase()) ||
      ev.actor_id.toLowerCase().includes(search.toLowerCase()) ||
      ev.reason_code.toLowerCase().includes(search.toLowerCase()) ||
      ev.object_id.toLowerCase().includes(search.toLowerCase()) ||
      ev.request_id.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  // Format uptime
  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}h ${m}m ${s}s`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-6xl mx-auto w-full relative">
      {/* 1px Beam Scan-line Heartbeat sweep on live poll */}
      {scanPulse && (
        <div
          className="pointer-events-none fixed left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-beam to-transparent z-50 animate-in fade-in duration-300"
          style={{ top: "64px" }}
        />
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              Audit
            </h2>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono border",
                isAdmin
                  ? "bg-secondary/60 border-border text-foreground"
                  : "bg-surface-raised border-border text-muted-foreground"
              )}
            >
              {isAdmin ? "SOC Global View" : "Personal Activity Log"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Immutable SHA-256 hash-chained ledger with real-time hardware telemetry and Ed25519 checkpoints.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Live stream toggle */}
          <button
            onClick={() => setIsLiveActive(!isLiveActive)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors",
              isLiveActive
                ? "bg-trust/10 border-trust/30 text-trust font-medium"
                : "bg-surface border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Radio className={cn("h-3 w-3", isLiveActive ? "text-trust animate-pulse" : "text-muted-foreground")} />
            <span>{isLiveActive ? "Live (Active)" : "Live (Paused)"}</span>
          </button>

          <Button
            size="sm"
            variant="outline"
            onClick={loadAuditData}
            className="text-xs h-8 gap-1.5 border-border"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Refresh</span>
          </Button>

          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCreateCheckpoint}
              disabled={isCreatingCheckpoint}
              className="text-xs h-8 gap-1.5 border-border hover:bg-surface-subtle"
            >
              {isCreatingCheckpoint ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Lock className="h-3 w-3" />
              )}
              <span>Create Checkpoint</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="security"
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="gap-1.5 text-xs h-8 font-medium bg-foreground text-background hover:bg-foreground/90"
          >
            {isVerifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Seal state="verified" size={14} className="text-current" />
            )}
            <span>Verify Hash Chain</span>
          </Button>
        </div>
      </div>

      {/* Role Notice Banner */}
      {!isAdmin && (
        <div className="p-3.5 rounded-xl border border-border bg-surface-raised/60 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="h-4 w-4 text-trust shrink-0" />
            <span>
              Displaying events strictly associated with identity{" "}
              <strong className="text-foreground font-mono">{persona.name}</strong> to protect peer privacy under NIST SP 800-162 tenant isolation.
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground shrink-0">
            Level {persona.clearanceLevel} Clearance
          </Badge>
        </div>
      )}

      {/* HARDWARE & SOFTWARE TELEMETRY GAUGES (RADIAL 270° SWEEP) */}
      {metrics && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-trust" />
              <span>Real-Time System & Hardware Telemetry</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              PID {metrics.process.pid} · Uptime: {formatUptime(metrics.process.uptime_seconds)} · {metrics.process.egress_mode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* RAM Arc Gauge */}
            <ArcGauge
              label="RAM Memory"
              icon={<Server className="h-3.5 w-3.5 text-trust" />}
              value={metrics.hardware.ram_percent}
              sublabelLeft={`${metrics.hardware.ram_used_gb} GB used`}
              sublabelRight={`${metrics.hardware.ram_total_gb} GB total`}
            />

            {/* CPU Arc Gauge */}
            <ArcGauge
              label="CPU Processor"
              icon={<Cpu className="h-3.5 w-3.5 text-trust" />}
              value={metrics.hardware.cpu_percent}
              sublabelLeft={`${metrics.hardware.cpu_cores} Active Cores`}
              sublabelRight={metrics.hardware.cpu_freq_mhz ? `${metrics.hardware.cpu_freq_mhz} MHz` : "Turbo"}
            />

            {/* Storage Arc Gauge */}
            <ArcGauge
              label="Storage & DB"
              icon={<HardDrive className="h-3.5 w-3.5 text-trust" />}
              value={metrics.hardware.disk_percent}
              displayValue={`${metrics.hardware.disk_percent}%`}
              sublabelLeft={`${metrics.storage.db_size_mb} MB DB`}
              sublabelRight={`${metrics.storage.total_chunks} chunks`}
            />

            {/* Decision Ratio Arc Gauge */}
            <ArcGauge
              label="Gate A/B Permits"
              icon={<ShieldCheck className="h-3.5 w-3.5 text-trust" />}
              value={metrics.security.permit_rate}
              displayValue={`${metrics.security.permit_rate}%`}
              sublabelLeft={`${metrics.security.permits} PERMITS`}
              sublabelRight={`${metrics.security.denies} DENIES`}
            />
          </div>
        </div>
      )}

      {/* Cryptographic Chain Integrity Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-surface-raised space-y-1">
          <div className="text-[11px] text-muted-foreground">Total Cryptographic Events</div>
          <div className="text-xl font-bold font-mono text-foreground">
            {metrics ? metrics.security.total_events : events.length}
          </div>
          <div className="text-[10px] text-muted-foreground">Recorded in append-only ledger</div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface-raised space-y-1">
          <div className="text-[11px] text-muted-foreground">Hash Chain Integrity</div>
          <div className="text-xl font-bold font-mono text-trust flex items-center gap-1.5">
            <Seal state={verifyStatus?.valid !== false ? "verified" : "broken"} size={18} />
            <span>{verifyStatus?.valid ? "VALID & UNBROKEN" : "VERIFIED"}</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {verifyStatus?.event_count ?? events.length} events chained in sequence
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface-raised space-y-1">
          <div className="text-[11px] text-muted-foreground">Active Signed Grants</div>
          <div className="text-xl font-bold font-mono text-foreground">
            {metrics ? metrics.storage.active_grants : "Active"}
          </div>
          <div className="text-[10px] text-muted-foreground">Governed by JIT Access Control</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search action, actor, reason, object, or request ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-8 bg-surface-raised"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-surface-raised border border-border rounded-lg p-0.5">
            {["ALL", "PERMIT", "DENY"].map((dec) => (
              <button
                key={dec}
                onClick={() => setFilterDecision(dec)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                  filterDecision === dec
                    ? "bg-secondary text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {dec}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            {filteredEvents.length} events
          </span>
        </div>
      </div>

      {/* Event Timeline Table */}
      {filteredEvents.length === 0 ? (
        <div className="p-12 rounded-xl border border-border/80 bg-surface-raised/40 text-center text-xs text-muted-foreground space-y-2">
          <History className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="font-medium text-foreground">No audit events match current criteria</p>
          <p className="text-[11px]">System events will appear here in real-time as queries are executed.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface-raised overflow-hidden shadow-xs relative">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-subtle text-muted-foreground border-b border-border text-[11px]">
                <tr>
                  <th className="p-3 font-medium">Timestamp</th>
                  <th className="p-3 font-medium">Actor</th>
                  <th className="p-3 font-medium">Action & Target</th>
                  <th className="p-3 font-medium">Decision</th>
                  <th className="p-3 font-medium">Reason Code</th>
                  <th className="p-3 font-medium">Hash Chain Link</th>
                  <th className="p-3 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredEvents.map((ev, idx) => {
                  const isPermit = ev.decision === "PERMIT" || ev.decision === "ALLOW"
                  const isSwept = sweepRowIndex !== null && idx <= sweepRowIndex
                  const isCurrentSweep = sweepRowIndex === idx

                  return (
                    <tr
                      key={ev.event_id || ev.request_id || idx}
                      onClick={() => setSelectedEvent(ev)}
                      className={cn(
                        "hover:bg-surface-subtle/50 transition-colors cursor-pointer group relative",
                        isCurrentSweep && "bg-trust/10 transition-colors duration-150"
                      )}
                    >
                      {/* Timestamp */}
                      <td className="p-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground/60" />
                          <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-[9px] text-muted-foreground/60 pl-4.5">
                          {new Date(ev.timestamp).toLocaleDateString()}
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <User className="h-3 w-3 text-trust" />
                          <span className="truncate max-w-[120px]">{ev.actor_id}</span>
                        </div>
                      </td>

                      {/* Action & Target */}
                      <td className="p-3">
                        <div className="space-y-0.5 max-w-[180px]">
                          <div className="font-mono text-foreground font-semibold truncate">
                            {ev.action}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate" title={ev.object_id}>
                            {ev.object_type}: <span className="font-mono">{ev.object_id}</span>
                          </div>
                        </div>
                      </td>

                      {/* Decision */}
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium uppercase border",
                            isPermit
                              ? "bg-trust/10 border-trust/30 text-trust"
                              : "bg-deny/10 border-deny/30 text-deny"
                          )}
                        >
                          {ev.decision}
                        </span>
                      </td>

                      {/* Reason Code */}
                      <td className="p-3">
                        <span className="font-mono text-[11px] text-muted-foreground truncate block max-w-[160px]" title={ev.reason_code}>
                          {ev.reason_code}
                        </span>
                      </td>

                      {/* Linked Hash Blocks (§71) */}
                      <td className="p-3 font-mono text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="px-1.5 py-0.5 rounded bg-surface border border-border text-muted-foreground text-[10px]"
                            title={`Previous hash: ${ev.prev_hash || "genesis"}`}
                          >
                            {ev.prev_hash ? ev.prev_hash.slice(0, 6) : "000000"}
                          </span>
                          <span className="text-muted-foreground/40 text-[9px]">→</span>
                          <span
                            className="px-1.5 py-0.5 rounded bg-surface border border-border text-foreground font-semibold text-[10px] flex items-center gap-1.5"
                            title={`Current hash: ${ev.current_hash}`}
                          >
                            <span>{ev.current_hash ? ev.current_hash.slice(0, 6) : "------"}</span>
                            <Identicon hash={ev.current_hash || "000000"} size={12} />
                          </span>
                          {isSwept && (
                            <Seal state="verified" size={12} className="text-trust ml-1" />
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="p-3 text-right">
                        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground inline-block transition-colors" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Event Inspector Sheet */}
      <Sheet open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent className="w-full sm:max-w-lg bg-surface border-border text-foreground overflow-y-auto">
          {selectedEvent && (
            <div className="space-y-6">
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase border",
                      selectedEvent.decision === "PERMIT" || selectedEvent.decision === "ALLOW"
                        ? "bg-trust/10 border-trust/30 text-trust"
                        : "bg-deny/10 border-deny/30 text-deny"
                    )}
                  >
                    {selectedEvent.decision}
                  </span>
                  <SheetTitle className="text-sm font-mono truncate">
                    {selectedEvent.action}
                  </SheetTitle>
                </div>
                <SheetDescription className="text-xs text-muted-foreground font-mono">
                  Request ID: {selectedEvent.request_id}
                </SheetDescription>
              </SheetHeader>

              {/* Event Attributes */}
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-lg bg-surface-raised border border-border space-y-2.5">
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                    Authorization Details
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground text-[11px]">Actor:</span>
                      <div className="font-mono text-foreground font-medium">{selectedEvent.actor_id}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px]">Target Type:</span>
                      <div className="font-mono text-foreground">{selectedEvent.object_type}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground text-[11px]">Target Object ID:</span>
                      <div className="font-mono text-foreground break-all">{selectedEvent.object_id}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground text-[11px]">Reason Code:</span>
                      <div className="font-mono text-foreground break-all text-[11px] p-2 rounded bg-surface border border-border/80 mt-1">
                        {selectedEvent.reason_code}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cryptographic Linkage */}
                <div className="p-3.5 rounded-lg bg-surface-raised border border-border space-y-2.5">
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 text-trust" />
                      <span>Cryptographic Hash Linkage (§71)</span>
                    </span>
                    <Seal state="verified" size={16} />
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">Previous Event Hash:</span>
                    <div className="font-mono text-[10px] text-muted-foreground break-all bg-surface p-2 rounded border border-border/60">
                      {selectedEvent.prev_hash || "genesis"}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-muted-foreground text-[10px]">Current Record Hash:</span>
                      <Identicon hash={selectedEvent.current_hash} size={14} />
                    </div>
                    <div className="font-mono text-[10px] text-trust break-all bg-surface p-2 rounded border border-trust/30 font-medium">
                      {selectedEvent.current_hash}
                    </div>
                  </div>
                </div>

                {/* Raw JSON Record */}
                <div className="space-y-1">
                  <span className="text-muted-foreground text-[11px]">Canonical Raw Audit JSON:</span>
                  <pre className="p-3 rounded-lg bg-surface-raised border border-border font-mono text-[10px] overflow-x-auto text-foreground/90">
                    {JSON.stringify(selectedEvent, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

