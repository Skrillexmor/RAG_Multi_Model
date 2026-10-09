import React, { useState } from "react"
import { cn } from "../../lib/utils"

export interface SessionRingProps {
  remaining: number
  total?: number
  warning?: boolean
  onRenew?: () => void
  className?: string
}

export const SessionRing: React.FC<SessionRingProps> = ({
  remaining,
  total = 300,
  warning = false,
  onRenew,
  className,
}) => {
  const [isRenewing, setIsRenewing] = useState(false)
  const radius = 10
  const circumference = 2 * Math.PI * radius
  const fraction = Math.max(0, Math.min(1, remaining / total))
  const strokeDashoffset = circumference * (1 - fraction)

  const m = Math.floor(remaining / 60)
  const s = remaining % 60
  const formattedTime = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`

  const isLow = remaining <= 60
  const isWarn = remaining <= 30 || warning

  const handleRenew = () => {
    setIsRenewing(true)
    onRenew?.()
    setTimeout(() => setIsRenewing(false), 500)
  }

  return (
    <button
      type="button"
      onClick={handleRenew}
      className={cn(
        "inline-flex items-center gap-2 h-8 px-2.5 rounded-lg border border-border bg-secondary/60 hover:bg-secondary text-xs text-foreground transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-trust",
        isWarn && "border-hold shadow-[0_0_0_1px_hsl(var(--sec-warning)/0.4)] animate-pulse",
        className
      )}
      title="Inactivity session countdown. Click to renew lease."
      aria-label={`Session countdown ${formattedTime}. Click to renew.`}
    >
      <svg
        viewBox="0 0 24 24"
        width={18}
        height={18}
        className="-rotate-90 shrink-0"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="2.5"
        />
        <circle
          cx="12"
          cy="12"
          r={radius}
          fill="none"
          stroke={isWarn ? "hsl(var(--sec-warning))" : isLow ? "hsl(var(--sec-warning))" : "hsl(var(--beam))"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn(
            "transition-[stroke-dashoffset] duration-500 ease-linear",
            isRenewing && "transition-[stroke-dashoffset] duration-400 ease-out"
          )}
        />
      </svg>
      <span className="font-mono text-xs tabular-nums tracking-tight font-medium">
        {formattedTime}
      </span>
    </button>
  )
}
