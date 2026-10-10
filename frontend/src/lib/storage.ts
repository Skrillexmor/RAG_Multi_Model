import { Conversation } from "../types"

const LEGACY_CONVERSATIONS_KEY = "dars_rag_conversations"
const THEME_KEY = "dars_rag_theme"
const DENSITY_KEY = "dars_rag_density"

function getStorageKey(userId?: string): string {
  if (userId && userId.trim()) {
    return `dars_rag_conversations_${userId.trim()}`
  }
  return LEGACY_CONVERSATIONS_KEY
}

// One-time safe migration helper from legacy global storage to user-scoped storage
function migrateLegacyConversationsIfNeeded(userId: string, persona?: string): void {
  try {
    const userKey = getStorageKey(userId)
    const existingUserData = localStorage.getItem(userKey)
    if (existingUserData) {
      // User storage already initialized
      return
    }

    const legacyRaw = localStorage.getItem(LEGACY_CONVERSATIONS_KEY)
    if (!legacyRaw) return

    const legacyList: Conversation[] = JSON.parse(legacyRaw)
    if (!Array.isArray(legacyList)) return

    // Only migrate conversations that match this user's username/persona/owner
    const matching = legacyList.filter(
      (c) =>
        c.owner_user_id === userId ||
        (persona && c.persona?.toLowerCase() === persona.toLowerCase()) ||
        (!c.owner_user_id && !c.persona && userId === "alice")
    )

    if (matching.length > 0) {
      localStorage.setItem(userKey, JSON.stringify(matching))
    }

    // Keep legacy backup intact without polluting user namespace
    if (!localStorage.getItem("dars_rag_conversations_backup")) {
      localStorage.setItem("dars_rag_conversations_backup", legacyRaw)
    }
  } catch (err) {
    console.warn("Storage migration skipped:", err)
  }
}

export function generateConversationTitle(query: string): string {
  const clean = query.trim().replace(/^["']|["']$/g, "")
  if (clean.length <= 32) return clean

  // Shorten common prefixes
  const lower = clean.toLowerCase()
  if (lower.startsWith("what is the ") || lower.startsWith("what are the ")) {
    return clean.slice(12, 44) + "..."
  }
  if (lower.startsWith("summarize ")) {
    return clean.slice(10, 42) + "..."
  }
  if (lower.startsWith("find ") || lower.startsWith("show ")) {
    return clean.slice(5, 37) + "..."
  }

  return clean.slice(0, 32) + "..."
}

export const storage = {
  getConversations(persona?: string, userId?: string): Conversation[] {
    try {
      if (userId) {
        migrateLegacyConversationsIfNeeded(userId, persona)
      }
      const key = getStorageKey(userId)
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const list: Conversation[] = JSON.parse(raw)
      list.forEach((c) => {
        c.messages?.forEach((m) => {
          if (m.securityTrace && (!m.securityTrace.gate_a || !m.securityTrace.gate_b)) {
            const st: any = m.securityTrace
            m.securityTrace = {
              request_id: st.request_id || "req_historical",
              principal: st.user_id || "user",
              vault: st.vault_slug || c.vaultSlug,
              gate_a: st.gate_a || {
                compiled_filter_valid: true,
                candidates_count: st.gate_a_candidates_count ?? 0,
              },
              gate_b: st.gate_b || {
                evaluated_count: st.gate_a_candidates_count ?? 0,
                authorized_count: st.gate_b_canonical_verified_count ?? 0,
                excluded_count: st.excluded_candidates_count ?? 0,
              },
              grounding: st.grounding || {
                claims_count: st.citations_total_count ?? 0,
                citations_count: st.citations_validated_count ?? 0,
                status: st.answer_status ?? "GROUNDED",
              },
              ...st,
            }
          }
        })
      })
      if (persona) {
        return list.filter((c) => !c.persona || c.persona === persona)
      }
      return list
    } catch {
      return []
    }
  },

  getConversation(id: string, userId?: string): Conversation | null {
    const list = this.getConversations(undefined, userId)
    return list.find((c) => c.id === id) || null
  },

  saveConversation(conv: Conversation, userId?: string): void {
    const effectiveUserId = userId || conv.owner_user_id
    const list = this.getConversations(undefined, effectiveUserId)
    const index = list.findIndex((c) => c.id === conv.id)
    if (index >= 0) {
      list[index] = conv
    } else {
      list.unshift(conv)
    }
    try {
      const key = getStorageKey(effectiveUserId)
      localStorage.setItem(key, JSON.stringify(list))
    } catch (e) {
      console.warn("Local storage write limit reached", e)
    }
  },

  deleteConversation(id: string, userId?: string): void {
    const key = getStorageKey(userId)
    const list = this.getConversations(undefined, userId).filter((c) => c.id !== id)
    localStorage.setItem(key, JSON.stringify(list))
  },

  pinConversation(id: string, pinned: boolean, userId?: string): void {
    const conv = this.getConversation(id, userId)
    if (conv) {
      conv.pinned = pinned
      this.saveConversation(conv, userId)
    }
  },

  renameConversation(id: string, newTitle: string, userId?: string): void {
    const conv = this.getConversation(id, userId)
    if (conv) {
      conv.title = newTitle.trim()
      conv.updatedAt = new Date().toISOString()
      this.saveConversation(conv, userId)
    }
  },

  clearUserConversations(userId?: string): void {
    if (userId) {
      localStorage.removeItem(getStorageKey(userId))
    }
  },

  getTheme(): "dark" | "light" | "system" {
    return (localStorage.getItem(THEME_KEY) as any) || "dark"
  },

  setTheme(theme: "dark" | "light" | "system"): void {
    localStorage.setItem(THEME_KEY, theme)
    if (theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  },

  getDensity(): "comfortable" | "compact" {
    return (localStorage.getItem(DENSITY_KEY) as any) || "comfortable"
  },

  setDensity(density: "comfortable" | "compact"): void {
    localStorage.setItem(DENSITY_KEY, density)
  },

  getMotion(): "system" | "on" | "off" {
    return (localStorage.getItem("dars_rag_motion") as any) || "system"
  },

  setMotion(motion: "system" | "on" | "off"): void {
    localStorage.setItem("dars_rag_motion", motion)
    if (motion === "off") {
      document.documentElement.dataset.motion = "off"
    } else if (motion === "on") {
      document.documentElement.dataset.motion = "on"
    } else {
      delete document.documentElement.dataset.motion
    }
  },
}

