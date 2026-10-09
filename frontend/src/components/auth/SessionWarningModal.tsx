import React from "react"
import { AlertTriangle, Clock, LogOut, RefreshCw } from "lucide-react"
import { useApp } from "../../context/AppContext"
import { Button } from "../ui/button"

export const SessionWarningModal: React.FC = () => {
  const {
    isSessionWarning,
    sessionRemainingSeconds,
    renewSession,
    logout,
  } = useApp()

  if (!isSessionWarning) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-surface-raised p-6 shadow-2xl space-y-5">
        {/* Header with warning icon and countdown badge */}
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-foreground">
                Inactivity Expiry Warning
              </h3>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                <Clock className="h-3 w-3" />
                {sessionRemainingSeconds}s
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              No genuine keyboard, pointer, or application activity detected for over 4 minutes.
              To preserve data isolation and security policies, your session will expire automatically.
            </p>
          </div>
        </div>

        {/* Progress bar visualizing last 30 seconds */}
        <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-amber-400 h-full transition-all duration-1000 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, (sessionRemainingSeconds / 30) * 100))}%` }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={logout}
            className="text-xs text-muted-foreground hover:text-foreground border-border"
          >
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Sign Out
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={renewSession}
            className="text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold shadow-sm"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Continue Session
          </Button>
        </div>
      </div>
    </div>
  )
}
