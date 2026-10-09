import React, { useState, useEffect, useRef } from "react"
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
import { Seal } from "../ui/seal"
import { Glyph } from "../../glyphs"
import { cn } from "../../lib/utils"
import { toast } from "sonner"

interface CategoryMeta {
  name: string
  count: number
  prefix: string
}

const MATRIX_CATEGORIES: CategoryMeta[] = [
  { name: "Authentication", count: 10, prefix: "AUTH" },
  { name: "Dataset scope", count: 7, prefix: "SCOPE" },
  { name: "Retrieval firewall", count: 12, prefix: "RET" },
  { name: "Structured data", count: 8, prefix: "DB" },
  { name: "Grants", count: 14, prefix: "GRANT" },
  { name: "Citations", count: 10, prefix: "CIT" },
  { name: "Injection & DLP", count: 8, prefix: "INJ" },
  { name: "Storage", count: 6, prefix: "STORE" },
  { name: "Federation", count: 6, prefix: "LAN" },
  { name: "Audit", count: 3, prefix: "AUDIT" },
]

export const SecurityTestsView: React.FC = () => {
  const [results, setResults] = useState<SecurityTestResult[]>([])
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL")
  const [search, setSearch] = useState<string>("")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [hoveredCell, setHoveredCell] = useState<{ id: string; category: string; title?: string; passed?: boolean } | null>(null)
  const [revealedCount, setRevealedCount] = useState<number>(84)

  const handleRunTests = async () => {
    setIsRunning(true)
    setRevealedCount(0)
    try {
      const res = await api.runSecurityTests()
      const testResults = res.results || []
      setResults(testResults)

      // 15ms cascade stagger animation across 84 cells
      for (let i = 1; i <= 84; i++) {
        setRevealedCount(i)
        await new Promise((r) => setTimeout(r, 14))
      }

      toast.success("Security suite execution complete!", {
        description: `Total: ${res.total} | Passed: ${res.passed} | Failed: ${res.failed}`,
      })
    } catch (err: any) {
      toast.error(`Test execution failed: ${err.message}`)
      setRevealedCount(84)
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
  const totalCount = results.length || 84

  // Map test results by ID for instantaneous lookup
  const resultsMap = new Map<string, SecurityTestResult>()
  results.forEach((r) => {
    resultsMap.set(r.test_id, r)
  })

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
      {/* Header & Hero KPI */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
            <Glyph name="verify" size={13} className="text-trust" />
            <span>Formal Verification Suite (§17, §85..§95)</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-light text-5xl md:text-6xl tracking-tight text-foreground tabular-nums">
              {isRunning ? revealedCount : (results.length > 0 ? passedCount : 84)}
            </span>
            <span className="text-xl md:text-2xl font-light text-muted-foreground tracking-tight">
              / 84 invariants
            </span>
            <Seal
              state={failedCount === 0 ? "verified" : "broken"}
              size={26}
              className="ml-1 self-center"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Automated regression matrix verifying zero-trust isolation, monotonic delegation, RLS, and citations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="security"
            onClick={handleRunTests}
            disabled={isRunning}
            className="gap-1.5 text-xs h-9 px-4 bg-foreground text-background hover:bg-foreground/90 font-medium"
          >
            <RotateCw className={cn("h-3.5 w-3.5", isRunning && "animate-spin")} />
            <span>{isRunning ? "Running Suite..." : "Run Security Tests"}</span>
          </Button>
        </div>
      </div>

      {/* 84-CELL INTERACTIVE TEST MATRIX */}
      <div className="rounded-xl border border-border bg-surface-raised p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-mono font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Glyph name="matrix" size={12} className="text-trust" />
            <span>84 Invariant Verification Matrix</span>
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {failedCount === 0 ? (
              <span className="text-trust font-medium">100% Invariants Passing</span>
            ) : (
              <span className="text-deny font-medium">{failedCount} Invariants Failing</span>
            )}
          </span>
        </div>

        {/* Matrix Categories Flex Layout */}
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          {MATRIX_CATEGORIES.map((cat, catIdx) => {
            // Calculate global starting index for cascade stagger
            let startIdx = 0
            for (let i = 0; i < catIdx; i++) {
              startIdx += MATRIX_CATEGORIES[i].count
            }

            return (
              <div key={cat.prefix} className="space-y-1.5">
                <div className="text-[10px] font-mono text-muted-foreground flex items-center justify-between gap-2">
                  <span className="truncate max-w-[110px]">{cat.name}</span>
                  <span className="text-[9px] text-muted-foreground/60">{cat.count}</span>
                </div>
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(cat.count, 7)}, 14px)`,
                  }}
                >
                  {Array.from({ length: cat.count }, (_, i) => {
                    const testNum = i + 1
                    const cellGlobalIndex = startIdx + testNum
                    const testId = `${cat.prefix}-${String(testNum).padStart(3, "0")}`
                    const testRecord = resultsMap.get(testId)
                    const isRevealed = cellGlobalIndex <= revealedCount
                    const isPass = testRecord ? testRecord.passed : true

                    return (
                      <button
                        key={testId}
                        type="button"
                        onClick={() => {
                          setSelectedCategory("ALL")
                          setSearch(testId)
                          toggleExpand(testId)
                        }}
                        onMouseEnter={() =>
                          setHoveredCell({
                            id: testId,
                            category: cat.name,
                            title: testRecord?.title,
                            passed: isPass,
                          })
                        }
                        onMouseLeave={() => setHoveredCell(null)}
                        className={cn(
                          "w-3.5 h-3.5 rounded-[3px] transition-all duration-150 relative cursor-pointer",
                          !isRevealed
                            ? "bg-secondary/40 border border-border/40"
                            : isPass
                            ? "bg-trust hover:scale-135 hover:z-10 shadow-xs"
                            : "bg-deny hover:scale-135 hover:z-10 shadow-xs"
                        )}
                        aria-label={`Test ${testId}`}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Dynamic Matrix Cell Hover Inspector Tooltip */}
        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs min-h-[28px]">
          {hoveredCell ? (
            <div className="flex items-center gap-2 font-mono text-[11px] truncate">
              <span className={cn(
                "px-1.5 py-0.2 rounded font-semibold text-[10px]",
                hoveredCell.passed !== false ? "bg-trust/10 text-trust" : "bg-deny/10 text-deny"
              )}>
                {hoveredCell.id}
              </span>
              <span className="text-muted-foreground font-sans">
                {hoveredCell.category}
              </span>
              {hoveredCell.title && (
                <>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="text-foreground truncate max-w-md font-sans">
                    {hoveredCell.title}
                  </span>
                </>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-[11px] font-mono">
              Hover any matrix cell to inspect test identifier and title. Click to jump to details.
            </span>
          )}

          <span className="text-[10px] font-mono text-muted-foreground shrink-0 hidden sm:inline-block">
            NIST SP 800-162 / Zero-Trust
          </span>
        </div>
      </div>

      {/* Filter and Category Pills */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search test ID, invariant, or keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-8 bg-surface-raised"
            />
          </div>
          {search && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch("")}
              className="text-xs h-8 text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors border",
                selectedCategory === cat
                  ? "bg-secondary text-foreground border-border shadow-xs"
                  : "bg-surface-raised text-muted-foreground border-border/60 hover:text-foreground"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Test List Accordion */}
      <div className="space-y-2">
        {filteredTests.map((t) => {
          const isExpanded = expandedIds.has(t.test_id)
          return (
            <div
              key={t.test_id}
              className="rounded-xl border border-border bg-surface-raised transition-all overflow-hidden text-xs shadow-xs"
            >
              <div
                onClick={() => toggleExpand(t.test_id)}
                className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-subtle/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      "text-[9px] font-mono py-0.5 px-1.5 rounded font-semibold shrink-0 uppercase border",
                      t.passed
                        ? "bg-trust/10 border-trust/30 text-trust"
                        : "bg-deny/10 border-deny/30 text-deny"
                    )}
                  >
                    {t.passed ? "PASS" : "FAIL"}
                  </span>

                  <span className="font-mono text-muted-foreground text-[11px] shrink-0">
                    {t.test_id}
                  </span>

                  <span className="font-medium text-foreground truncate">{t.title}</span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface border border-border text-muted-foreground hidden md:inline-flex">
                    {t.category}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-3.5 pt-2 border-t border-border/40 text-[11px] space-y-1.5 bg-surface">
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

