import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react"
import { toast } from "sonner"
import {
  Principal,
  Vault,
  DemoPersona,
  Conversation,
  EvidenceItem,
  RetrievalSecurityTrace,
  TimeStatus,
  LlmStatus,
  AuthConfig,
} from "../types"
import { DEMO_PERSONAS } from "../lib/personas"
import { api, ApiError } from "../lib/api"
import { storage } from "../lib/storage"

type ActiveInspector =
  | { type: "evidence"; data: EvidenceItem }
  | { type: "trace"; data: RetrievalSecurityTrace }
  | null

export type AppView =
  | "chat"
  | "sources"
  | "vaults"
  | "vault-detail"
  | "access"
  | "federation"
  | "audit"
  | "tests"
  | "chunks"
  | "settings"

interface AppContextType {
  // Auth Config & System Settings
  authConfig: AuthConfig | null

  // Persona & Principal
  persona: DemoPersona
  principal: Principal | null
  switchPersona: (username: string) => Promise<void>
  loginWithCredentials: (username: string, password?: string) => Promise<void>
  registerUser: (payload: { username: string; password: string; department?: string; roles?: string[]; clearance?: number }) => Promise<void>
  isAuthModalOpen: boolean
  setIsAuthModalOpen: (open: boolean) => void

  // Local LLM Status
  llmStatus: LlmStatus | null
  refreshLlmStatus: () => Promise<void>
  isLlmModalOpen: boolean
  setIsLlmModalOpen: (open: boolean) => void

  // Vaults
  vaults: Vault[]
  selectedVault: Vault | null
  setSelectedVault: (vault: Vault | null) => void
  refreshVaults: () => Promise<void>

