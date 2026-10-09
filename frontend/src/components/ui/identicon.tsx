import React, { useMemo } from "react"
import { cn } from "../../lib/utils"

export interface IdenticonProps extends React.HTMLAttributes<HTMLSpanElement> {
  hash: string
  size?: number
}

export const Identicon: React.FC<IdenticonProps> = ({
  hash,
  size = 18,
  className,
  ...props
}) => {
  const bits = useMemo(() => {
    let cleanHash = hash.replace(/^0x/, "")
    if (!cleanHash) cleanHash = "00000000"
    let seed = parseInt(cleanHash.slice(0, 8), 16) || 1
    const next = () => {
      seed ^= seed << 13
      seed >>>= 0
      seed ^= seed >>> 17
      seed ^= seed << 5
      seed >>>= 0
      return seed
    }

    const grid: number[][] = []
    for (let r = 0; r < 5; r++) {
      const row = [0, 1, 2].map(() => next() & 1)
      grid.push([row[0], row[1], row[2], row[1], row[0]])
    }
    return grid.flat()
  }, [hash])

  const cellSize = Math.max(2, Math.floor(size / 5))

  return (
    <span
      className={cn(
        "inline-grid grid-cols-5 gap-[1px] p-0.5 rounded bg-secondary/60 border border-border/40 select-none align-middle",
        className
      )}
      aria-hidden="true"
      style={{ width: cellSize * 5 + 6, height: cellSize * 5 + 6 }}
      {...props}
    >
      {bits.map((bit, idx) => (
        <i
          key={idx}
          className={cn(
            "rounded-[0.5px] transition-colors",
            bit ? "bg-trust" : "bg-transparent"
          )}
          style={{ width: cellSize, height: cellSize }}
        />
      ))}
    </span>
  )
}
