import React from "react"
import { AppProvider } from "./context/AppContext"
import { AppShell } from "./components/shell/AppShell"
import { ErrorBoundary } from "./components/common/ErrorBoundary"

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App
