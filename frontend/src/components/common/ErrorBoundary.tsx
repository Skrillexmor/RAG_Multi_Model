import React, { Component, ErrorInfo, ReactNode } from "react"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "../ui/button"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an unhandled error:", error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-surface-raised border border-border rounded-2xl p-6 text-center space-y-4 shadow-xl">
            <div className="h-12 w-12 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto text-destructive">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-foreground">Something went wrong</h2>
              <p className="text-xs text-muted-foreground">
                An unexpected UI rendering issue occurred. Your secure data and session remain intact.
              </p>
            </div>
            {this.state.error && (
              <div className="p-3 rounded-lg bg-surface-subtle border border-border text-[11px] font-mono text-muted-foreground text-left overflow-auto max-h-32">
                {this.state.error.message}
              </div>
            )}
            <div className="pt-2">
              <Button onClick={this.handleReset} className="w-full gap-2">
                <RotateCcw className="h-4 w-4" />
                Reload Application
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
