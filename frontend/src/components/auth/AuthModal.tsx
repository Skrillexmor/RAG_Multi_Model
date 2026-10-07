import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Badge } from "../ui/badge"
import { useApp } from "../../context/AppContext"
import { DEMO_PERSONAS } from "../../lib/personas"
import {
  Shield,
  User,
  Key,
  UserPlus,
  LogIn,
  CheckCircle2,
  Lock,
  Building,
  Sparkles,
} from "lucide-react"

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    setIsAuthModalOpen,
    loginWithCredentials,
    registerUser,
    switchPersona,
    persona,
    principal,
  } = useApp()

  const [activeTab, setActiveTab] = useState<"login" | "register">("login")

  // Login form
  const [loginUsername, setLoginUsername] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    try {
      await loginWithCredentials(loginUsername.trim(), loginPassword)
      setLoginPassword("")
    } catch {
      // toast shown in context
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regUsername.trim() || !regPassword.trim()) return
    setIsSubmitting(true)
    try {
      await registerUser({
        username: regUsername.trim(),
        password: regPassword,
        department: regDepartment.trim(),
        roles: [regRole],
        clearance: regClearance,
      })
      setRegPassword("")
    } catch {
      // toast shown in context
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isAuthModalOpen} onOpenChange={setIsAuthModalOpen}>
      <DialogContent className="max-w-md bg-surface-raised border-border text-foreground shadow-2xl p-6">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Zero-Trust Identity & Roles
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Authenticate with Argon2id cryptographic identity or register custom roles.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tab Switcher */}
        <div className="flex rounded-lg bg-surface-subtle p-1 border border-border/60">
          <button
            type="button"
            onClick={() => setActiveTab("login")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === "login"
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("register")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all ${
              activeTab === "register"
                ? "bg-surface-raised text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Create Account / Roles</span>
          </button>
        </div>

        {activeTab === "login" ? (
          /* LOGIN TAB */
          <form onSubmit={handleLogin} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Username</label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Enter username (e.g. alice, bob, or your username)"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="pl-8 text-xs h-8"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="pl-8 text-xs h-8"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Demo users default password is <span className="font-mono text-foreground">&lt;username&gt;123</span>
              </p>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !loginUsername.trim()}
              className="w-full text-xs h-8 gap-1.5"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Authenticating..." : "Sign In"}</span>
            </Button>

            {/* Quick Demo Switcher Section */}
            <div className="pt-2 border-t border-border/40">
              <p className="text-[11px] font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-400" />
                <span>Or switch instantly to pre-seeded demo personas:</span>
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {DEMO_PERSONAS.map((p) => {
                  const isCurrent = persona.username === p.username
                  return (
                    <button
                      key={p.username}
                      type="button"
                      onClick={async () => {
                        await switchPersona(p.username)
                        setIsAuthModalOpen(false)
                      }}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        isCurrent
                          ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                          : "border-border/60 bg-surface-subtle/50 hover:bg-surface-subtle text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">{p.name}</span>
                        <Badge variant="clearance" className="text-[9px] py-0 px-1">
                          L{p.clearanceLevel}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{p.roleTitle}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </form>
        ) : (
          /* REGISTER TAB */
          <form onSubmit={handleRegister} className="space-y-3.5 pt-1">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Username</label>
                <Input
                  placeholder="e.g. dev_analyst"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  className="text-xs h-8"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Department</label>
                <Input
                  placeholder="e.g. Research, InfoSec"
                  value={regDepartment}
                  onChange={(e) => setRegDepartment(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Password</label>
              <Input
                type="password"
                placeholder="At least 4 characters"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className="text-xs h-8"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Role Selection */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Assigned Role</label>
                <select
                  value={regRole}
                  onChange={(e) => setRegRole(e.target.value)}
                  className="w-full text-xs h-8 rounded-md bg-surface-subtle border border-border px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="analyst">Analyst (Standard Queries)</option>
                  <option value="security_admin">Security Admin (Full Policy)</option>
                  <option value="auditor">Auditor (Read Audit Trail)</option>
                  <option value="engineer">Engineer (Technical RAG)</option>
                  <option value="compliance_officer">Compliance Officer</option>
                  <option value="data_owner">Data Owner (Manage Vaults)</option>
                  <option value="viewer">Viewer (Restricted Scope)</option>
                </select>
              </div>

              {/* Clearance Selection */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Clearance Level</label>
                <select
                  value={regClearance}
                  onChange={(e) => setRegClearance(Number(e.target.value))}
                  className="w-full text-xs h-8 rounded-md bg-surface-subtle border border-border px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value={1}>L1 - Public / Unclassified</option>
                  <option value={2}>L2 - Internal Company Docs</option>
                  <option value={3}>L3 - Confidential Project Data</option>
                  <option value={4}>L4 - Secret / High Integrity</option>
                </select>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-surface-subtle/70 border border-border/50 text-[11px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 text-foreground font-medium text-[11px]">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                <span>Zero-Trust Governance Guarantees</span>
              </div>
              <p className="text-[10px] leading-relaxed">
                Passwords are hash-salted with Argon2id. Role assignments are cryptographically verified per query at Gate A & Gate B.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !regUsername.trim() || !regPassword.trim()}
              className="w-full text-xs h-8 gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Creating Account..." : "Create Account & Sign In"}</span>
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
