import React, { useState, useEffect } from "react"
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { SecurityTestResult } from "../../types"
import { api } from "../../lib/api"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { Input } from "../ui/input"
import { toast } from "sonner"

export const SecurityTestsView: React.FC = () => {
  const [results, setResults] = useState<SecurityTestResult[]>([])
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL")
  const [search, setSearch] = useState<string>("")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const handleRunTests = async () => {
    setIsRunning(true)
    try {
      const res = await api.runSecurityTests()
      setResults(res.results || [])
      toast.success("Security suite execution complete!", {
        description: `Total: ${res.total} | Passed: ${res.passed} | Failed: ${res.failed}`,
      })
    } catch (err: any) {
      toast.error(`Test execution failed: ${err.message}`)
    } finally {
      setIsRunning(false)
    }
  }

  // Auto-run on first mount
  useEffect(() => {
    handleRunTests()
  }, [])

  const categories = [
    "ALL",
    "Authentication",
    "Dataset Scope",
    "Retrieval Firewall",
    "Structured Data RLS",
    "Grants & Delegation",
    "Citations & Grounding",
    "Prompt Injection & DLP",
    "Storage Security",
    "Federation & LAN",
    "Audit Integrity",
  ]

  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.filter((r) => !r.passed).length

  const filteredTests = results.filter((r) => {
    const matchesCat = selectedCategory === "ALL" || r.category === selectedCategory
    const matchesSearch =
      r.test_id.toLowerCase().includes(search.toLowerCase()) ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.details.toLowerCase().includes(search.toLowerCase())
    return matchesCat && matchesSearch
  })

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpandedIds(next)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground tracking-tight">
            Security Invariant Test Suite (§17, §85..§95)
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Automated regression suite verifying 84 zero-trust security and grounding invariants.
          </p>
        </div>

        <Button
          size="sm"
          variant="security"
          onClick={handleRunTests}
          disabled={isRunning}
          className="gap-1.5 text-xs h-8"
        >
          <RotateCw className={`h-3.5 w-3.5 ${isRunning ? "animate-spin" : ""}`} />
          <span>{isRunning ? "Running Suite..." : "Run Security Tests"}</span>
        </Button>
      </div>

      {/* Top Banner KPI */}
      <div className="p-4 rounded-xl border border-emerald-800/40 bg-emerald-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="font-semibold text-sm text-foreground">
              Formal Security Verification Matrix
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Argon2id auth, two-gate pre-retrieval isolation, monotonic delegation, RLS, and exact citation proofs.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="success" className="text-sm font-mono px-3 py-1">
            {passedCount} / {results.length || 84} PASS
          </Badge>
          {failedCount > 0 && (
            <Badge variant="danger" className="text-sm font-mono px-3 py-1">
              {failedCount} FAIL
            </Badge>
          )}
        </div>
      </div>

      {/* Filter and Category Pills */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search test ID or invariant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Test List */}
      <div className="space-y-2">
        {filteredTests.map((t) => {
          const isExpanded = expandedIds.has(t.test_id)
          return (
            <div
              key={t.test_id}
              className="rounded-xl border border-border bg-surface-raised transition-all overflow-hidden text-xs"
            >
              <div
                onClick={() => toggleExpand(t.test_id)}
                className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-subtle/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Badge
                    variant={t.passed ? "success" : "danger"}
                    className="text-[10px] font-mono py-0 px-1.5 shrink-0"
                  >
                    {t.passed ? "PASS" : "FAIL"}
                  </Badge>

                  <span className="font-mono text-muted-foreground text-[11px] shrink-0">
                    {t.test_id}
                  </span>

                  <span className="font-medium text-foreground truncate">{t.title}</span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="clearance" className="text-[10px] py-0 hidden md:inline-flex">
                    {t.category}
                  </Badge>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-3.5 pt-1 border-t border-border/40 text-[11px] space-y-1.5 bg-surface-subtle/30">
                  <div className="text-muted-foreground">
                    Invariant Verified:{" "}
                    <span className="text-foreground font-mono">{t.details}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
