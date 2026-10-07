import React, { useState } from "react"
import { useApp } from "../../context/AppContext"
import { TopBar } from "./TopBar"
import { Sidebar } from "./Sidebar"
import { ChatView } from "../chat/ChatView"
import { SourcesView } from "../sources/SourcesView"
import { AccessView } from "../security/AccessView"
import { FederationView } from "../security/FederationView"
import { AuditView } from "../security/AuditView"
import { SecurityTestsView } from "../security/SecurityTestsView"
import { SettingsView } from "../settings/SettingsView"
import { EvidenceInspector } from "../evidence/EvidenceInspector"
import { SecurityTraceDrawer } from "../evidence/SecurityTraceDrawer"
import { CommandPalette } from "../command/CommandPalette"
import { RequestAccessModal } from "../security/RequestAccessModal"
import { Toaster } from "sonner"

export const AppShell: React.FC = () => {
  const { currentView, activeInspector, closeInspector, refreshVaults } = useApp()
  const [requestAccessVaultSlug, setRequestAccessVaultSlug] = useState<string | null>(null)

  const renderMainView = () => {
    switch (currentView) {
      case "chat":
        return <ChatView onRequestAccess={(slug) => setRequestAccessVaultSlug(slug || "project-alpha")} />
      case "sources":
      case "vault-detail":
        return <SourcesView />
      case "access":
        return <AccessView />
      case "federation":
        return <FederationView />
      case "audit":
        return <AuditView />
      case "tests":
        return <SecurityTestsView />
      case "settings":
        return <SettingsView />
      default:
        return <ChatView />
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground select-text font-sans">
      {/* Left Navigation & Conversation History Rail */}
      <Sidebar />

      {/* Main Workspace Column */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopBar />
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {renderMainView()}
        </main>
      </div>

      {/* Right Context Drawers */}
      <EvidenceInspector
        isOpen={activeInspector?.type === "evidence"}
        evidence={activeInspector?.type === "evidence" ? activeInspector.data : null}
        onClose={closeInspector}
      />

      <SecurityTraceDrawer
        isOpen={activeInspector?.type === "trace"}
        trace={activeInspector?.type === "trace" ? activeInspector.data : null}
        onClose={closeInspector}
      />

      {/* Global Command Palette */}
      <CommandPalette />

      {/* JIT Request Access Modal */}
      {requestAccessVaultSlug && (
        <RequestAccessModal
          isOpen={!!requestAccessVaultSlug}
          onClose={() => setRequestAccessVaultSlug(null)}
          initialVaultSlug={requestAccessVaultSlug}
          onRequestSubmitted={refreshVaults}
        />
      )}

      {/* Toast Notification Container */}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          className: "bg-surface-raised border border-border text-foreground text-xs shadow-xl",
        }}
      />
    </div>
  )
}
