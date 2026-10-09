import React from "react"
import { cn } from "../../lib/utils"

export interface TimeBarProps extends React.HTMLAttributes<HTMLDivElement> {
  from?: string
  until?: string
  warnAt?: number // fraction e.g. 0.15 for 15%
}

export const TimeBar: React.FC<TimeBarProps> = ({
  from,
  until,
  warnAt = 0.15,
  className,
  ...props
}) => {
  if (!from || !until) {
    return (
      <div
        className={cn("h-1.5 w-full rounded-full bg-secondary", className)}
        {...props}
      />
    )
  }

  const startTime = new Date(from).getTime()
  const endTime = new Date(until).getTime()
  const now = Date.now()

  const total = Math.max(1, endTime - startTime)
  const remaining = Math.max(0, endTime - now)
  const fraction = Math.min(1, Math.max(0, remaining / total))
  const isExpired = remaining <= 0
  const isWarning = fraction < warnAt && !isExpired

  return (
    <div
      className={cn(
        "h-1.5 w-full rounded-full bg-secondary overflow-hidden relative",
        className
      )}
      title={
        isExpired
          ? "Expired"
          : `${Math.round(fraction * 100)}% remaining until ${new Date(
              until
            ).toLocaleTimeString()}`
      }
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300",
          isExpired
            ? "w-full bg-muted-foreground/30 border-dashed"
            : isWarning
            ? "bg-hold"
            : "bg-permit"
        )}
        style={{ width: `${Math.round(fraction * 100)}%` }}
      />
    </div>
  )
}
