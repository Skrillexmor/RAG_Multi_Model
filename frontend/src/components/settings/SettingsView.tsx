import React, { useState } from "react"
import {
  Settings,
  Moon,
  Sun,
  Laptop,
  Shield,
  Server,
  Database,
  Lock,
  Wifi,
} from "lucide-react"
import { useApp } from "../../context/AppContext"
import { storage } from "../../lib/storage"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"

export const SettingsView: React.FC = () => {
  const { persona } = useApp()
  const [theme, setThemeState] = useState<"dark" | "light" | "system">(storage.getTheme())
  const [density, setDensityState] = useState<"comfortable" | "compact">(storage.getDensity())

  const handleThemeChange = (newTheme: "dark" | "light" | "system") => {
    setThemeState(newTheme)
    storage.setTheme(newTheme)
  }

  const handleDensityChange = (newDensity: "comfortable" | "compact") => {
    setDensityState(newDensity)
    storage.setDensity(newDensity)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground tracking-tight">
          Settings & Environment Diagnostics (§18)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Configure interface preferences, identity contexts, and inspect local server constraints.
        </p>
      </div>

      {/* Appearance Section */}
      <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-3.5 text-xs">
        <h3 className="font-semibold text-foreground text-sm">Appearance & Theme</h3>

        <div className="grid grid-cols-3 gap-2.5 max-w-md">
          <button
            onClick={() => handleThemeChange("dark")}
            className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-colors ${
              theme === "dark"
                ? "border-emerald-500 bg-surface-subtle text-foreground"
                : "border-border text-muted-foreground hover:bg-surface-subtle"
            }`}
          >
            <Moon className="h-4 w-4" />
            <span className="font-medium">Dark Mode</span>
          </button>

          <button
            onClick={() => handleThemeChange("light")}
            className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-colors ${
              theme === "light"
                ? "border-emerald-500 bg-surface-subtle text-foreground"
                : "border-border text-muted-foreground hover:bg-surface-subtle"
            }`}
          >
            <Sun className="h-4 w-4" />
            <span className="font-medium">Light Mode</span>
          </button>

          <button
            onClick={() => handleThemeChange("system")}
            className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-colors ${
              theme === "system"
                ? "border-emerald-500 bg-surface-subtle text-foreground"
                : "border-border text-muted-foreground hover:bg-surface-subtle"
            }`}
          >
            <Laptop className="h-4 w-4" />
            <span className="font-medium">System</span>
          </button>
        </div>
      </div>

      {/* Identity & Current Persona */}
      <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-3 text-xs">
        <h3 className="font-semibold text-foreground text-sm">Current Security Persona</h3>

        <div className="p-3 rounded-lg border border-border bg-surface-subtle space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground text-sm">{persona.name}</span>
            <Badge variant="clearance">Clearance Level {persona.clearanceLevel}</Badge>
          </div>
          <div className="text-muted-foreground">{persona.description}</div>
          <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/40">
            Role Tokens: {persona.roles.join(", ")}
          </div>
        </div>
      </div>

      {/* System & Architecture Diagnostics */}
      <div className="p-4 rounded-xl border border-border bg-surface-raised space-y-3 text-xs">
        <h3 className="font-semibold text-foreground text-sm">Offline Diagnostics (§128)</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="p-3 rounded-lg border border-border bg-surface-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-emerald-400" />
              <span>External Egress</span>
            </div>
            <Badge variant="success">BLOCKED (ZERO CLOUD)</Badge>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-emerald-400" />
              <span>Vector Database</span>
            </div>
            <span className="font-mono text-foreground text-[11px]">Qdrant (Local Disk)</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-emerald-400" />
              <span>Canonical Storage</span>
            </div>
            <span className="font-mono text-foreground text-[11px]">AES-256-GCM Encrypted</span>
          </div>

          <div className="p-3 rounded-lg border border-border bg-surface-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span>Password Algorithm</span>
            </div>
            <span className="font-mono text-foreground text-[11px]">Argon2id Salted</span>
          </div>
        </div>
      </div>
    </div>
  )
}
