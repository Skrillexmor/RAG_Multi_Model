import { Conversation } from "../types"

const CONVERSATIONS_KEY = "dars_rag_conversations"
const THEME_KEY = "dars_rag_theme"
const DENSITY_KEY = "dars_rag_density"

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
  getConversations(persona?: string): Conversation[] {
    try {
      const raw = localStorage.getItem(CONVERSATIONS_KEY)
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

  getConversation(id: string): Conversation | null {
    const list = this.getConversations()
    return list.find((c) => c.id === id) || null
  },

  saveConversation(conv: Conversation): void {
    const list = this.getConversations()
    const index = list.findIndex((c) => c.id === conv.id)
    if (index >= 0) {
      list[index] = conv
    } else {
      list.unshift(conv)
    }
    try {
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list))
    } catch (e) {
      console.warn("Local storage write limit reached", e)
    }
  },

  deleteConversation(id: string): void {
    const list = this.getConversations().filter((c) => c.id !== id)
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(list))
  },

  pinConversation(id: string, pinned: boolean): void {
    const conv = this.getConversation(id)
    if (conv) {
      conv.pinned = pinned
      this.saveConversation(conv)
    }
  },

  renameConversation(id: string, newTitle: string): void {
    const conv = this.getConversation(id)
    if (conv) {
      conv.title = newTitle.trim()
      conv.updatedAt = new Date().toISOString()
      this.saveConversation(conv)
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
}
