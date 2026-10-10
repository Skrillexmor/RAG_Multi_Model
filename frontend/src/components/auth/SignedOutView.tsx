import React, { useState } from "react"
import { useApp } from "../../context/AppContext"
import { DEMO_PERSONAS } from "../../lib/personas"
import {
  Shield,
  User,
  Key,
  LogIn,
  UserPlus,
  Lock,
  Building,
  Sparkles,
  Lan,
  Session,
  Loader2,
  CheckCircle2,
} from "../../glyphs"
import { Strata } from "../ui/strata"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"
import { Input } from "../ui/input"

export const SignedOutView: React.FC = () => {
  const {
    loginWithCredentials,
    registerUser,
    switchPersona,
    authConfig,
    timeStatus,
  } = useApp()

  const [activeTab, setActiveTab] = useState<"login" | "register" | "demo">("login")

  // Login form
  const [loginUsername, setLoginUsername] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Register form
  const [regUsername, setRegUsername] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regDepartment, setRegDepartment] = useState("Engineering")
  const [regRole, setRegRole] = useState("analyst")
  const [regClearance, setRegClearance] = useState(2)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginUsername.trim()) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await loginWithCredentials(loginUsername.trim(), loginPassword)
      setLoginPassword("")
    } catch (err: any) {
      setErrorMessage(err?.message || "Invalid credentials or unauthorized login.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regUsername.trim() || !regPassword.trim()) return
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await registerUser({
        username: regUsername.trim(),
        password: regPassword,
        department: regDepartment.trim(),
        roles: [regRole],
        clearance: regClearance,
      })
      setRegPassword("")
    } catch (err: any) {
      setErrorMessage(err?.message || "Registration failed.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectDemoPersona = async (username: string) => {
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      await switchPersona(username)
    } catch (err: any) {
      setErrorMessage(err?.message || "Failed to sign in as persona.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isDemoMode = authConfig ? authConfig.demo_mode : true

  return (
    <div className="min-h-screen w-screen flex flex-col justify-between bg-background text-foreground font-sans">
      {/* Top Header */}
      <header className="h-14 border-b border-border/60 bg-surface/80 backdrop-blur-md px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Shield className="h-4 w-4" />
          </div>
          <span className="font-sans font-semibold text-sm tracking-tight text-foreground">
            PrivateRAG
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/80 border-l border-border pl-2 tracking-wider">
            DARS SECURE ENCLAVE
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-border text-xs text-muted-foreground"
            title="Air-gapped LAN: Zero external cloud egress"
          >
            <Lan size={13} className="text-emerald-500" />
            <span className="text-[11px] font-mono">Air-gap Verified</span>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-border text-xs text-muted-foreground">
            <Session size={13} className="text-muted-foreground" />
            <span className="text-[11px] font-mono">
              Clock: {authConfig?.clock_status || "Verified"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Card */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface-raised border border-border rounded-2xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 items-center justify-center text-emerald-400 mb-1">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Authenticated Access Required
            </h1>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              This system operates in strict fail-closed mode. Sign in to inspect authorized vaults and execute queries.
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="grid grid-cols-3 p-1 rounded-lg bg-surface border border-border text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setActiveTab("login")
                setErrorMessage(null)
              }}
              className={`py-1.5 rounded-md transition-colors ${
                activeTab === "login"
                  ? "bg-secondary text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("register")
                setErrorMessage(null)
              }}
              className={`py-1.5 rounded-md transition-colors ${
                activeTab === "register"
                  ? "bg-secondary text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("demo")
                setErrorMessage(null)
              }}
              className={`py-1.5 rounded-md transition-colors ${
                activeTab === "demo"
                  ? "bg-secondary text-foreground font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Demo Personas
            </button>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs">
              {errorMessage}
            </div>
          )}

          {/* Tab 1: Login */}
          {activeTab === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Username
                </label>
                <Input
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="e.g. alice, bob, or registered username"
                  className="bg-background text-xs h-9"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  Password
                </label>
                <Input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Defaults to <username>123 in demo"
                  className="bg-background text-xs h-9"
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !loginUsername.trim()}
                className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-xs gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="h-3.5 w-3.5" />
                    <span>Login</span>
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Tab 2: Register */}
          {activeTab === "register" && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Username</label>
                <Input
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="New principal username"
                  className="bg-background text-xs h-8"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Password</label>
                <Input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="bg-background text-xs h-8"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Department</label>
                  <Input
                    value={regDepartment}
                    onChange={(e) => setRegDepartment(e.target.value)}
                    className="bg-background text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Clearance Level</label>
                  <select
                    value={regClearance}
                    onChange={(e) => setRegClearance(Number(e.target.value))}
                    className="w-full h-8 px-2 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={1}>Level 1 - Public</option>
                    <option value={2}>Level 2 - Confidential</option>
                    <option value={3}>Level 3 - Secret</option>
                    <option value={4}>Level 4 - Top Secret</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Assigned Role</label>
                <select
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                  className="w-full h-8 px-2 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="analyst">Analyst</option>
                  <option value="auditor">Auditor</option>
                  <option value="engineer">Engineer</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !regUsername.trim() || !regPassword.trim()}
                className="w-full h-9 bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-xs gap-1.5 mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Create Account</span>
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Tab 3: Demo Personas Quick Select */}
          {activeTab === "demo" && (
            <div className="space-y-2.5">
              <p className="text-[11px] text-muted-foreground">
                Select a pre-configured persona to test compartmentalized access and RBAC authorization policies:
              </p>
              <div className="space-y-2">
                {DEMO_PERSONAS.map((p) => (
                  <button
                    key={p.username}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleSelectDemoPersona(p.username)}
                    className="w-full p-2.5 rounded-xl border border-border bg-surface hover:bg-secondary/70 hover:border-emerald-500/40 text-left transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground group-hover:text-emerald-400 transition-colors">
                          {p.name}
                        </span>
                        <Strata level={p.clearanceLevel} size="sm" />
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {p.roleTitle} · {p.description}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                      L{p.clearanceLevel}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Assurances */}
      <footer className="h-10 border-t border-border/40 px-6 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
        <span>Zero-Trust Architecture · Gates A & B Gatelight</span>
        <span className="hidden sm:inline">5-Minute Inactivity Revocation</span>
      </footer>
    </div>
  )
}
