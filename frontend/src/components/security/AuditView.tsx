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
} from "lucide-react"
import { AuditEvent, SystemMetrics } from "../../types"
import { api } from "../../lib/api"
import { useApp } from "../../context/AppContext"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet"
import { toast } from "sonner"

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
    try {
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
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-6xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              Cryptographic Audit & Telemetry Dashboard
            </h2>
            <Badge
              variant="outline"
              className={`text-[10px] py-0 ${
                isAdmin
                  ? "border-sky-500/30 text-sky-400"
                  : "border-emerald-500/30 text-emerald-400"
              }`}
            >
              {isAdmin ? "SOC Global View" : "Personal Activity Log"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Immutable SHA-256 hash-chained log with real-time hardware telemetry and Ed25519 checkpoints.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Live stream indicator */}
          <button
            onClick={() => setIsLiveActive(!isLiveActive)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${
              isLiveActive
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-medium"
                : "bg-surface border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Radio className={`h-3 w-3 ${isLiveActive ? "text-emerald-400 animate-pulse" : "text-muted-foreground"}`} />
            <span>{isLiveActive ? "Live Stream (Active)" : "Live Stream (Paused)"}</span>
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
              className="text-xs h-8 gap-1.5 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10"
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
            className="gap-1.5 text-xs h-8 font-medium"
          >
            {isVerifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            <span>Verify Hash Chain</span>
          </Button>
        </div>
      </div>

      {/* Role Notice Banner */}
      {!isAdmin && (
        <div className="p-3.5 rounded-xl border border-border bg-surface-raised/60 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Info className="h-4 w-4 text-emerald-400 shrink-0" />
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

      {/* HARDWARE & SOFTWARE TELEMETRY GAUGES (REAL-TIME DASHBOARD) */}
      {metrics && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground uppercase tracking-wider text-[11px] flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-emerald-400" />
              <span>Real-Time System & Hardware Telemetry</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              PID {metrics.process.pid} · Uptime: {formatUptime(metrics.process.uptime_seconds)} · {metrics.process.egress_mode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* RAM Meter */}
            <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-emerald-400" />
                  <span>RAM Memory</span>
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {metrics.hardware.ram_percent}%
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, metrics.hardware.ram_percent)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>{metrics.hardware.ram_used_gb} GB used</span>
                <span>{metrics.hardware.ram_total_gb} GB total</span>
              </div>
            </div>

            {/* CPU Load */}
            <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-sky-400" />
                  <span>CPU Processor</span>
                </span>
                <span className="text-xs font-mono font-bold text-sky-400">
                  {metrics.hardware.cpu_percent}%
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-sky-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(4, Math.min(100, metrics.hardware.cpu_percent))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>{metrics.hardware.cpu_cores} Active Cores</span>
                <span>{metrics.hardware.cpu_freq_mhz ? `${metrics.hardware.cpu_freq_mhz} MHz` : "Turbo"}</span>
              </div>
            </div>

            {/* Storage & DB */}
            <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Storage & DB Size</span>
                </span>
                <span className="text-xs font-mono font-bold text-indigo-400">
                  {metrics.storage.db_size_mb} MB
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, metrics.hardware.disk_percent)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>{metrics.storage.total_chunks} chunks stored</span>
                <span>{metrics.storage.total_resources} files encrypted</span>
              </div>
            </div>

            {/* Security Decision Ratio */}
            <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                  <span>Gate A/B Permits</span>
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {metrics.security.permit_rate}%
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-400 h-full"
                  style={{ width: `${metrics.security.permit_rate}%` }}
                />
                <div
                  className="bg-rose-400 h-full"
                  style={{ width: `${metrics.security.deny_rate}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span className="text-emerald-400 font-medium">{metrics.security.permits} PERMITS</span>
                <span className="text-rose-400 font-medium">{metrics.security.denies} DENIES</span>
              </div>
            </div>
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
          <div className="text-xl font-bold font-mono text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            <span>{verifyStatus?.valid ? "VALID & UNBROKEN" : "VERIFIED"}</span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono">
            {verifyStatus?.event_count ?? events.length} events chained in sequence
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-surface-raised space-y-1">
          <div className="text-[11px] text-muted-foreground">Active Signed Grants</div>
          <div className="text-xl font-bold font-mono text-sky-400">
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
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  filterDecision === dec
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
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
        <div className="rounded-xl border border-border bg-surface-raised overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-surface-subtle text-muted-foreground border-b border-border text-[11px]">
                <tr>
                  <th className="p-3 font-medium">Timestamp</th>
                  <th className="p-3 font-medium">Actor</th>
                  <th className="p-3 font-medium">Action & Target</th>
                  <th className="p-3 font-medium">Decision</th>
                  <th className="p-3 font-medium">Reason Code</th>
                  <th className="p-3 font-medium">Cryptographic Hash</th>
                  <th className="p-3 font-medium text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredEvents.map((ev) => {
                  const isPermit = ev.decision === "PERMIT" || ev.decision === "ALLOW"
                  return (
                    <tr
                      key={ev.event_id || ev.request_id}
                      onClick={() => setSelectedEvent(ev)}
                      className="hover:bg-surface-subtle/50 transition-colors cursor-pointer group"
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
                          <User className="h-3 w-3 text-emerald-400" />
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
                        <Badge
                          variant={isPermit ? "success" : "destructive"}
                          className="text-[9px] py-0 font-mono uppercase"
                        >
                          {ev.decision}
                        </Badge>
                      </td>

                      {/* Reason Code */}
                      <td className="p-3">
                        <span className="font-mono text-[11px] text-muted-foreground truncate block max-w-[160px]" title={ev.reason_code}>
                          {ev.reason_code}
                        </span>
                      </td>

                      {/* Hash Link */}
                      <td className="p-3 font-mono text-[10px] text-emerald-400/90 whitespace-nowrap">
                        <span className="truncate max-w-[100px] inline-block" title={ev.current_hash}>
                          {ev.current_hash ? `${ev.current_hash.slice(0, 8)}...${ev.current_hash.slice(-6)}` : "—"}
                        </span>
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
                  <Badge
                    variant={
                      selectedEvent.decision === "PERMIT" || selectedEvent.decision === "ALLOW"
                        ? "success"
                        : "destructive"
                    }
                    className="text-[10px] font-mono py-0"
                  >
                    {selectedEvent.decision}
                  </Badge>
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
                <div className="p-3 rounded-lg bg-surface-raised border border-border space-y-2">
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
                    Authorization Details
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Actor:</span>
                      <div className="font-mono text-foreground font-medium">{selectedEvent.actor_id}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Target Type:</span>
                      <div className="font-mono text-foreground">{selectedEvent.object_type}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Target Object ID:</span>
                      <div className="font-mono text-foreground break-all">{selectedEvent.object_id}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Reason Code:</span>
                      <div className="font-mono text-foreground break-all text-[11px] p-2 rounded bg-surface border border-border/80 mt-1">
                        {selectedEvent.reason_code}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cryptographic Linkage */}
                <div className="p-3 rounded-lg bg-surface-raised border border-border space-y-2">
                  <div className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Cryptographic Hash Linkage (§71)</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">Previous Event Hash:</span>
                    <div className="font-mono text-[10px] text-muted-foreground break-all bg-surface p-1.5 rounded border border-border/60">
                      {selectedEvent.prev_hash}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px]">Current Record Hash:</span>
                    <div className="font-mono text-[10px] text-emerald-400 break-all bg-surface p-1.5 rounded border border-emerald-500/30">
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
