import React, { useState, useEffect } from "react"
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
} from "lucide-react"
import { AuditEvent } from "../../types"
import { api } from "../../lib/api"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet"
import { toast } from "sonner"

export const AuditView: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)
  const [isVerifying, setIsVerifying] = useState<boolean>(false)
  const [verifyStatus, setVerifyStatus] = useState<{
    valid: boolean
    event_count: number
    error: string | null
  } | null>(null)
  const [filterDecision, setFilterDecision] = useState<string>("ALL")
  const [search, setSearch] = useState<string>("")

  const loadAuditData = async () => {
    try {
      const [eRes, vRes] = await Promise.all([
        api.getAuditEvents(100),
        api.verifyAuditChain(),
      ])
      setEvents(eRes.events || [])
      setVerifyStatus(vRes)
    } catch (err: any) {
      toast.error(`Failed to load audit events: ${err.message}`)
    }
  }

  useEffect(() => {
    loadAuditData()
  }, [])

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

  const filteredEvents = events.filter((ev) => {
    const matchesFilter = filterDecision === "ALL" || ev.decision === filterDecision
    const matchesSearch =
      ev.action.toLowerCase().includes(search.toLowerCase()) ||
      ev.actor_id.toLowerCase().includes(search.toLowerCase()) ||
      ev.reason_code.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            Cryptographic Audit Trail (§16, §71)
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Immutable SHA-256 hash-chained log with Ed25519 signed checkpoints.
          </p>
        </div>

        <Button
          size="sm"
          variant="security"
          onClick={handleVerifyChain}
          disabled={isVerifying}
          className="gap-1.5 text-xs h-8"
        >
          {isVerifying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span>Verify Hash Chain</span>
        </Button>
      </div>

      {/* Verification Status Banner */}
      {verifyStatus && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            verifyStatus.valid
              ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300"
              : "bg-rose-950/30 border-rose-800/40 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {verifyStatus.valid ? (
              <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-rose-400 shrink-0" />
            )}
            <div>
              <div className="font-semibold text-sm">
                {verifyStatus.valid
                  ? "Cryptographic Hash Chain Intact"
                  : "Hash Chain Verification Failure"}
              </div>
              <div className="text-[11px] opacity-80 mt-0.5">
                {verifyStatus.valid
                  ? `Verified ${verifyStatus.event_count} sequential audit records: H(n) = SHA256(H(n-1) || Event).`
                  : `Integrity breach: ${verifyStatus.error}`}
              </div>
            </div>
          </div>
          <Badge
            variant={verifyStatus.valid ? "success" : "danger"}
            className="text-xs px-2.5 py-1 font-mono shrink-0"
          >
            {verifyStatus.valid ? "VERIFIED" : "BROKEN"}
          </Badge>
        </div>
      )}

      {/* Controls: Filter & Search */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search action, actor, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-8"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {["ALL", "ALLOW", "DENY"].map((dec) => (
            <button
              key={dec}
              onClick={() => setFilterDecision(dec)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filterDecision === dec
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              {dec}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Event Timeline */}
      <div className="space-y-2">
        {filteredEvents.map((ev) => (
          <div
            key={ev.event_id}
            onClick={() => setSelectedEvent(ev)}
            className="p-3 rounded-xl border border-border bg-surface-raised hover:border-border/80 transition-all flex items-center justify-between gap-3 text-xs cursor-pointer group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Badge
                variant={ev.decision === "ALLOW" ? "success" : "danger"}
                className="text-[10px] py-0 px-1.5 font-mono shrink-0"
              >
                {ev.decision}
              </Badge>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground truncate">
                    {ev.action}
                  </span>
                  <span className="text-muted-foreground">by</span>
                  <span className="font-mono text-[11px] text-foreground">
                    {ev.actor_id}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                  Reason: {ev.reason_code}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline-block">
                {new Date(ev.timestamp).toLocaleTimeString()}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
            </div>
          </div>
        ))}
      </div>

      {/* Event Details Sheet */}
      <Sheet open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader className="pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-emerald-400" />
              <SheetTitle className="text-base font-semibold">
                Audit Event Record
              </SheetTitle>
            </div>
            <SheetDescription className="text-xs">
              Cryptographic proof and metadata for event: {selectedEvent?.event_id}
            </SheetDescription>
          </SheetHeader>

          {selectedEvent && (
            <div className="py-4 space-y-3.5 text-xs">
              <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Action</span>
                  <span className="font-semibold text-foreground">{selectedEvent.action}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Decision</span>
                  <Badge variant={selectedEvent.decision === "ALLOW" ? "success" : "danger"}>
                    {selectedEvent.decision}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actor</span>
                  <span className="font-mono text-foreground">{selectedEvent.actor_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Timestamp</span>
                  <span className="font-mono text-muted-foreground">
                    {new Date(selectedEvent.timestamp).toISOString()}
                  </span>
                </div>
              </div>

              {/* Cryptographic Hash Chain Proof */}
              <div className="space-y-2">
                <div className="font-semibold text-foreground text-xs">
                  SHA-256 Hash Chain Proof
                </div>
                <div className="p-3 rounded-lg border border-border bg-surface-raised space-y-2 font-mono text-[11px]">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Previous Hash H(n-1):</span>
                    <span className="text-foreground break-all">{selectedEvent.prev_hash}</span>
                  </div>
                  <div className="pt-2 border-t border-border/40">
                    <span className="text-muted-foreground block text-[10px]">Current Hash H(n):</span>
                    <span className="text-emerald-400 break-all">{selectedEvent.current_hash}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
