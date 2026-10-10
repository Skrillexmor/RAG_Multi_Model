import React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog"
import { ScrollArea } from "../ui/scroll-area"
import { cn } from "../../lib/utils"

export interface ResourceInspectorLayoutProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string | React.ReactNode
  badge?: React.ReactNode
  icon?: React.ReactNode
  leftPane: React.ReactNode
  rightPane: React.ReactNode
  footerActions?: React.ReactNode
  maxWidthClass?: string
  className?: string
}

export const ResourceInspectorLayout: React.FC<ResourceInspectorLayoutProps> = ({
  open,
  onClose,
  title,
  subtitle,
  badge,
  icon,
  leftPane,
  rightPane,
  footerActions,
  maxWidthClass = "max-w-5xl",
  className,
}) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className={cn(
          "w-[95vw] bg-surface-raised border border-border text-foreground shadow-2xl p-0 max-h-[90vh] flex flex-col overflow-hidden",
          maxWidthClass,
          className
        )}
      >
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0 bg-surface/50">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div className="h-9 w-9 rounded-lg bg-surface border border-border flex items-center justify-center text-foreground shrink-0">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold truncate">
                  {title}
                </DialogTitle>
                {subtitle && (
                  <DialogDescription className="text-xs text-muted-foreground font-mono truncate">
                    {subtitle}
                  </DialogDescription>
                )}
              </div>
            </div>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
        </DialogHeader>

        {/* Two-Pane Body: Desktop 58% Left (Preview/Content), 42% Right (Metadata/Security) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-border/40 overflow-hidden">
          {/* Left Pane: Preview, Media & Primary Content */}
          <div className="md:col-span-7 flex flex-col min-h-0 max-h-[50vh] md:max-h-[calc(90vh-130px)] overflow-hidden bg-background/40">
            <ScrollArea className="flex-1 p-5 overflow-y-auto">
              <div className="space-y-4">{leftPane}</div>
            </ScrollArea>
          </div>

          {/* Right Pane: Cryptographic Proofs, Provenance & Details */}
          <div className="md:col-span-5 flex flex-col min-h-0 max-h-[50vh] md:max-h-[calc(90vh-130px)] overflow-hidden bg-surface/30">
            <ScrollArea className="flex-1 p-5 overflow-y-auto">
              <div className="space-y-4 text-xs">{rightPane}</div>
            </ScrollArea>
          </div>
        </div>

        {/* Optional Footer */}
        {footerActions && (
          <div className="px-6 py-3 border-t border-border/40 bg-surface/40 flex items-center justify-between shrink-0">
            {footerActions}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
