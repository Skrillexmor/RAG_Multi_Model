import React from "react"
import { cn } from "../../lib/utils"

export interface SealProps extends React.SVGProps<SVGSVGElement> {
  state?: "verified" | "pending" | "broken"
  size?: number | string
  animate?: boolean
}

export const Seal: React.FC<SealProps> = ({
  state = "verified",
  size = 20,
  animate = false,
  className,
  ...props
}) => {
  const colorMap = {
    verified: "text-trust",
    pending: "text-hold",
    broken: "text-deny",
  }

  return (
    <svg
      viewBox="0 0 38 38"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={cn("inline-block shrink-0", colorMap[state], className)}
      aria-hidden="true"
      {...props}
    >
      <circle
        cx="19"
        cy="19"
        r="9.5"
        transform="rotate(-90 19 19)"
        className={cn(animate && "transition-all duration-500 ease-out")}
      />
      <circle cx="19" cy="19" r="4.5" opacity="0.55" />
      <circle cx="19" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}
