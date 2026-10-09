import * as React from "react"
import "./glyphs.css"

export type GlyphProps = React.SVGProps<SVGSVGElement> & {
  size?: number | string
  accent?: string
  busy?: boolean
}

export const makeGlyph = (name: string, body: React.ReactNode) => {
  const G = React.forwardRef<SVGSVGElement, GlyphProps>(
    ({ size = 16, accent, busy, className, style, ...props }, ref) => (
      <svg
        ref={ref}
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="var(--glyph-stroke, 1.5)"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`glyph glyph-${name} ${busy ? "is-busy" : ""} ${className ?? ""}`}
        style={{ ["--glyph-accent" as any]: accent, ...style }}
        aria-hidden="true"
        {...props}
      >
        {body}
      </svg>
    )
  )
  G.displayName = name
  return G
}
