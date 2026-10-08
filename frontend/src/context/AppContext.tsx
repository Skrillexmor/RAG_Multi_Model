import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
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
  | "settings"

interface AppContextType {
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
  const [persona, setPersona] = useState<DemoPersona>(DEMO_PERSONAS[0]) // Alice
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [vaults, setVaults] = useState<Vault[]>([])
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [selectedTargetFile, setSelectedTargetFile] = useState<{ id: string; name: string } | null>(null)

  const [leaseDeadline, setLeaseDeadline] = useState<string | null>(null)
  const [leaseSecondsRemaining, setLeaseSecondsRemaining] = useState<number>(300)
  const [timeStatus, setTimeStatus] = useState<TimeStatus | null>(null)

  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false)
  const [isLlmModalOpen, setIsLlmModalOpen] = useState<boolean>(false)
  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null)

  const [activeInspector, setActiveInspector] = useState<ActiveInspector>(null)
  const [currentView, setCurrentView] = useState<AppView>("chat")
  const [viewParam, setViewParam] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false)
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true)

  // 1. Load initial user and authenticate
  const initializeAuth = useCallback(async (targetPersona: DemoPersona) => {
    setIsLoadingUser(true)
    try {
      // First try login
      const loginRes = await api.login(targetPersona.username, `${targetPersona.username}123`)
      setPrincipal(loginRes.principal)
      // Set initial lease
      setLeaseSecondsRemaining(300)
    } catch (err: any) {
      console.warn("Auto-login error:", err)
      // Demo fallback switch
      try {
        const switchRes = await api.switchPersona(targetPersona.username)
        setPrincipal(switchRes.principal)
      } catch (e: any) {
        setPrincipal({
          user_id: "u_alice",
          username: "alice",
          roles: ["admin", "analyst"],
          clearance_level: 4,
          tenant_id: "tenant-default",
          is_active: true,
        })
      }
    } finally {
      setIsLoadingUser(false)
    }
  }, [])

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

      try {
        const loginRes = await api.login(target.username, `${target.username}123`)
        setPersona(target)
        setPrincipal(loginRes.principal)

        // Reset sensitive context (§54)
        setActiveInspector(null)
        setLeaseSecondsRemaining(300)

        // Reload vaults for new user
        const vRes = await api.getVaults()
        setVaults(vRes.vaults || [])
        if (vRes.vaults?.length) {
          setSelectedVault(vRes.vaults[0])
        }

        // Reload conversations for this persona
        const userConversations = storage.getConversations(target.username)
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
    try {
      const res = await api.login(username, password)
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
      setActiveInspector(null)
      const vRes = await api.getVaults()
      setVaults(vRes.vaults || [])
      if (vRes.vaults?.length) {
        setSelectedVault(vRes.vaults[0])
      }
      const userConversations = storage.getConversations(res.principal.username)
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
      setIsLoadingUser(false)
    }
  }, [])

  const registerUser = useCallback(async (payload: { username: string; password: string; department?: string; roles?: string[]; clearance?: number }) => {
    setIsLoadingUser(true)
    try {
      const res = await api.register(payload)
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
      setActiveInspector(null)
      const vRes = await api.getVaults()
      setVaults(vRes.vaults || [])
      if (vRes.vaults?.length) {
        setSelectedVault(vRes.vaults[0])
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
      setIsLoadingUser(false)
    }
  }, [])

  // 7. Initial Mount
  useEffect(() => {
    initializeAuth(persona).then(() => {
      refreshVaults()
      refreshSystemStatus()
      refreshLlmStatus()
      setConversations(storage.getConversations(persona.username))
    })
  }, [])

  // 6. Lease countdown ticker
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
    storage.saveConversation(conv)
    setConversations(storage.getConversations(persona.username))
    setActiveConversationId(conv.id)
  }

  const deleteConversation = (id: string) => {
    storage.deleteConversation(id)
    const remaining = storage.getConversations(persona.username)
    setConversations(remaining)
    if (activeConversationId === id) {
      setActiveConversationId(remaining.length ? remaining[0].id : null)
    }
    toast.info("Conversation deleted")
  }

  const renameConversation = (id: string, newTitle: string) => {
    storage.renameConversation(id, newTitle)
    setConversations(storage.getConversations(persona.username))
  }

  const pinConversation = (id: string) => {
    const conv = conversations.find((c) => c.id === id)
    if (conv) {
      storage.pinConversation(id, !conv.pinned)
      setConversations(storage.getConversations(persona.username))
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
