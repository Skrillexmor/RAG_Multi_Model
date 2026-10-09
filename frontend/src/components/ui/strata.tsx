import React from "react"
import { cn } from "../../lib/utils"

interface StrataProps extends React.HTMLAttributes<HTMLSpanElement> {
  level: number
  ceiling?: number
  size?: "sm" | "md" | "lg"
}

export const Strata: React.FC<StrataProps> = ({
  level,
  ceiling,
  size = "md",
  className,
  ...props
}) => {
  const bars = [1, 2, 3, 4]
  const label = `Clearance level ${level} of 4${
    ceiling !== undefined ? `, compartment ceiling ${ceiling}` : ""
  }`

  const sizeClasses = {
    sm: "h-5 px-1.5 text-[10px] gap-1.5",
    md: "h-6 px-2 text-[11.5px] gap-1.5",
    lg: "h-auto py-2.5 px-3.5 text-sm gap-3.5",
  }

  const barClasses = {
    sm: "w-[2.5px] h-2 rounded-[1px]",
    md: "w-[3px] h-2.5 rounded-[1.5px]",
    lg: "w-3 h-8 rounded-[3px]",
  }

  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex items-center rounded-md bg-secondary font-mono font-medium text-muted-foreground select-none",
        sizeClasses[size],
        className
      )}
      {...props}
    >
      <i className="flex items-end gap-0.5 not-italic">
        {bars.map((i) => {
          const isLit = i <= level
          const isGap = ceiling !== undefined && i > level && i <= ceiling
          return (
            <b
              key={i}
              className={cn(
                "block transition-all",
                barClasses[size],
                isLit
                  ? "bg-foreground shadow-none"
                  : isGap
                  ? "border border-dashed border-hold bg-hold/20"
                  : "border border-border bg-transparent"
              )}
            />
          )
        })}
      </i>
      <span>L{level}</span>
    </span>
  )
}