  // Conversations
  conversations: Conversation[]
  activeConversationId: string | null
  activeConversation: Conversation | null
  selectedTargetFile: { id: string; name: string } | null
  setSelectedTargetFile: (file: { id: string; name: string } | null) => void
  startNewChat: (vaultSlug?: string, targetFile?: { id: string; name: string } | null) => void
  selectConversation: (id: string) => void
  saveConversation: (conv: Conversation) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, newTitle: string) => void
  pinConversation: (id: string) => void

  // System & Authorization Lease
  leaseDeadline: string | null
  leaseSecondsRemaining: number
  timeStatus: TimeStatus | null
  refreshSystemStatus: () => Promise<void>

  // Session & Inactivity Management
  sessionRemainingSeconds: number
  isSessionWarning: boolean
  renewSession: () => Promise<void>
  logout: () => Promise<void>

  // Inspector & Drawers
  activeInspector: ActiveInspector
  openEvidenceInspector: (evidence: EvidenceItem) => void
  openTraceInspector: (trace: RetrievalSecurityTrace) => void
  closeInspector: () => void

  // Navigation & Shell
  currentView: AppView
  viewParam: string | null
  navigate: (view: AppView, param?: string | null) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void

  // Loading
  isLoadingUser: boolean
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null)
  const [persona, setPersona] = useState<DemoPersona>(DEMO_PERSONAS[0]) // Alice default visual fallback
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [vaults, setVaults] = useState<Vault[]>([])
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [selectedTargetFile, setSelectedTargetFile] = useState<{ id: string; name: string } | null>(null)

  const [leaseDeadline, setLeaseDeadline] = useState<string | null>(null)
  const [leaseSecondsRemaining, setLeaseSecondsRemaining] = useState<number>(300)
  const [timeStatus, setTimeStatus] = useState<TimeStatus | null>(null)

  // Inactivity timeout state (Authoritative 300s)
  const [sessionRemainingSeconds, setSessionRemainingSeconds] = useState<number>(300)
  const isSessionWarning = sessionRemainingSeconds <= 30 && sessionRemainingSeconds > 0 && principal !== null

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false)
  const [isLlmModalOpen, setIsLlmModalOpen] = useState<boolean>(false)
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null)

  const [activeInspector, setActiveInspector] = useState<ActiveInspector>(null)
  const [currentView, setCurrentView] = useState<AppView>("chat")
  const [viewParam, setViewParam] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false)
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true)

  const authGenerationRef = useRef<number>(0)
  const lastActivityReportRef = useRef<number>(Date.now())
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null)

  // Leak-proof state reset on sign-out, session expiration, or cross-tab logout
  const resetAuthState = useCallback(() => {
    api.setToken(null)
    setPrincipal(null)
    setVaults([])
    setSelectedVault(null)
    setSelectedTargetFile(null)
    setConversations([])
    setActiveConversationId(null)
    setActiveInspector(null)
    setViewParam(null)
    setCurrentView("chat")
    setIsAuthModalOpen(false)
    setLeaseDeadline(null)
    setLeaseSecondsRemaining(0)
    setSessionRemainingSeconds(0)
  }, [])

  // 1. Authoritative initial auth check (Restores ONLY valid sessions; fail-closed signed-out state otherwise)
  const initializeAuth = useCallback(async () => {
    setIsLoadingUser(true)
    const gen = ++authGenerationRef.current
    try {
      // Fetch public server auth config
      try {
        const config = await api.getAuthConfig()
        if (gen === authGenerationRef.current) {
          setAuthConfig(config)
        }
      } catch (e) {
        console.warn("Failed to fetch auth config:", e)
      }

      // Check for existing session token in sessionStorage
      const existingToken = api.getToken()
      if (existingToken) {
        try {
          const meRes = (await api.getMe()) as any
          if (gen !== authGenerationRef.current) return
          const currentPrincipal: Principal = meRes.principal || meRes
          setPrincipal(currentPrincipal)

          const matched = DEMO_PERSONAS.find(
            (p) => p.username === currentPrincipal.username.toLowerCase()
          )
          if (matched) {
            setPersona(matched)
          } else {
            setPersona({
              username: currentPrincipal.username,
              name: currentPrincipal.username.charAt(0).toUpperCase() + currentPrincipal.username.slice(1),
              roleTitle: currentPrincipal.roles.join(", "),
              roles: currentPrincipal.roles,
              clearanceLevel: currentPrincipal.clearance_level,
              description: `Authenticated Principal (${currentPrincipal.roles.join(", ")})`,
              accessibleVaults: [],
            })
          }

          setLeaseSecondsRemaining(300)
          setSessionRemainingSeconds(300)

          // Load user-scoped vaults and conversations
          const vRes = await api.getVaults()
          if (gen === authGenerationRef.current) {
            setVaults(vRes.vaults || [])
            if (vRes.vaults?.length) {
              setSelectedVault(vRes.vaults[0])
            }
            const userConvs = storage.getConversations(
              currentPrincipal.username,
              currentPrincipal.user_id
            )
            setConversations(userConvs)
            if (userConvs.length > 0) {
              setActiveConversationId(userConvs[0].id)
            }
          }
          return
        } catch {
          // Token invalid or expired - fail-closed
          if (gen === authGenerationRef.current) {
            resetAuthState()
          }
        }
      } else {
        // No token present - true signed-out state
        if (gen === authGenerationRef.current) {
          resetAuthState()
        }
      }
    } finally {
      if (gen === authGenerationRef.current) {
        setIsLoadingUser(false)
      }
    }
  }, [resetAuthState])

  // 2. Fetch Vaults
  const refreshVaults = useCallback(async () => {
    try {
      const res = await api.getVaults()
      setVaults(res.vaults || [])
      if (res.vaults?.length && !selectedVault) {
        setSelectedVault(res.vaults[0])
      }
    } catch (err: any) {
      console.error("Failed to load vaults", err)
    }
  }, [selectedVault])

  // 3. System time & lease status
  const refreshSystemStatus = useCallback(async () => {
    try {
      const ts = await api.getTimeStatus()
      setTimeStatus(ts)
    } catch {
      // Fallback
    }
  }, [])

  // 4. Switch Persona safely (§54)
  const switchPersona = useCallback(
    async (username: string) => {
      const target = DEMO_PERSONAS.find((p) => p.username === username)
      if (!target) return
      setIsLoadingUser(true)
      const gen = ++authGenerationRef.current

      try {
        const loginRes = await api.login(target.username, `${target.username}123`)
        if (gen !== authGenerationRef.current) return
        setPersona(target)
        setPrincipal(loginRes.principal)

        // Reset sensitive context (§54)
        setActiveInspector(null)
        setLeaseSecondsRemaining(300)
        setSessionRemainingSeconds(300)
        setIsAuthModalOpen(false)

        // Reload vaults for new user
        const vRes = await api.getVaults()
        setVaults(vRes.vaults || [])
        if (vRes.vaults?.length) {
          setSelectedVault(vRes.vaults[0])
        } else {
          setSelectedVault(null)
        }

        // Reload user-scoped conversations
        const userConversations = storage.getConversations(target.username, loginRes.principal.user_id)
        setConversations(userConversations)
        if (userConversations.length > 0) {
          setActiveConversationId(userConversations[0].id)
        } else {
          setActiveConversationId(null)
        }

        toast.success(`Switched identity to ${target.name}`, {
          description: `Clearance L${target.clearanceLevel} · ${target.roleTitle}`,
        })
      } catch (err: any) {
        toast.error(`Failed to switch persona: ${err.message}`)
      } finally {
        if (gen === authGenerationRef.current) {
          setIsLoadingUser(false)
        }
      }
    },
    []
  )

  // 5. Local LLM status
  const refreshLlmStatus = useCallback(async () => {
    try {
      const res = await api.getLlmStatus()
      setLlmStatus(res)
    } catch {
      // offline / not reachable
    }
  }, [])

  // 6. Direct Login & Register
  const loginWithCredentials = useCallback(async (username: string, password?: string) => {
    setIsLoadingUser(true)
    const gen = ++authGenerationRef.current
    try {
      const res = await api.login(username, password)
      if (gen !== authGenerationRef.current) return
      setPrincipal(res.principal)
      const matched = DEMO_PERSONAS.find((p) => p.username === username.toLowerCase())
      if (matched) {
        setPersona(matched)
      } else {
        setPersona({
          username: res.principal.username,
          name: res.principal.username.charAt(0).toUpperCase() + res.principal.username.slice(1),
          roleTitle: res.principal.roles.join(", "),
          roles: res.principal.roles,
          clearanceLevel: res.principal.clearance_level,
          description: `Active Principal (${res.principal.roles.join(", ")})`,
          accessibleVaults: []
        })
      }
      setLeaseSecondsRemaining(300)
      setSessionRemainingSeconds(300)
      setActiveInspector(null)
      const vRes = await api.getVaults()
      setVaults(vRes.vaults || [])
      if (vRes.vaults?.length) {
        setSelectedVault(vRes.vaults[0])
      } else {
        setSelectedVault(null)
      }
      const userConversations = storage.getConversations(res.principal.username, res.principal.user_id)
      setConversations(userConversations)
      setActiveConversationId(userConversations.length > 0 ? userConversations[0].id : null)
      setIsAuthModalOpen(false)
      toast.success(`Signed in as ${res.principal.username}`, {
        description: `Roles: ${res.principal.roles.join(", ")} · Clearance L${res.principal.clearance_level}`
      })
    } catch (err: any) {
      toast.error(`Login failed: ${err.message}`)
      throw err
    } finally {
      if (gen === authGenerationRef.current) {
        setIsLoadingUser(false)
      }
    }
  }, [])

  const registerUser = useCallback(async (payload: { username: string; password: string; department?: string; roles?: string[]; clearance?: number }) => {
    setIsLoadingUser(true)
    const gen = ++authGenerationRef.current
    try {
      const res = await api.register(payload)
      if (gen !== authGenerationRef.current) return
      setPrincipal(res.principal)
      setPersona({
        username: res.principal.username,
        name: res.principal.username.charAt(0).toUpperCase() + res.principal.username.slice(1),
        roleTitle: res.principal.roles.join(", "),
        roles: res.principal.roles,
        clearanceLevel: res.principal.clearance_level,
        description: `Registered Principal (${res.principal.roles.join(", ")})`,
        accessibleVaults: []
      })
      setLeaseSecondsRemaining(300)
      setSessionRemainingSeconds(300)
      setActiveInspector(null)
      const vRes = await api.getVaults()
      setVaults(vRes.vaults || [])
      if (vRes.vaults?.length) {
        setSelectedVault(vRes.vaults[0])
      } else {
        setSelectedVault(null)
      }
      setConversations([])
      setActiveConversationId(null)
      setIsAuthModalOpen(false)
      toast.success(`Account registered successfully!`, {
        description: `Welcome, ${res.principal.username} · Roles: ${res.principal.roles.join(", ")}`
      })
    } catch (err: any) {
      toast.error(`Registration failed: ${err.message}`)
      throw err
    } finally {
      if (gen === authGenerationRef.current) {
        setIsLoadingUser(false)
      }
    }
  }, [])

  // 7. Initial Mount
  useEffect(() => {
    initializeAuth()
  }, [initializeAuth])

  // When authenticated, refresh LLM and time status
  useEffect(() => {
    if (principal) {
      refreshSystemStatus()
      refreshLlmStatus()
    }
  }, [principal, refreshSystemStatus, refreshLlmStatus])

  // 8. Session & Inactivity Management
  const logout = useCallback(async () => {
    authGenerationRef.current += 1
    try {
      await api.logout()
    } catch {
      // ignore
    }
    resetAuthState()
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: "LOGOUT" })
      } catch {}
    }
    toast.info("Signed out of session")
  }, [resetAuthState])

  const renewSession = useCallback(async () => {
    try {
      const res = await api.renewSession()
      setSessionRemainingSeconds(res.remaining_seconds || 300)
      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.postMessage({ type: "RENEWED", remainingSeconds: res.remaining_seconds || 300 })
        } catch {}
      }
      toast.success("Session extended for 5 minutes")
    } catch (err: any) {
      console.warn("Session renewal failed:", err)
      toast.error(`Session renewal failed: ${err.message || "Session expired or rejected"}`)
      if (err.status === 401 || err.message?.includes("401") || err.message?.includes("expired") || err.message?.includes("revoked")) {
        logout()
      }
    }
  }, [logout])

  // Genuine User Activity Tracker (Keyboard, Pointer, Touch, Scroll, Wheel)
  const handleUserActivity = useCallback(() => {
    if (!principal) return
    setSessionRemainingSeconds(300)

    const now = Date.now()
    // Throttle server activity pings to at most once every 15 seconds
    if (now - lastActivityReportRef.current > 15000) {
      lastActivityReportRef.current = now
      api.recordActivity().catch(() => {})
      if (broadcastChannelRef.current) {
        try {
          broadcastChannelRef.current.postMessage({ type: "ACTIVITY", remainingSeconds: 300 })
        } catch {}
      }
    }
  }, [principal])

  useEffect(() => {
    if (!principal) return

    const onEvent = () => handleUserActivity()
    const captureOpts: AddEventListenerOptions = { capture: true, passive: true }
    const passiveOpts: AddEventListenerOptions = { passive: true }

    // Use capture: true so scroll anywhere in child containers bubbles up
    window.addEventListener("scroll", onEvent, captureOpts)
    document.addEventListener("scroll", onEvent, captureOpts)
    window.addEventListener("wheel", onEvent, passiveOpts)
    window.addEventListener("keydown", onEvent, passiveOpts)
    window.addEventListener("pointerdown", onEvent, passiveOpts)
    window.addEventListener("touchstart", onEvent, passiveOpts)
    window.addEventListener("touchmove", onEvent, passiveOpts)

    return () => {
      window.removeEventListener("scroll", onEvent, captureOpts)
      document.removeEventListener("scroll", onEvent, captureOpts)
      window.removeEventListener("wheel", onEvent, passiveOpts)
      window.removeEventListener("keydown", onEvent, passiveOpts)
      window.removeEventListener("pointerdown", onEvent, passiveOpts)
      window.removeEventListener("touchstart", onEvent, passiveOpts)
      window.removeEventListener("touchmove", onEvent, passiveOpts)
    }
  }, [principal, handleUserActivity])

  // Cross-tab Synchronization via BroadcastChannel & storage events
  useEffect(() => {
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel("rag_session_channel")
      broadcastChannelRef.current = bc
      bc.onmessage = (event) => {
        const data = event.data
        if (data?.type === "LOGOUT" || data?.type === "EXPIRED") {
          resetAuthState()
        } else if (data?.type === "ACTIVITY" || data?.type === "RENEWED") {
          setSessionRemainingSeconds(data.remainingSeconds || 300)
        }
      }
    } catch (e) {
      console.warn("BroadcastChannel not supported", e)
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === "rag_token" && !e.newValue) {
        resetAuthState()
      }
    }
    window.addEventListener("storage", onStorage)

    return () => {
      window.removeEventListener("storage", onStorage)
      if (bc) bc.close()
    }
  }, [resetAuthState])

  // Inactivity countdown ticker & periodic background sync
  useEffect(() => {
    if (!principal) return

    const timer = setInterval(() => {
      setSessionRemainingSeconds((prev) => {
        if (prev <= 1) {
          resetAuthState()
          if (broadcastChannelRef.current) {
            try {
              broadcastChannelRef.current.postMessage({ type: "EXPIRED" })
            } catch {}
          }
          toast.error("Session expired due to 5 minutes of inactivity. Please sign in again.")
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Periodic authoritative server status reconciliation (read-only; does not keep session alive)
    const syncTimer = setInterval(async () => {
      try {
        const status = await api.getSessionStatus()
        // Only force logout if the server authoritative check explicitly reports expired or revoked
        if (status && status.active === false && (status.reason === "INACTIVITY_EXPIRED" || status.reason === "SESSION_REVOKED")) {
          resetAuthState()
          if (broadcastChannelRef.current) {
            try {
              broadcastChannelRef.current.postMessage({ type: "EXPIRED" })
            } catch {}
          }
          toast.error("Session expired due to 5 minutes of inactivity. Please sign in again.")
        } else if (typeof status?.remaining_seconds === "number" && status.remaining_seconds > 0) {
          setSessionRemainingSeconds(status.remaining_seconds)
        }
      } catch (err: any) {
        // Do not force logout on network glitch or transient server restart
        console.warn("Session status check deferred:", err)
      }
    }, 20000)

    return () => {
      clearInterval(timer)
      clearInterval(syncTimer)
    }
  }, [principal])

  // Lease countdown ticker (Point-in-time retrieval authorization lease)
  useEffect(() => {
    const timer = setInterval(() => {
      setLeaseSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Conversation Helpers
  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null

  const startNewChat = (vaultSlug?: string, targetFile?: { id: string; name: string } | null) => {
    if (vaultSlug) {
      const targetV = vaults.find((v) => v.slug === vaultSlug)
      if (targetV) setSelectedVault(targetV)
    }
    setSelectedTargetFile(targetFile !== undefined ? targetFile : null)
    setActiveConversationId(null)
    setCurrentView("chat")
    setActiveInspector(null)
  }

  const selectConversation = (id: string) => {
    setActiveConversationId(id)
    const conv = conversations.find((c) => c.id === id)
    if (conv) {
      if (conv.vaultSlug) {
        const v = vaults.find((item) => item.slug === conv.vaultSlug)
        if (v) setSelectedVault(v)
      }
      if (conv.selectedFileId) {
        setSelectedTargetFile({ id: conv.selectedFileId, name: conv.selectedFileName || "Document" })
      } else {
        setSelectedTargetFile(null)
      }
    }
    setCurrentView("chat")
    setActiveInspector(null)
  }

  const saveConversation = (conv: Conversation) => {
    const userId = principal?.user_id
    storage.saveConversation(conv, userId)
    setConversations(storage.getConversations(persona.username, userId))
    setActiveConversationId(conv.id)
    if (principal && api.getToken()) {
      api.createConversation({
        conversation_id: conv.id,
        title: conv.title,
        vault_slug: conv.vaultSlug,
        selected_file_id: conv.selectedFileId,
        selected_file_name: conv.selectedFileName,
        pinned: conv.pinned,
      }).catch(() => {})
    }
  }

  const deleteConversation = (id: string) => {
    const userId = principal?.user_id
    storage.deleteConversation(id, userId)
    const remaining = storage.getConversations(persona.username, userId)
    setConversations(remaining)
    if (activeConversationId === id) {
      setActiveConversationId(remaining.length ? remaining[0].id : null)
    }
    toast.info("Conversation deleted")
  }

  const renameConversation = (id: string, newTitle: string) => {
    const userId = principal?.user_id
    storage.renameConversation(id, newTitle, userId)
    setConversations(storage.getConversations(persona.username, userId))
  }

  const pinConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id)
    if (conv) {
      const userId = principal?.user_id
      storage.pinConversation(id, !conv.pinned, userId)
      setConversations(storage.getConversations(persona.username, userId))
    }
  }

  // Inspector Helpers
  const openEvidenceInspector = (evidence: EvidenceItem) => {
    setActiveInspector({ type: "evidence", data: evidence })
  }

  const openTraceInspector = (trace: RetrievalSecurityTrace) => {
    setActiveInspector({ type: "trace", data: trace })
  }

  const closeInspector = () => {
    setActiveInspector(null)
  }

  // Navigation
  const navigate = (view: AppView, param: string | null = null) => {
    setCurrentView(view)
    setViewParam(param)
    if (view !== "chat") {
      setActiveInspector(null)
    }
  }

  return (
    <AppContext.Provider
      value={{
        authConfig,
        persona,
        principal,
        switchPersona,
        loginWithCredentials,
        registerUser,
        isAuthModalOpen,
        setIsAuthModalOpen,
        llmStatus,
        refreshLlmStatus,
        isLlmModalOpen,
        setIsLlmModalOpen,
        vaults,
        selectedVault,
        setSelectedVault,
        refreshVaults,
        conversations,
        activeConversationId,
        activeConversation,
        selectedTargetFile,
        setSelectedTargetFile,
        startNewChat,
        selectConversation,
        saveConversation,
        deleteConversation,
        renameConversation,
        pinConversation,
        leaseDeadline,
        leaseSecondsRemaining,
        timeStatus,
        refreshSystemStatus,
        sessionRemainingSeconds,
        isSessionWarning,
        renewSession,
        logout,
        activeInspector,
        openEvidenceInspector,
        openTraceInspector,
        closeInspector,
        currentView,
        viewParam,
        navigate,
        sidebarCollapsed,
        setSidebarCollapsed,
        commandPaletteOpen,
        setCommandPaletteOpen,
        isLoadingUser,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error("useApp must be used within an AppProvider")
  }
  return context
}
