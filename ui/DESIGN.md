# DESIGN.md — Gatelight
### A premium design system for DARS-RAG / PrivateRAG

> **One sentence:** *Color and light appear only when the system makes a security decision. Everything else is steel and ink.*

| | |
|---|---|
| **Product** | DARS-RAG v4.0 (UI brand string today: "PrivateRAG") — offline, LAN-native, multi-modal RAG where authorization travels with the data |
| **Stack it targets** | React 18 · Vite 6 · Tailwind 3.4 · Radix primitives · cmdk · sonner · class-variance-authority |
| **Author's stance** | Product designer, not tester. Every decision below is made by reading the actual screens, their data (`types/index.ts`), and their connections (`AppContext` → `AppShell` → views). |
| **Companion file** | `gatelight-preview.html` — animated, interactive proof of the system (tokens, glyphs, motion, signature components) |

---

## 0. The Zero-Break Contract

This redesign is **skin, structure of presentation, and motion only.** The product is a security system with 84 passing invariants; the UI must never become a reason to doubt it. These rules are non-negotiable and every section below obeys them.

1. **No logic changes.** `AppContext`, `lib/api.ts`, `lib/storage.ts`, all `handle*` functions, all props and callbacks stay byte-identical. Redesign happens inside `className`, JSX wrappers, new presentational components, and CSS.
2. **No data the server didn't already send.** New visuals only reuse fields that already exist in `types/index.ts` (e.g. `gate_a.candidates_count`, `gate_b.excluded_count`, `lease_deadline`, `claims[].citation_ids`, `skew_seconds`). A security product must never *invent* a number to look good.
3. **No view, route, modal, or control is removed.** Every `AppView` value, every dropdown item, every Dialog keeps existing. Additions are additive.
4. **Same names, same props.** The icon system is a drop-in (§5): identical export names as `lucide-react`, so migration is a one-line import change per file.
5. **Same CSS-variable names.** `--background`, `--primary`, `--surface-raised`, `--sec-allowed`… keep their names; only values change. Tailwind's `bg-surface-raised`, `text-muted-foreground` etc. keep working everywhere.
6. **Offline-safe.** The product promises *zero cloud*. No Google Fonts, no CDN icons, no remote images. Fonts are bundled (§4.3). The design must pass `scripts/verify_offline.py` spirit.
7. **Motion never gates function.** Every animation is decorative or explanatory; `prefers-reduced-motion` collapses all of it to instant state changes.
8. **Color is never the only signal.** Permit/Deny/Hold also change glyph shape and label text (§3.4).

---

## 1. Design Audit — what I found reading every page

I walked the app as a user would: shell → chat → sources → vaults → access → federation → audit → chunks → settings, then every modal and drawer. These are the findings that drive the system.

### 1.1 Structural findings (verified in source)

| # | Finding | Evidence | Design consequence |
|---|---|---|---|
| A1 | **Emerald-on-gray everywhere.** `emerald-400/500/300` appear ~380 times as the default "accent", plus sky/indigo/amber/rose/purple/cyan/fuchsia for decoration. It reads as "default AI dashboard". | grep: `emerald-500` ×175, `emerald-400` ×171, `emerald-300` ×33 | Introduce *chromatic scarcity* (§3.1): neutral by default, semantic color only for decisions |
| A2 | **Emoji as icons** in the live-model badge: 💬 🎙️ 👁️ 🎬 — rendered by each OS differently, off-brand, can't be themed. | `TopBar`, `ChatView`, `Composer` (28 emoji refs) | Custom *Engine Glyphs* (§5.4) |
| A3 | **Same model-detection function copy-pasted 3×** (and a 4th variant in `UploadModal`) with duplicated color classes. | `getActiveModelInfo`, `getActiveModelForFile`, `getDetectedModel` | One presentational `<EngineChip file=… />` (pure function of filename — no logic change, just deduplicated rendering) |
| A4 | **Silent no-op Tailwind classes.** `h-4.5`, `h-7.5`, `w-7.5`, `py-0.2`, `xs:block` don't exist in Tailwind 3.4's default scale/screens, so those elements fall back to unintended sizes. | `h-7.5` ×7, `py-0.2` ×9, `h-4.5` ×3, `xs:` ×1 | Add to scale via `extend.spacing` / `screens` so intent is honored (§3.5) — zero JSX change |
| A5 | **Referenced keyframe doesn't exist.** The Composer progress bar uses `animate-[indeterminate_…]` but `indeterminate` is never defined → the bar is a static green line. | Composer L199; tailwind.config.js | Define `indeterminate` (§8) — loading finally *moves* |
| A6 | **Light theme is nominal.** Settings offers Light/Dark/System and `:root` has light tokens, but hundreds of hard-coded `text-emerald-300`, `bg-*-950/40`, `text-amber-200` are unreadable on white. `index.html` hard-sets `class="dark"`. | `SettingsView` theme buttons; index.html | Gatelight ships a *real* paper theme (§3.1) driven by tokens, plus a codemod table mapping hard-coded palette classes → semantic tokens |
| A7 | **Fonts promised, never loaded.** CSS names `JetBrains Mono`; nothing loads it. Body is the browser's `font-sans`. Result: inconsistent type per OS. | index.css L82; index.html | Bundle Geist + Geist Mono + Geist Light via `@fontsource` (offline, §4.3) |
| A8 | **Spec section codes leak into UI copy.** Headings like "Security Vault Compartments (§12..§25)", "Retrieval Security Trace (§11)", "(§128)". Great for a hackathon judge, noisy for a user. | VaultsView, SecurityTraceDrawer, SettingsView, TestsView | Move § refs into a quiet mono `ref` tag (visible, copyable, but visually tertiary) — nothing removed |
| A9 | **Brand naming drift.** `<title>` & TopBar say *PrivateRAG*; README/architecture say *DARS-RAG*; Audit says *SOC*. | index.html, TopBar, README | Wordmark lockup: **PrivateRAG** with `DARS` as the technical sub-label (§6.3) |
| A10 | **`SecurityTestsView` is routed but unreachable.** `AppShell` has `case "tests"`, but neither the Sidebar nav nor the Command Palette links to it. | Sidebar `navLinks`; CommandPalette items | Additive: add a "Verification" entry to the palette and a quiet link in Settings → Offline Diagnostics. *(No existing item removed.)* |
| A11 | **Dense micro-type.** Large amounts of 9–11px text (`text-[9px]`, `text-[10px]`) in mono, many at `text-muted-foreground/60` — below WCAG AA contrast on dark. | passim | Type scale floor of 11px for anything that carries meaning; 10px only for decorative tags (§4) |
| A12 | **Every card is the same card.** Vault, Source, Chunk, Grant, Node, Gauge all use `rounded-xl border bg-surface-raised`. Hierarchy is flat; nothing says "this one matters". | Sources/Vaults/Chunks/Access/Federation | Three elevation roles + a "Sealed" surface for verified things (§3.6) |
| A13 | **Loading is text + `animate-pulse`.** The chat loading state shows a sentence while the *real* pipeline (Gate A → Gate B → grounding) is invisible, even though the trace data describes it perfectly. | ChatView loading block | **Gate Path** pipeline visual (§6.4) — the product's best story, finally told |
| A14 | **Model/mode colors are arbitrary.** LOW=emerald, MED=blue, HIGH=purple; Audio=amber, Video=fuchsia/amber, Image=indigo/amber — inconsistent across Sidebar, MessageItem, Evidence. | Sidebar vs MessageItem vs EvidenceInspector | One modality map, one depth map (§3.3) |

### 1.2 What is already good (and must be protected)

- The **information architecture** is correct: Workspace (Chat/Sources/Vaults) → Security (Access/Federation/Audit/Chunks) → System (Settings). Keep it.
- The **right-side drawer pattern** for Evidence and Trace is the right model for provenance. Keep it, elevate it.
- **Citations as inline chips `[C1]`** that open proof — the core trust mechanic. Keep it, make it beautiful.
- The **command palette**, **session countdown capsule**, and **refusal-with-request-access** flow are genuinely good product thinking. They get the most design attention.
- The dark editorial foundation (`220 7% 7%`) is already restrained. Gatelight deepens it rather than replacing it.

### 1.3 Connection map (how pages talk to each other)

```
                        ┌──────────────────────────── Command Palette (⌘K) ───────────────────────────┐
                        │ new chat · chunks · audit · chat · sources · access · federation · settings   │
                        └───────────────────────────────────────────────────────────────────────────────┘
 Sidebar ── history ─────────► Chat ◄──────────── "Ask Folder" ◄── Sources ◄── "Browse Files" ◄── Vaults
    │                           │  ▲                                  │  │                           │  │
    │                           │  └─ vault/file scope chips          │  └─ Upload / Assign-Share    │  └─ Assign Grants / JIT
    │                           ▼                                     ▼                              ▼
    │                   Evidence drawer ◄── [C1] chips        ShareAccessModal             RequestAccessModal / IssueGrantModal
    │                   Trace drawer    ◄── "Gate A…" row            │                              │
    │                           │                                    └────────► Access & Grants ◄───┘
    │                  Refusal ─┴── "Request Temporary Access" ──────────────►  (grants · requests · matrix)
    ├── Federation (bundles, topology)      ├── Audit (hash chain, telemetry, checkpoints)
    ├── Chunk Store (canonical chunks)      └── Settings (users, theme, offline diagnostics) ─► (Tests: orphaned today)
 TopBar: model chip → LLM modal · session capsule → renew/Session-warning modal · avatar → Auth modal / persona switch / logout
```

Design implication: **the same four objects recur on every page** — *Vault, Document, Grant, Evidence*. Gatelight gives each a consistent visual identity (§6.2) so users recognise them across pages.

---

## 2. Concept — "Gatelight"

DARS-RAG's defining idea is the **Two-Gate Retrieval Firewall**: every piece of evidence must pass **Gate A** (pre-retrieval filter) and **Gate B** (canonical recheck) before the model ever sees it.

Gatelight turns that into the visual language:

- **The Aperture** — the brand mark is two concentric rings (Gate A outer, Gate B inner) with a small *beam dot* passing through the opening. It appears as logo, loader, empty-state illustration, and verified-seal.
- **Strata** — classification levels L0–L4 are not a number in a badge; they are **five stacked layers** you can *see*: your clearance is how deep you reach; a vault's ceiling is how deep it goes. A gap between them *is* the "Request access" moment.
- **Chromatic scarcity** — the interface is steel and chalk. Color is *earned*: Verdigris only when something is permitted, Garnet only when denied, Saffron only when pending/expiring, Lapis only for cryptographic trust (hashes, signatures, chain).
- **The Seal** — verified things (citations, audit blocks, signed grants) carry a subtle *sealed* surface: a 1px inner highlight and a tiny notch. Unverified/ordinary things don't. You can tell trust at a glance without reading.

### 2.1 Six principles

1. **Decisions glow, data rests.** Only security outcomes use color/animation. Content stays calm.
2. **Show the gate, not the claim.** Prefer visualising the real pipeline/trace over writing "Verified ✓".
3. **Density with air.** SOC views are dense; Chat is spacious. Same tokens, two densities.
4. **Own the details.** Custom glyphs, custom focus ring, custom scrollbars, custom selection color. Nothing visibly "default".
5. **Honest motion.** Motion encodes causality (this passed → that opened), never decoration for its own sake.
6. **Quiet on the outside, rigorous inside.** Hairlines, tabular numerals, mono reserved for real identifiers (hashes, IDs, timestamps), and large type that is *light* rather than loud.

### 2.2 Voice (microcopy)

Keep technical truth, remove spec noise from the primary line:

| Today | Gatelight |
|---|---|
| "Security Vault Compartments (§12..§25)" | **Compartments** · `§12–25` |
| "Retrieval Security Trace (§11)" | **Gate Path** · `§11` |
| "Zero-Trust Identity & Roles" | **Identity** — *Authenticate or create a role.* |
| "Local Offline LLM Configuration & Models" | **Local Engines** — *Everything runs on this machine.* |
| "Access-Controlled Information Boundary" | **Outside your clearance** — *Nothing restricted reached the model.* |
| "Closed-World Invariant ✓" | **Closed world** · sealed |

---

## 3. Foundations — Design Tokens

All tokens are **OKLCH-authored** (perceptually uniform, so Verdigris and Garnet *feel* equally bright) with **sRGB hex** and **HSL triplets** supplied. The HSL triplets slot straight into the existing `hsl(var(--token))` pipeline — no component needs to know OKLCH exists.

### 3.1 Color — two themes, one logic

The dark theme is **steel, not black**: a visibly cool blue-graphite canvas (the colour of a vault door), lifted a few points above the near-black that most dashboards default to, so surfaces separate with hairlines instead of shadows. The light theme is **chalk** — a faintly cool off-white, deliberately *not* cream.

**Dark theme: "Steel"** (default; keeps `class="dark"`)

| Role · existing variable | OKLCH | Hex | HSL triplet (for `index.css`) | vs canvas | vs raised |
|---|---|---|---|---|---|
| Canvas · `--background` | `oklch(0.175 0.013 250)` | `#0C1116` | `211 29% 7%` | — | — |
| Surface · `--surface` | `oklch(0.205 0.014 250)` | `#12181D` | `211 23% 9%` | — | — |
| Raised · `--surface-raised`, `--card`, `--popover` | `oklch(0.236 0.015 250)` | `#191F25` | `211 20% 12%` | — | — |
| Subtle · `--secondary`, `--muted`, `--surface-subtle` | `oklch(0.272 0.016 250)` | `#21282F` | `211 17% 16%` | — | — |
| Accent hover · `--accent` | `oklch(0.302 0.016 250)` | `#282F36` | `211 15% 19%` | — | — |
| Hairline · `--border`, `--input`, `--surface-border` | `oklch(0.345 0.016 250)` | `#333A41` | `211 12% 23%` | — | — |
| **Ink** · `--foreground`, `--primary` | `oklch(0.958 0.008 85)` | `#F3F1EB` | `40 27% 94%` | 16.8:1 | 14.7:1 |
| Ink-2 · `--muted-foreground` | `oklch(0.765 0.014 250)` | `#ACB4BB` | `211 10% 71%` | 9.0:1 | 7.9:1 |
| Ink-3 · *new* `--faint` (secondary meta text; never below this) | `oklch(0.665 0.014 250)` | `#8D959C` | `211 7% 58%` | 6.2:1 | 5.5:1 |
| **Permit · Verdigris** · `--sec-allowed` | `oklch(0.8 0.125 170)` | `#5AD8B1` | `162 61% 60%` | 10.7:1 | 9.4:1 |
| **Deny · Garnet** · `--sec-denied` | `oklch(0.7 0.18 20)` | `#FA676E` | `357 94% 69%` | 6.5:1 | 5.7:1 |
| **Hold · Saffron** · `--sec-warning` | `oklch(0.83 0.14 82)` | `#F4BE4F` | `40 89% 63%` | 11.1:1 | 9.7:1 |
| **Trust · Lapis** · *new* `--sec-trust` (hashes, signatures, chain, epochs) | `oklch(0.78 0.11 255)` | `#87BAFD` | `214 96% 76%` | 9.5:1 | 8.3:1 |
| **Beam** · *new* `--beam` (logo, loaders, verified glints) | `oklch(0.93 0.07 195)` | `#B0F7F6` | `179 82% 83%` | 15.8:1 | 13.9:1 |

**Light theme: "Chalk"** (becomes a real theme — cool off-white, ink text, deeper semantic hues so contrast holds)

| Role | OKLCH | Hex | HSL triplet | Contrast on chalk |
|---|---|---|---|---|
| Chalk · `--background` | `oklch(0.982 0.003 250)` | `#F8F9FB` | `211 30% 98%` | — |
| Surface | `oklch(0.965 0.004 250)` | `#F1F4F6` | `211 20% 96%` | — |
| Raised · card/popover | `oklch(0.997 0.002 250)` | `#FDFEFF` | `206 100% 100%` | — |
| Subtle · secondary/muted | `oklch(0.945 0.005 250)` | `#EAEDF0` | `211 16% 93%` | — |
| Hairline · border | `oklch(0.89 0.006 250)` | `#D8DBDF` | `211 9% 86%` | — |
| Ink · foreground | `oklch(0.2 0.014 255)` | `#12161C` | `214 23% 9%` | 17.2:1 |
| Ink-2 · muted-foreground | `oklch(0.47 0.014 255)` | `#565B63` | `214 7% 36%` | 6.5:1 |
| Ink-3 · faint | `oklch(0.54 0.012 255)` | `#6A6F76` | `214 5% 44%` | 4.8:1 |
| Permit | `oklch(0.5 0.12 170)` | `#007859` | `164 100% 24%` | 5.2:1 |
| Deny | `oklch(0.53 0.19 22)` | `#C12535` | `354 68% 45%` | 5.5:1 |
| Hold | `oklch(0.545 0.135 70)` | `#A15F00` | `35 100% 31%` | 4.8:1 |
| Trust | `oklch(0.49 0.12 258)` | `#3260A3` | `216 53% 42%` | 6.0:1 |
| Beam (decorative accents only) | `oklch(0.52 0.09 200)` | `#00787D` | `182 100% 25%` | 5.0:1 |

> Every text-carrying pair above meets WCAG AA (4.5:1). Ink-3 is the *floor* for meaningful text; anything dimmer than Ink-3 is decorative only (hairlines, disabled controls). Beam on Chalk is used for glyph accents and never for text.

**Drop-in `index.css`** (variable names unchanged; `hsl(var(--x))` unchanged):

```css
@layer base {
  :root {                       /* CHALK */
    --background: 211 30% 98%;   --foreground: 214 23% 9%;
    --card: 206 100% 100%;         --card-foreground: 214 23% 9%;
    --popover: 206 100% 100%;      --popover-foreground: 214 23% 9%;
    --primary: 214 23% 9%;      --primary-foreground: 211 30% 98%;
    --secondary: 211 16% 93%;    --secondary-foreground: 214 23% 9%;
    --muted: 211 16% 93%;        --muted-foreground: 214 7% 36%;
    --accent: 211 14% 90%;       --accent-foreground: 214 23% 9%;
    --destructive: 354 68% 45%; --destructive-foreground: 211 30% 98%;
    --border: 211 9% 86%;       --input: 211 9% 86%;   --ring: 216 53% 42%;
    --radius: 0.625rem;

    --surface: 211 20% 96%;      --surface-raised: 206 100% 100%;
    --surface-subtle: 211 16% 93%; --surface-border: 211 9% 86%;

    --sec-allowed: 164 100% 24%; --sec-denied: 354 68% 45%;
    --sec-warning: 35 100% 31%;  --sec-neutral: 214 7% 36%;
    --sec-trust: 216 53% 42%;    --beam: 182 100% 25%;  --faint: 214 5% 44%;
  }
  .dark {                       /* STEEL */
    --background: 211 29% 7%;   --foreground: 40 27% 94%;
    --card: 211 20% 12%;        --card-foreground: 40 27% 94%;
    --popover: 211 20% 12%;     --popover-foreground: 40 27% 94%;
    --primary: 40 27% 94%;      --primary-foreground: 211 29% 7%;
    --secondary: 211 17% 16%;   --secondary-foreground: 40 27% 94%;
    --muted: 211 17% 16%;       --muted-foreground: 211 10% 71%;
    --accent: 211 15% 19%;      --accent-foreground: 40 27% 94%;
    --destructive: 357 80% 60%; --destructive-foreground: 40 27% 94%;
    --border: 211 12% 23%;       --input: 211 12% 23%;   --ring: 214 96% 76%;

    --surface: 211 23% 9%;      --surface-raised: 211 20% 12%;
    --surface-subtle: 211 17% 16%; --surface-border: 211 12% 23%;

    --sec-allowed: 162 61% 60%;  --sec-denied: 357 94% 69%;
    --sec-warning: 40 89% 63%;   --sec-neutral: 211 10% 71%;
    --sec-trust: 214 96% 76%;    --beam: 179 82% 83%;  --faint: 211 7% 58%;
  }
}
```

> **Why `index.html` changes by one attribute:** remove the hard-coded `class="dark"` and let a 6-line inline script set it from `storage.getTheme()` *before* first paint (prevents the flash). `SettingsView` already owns the toggle — no logic added.

### 3.2 Chromatic scarcity — the usage rule

| Surface | Allowed color | Never |
|---|---|---|
| Chrome (sidebar, topbar, cards, tables) | Ink / Ink-2 / hairlines only | emerald/sky/indigo tints on icons "for flavor" |
| Primary button | Ink on canvas (chalk pill) | green buttons |
| Focus ring | Lapis ring + 2px offset | outline-none with no replacement |
| Success/Permit | Verdigris **+ shield-open glyph + word "Permitted"** | color alone |
| Error/Deny | Garnet **+ closed-gate glyph + word "Denied"** | red-only text |
| Pending/Expiring | Saffron **+ ring-timer glyph + time** | amber blocks as decoration |
| Crypto (hash, signature, chain, epoch) | Lapis, in mono | green hashes |
| Brand moments (logo, loader, seal) | Beam | gradients |

### 3.3 Two semantic maps that replace today's inconsistent colors (A14)

**Modality** — same chroma/lightness family, *glyph carries identity*, color is a quiet tint (dark theme):

| Modality | OKLCH | Hex | Glyph |
|---|---|---|---|
| Document | `oklch(0.78 0.030 240)` | `#A7BAC9` | `sheet` |
| Image | `oklch(0.80 0.085 145)` | `#9CCD9C` | `frame` |
| Audio | `oklch(0.82 0.085 65)` | `#EBB989` | `wave` |
| Video | `oklch(0.78 0.090 300)` | `#C0ABE9` | `reel` |
| Code | `oklch(0.80 0.075 215)` | `#84CBDC` | `brackets` |

Chroma ≤ 0.09 on purpose: these never compete with Verdigris/Garnet (chroma ≥ 0.125).

**Retrieval depth** — LOW / MEDIUM / HIGH stop being green/blue/purple. They become **1, 2, 3 filled rings** of the same Lapis (`depth` glyph). More rings = deeper retrieval pipeline. Readable at 12px, colorblind-safe.

### 3.4 Status vocabulary (shape + word + color)

| State | Glyph | Word | Color | Replaces |
|---|---|---|---|---|
| Permit / ALLOW | `gate-open` | Permitted | Verdigris | `Badge variant="success"` |
| Deny / DENY | `gate-closed` | Denied | Garnet | `Badge variant="danger"/"destructive"` |
| Pending / JIT | `ring-timer` | Pending | Saffron | `Badge variant="warning"` |
| Verified / sealed | `seal` | Verified | Lapis | emerald check circles |
| Expired / revoked | `gate-closed` outline | Expired / Revoked | Ink-3 | grey badges |

*(Badge variants keep their names — only their classes change, §6.1.)*

### 3.5 Spacing, size, radius

- **4px base grid.** Keep Tailwind's scale; **add** the half-steps the code already uses (A4): `0.2 → 0.05rem`, `4.5 → 1.125rem`, `7.5 → 1.875rem`; add `screens.xs = 480px`.
- **Density modes** (new, additive): `data-density="comfortable|compact"` on `<html>`. Chat/Settings default comfortable (row 44px); Audit/Chunks/Access tables default compact (row 32px). Implemented as CSS vars `--row-h`, `--pad-card`, `--gap-section` read via arbitrary values.
- **Radius** — `--radius: 0.625rem` (was 0.5). Components: chips 6px · inputs/buttons 8px · cards 12px · composer/drawers 16px · seals (round) 9999px. Concentric rule: inner radius = outer − padding.
- **Layout constants:** sidebar 264px / rail 64px; topbar 52px (was 56); chat measure 68ch (≈ `max-w-3xl`); drawer 480px (`md:max-w-lg` stays).

### 3.6 Elevation — "shadow-as-border" (the Vercel/Linear lesson)

Premium dark UIs don't use drop shadows to lift things; they use **1px hairline rings + an inner top highlight**, and reserve real shadows for floating layers.

| Level | Used by | Recipe |
|---|---|---|
| `e0` flat | page canvas, table rows | none |
| `e1` card | vault/source/chunk/grant cards, gauges | `0 0 0 1px hsl(var(--border)), inset 0 1px 0 hsl(0 0% 100% / .035)` |
| `e2` raised | composer, dropdowns, popovers, toasts | `0 0 0 1px hsl(var(--border)), 0 12px 32px -12px hsl(0 0% 0% / .65), inset 0 1px 0 hsl(0 0% 100% / .05)` |
| `e3` overlay | dialogs, drawers, command palette | `0 0 0 1px hsl(var(--border)), 0 32px 80px -24px hsl(0 0% 0% / .75), 0 0 0 100vmax hsl(0 0% 0% / .5)` (scrim) |
| **`sealed`** | verified evidence, citations, signed grants, audit blocks | `e1` + `inset 0 0 0 1px hsl(var(--beam) / .10), inset 0 1px 0 hsl(var(--beam) / .18)` + 6px corner notch glyph |

On **Chalk** theme the highlight inverts: `inset 0 -1px 0 hsl(0 0% 0% / .04)` and shadows soften to `.12` alpha.

### 3.7 Z-index scale
`base 0 · sticky 10 · sidebar 20 · topbar 30 · dropdown 40 · drawer 50 · modal 60 · palette 70 · toast 80`. (Today they're ad-hoc `z-20/z-30/z-50`.)

---

## 4. Typography

### 4.1 Faces (all SIL OFL — free, redistributable, **bundleable offline**)

| Role | Face | Why |
|---|---|---|
| UI & body | **Geist** (variable) | Neutral-technical, tight at display sizes, excellent numerals, the face of the Vercel system |
| Identifiers, hashes, IDs, kbd | **Geist Mono** | Pairs metrically with Geist; zero-ambiguity `0/O` `1/l/I` |
| Display moments (empty-state headline, view titles, big counters) | **Geist at weight 300**, 28–40px, tracking −0.03em | One family, two voices: light + large reads calm and confident; the research (Vercel's "compression as identity") shows tight tracking is what makes a neutral grotesque look expensive. No second display face to load or to look like every other generated page |

### 4.2 Scale (base is **13px** — the app lives at 12px today and reads cramped)

| Token | Size / line | Weight · tracking | Use |
|---|---|---|---|
| `display` | 40 / 44 | Geist 300 · −0.035em | Empty-state headline, hero counters |
| `title-1` | 28 / 32 | Geist 300 · −0.03em | View titles ("Compartments", "Audit") |
| `title-2` | 20 / 26 | Geist 600 · −0.012em | Drawer/dialog titles, section heads |
| `body-lg` | 15 / 1.65 | Geist 400 | **Chat answers** (reading size) |
| `body` | 13 / 20 | Geist 400 | Default UI |
| `label` | 12 / 16 | Geist 500 · +0.005em | Buttons, tabs, chips |
| `caption` | 11 / 14 | Geist 400 | Meta lines (floor for meaningful text) |
| `mono` | 12 / 18 | Geist Mono 450 | IDs, hashes, timestamps, code |
| `quiet` | 11 / 14 | Geist 500 · +0.01em · sentence case, Ink-3 | Group labels and table column heads (replaces tracked-out ALL-CAPS eyebrows — a labeling habit I deliberately avoid) |

Rules: `font-variant-numeric: tabular-nums` on every counter/timer/gauge; `text-wrap: balance` on titles; `text-wrap: pretty` on answers; `font-feature-settings: "ss01","cv11"` for Geist's single-storey `a`; hyphenation off in mono.

### 4.3 Loading fonts without breaking "zero-cloud"

```bash
npm i @fontsource-variable/geist @fontsource-variable/geist-mono
```
```ts
// main.tsx — add 2 imports above "./index.css"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"
```
Vite bundles the woff2 files into `dist/assets` — served from the same FastAPI origin, so the CSP and `verify_offline.py` invariants hold. Tailwind: `fontFamily: { sans: ['"Geist Variable"', ...], mono: ['"Geist Mono Variable"', ...] }`.

---

## 5. Iconography — "Gatelight Glyphs" (own icon set, zero defaults)

Today: **81 distinct lucide icons**, plus 4 emoji. Lucide is excellent but it's *everyone's* icon set; it is the single fastest tell of a generic AI product. Gatelight replaces all of them.

### 5.1 Construction rules

| Rule | Spec |
|---|---|
| Grid | 24×24, 2px safe padding (live area 20×20) |
| Stroke | **1.5px**, round joins, round caps; scales to 1.25px at 14px and 1.75px at 28px via `vector-effect` + `--glyph-stroke` |
| Geometry | Built from circles, quarter-arcs and 45° cuts only; corner radius 2.5 on rectangles |
| **The Notch** (signature) | Every closed contour has **one deliberate gap** (≈ 3px) at the upper-right — the *gate opening*. Reads as a family at a glance. |
| **The Beam** (duotone) | Each glyph has **one accent element** (a dot, tick or line) drawn in `--glyph-accent` (defaults to `currentColor` at 100%; becomes Verdigris/Garnet/Saffron/Lapis in status contexts; animates on hover) |
| Sizes | 12 (inline) · 14 (dense UI) · 16 (default) · 20 (nav) · 28 (empty states) |
| States | `idle` · `hover` (beam shifts/pulses once) · `active` (beam filled) · `busy` (beam orbits) |

The brand mark **is** the first glyph: `aperture` — outer ring open at top-right (Gate A), inner ring (Gate B), beam dot passing through the opening.

### 5.2 The set (authored SVG; `viewBox="0 0 24 24"`; primary = `stroke`, accent = `.b` class)

> Every path below is final production geometry — copy into `src/glyphs/paths.ts`. `.b` = beam (accent) element.

```text
aperture     <path d="M12 3a9 9 0 1 0 9 9"/><circle cx="12" cy="12" r="4"/><circle class="b" cx="17.2" cy="6.8" r="1.25"/>
ask          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h-.5A2.5 2.5 0 0 1 4 13.5z"/><path class="b" d="M8.5 9.5h6"/>
sheet        <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3H14l4.5 4.5v12A1.5 1.5 0 0 1 17 21H7.5A1.5 1.5 0 0 1 6 19.5z"/><path d="M14 3v4.5h4.5"/><path class="b" d="M9.5 13h5M9.5 16.5h3"/>
compartment  <rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="12" cy="12" r="3.5"/><path class="b" d="M12 8.5V6.8"/>
grant        <circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5 19 4"/><path d="m16 7 2.5 2.5"/><circle class="b" cx="8" cy="15" r="1"/>
mesh         <circle cx="12" cy="5" r="2"/><circle cx="5.5" cy="18" r="2"/><circle cx="18.5" cy="18" r="2"/><path d="M11 6.9 6.5 16M13 6.9l4.5 9.1M7.6 18h8.8"/><circle class="b" cx="12" cy="13.4" r=".9"/>
ledger       <rect x="3" y="8.5" width="10" height="7" rx="3.5"/><rect x="11" y="8.5" width="10" height="7" rx="3.5"/><path class="b" d="M12 18.5v2"/>
strata       <path d="M4.5 7 12 4l7.5 3L12 10z"/><path d="m4.5 11.5 7.5 3 7.5-3"/><path d="m4.5 16 7.5 3 7.5-3"/><path class="b" d="M12 4v6"/>
verify       <path d="M12 3 4.5 6v5.5c0 4.5 3 7.8 7.5 9.5 4.5-1.7 7.5-5 7.5-9.5V7.5"/><path class="b" d="m8.8 12 2.4 2.4 5-5.4"/>
tune         <path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20"/><circle cx="15" cy="7" r="2.5"/><circle cx="9" cy="17" r="2.5"/><circle class="b" cx="15" cy="7" r=".8"/>
add          <path d="M12 5v5M12 14v5M5 12h5M14 12h5"/><circle class="b" cx="12" cy="12" r="1"/>
find         <path d="M16.5 10.5a6 6 0 1 1-6-6"/><path class="b" d="m15 15 5 5"/>
session      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/><path d="M12 7.5V12l3 2"/><circle class="b" cx="18" cy="6" r="1.25"/>
lock         <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.5-1.8"/><circle class="b" cx="12" cy="15.2" r="1.2"/>
iris         <path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z"/><circle class="b" cx="12" cy="12" r="2.6"/>
wave         <path d="M5 10v4M8.5 7v10M15.5 8v8M19 10.5v3"/><path class="b" d="M12 4.5v15"/>
reel         <rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M7 5.5v13M17 5.5v13"/><path class="b" d="m10.8 9.6 3.4 2.4-3.4 2.4z"/>
brackets     <path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4"/><path class="b" d="m13.2 6.5-2.4 11"/>
frame        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m4 16 4.5-4.5 4 4 2.5-2.5 5 5"/><circle class="b" cx="15.5" cy="9" r="1.3"/>
engine       <path d="M12 3 4.2 7.5v9L12 21l7.8-4.5V9"/><circle class="b" cx="12" cy="12" r="2"/><path d="M12 10V6.5M13.7 13l3 1.7"/>
gate-open    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/><path class="b" d="m8.6 12 2.4 2.4 4.8-5"/>
gate-closed  <circle cx="12" cy="12" r="8.5"/><path class="b" d="M7 12h10"/>
alert        <path d="M10.3 5.2 3.8 17a1.9 1.9 0 0 0 1.7 2.8h13a1.9 1.9 0 0 0 1.7-2.8L13.7 5.2a2 2 0 0 0-3.4 0z" /><path class="b" d="M12 10v3.6"/><circle class="b" cx="12" cy="16.6" r=".6"/>
hash         <path d="M9.5 4 8 20M16 4l-1.5 16M4.5 9h15M4 15h15"/><circle class="b" cx="19.5" cy="4.5" r="1"/>
send         <path d="M12 19V7M6.5 12 12 6.5"/><path class="b" d="m17.5 12-5.5-5.5"/>
share        <circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>
people       <circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path class="b" d="M16 6a3 3 0 0 1 0 5.6M18 14.2a5.5 5.5 0 0 1 2.5 4.8"/>
lan          <path d="M5 10a10 10 0 0 1 14 0M8 13.2a6 6 0 0 1 8 0"/><circle class="b" cx="12" cy="17" r="1.6"/>
upload       <path d="M12 16V5M7 9.5 12 5"/><path d="M4.5 16v1.5A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2V16"/><circle class="b" cx="17" cy="9.5" r="1"/>
download     <path d="M12 5v11M7 12l5 4.5"/><path d="M4.5 16v1.5A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2V16"/><circle class="b" cx="17" cy="12" r="1"/>
refresh      <path d="M19 12a7 7 0 1 1-2.1-5"/><path class="b" d="M19 4.5v3.2h-3.2"/>
trash        <path d="M5 7h14M9.5 7V5h5v2M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7"/><path class="b" d="M10.5 11v5M13.5 11v5"/>
edit         <path d="M5 19l.7-3.6L16 5.2a1.8 1.8 0 0 1 2.6 0l.2.2a1.8 1.8 0 0 1 0 2.6L8.6 18.3z"/><path class="b" d="m14.5 6.7 2.8 2.8"/>
pin          <path d="M9 4h6l-.8 5 2.8 3.5H7L9.8 9z"/><path class="b" d="M12 12.5V20"/>
more         <circle cx="12" cy="5.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/>
chevron      <path d="m9 6 6 6-6 6"/>
close        <path d="M6.5 6.5 17.5 17.5M17.5 6.5l-11 11"/>
copy         <rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>
check        <path d="m5.5 12.5 4.2 4.2L18.5 7.5"/>
panel        <rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15"/><path class="b" d="M6.3 9h.01M6.3 12h.01"/>
terminal     <rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="m7.5 10 2.8 2-2.8 2"/><path class="b" d="M12.5 15h4"/>
pulse        <path d="M3.5 12h4l2-5 3.6 10 2.4-5h5"/><circle class="b" cx="20.5" cy="12" r=".4"/>
drive        <rect x="3.5" y="8" width="17" height="8.5" rx="2.5"/><path d="M7 12.3h.01"/><path class="b" d="M16.5 12.3h.01"/>
```

### 5.3 Mapping — all 81 lucide imports → Gatelight glyphs (drop-in names)

The adapter module **re-exports every glyph under the original lucide name**, so migration is *only* an import path change. Names not yet drawn fall back to lucide (so nothing ever breaks mid-migration).

| lucide import | Glyph | | lucide import | Glyph |
|---|---|---|---|---|
| `Shield` | `aperture` | | `Network` | `mesh` |
| `ShieldCheck`, `FileCheck`, `UserCheck` | `verify` | | `Server`, `HardDrive` | `drive` |
| `ShieldAlert`, `AlertTriangle`, `AlertOctagon`, `AlertCircle` | `alert` | | `Wifi`, `Radio` | `lan` |
| `MessageSquare`, `HelpCircle`, `BookOpen` | `ask` | | `Upload` | `upload` |
| `FileText`, `Folder`, `ListOrdered`, `Calendar` | `sheet` | | `Download` | `download` |
| `FolderLock` | `compartment` | | `RefreshCw`, `RotateCw`, `RotateCcw`, `Loader2` | `refresh` (+ `busy` orbit) |
| `Layers` (depth/strata context) | `strata` | | `Trash2` | `trash` |
| `KeyRound`, `Key` | `grant` | | `Edit2` | `edit` |
| `History` | `ledger` | | `Pin` | `pin` |
| `Database`, `Layers` | `strata` | | `MoreVertical` | `more` |
| `Settings`, `Filter` | `tune` | | `ChevronDown/Up/Right` | `chevron` (rotated) |
| `Plus` | `add` | | `X`, `XCircle` | `close` |
| `Search` | `find` | | `Copy` | `copy` |
| `Clock` | `session` | | `Check`, `CheckCircle2` | `check` / `gate-open` |
| `Lock` | `lock` | | `PanelLeftClose/Open` | `panel` (flipped) |
| `Image`, `ImageIcon` | `frame` | | `Terminal` | `terminal` |
| `Video` | `reel` | | `Activity`, `Zap` | `pulse` |
| `Music`, `Volume2` | `wave` | | `Hash` | `hash` |
| `Code`, `Code2` | `brackets` | | `ArrowUp`, `ArrowUpRight`, `Play` | `send` / `send`(rot 45°) / `reel` accent |
| `Cpu` | `engine` | | `Share2` | `share` |
| `Sparkles` (generic "AI" star) | **retired** → `aperture` beam-dot twinkle | | `Users`, `User`, `UserPlus`, `Building` | `people` (+ add/ building variants) |
| 👁️ emoji (vision engine) | `iris` | | `ExternalLink`, `Maximize2`, `Info`, `Circle`, `Laptop`, `Moon`, `Sun`, `LogIn`, `LogOut` | drawn in phase 2 (same rules); lucide fallback until then |

> **`Sparkles` is deliberately retired.** The 4-point sparkle is the universal "AI feature" mark. DARS-RAG's brand is *authorization*, not magic — the aperture beam replaces it everywhere it appears (Sidebar "General" conversation, Upload modal, Sources, Chunks, Vaults, Access headers, Settings).

### 5.4 Engine Glyphs — replacing the four emoji

| Was | Now | Engine chip anatomy |
|---|---|---|
| 💬 Gemma 3 4B | `engine` | `[engine glyph] Gemma 3 · 4B   ● Document LLM` |
| 🎙️ Whisper Base | `wave` (beam bars animate while active) | `[wave glyph] Whisper · Base   ● Speech-to-text` |
| 👁️ Qwen 2.5-VL | `iris` (beam dot "looks" side-to-side while active) | `[iris glyph] Qwen 2.5-VL · 3B   ● Vision` |
| 🎬 Whisper + Qwen-VL | `reel` + `wave` fused (two beam elements alternate) | `[reel glyph] Whisper + Qwen-VL   ● Video` |

The chip is **one component** `<EngineChip fileName? compact? />` used by TopBar, ChatView banner, Composer banner, UploadModal — it merely *renders* the existing `ext → model` mapping that three files duplicate today. No change to which model is detected or when.

### 5.5 Implementation — the zero-risk adapter

```tsx
// src/glyphs/Glyph.tsx
import * as React from "react"
export type GlyphProps = React.SVGProps<SVGSVGElement> & { size?: number; accent?: string; busy?: boolean }

export const makeGlyph = (name: string, body: React.ReactNode) => {
  const G = React.forwardRef<SVGSVGElement, GlyphProps>(({ size, accent, busy, className, style, ...p }, ref) => (
    <svg ref={ref} viewBox="0 0 24 24" width={size} height={size} fill="none"
         stroke="currentColor" strokeWidth="var(--glyph-stroke,1.5)" strokeLinecap="round" strokeLinejoin="round"
         className={`glyph glyph-${name} ${busy ? "is-busy" : ""} ${className ?? ""}`}
         style={{ ["--glyph-accent" as any]: accent, ...style }} aria-hidden="true" {...p}>
      {body}
    </svg>
  ))
  G.displayName = name; return G
}
```
```tsx
// src/glyphs/index.tsx — SAME names as lucide, so call sites don't change
export { Aperture as Shield, Verify as ShieldCheck, Ask as MessageSquare, Sheet as FileText,
         Compartment as FolderLock, Grant as KeyRound, Grant as Key, Ledger as History,
         Mesh as Network, Tune as Settings, Add as Plus, Find as Search, Session as Clock, /* … */ } from "./set"
export * from "lucide-react"            // fallback for anything not yet drawn (explicit exports above win)
```
```css
/* glyphs.css */
.glyph .b { stroke: var(--glyph-accent, currentColor); fill: var(--glyph-accent, currentColor); }
.glyph .b[d] { fill: none; }                          /* line accents stay strokes */
button:hover > .glyph .b, .group:hover .glyph .b { animation: beam-nudge .5s var(--ease-out); }
.glyph.is-busy .b { animation: beam-orbit 1.1s linear infinite; transform-origin: 12px 12px; }
@keyframes beam-nudge { 40% { transform: translate(.6px,-.6px) scale(1.25) } }
@keyframes beam-orbit { to { transform: rotate(360deg) } }
```
Migration per file: `from "lucide-react"` → `from "../../glyphs"`. Run it as a codemod; TypeScript fails loudly on any missing name (it won't — fallback re-export).

---

## 6. Components — the system, piece by piece

> Convention: **Keep** = existing props/handlers untouched · **Skin** = class/token change · **New** = additive presentational component.

### 6.1 Primitives (`components/ui/*` — Skin only)

**Button** (`cva` variants keep their names; sizes unchanged)

| Variant | Gatelight look |
|---|---|
| `default` | Ink pill on canvas (chalk on Steel / ink on Chalk). Inner top highlight, 1px ring. `active:` scale .98 + highlight dims. No glow. |
| `secondary` | Subtle fill, hairline ring, ink text. Hover: lifts to Accent. |
| `outline` | Transparent, hairline ring. Hover: fill Subtle. |
| `ghost` | No ring. Hover: Subtle fill. |
| `subtle` | Surface-subtle + ring (used in toolbars). |
| `security` | **Lapis** tint: `bg-trust/10 text-trust ring-trust/30`. Glyph `verify`. (Today emerald.) |
| `destructive` | Garnet text on garnet/10; solid only inside confirm dialogs. |
| *loading (new class `.is-busy`)* | Label stays, beam orbits in the leading glyph — width never jumps. |

Focus ring: `outline: 2px solid hsl(var(--ring)); outline-offset: 2px` (Lapis). Heights: sm 30 / default 36 / lg 44 (tap-safe).

**Badge** — variants stay (`default, secondary, outline, success, warning, danger, clearance, vault`):
- `success|warning|danger` → status vocabulary §3.4: tinted fill `/10`, ring `/25`, **leading glyph**, label in sentence case (not ALL CAPS).
- `clearance` → becomes the **Strata chip**: `[▤ L2]` — a 5-bar mini-stack with bars 1…n lit (see §6.2). Still takes `L{n}` children.
- `vault` → Compartment chip: `compartment` glyph + name, mono slug as tail.

**Input / Textarea** — 36px, ring-only border; focus swaps ring to Lapis and adds a 3px `ring/15` halo; caret color = Beam. Placeholder = Ink-3.
**Dialog / Sheet** — radius 16, `e3`, scrim blur 6px at 40%; enter: scale .98→1 + fade 220ms; Sheet slides 24px, not full-width, with content stagger (§8).
**Dropdown / Tooltip** — `e2`, 8px radius, items 32px; selected item shows the beam dot (not a check). Tooltip: Ink on Raised, mono for ids, 400ms open delay (current 200 → feels twitchy on dense toolbars).
**ScrollArea / scrollbar** — 8px, transparent track, thumb `hsl(var(--border))` → Ink-3 on hover; thumb *thins to 4px at rest*. Selection color: `beam/25`.
**Toaster (sonner)** — `e2`, glyph-led (`gate-open`/`gate-closed`/`alert`), 3px left status edge, `theme` follows app theme (today hard-coded `"dark"` — a light-theme bug).

### 6.2 Object identities — the four things users meet on every page

| Object | Identity | Where it appears |
|---|---|---|
| **Vault / Compartment** | `compartment` glyph in a rounded-square "safe door" tile; **Strata chip** for ceiling; epoch in mono (`ep 7`) | Sources, Vaults, Composer chip, TopBar crumb, Sidebar conversation tile |
| **Document** | `sheet`/modality glyph tile (tint from §3.3), title, mono locator; classification dot | Sources rows, Composer scope menu, Chunks, Citations |
| **Grant** | `grant` glyph; a **time-bar** underneath (remaining ÷ duration, Saffron <15%); state word; delegation depth as `↳` indents | Access, ShareAccessModal, Vault grants |
| **Evidence** | **Sealed** surface (§3.6), mono `evidence_id`, relevance as a thin 3px bar (not "94.1%" alone), `lease` ring if `lease_deadline` present | Citations, Evidence drawer, Chunks |

**The Strata chip** (`<Strata level={n} ceiling?={m} />`) — the signature widget:
```
 L0 ▁▁▁▁▁   L1 ▇▁▁▁▁   L2 ▇▇▁▁▁   L3 ▇▇▇▁▁   L4 ▇▇▇▇▇ (filled bars = clearance; ghost bar outline = vault ceiling)
```
- 5 bars, 3×10px, 2px gap, radius 1.5. Lit bars = Ink; ghost = hairline.
- With `ceiling`, bars *above your clearance but within the ceiling* render as **dashed Saffron outlines** = "reachable via JIT request". The Refusal card (§6.6) animates that gap.
- Tooltip names the tier: *Public · Internal · Confidential · Top Secret* (already exists as text in Vaults/Settings).

### 6.3 Shell

**Brand lockup (TopBar left)** — `aperture` 20px + `PrivateRAG` in Geist 600 −0.012em + `DARS` in Geist Mono 10px tracking .12em, Ink-3, separated by a hairline. On hover the beam dot completes one lap of the ring (600ms). Click → `navigate("chat")` (kept).

**Sidebar** (`w-64` / rail `w-16` — Keep)
- Surface = `--surface`, right edge = hairline only (no shadow).
- *New chat*: ink pill, `add` glyph, `⌘⇧O` hint in mono (hint only).
- Conversation rows: 40px; tile = modality glyph on modality tint (replaces the 6 competing badge colors); selected row gets a **2px Beam edge** on the left + Raised fill; pinned shows a `pin` with beam dot filled. Group labels use the `quiet` style. Action menu `more` appears on hover/focus *and always on the active row* (today always visible on every row → visual noise).
- Nav: groups **Workspace / Security / System** with quiet group labels, sentence case (currently the `category` field exists in `navLinks` but isn't rendered!). Selected = Raised pill + glyph beam filled. `Chunk Store` "Live" badge → a 6px **live dot** that breathes (2.4s) instead of a text badge.
- Rail mode: tooltips right, 400ms delay; a 1px beam tick marks the active view.
- Collapse animation: width 220ms `--ease-out`; labels fade first (80ms) so text never wraps mid-collapse.

**TopBar** (52px, `backdrop-blur-md`, hairline bottom that **fades in on scroll** via scroll-driven animation, §8.4)
Right cluster, redesigned as one **status strip** instead of five separate pills:
1. **Engine chip** (§5.4) — click → Local Engines modal (kept).
2. **Air-gap chip** — `lan` glyph + "Air-gapped"; Verdigris beam dot. Tooltip keeps the existing copy.
3. **Time chip** — `session` glyph + "Time verified"; turns Saffron with skew `+0.8s` if `timeStatus.status !== "OK"` (data exists: `skew_seconds`).
4. **Session ring** — see below.
5. **Identity** — avatar tile (initial on Beam-tinted square, not a circle — squares echo vault tiles) + name + Strata chip + chevron.

Centered ⌘K search: 32px field, ring-only, `⌘K` kbd in mono; on focus it **expands to 480px** (200ms) and becomes the palette entry (opens the same `CommandPalette`).

**Session ring** (replaces `Session: 04:12 ⟳` capsule; same click → `renewSession`)
- 26px ring (SVG stroke-dashoffset) draws the remaining fraction of 300s; time in tabular mono beside it.
- States: **>60s** hairline ring + Beam arc · **≤60s** arc → Saffron · **≤30s (`isSessionWarning`)** arc Saffron, ring pulses 1.2s, capsule outline Saffron.
- Click: ring *refills* clockwise in 400ms with a Beam sweep (visual confirmation of `renewSession`).

### 6.4 Gate Path — the product's best story, finally visible (A13)

Two places use it: the **loading state** in Chat and the **Security Trace drawer**.

```
 Identity ─▶ Scope ─▶ [ GATE A ] ─▶ Vector candidates ─▶ [ GATE B ] ─▶ Evidence ─▶ Grounding ─▶ DLP ─▶ Answer
   ✓         ✓          signed       ░░░ 24 ░░░             recheck       ▇▇ 5          claims→citations   clean
```
- Horizontal on ≥720px, vertical stepper in the drawer.
- Nodes are 10px rings; while pending they show the orbit beam; on completion they fill and a **beam pulse travels the connector** to the next node (240ms).
- **Funnel shape**: the connector between Gate A and Gate B is a tapering bar whose thickness ∝ `candidates_count`, narrowing to `authorized_count` after Gate B; excluded count rendered as a faint ghost remainder labeled `excluded 19`. *All three numbers already ship in `RetrievalSecurityTrace`.*
- **Loading state truthfulness:** the API returns the trace only when the query completes, so while waiting the path shows stage **labels advancing on a calm timer** (never claiming counts) with the active node orbiting; when the response lands, real counts snap in and the funnel "settles". Never display fabricated progress numbers.
- Retrieval depth (LOW/MED/HIGH) sets how many sub-nodes appear (MED adds "lazy chunk + cache", HIGH adds "hybrid + rerank + expand") — matches the existing copy in `ChatView`.

### 6.5 Chat

**Empty state** ("The Antechamber")
- Large `aperture` (56px) whose beam dot slowly circles (14s) — the only motion on screen.
- Headline in Geist 300 at 40px, one even weight, no accent word: **Ask your private knowledge.**
- Sub: one line, Ink-2. Three **context chips** replace the current row of 3-4 mismatched badges: `Compartment · Project Alpha`, `Scope · All files` / `Target · file.pdf`, `Reach · L2`. Chips are buttons that open the same menus as the Composer (no new logic — they call the existing `setSelectedVault` / `setSelectedTargetFile` flows through the same dropdown components).
- **StarterPrompts**: 2×2 grid, each card has a *glyph tile*, title, 2-line description, and a mono scope tag. Hover: the beam dot slides in and the arrow nudges — the card itself doesn't move. Prompts content unchanged.

**User bubble** — right-aligned, Subtle fill, radius 16 with a 4px tail corner (bottom-right). Max 68ch.

**Assistant message** (header: `aperture` 16px + "PrivateRAG" + status word)
- Header status: **Verified · grounded** (Lapis `verify`) / **Extractive** (Ink-2 `sheet`) / **Outside your clearance** (Garnet `gate-closed`).
- Body: `body-lg` 15/1.65 Geist, 68ch measure, headings in Geist 600; bullets use a 4px beam-dot, numbered lists use mono numerals in Ink-3; inline code = Subtle chip, Geist Mono.
- **Streaming feel without streaming:** answer fades in line-by-line (40ms stagger, 180ms each, max 12 lines) — purely a presentational reveal of text that already exists.
- **Citation seals** (`[C1]` chips): 18px rounded-square, mono, Lapis-tinted, **sealed** surface. Hover: the matching card in *Sources used* lifts and the chip's beam dot blinks once. Click: opens Evidence drawer (kept).
- **Claim underlines (new, uses existing `claims[]`)**: sentences that map to `claims[i].citation_ids` get a 1px dotted Lapis underline; hovering a claim highlights its seals and cards; `Tab` moves claim→claim. Falls back to current rendering if `claims` empty.
- **Sources used**: cards become *evidence tiles* — modality tile (image thumb / video keyframe with play glyph / waveform sparkline for audio), title, mono locator, italic 2-line quote, relevance bar. Header right: `verify Exact quotes verified` in Lapis.
- **Gate summary line** → a compact mini-funnel `A 24 ▸ B 5` (tabular mono) + depth rings + "Closed world · sealed". Click → Trace drawer (kept).

### 6.6 The Refusal — "Closed Gate" (the most important emotional moment)

Today: an amber box. Gatelight: a **respectful, explanatory, actionable** card.
- Left: `gate-closed` glyph in a Garnet-tinted tile; headline **Outside your clearance** (Geist 600); body keeps the server-provided `message.content`.
- Center: the **Strata diagram** — your bars lit to your level; the vault's ceiling ghosted above; the *gap* hatched in Saffron. Caption: *This compartment is classified above your clearance.* (Use only values already known: `persona.clearanceLevel`, `selectedVault.classification_ceiling`. If either is unavailable, the diagram is omitted — never guessed.)
- Right: **Request temporary access** (kept, `onRequestAccess`), as a Saffron-outline button with `ring-timer` glyph; secondary `Reason · UNAUTHORIZED_SCOPE` in mono, copyable.
- Entry animation: gate ring draws closed (400ms), card settles. No shake, no red flash — security product, not a game.

### 6.7 Composer — "The Slot"

Raised (`e2`), radius 16, focus = Lapis ring + halo.
- **Loading bar** finally works (A5): a 2px Beam shimmer sweeping at the top edge.
- Engine banner (when a file is targeted): `[sheet glyph] file.pdf  ·  [EngineChip compact]  ·  exclusive RAM`.
- Controls row, left→right, all 28px chips: **Compartment** (`compartment`) · **Scope** (`sheet`/`strata`) · clear-scope `close` · **Purpose** · **Strata chip** (read-only) · **Depth dial**.
- **Depth dial** (replaces the 3 colored text buttons LOW/MED/HIGH): a 3-segment pill with sliding thumb (220ms spring `linear()`), each segment shows 1/2/3 ring glyph; the description line below cross-fades. `title` tooltips keep the existing explanations.
- Send: 32px ink circle with `send` glyph; disabled → Ink-3 ring only; pressing animates beam up-and-out (180ms).
- The footer line `Mode [LOW]: …  Speed: High · Compute: Low` becomes a two-part **meter**: three tiny bars for Speed / Precision / Compute (decorative, derived from the same static copy) so it's glanceable.
- Keyboard: `/` focuses from anywhere; `⌘↵` also sends; `Esc` clears scope chip focus.

### 6.8 Drawers

**Evidence & Provenance Inspector** (Sheet, right, 480px)
- Header: title **Evidence** in Geist 600, modality tile, Strata chip, **seal** stamp animating in (ring draws, notch closes — 500ms) when opened.
- Sections as **collapsible cards** with quiet labels: *Excerpt* (decrypted — a quiet `lock` + "AES-256-GCM" tag), *Proof object* (key/value table with mono values; hash shows first 8…last 6 with copy), *Developer payload* (kept).
- Excerpt highlights the cited quote span (find `citation.quote` inside `evidence.content`; if not found, no highlight — never fabricate).
- Media: image in a matte frame with zoom-on-click (Maximize), video with keyframe poster, audio keeps the native `<audio controls>` element in a styled tile (no decorative waveform — a fake waveform would imply analysis the system didn't do).
- Footer actions: Copy proof JSON (kept), "Open in Chunk Store" (additive: `navigate("chunks")`).

**Security Trace Drawer** — the Gate Path (§6.4) vertical, three cards become steps; PASSED badges become `gate-open`.

### 6.9 Overlays & modals

| Overlay | Gatelight treatment |
|---|---|
| **Command palette** | Centered 640px, `e3`; input 52px with `find` glyph, results grouped (Quick actions · Navigation · People · Recent chats) with quiet group headings, kbd hints right, active row = Raised + beam edge. **Add** "Run verification suite" (`verify`, → `navigate("tests")`) fixing A10. Match highlighting in Ink with the match run underlined 1px. |
| **Auth modal** | Two-pane on ≥720px: left = brand panel (aperture + three principles in Geist 300 at 20px), right = form. Tabs → segmented control with sliding thumb. Persona quick-picks as **Strata-chip cards** (data exists in `DEMO_PERSONAS`). Password field gets show/hide `iris`. |
| **Session warning** | Not a modal wall: a **bottom-center toast-card** (still `role="alertdialog"`) with a 30s ring that drains; Renew is the primary. Backdrop dims only 20%. |
| **LLM / Local Engines** | Engines as **cards with the engine glyph**, state dot, RAM-guard shown as a *single slot* diagram (one lit chamber of N) — the "only one model in memory" rule becomes visible. Setup steps (`step1..3`) as a numbered stepper with copy buttons on commands (mono). |
| **Upload modal** | Drop zone with animated dashed-ring that *tightens* on drag-over; after file pick shows `EngineChip` for the detected model; progress = ring-in-tile; success = seal stamp. |
| **Share / Issue grant / Request access** | Shared "Grant composer" layout: *Who* → *What* (actions as toggle chips with glyphs) → *How long* (**duration scrubber** with presets 10m·1h·1d·custom, live "expires at HH:MM" mono preview) → *Why* (purpose). Summary rail on the right shows the resulting grant as a **time-bar** with signature placeholder `Ed25519 · pending`. |

---

## 7. Page-by-page redesign

Format per page: **Role → What's there today → Gatelight → New interactions → Connections preserved.**

### 7.1 Chat (`currentView === "chat"`)
- **Role:** the primary surface — ask, read, verify.
- **Today:** empty state with shield icon + badges; stream of `MessageItem`; persistent `Composer`; loading = pulsing text.
- **Gatelight:** Antechamber empty state (§6.5), reading-grade messages (15/1.65, 68ch), citation seals, claim underlines, Closed-Gate refusals, Gate Path loading, Composer "Slot" with Depth dial. Scoped-file banner becomes a slim **context bar** pinned under TopBar (`sheet` + file + EngineChip + compartment slug) with a hairline, appearing with a 180ms slide.
- **New:** *jump-to-latest* pill when scrolled up; message hover toolbar (Copy answer, Open trace — both use existing data); keyboard `j/k` between messages; sticky date dividers ("Today") in long threads.
- **Connections kept:** `onRequestAccess` → RequestAccessModal; `[C#]` → Evidence drawer; gate line → Trace drawer; Sidebar history ↔ `selectConversation`.

### 7.2 Sources (`"sources"` and `"vault-detail"` → `SourcesView`)
- **Role:** manage folders and files; start a query scoped to them.
- **Today:** header + Create/Upload buttons, search, accordion of vault cards with toolbars, many dialogs (create, edit, delete, share…).
- **Gatelight:** Title **Sources** in Geist 300 28px with a plain one-line description beneath (no eyebrow). Vault card = **safe-door tile** (compartment glyph in rounded square, 48px) + name + Strata chip + slug (mono) + counts as tabular mono (`12 files · 438 chunks`). Expand = height animates with `grid-template-rows: 0fr → 1fr` (no JS measuring). Document rows: modality tile, title, classification dot, chunks count, status (*Indexed* Verdigris dot / *Quarantined* Saffron), row actions on hover.
- **Primary action hierarchy:** `Ask folder` is the hero (ink pill); `Upload`, `Assign / Share` are ghost; the `more` menu holds the rest — today four same-weight buttons compete.
- **Empty state:** illustration = three stacked strata plates assembling (SVG, 6s loop paused after first run) + "Create your first folder".
- **New:** drag a file anywhere onto the view → upload dialog opens pre-filled (calls the same `setSelectedUploadVault`); filter chips by modality (client-side filter of existing list); multi-select toolbar for *share* (reuses ShareAccessModal per item — only if already supported; otherwise omit).
- **Connections kept:** Ask Folder → `handleAskVault` → chat; Upload → UploadModal; Assign/Share → ShareAccessModal; Vaults ↔ Sources via "Browse Files".

### 7.3 Vaults / Compartments (`"vaults"`)
- **Role:** governance view — compartments, ceilings, stewards, epochs.
- **Today:** 4 metric tiles, search + ceiling filter, grid of compartment cards, dialogs.
- **Gatelight:** Title *Compartments* + quiet `§12–25` ref. The four **metric tiles** become instruments: *Total compartments* (big tabular number, sparkline-less), *Classification ceiling* (the **Strata** graphic at 5 bars, large), *Documents indexed* (count-up on mount, 600ms), *Isolation* (`0 cross-bleed` with a sealed surface — it's a claim, so it earns the seal).
- Ceiling filter `ALL/1/2/3/4` → segmented control where each segment shows its own mini Strata (1–4 bars).
- Compartment card: left edge **classification stripe** (4px; opacity ∝ level, hue stays neutral — never red/green for levels), Epoch badge (`ep 7`, Lapis mono) that **ticks** with a flip animation when `vault_epoch` changes after a refresh, steward chip with avatar tile, origin tag, ingested-doc preview as stacked **doc ghosts** (3 overlapping sheet glyphs; "+N").
- **New:** *Compartment map* toggle — alternate layout arranging cards by ceiling (rows L1→L4 as strata bands). Same data, a more instructive view of the security model.
- **Connections kept:** Browse Files → `setSelectedVault` + `navigate("sources")`; Assign Grants; Request JIT; Edit/Delete (owner/admin gated exactly as today).

### 7.4 Access & Grants (`"access"`; tabs: grants · requests · matrix)
- **Role:** the policy brain — who can do what, until when.
- **Gatelight:** tabs → underline tabs with a **sliding Beam underline** and counts (`Requests 3` in Saffron when pending). Header badge `NIST SP 800-162` → quiet mono `ref`.
- **Grants table (compact density):** columns *Grantee · Compartment/File · Actions · Window · State*. *Window* is the **time-bar** (green→Saffron under 15%, hatched when expired). Actions render as tiny glyph-chips (read / query / download…) with tooltips. Delegable grants show `↳ depth 2` and expand inline to show the **delegation tree** (parent → child lines, monotonic attenuation visible: child chips are a subset of the parent's).
- **Requests tab:** card per request with *Separation of Duties* explained inline on the Approve button when requester === current user (button disabled + tooltip; logic unchanged). Pending cards have a slow Saffron ring on the `ring-timer`.
- **Matrix tab:** the persona table becomes a **heat-matrix**: rows = personas, columns = L0–L4 + compartments; cells use glyph dots (filled = accessible). Current persona's row is outlined with a Beam edge. Hover a cell → explanatory tooltip *Why* (derived from existing `accessibleVaults`/clearance fields).
- **Connections kept:** IssueGrantModal, RequestAccessModal, revoke, approve/deny.

### 7.5 LAN Federation (`"federation"`)
- **Role:** trusted node topology + signed offline bundles.
- **Gatelight:** the node list becomes a **topology canvas** (SVG, 3–8 nodes on a soft ring, *this node* centered, links as hairlines with a traveling beam dot along trusted links; offline nodes dashed + Ink-3). Node card on hover: address in mono, status word, last seen relative time.
- **Export** = *Seal a bundle*: a step flow `Choose compartment → Choose recipient node → Seal` and on success a **wax-seal stamp animation** (ring draws, notch closes, tiny Lapis ripple) + signature fingerprint in mono. **Import** = *Open a bundle*: textarea becomes a drop-target for `.rvault` files, shows header verification results one-by-one (signature · recipient binding · nonce unused · payload hash) as a checklist that resolves in sequence — data comes from the existing response.
- **Connections kept:** export/import handlers and error toasts.

### 7.6 Audit Trail (`"audit"`)
- **Role:** the cryptographic ledger + live telemetry.
- **Gatelight:** Title *Audit*, badge `SOC global view` / `Personal activity log` as a mode chip.
- **Telemetry** (RAM, CPU, disk, Permit/Deny rates): radial → **thin arc gauges** (270° sweep, 3px, tabular center value, Lapis at rest → Saffron >75% → Garnet >90%) with 600ms count/arc ease on updates. The existing Live toggle adds a 1px Beam **scan line** across the panel at each poll — *the heartbeat of the system*.
- **Event stream:** table rows 32px; decision = status vocabulary; `prev_hash → current_hash` shown as **linked blocks**: the first 6 hex chars of each, drawn as two tiny blocks joined by a link; clicking opens the existing Sheet with the full chain neighborhood (previous/next block).
- **Verify hash chain** (kept): a **verification sweep** — a Beam wipe travels top→bottom over visible rows; each row's link glyph turns `seal`-filled as it passes; completes with a *Chain intact · N blocks* seal. On failure the sweep halts at the broken block and highlights it Garnet — graceful *and* legible.
- **Create checkpoint** (admin): Ed25519 checkpoint inserts a distinct **checkpoint rail** marker into the stream.
- **Connections kept:** Live interval (`setInterval`), verify, checkpoint, filters, event Sheet.

### 7.7 Chunk Store (`"chunks"`)
- **Role:** inspect decrypted canonical chunks with provenance.
- **Gatelight:** header `Canonical store` + `AES-256-GCM decrypted` as a mono tag with `lock`. Stats strip: total · encrypted · by-modality as a **stacked 6px bar** with tints from §3.3 (hover segment → count).
- Chunk cards: modality tile, doc title, locator, **integrity glyph** (`seal` filled when `integrity_verified`, outline + Saffron when false), classification dot, hash fingerprint rendered as a **5×5 identicon** from `content_hash` (deterministic, purely visual — a human-recognisable fingerprint that makes "same hash" visible at a glance). Text clamped 3 lines with `Maximize2` to open the detail Dialog (kept).
- **Virtualised list** (windowing) is a *performance* addition; skip if it risks selection/scroll behavior — flagged as optional (§11, Phase 5).
- **Connections kept:** refresh, search, detail dialog, "Ask about this chunk" if present.

### 7.8 Security Tests (`"tests"` — routed, today unreachable)
- **Role:** run the 84-invariant matrix.
- **Gatelight:** the 84 results become an **84-cell matrix** (12×7 grid of 14px cells grouped by category with 6px gaps). `Run` triggers a **cascade**: cells light Verdigris in id order (15ms stagger) as results arrive; any fail = Garnet with `gate-closed`; hover shows `AUTH-004 — title`. The category table below keeps its accordion. Header KPI: `84 / 84` in Geist Light at 40px, with a seal.
- **Reach it:** palette entry + Settings → Offline Diagnostics link (additive).

### 7.9 Settings (`"settings"`)
- **Role:** users, theme, identity, offline diagnostics.
- **Gatelight:** two-column on ≥1024px: left sticky section index (*Users · Identity · Appearance · Session · Diagnostics*) with scroll-spy (Beam tick), right = sections as `e1` cards. Users table with Strata chips, role chips, avatar tiles; dialogs unchanged in function.
- **Appearance:** the Dark/Light/System buttons become **three live preview tiles** (mini-UI thumbnails drawn in SVG using the real tokens) — pick by seeing. Add *Density* (Comfortable/Compact) and *Reduce motion* (System/On/Off) — both purely client preferences stored via the same `storage` helper pattern.
- **Offline Diagnostics:** list of invariants (`egress BLOCKED`, `Local models`, `Encrypted storage`) as a **checklist with live Verdigris ticks** and a "Run verification suite" link.

### 7.10 Global overlays — see §6.9 (palette, auth, session warning, engines, upload, grants).

---

## 8. Motion language

### 8.1 Tokens
```css
:root {
  --dur-instant: 90ms;  --dur-fast: 140ms; --dur-base: 220ms;
  --dur-slow: 360ms;    --dur-seal: 520ms; --dur-ambient: 14000ms;
  --ease-out:    cubic-bezier(.16, 1, .3, 1);      /* arrivals */
  --ease-in:     cubic-bezier(.7, 0, .84, 0);      /* departures */
  --ease-inout:  cubic-bezier(.65, 0, .35, 1);     /* morphs */
  --ease-spring: linear(0, .18 5%, .62 12%, .94 20%, 1.06 28%, 1.07 33%, 1.02 45%, .99 60%, 1);
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important;
                           transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
```
Rule of thumb: **hover ≤140ms · state change 220ms · layout/morph 360ms · seals 520ms · ambient ≥10s and only one ambient animation on screen.**

### 8.2 Catalog

| Name | Trigger | Spec | Purpose |
|---|---|---|---|
| `beam-nudge` | hover on any glyph button | beam translates (.6,-.6)px + scale 1.25, 500ms out | Life without noise |
| `beam-orbit` | busy state | beam rotates around glyph center 1.1s linear ∞ | Universal loading |
| `seal-in` | citation open, grant issued, chain verified | ring `stroke-dashoffset` 100→0 in 520ms, then notch closes (60ms) | Trust moment |
| `gate-close` | refusal appears | ring draws closed 400ms, bar scales in X 200ms | Respectful denial |
| `gate-path` | query pending/complete | node fill + beam pulse along connector 240ms/step | Show causality |
| `ring-sweep` | `renewSession` | arc refills cw 400ms + Beam head | Confirm renewal |
| `reveal` | **only** the assistant answer and drawer contents | opacity + translateY 6→0, 220ms, line stagger 40ms (max 12) | Shows *new content arrived*. Deliberately **not** applied to every card/list — blanket fade-slide entrances are the most generic motion on the web |
| `slide-thumb` | segmented controls, tabs | translateX with `--ease-spring`, 260ms | Continuity |
| `grid-expand` | accordion | `grid-template-rows` 0fr→1fr, 260ms inout | Smooth height, no measuring |
| `epoch-flip` | `vault_epoch` change | digit rolls up 180ms | Show revocation/epoch bumps |
| `count-up` | metric mount | number eases 0→n, 600ms out, tabular | Weight |
| `scan` | audit live poll | 1px Beam line sweeps panel 900ms | Heartbeat |
| `matrix-cascade` | tests run | 15ms stagger per cell, 120ms fill | Satisfying proof |
| `breathe` | Chunk Store "live" dot | opacity .5↔1, 2.4s | Ambient |
| `indeterminate` (fixes A5) | composer loading | 40%-wide bar translateX −100%→250%, 1.5s linear ∞ | Fix existing bug |

### 8.3 Keyframes (drop into `tailwind.config.js` `extend.keyframes` or `index.css`)
```css
@keyframes indeterminate { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } }
@keyframes rise     { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes draw     { to { stroke-dashoffset: 0 } }
@keyframes scan     { from { transform: translateY(-100%) } to { transform: translateY(100%) } }
@keyframes breathe  { 50% { opacity: .45 } }
@keyframes orbit    { to { transform: rotate(360deg) } }
@keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 hsl(var(--sec-warning) / .5) } 100% { box-shadow: 0 0 0 10px transparent } }
/* animate custom properties (conic gauges, mode dial) */
@property --p { syntax: "<number>"; inherits: false; initial-value: 0; }
.gauge { background: conic-gradient(hsl(var(--sec-trust)) calc(var(--p) * 1%), transparent 0); transition: --p 600ms var(--ease-out); }
```

### 8.4 Progressive enhancements (feature-detected, never required)
```css
/* TopBar hairline fades in as the view scrolls — runs off the main thread */
@supports (animation-timeline: scroll()) {
  .topbar-line { animation: line-in linear both; animation-timeline: scroll(nearest); animation-range: 0 48px; }
  @keyframes line-in { from { opacity: 0 } to { opacity: 1 } }
}
```
```ts
// Cross-fade between views using the View Transitions API (same-document). Wrap the existing navigate():
const go = (v: AppView) =>
  (document as any).startViewTransition
    ? (document as any).startViewTransition(() => flushSync(() => navigate(v)))   // flushSync is required with React
    : navigate(v)
```
Support note from the research (§12): same-document view transitions and scroll-driven animations are shipping in Chromium and Safari; Firefox support is partial/in-progress depending on version — hence `@supports` / feature-detection and graceful fallback to instant navigation.

---

## 9. Rare, valuable additions (research-backed, all additive)

Ranked by *value ÷ risk*. Every item reuses existing data or is pure client UI.

| # | Idea | Why it's valuable | Data it needs (already exists) |
|---|---|---|---|
| 1 | **Gate Path funnel** (§6.4) | Turns an invisible security guarantee into the product's signature visual; the strongest demo moment | `security_trace.gate_a/gate_b/grounding` |
| 2 | **Strata chip + clearance-gap** (§6.2/6.6) | Explains *why* a refusal happened and what JIT access would change — turns a dead end into a path | `clearance_level`, `classification_ceiling` |
| 3 | **Claim → citation underlines** | Makes "every claim is grounded" tangible; hovering proves it. Almost no RAG UI does claim-level linking | `claims[].citation_ids` |
| 4 | **Quote-span highlight in Evidence** | Verifiable in one glance — the evidence panel proves the quote is verbatim | `citation.quote`, `evidence.content` |
| 5 | **Hash identicon** for chunks/blocks | Humans can't compare SHA-256; they *can* compare a 5×5 pattern. Instant "same/different" | `content_hash`, `current_hash` |
| 6 | **Hash-chain sweep verification** | Makes tamper-evidence visible; failure state pinpoints the broken block | audit verify response |
| 7 | **Time-bar on grants** | Expiring access is the core of JIT; seeing it drain prevents surprise denials | `valid_from`, `valid_until` |
| 8 | **Epoch ticker** | Shows revocation took effect (vault epoch bump) — rare "proof of revoke" UX | `vault_epoch` |
| 9 | **Single-slot RAM guard diagram** | Visualises "only one model in memory" so the constraint is understood, not just stated | `MultimodalModelStatus.state/active_model` |
| 10 | **Air-gap chip + egress watch** | A persistent, honest "zero-cloud" signal. If `egress_mode` ever ≠ blocked, chip turns Garnet | `SystemMetrics.process.egress_mode` |
| 11 | **Sealed-bundle stamp & stepwise import verification** | Makes federation checks (signature, recipient, nonce) legible | federation import response |
| 12 | **84-cell test matrix** | Dense, beautiful, and honest: each cell is a real test | `SecurityTestResult[]` |
| 13 | **Compartment map layout** | Teaches the security model spatially | `Vault[]` |
| 14 | **Go-to chords + `/`** | Power-user speed: `g c` chat, `g s` sources, `g v` vaults, `g a` access, `g u` audit, `g k` chunks, `g t` tests, `g ,` settings, `/` focus composer, `[` sidebar | none |
| 15 | **Evidence certificate export** | "Print proof" → clean one-page print stylesheet of an answer + citations + proof objects (CSS `@media print`; no new backend) | already in message |
| 16 | **Density toggle** | One toggle makes Audit/Chunks usable for SOC analysts | client pref |
| 17 | **Skeletons shaped like final layouts** | Perceived performance; no layout shift | none |
| 18 | **Quiet sound off, haptics n/a** | Deliberately *no* sounds — a security tool in an office should be silent | — |

**Deliberately not added** (would violate the contract): fake streaming tokens, invented confidence scores, fabricated progress percentages, "trust score" numbers, any telemetry leaving the machine, animated backgrounds, glassmorphism on content surfaces.

---

## 10. Accessibility, performance, offline

**Accessibility**
- Contrast tables in §3.1 are AA for all text pairs; Ink-3 is the floor.
- **Color is never alone** (§3.2/3.4): glyph + word + color.
- Focus: 2px Lapis outline + 2px offset on *every* interactive element, including chips inside `button`s; drawers trap focus (Radix already does); returning focus to the trigger on close.
- Hit targets ≥ 32px (dense tables) / ≥ 40px (primary actions).
- `aria-live="polite"` region for toasts and Gate Path stage text; `role="img"` + label for Strata chip (*"Clearance level 2 of 4"*), session ring (*"4 minutes 12 seconds until inactivity sign-out"*), gauges, matrix cells.
- Keyboard: all new chords documented in the palette (`?` opens a cheat-sheet).
- Motion: `prefers-reduced-motion` handled globally (§8.1) **and** Settings override.
- Light theme verified for every semantic hue (§3.1).

**Performance**
- Glyphs are inline SVG components (≈ 300 B each, tree-shaken) — smaller than the 81-icon lucide import graph in practice.
- All animation uses `transform`/`opacity`/`stroke-dashoffset`/`@property` — compositor-friendly. No blur on scrolling content; `backdrop-blur` only on TopBar and scrims.
- Fonts: 2 variable families, `font-display: swap`, subset to Latin (fontsource default).
- Lists > 200 rows: `content-visibility: auto; contain-intrinsic-size: 72px` on rows (CSS-only windowing).

**Offline** — no network font/icon/CDN anywhere (§4.3). The preview file is the only artefact that may reference web fonts, and it falls back gracefully.

---

## 11. Implementation plan (phased, each phase independently shippable & reversible)

> Phases are ordered so the app is *never* in a half-migrated, broken state. Each ends with the **Zero-Break checklist** (§13).

**Phase 0 — Safety net (½ day)** — Branch; screenshot baseline of every view × {Steel, Chalk} × {collapsed, expanded}; run `scripts/run_all_security_tests.py` (84/84) and `npm run build`. *No UI change.*

**Phase 1 — Tokens & type (1 day)** — Replace `index.css` variable values (§3.1); add `--beam/--sec-trust/--faint`; extend Tailwind (`colors.permit/deny/hold/trust/beam`, spacing half-steps, `screens.xs`, fonts, keyframes incl. `indeterminate`); install fontsource + 4 imports; remove hard-coded `class="dark"` with pre-paint script. *Visible result: calmer palette, correct type, working loader, valid classes.*
```js
// tailwind.config.js (extend)
colors: {
  permit: "hsl(var(--sec-allowed) / <alpha-value>)", deny: "hsl(var(--sec-denied) / <alpha-value>)",
  hold:   "hsl(var(--sec-warning) / <alpha-value>)", trust: "hsl(var(--sec-trust) / <alpha-value>)",
  beam:   "hsl(var(--beam) / <alpha-value>)",       faint: "hsl(var(--faint) / <alpha-value>)",
},
spacing: { "0.2": "0.05rem", "4.5": "1.125rem", "7.5": "1.875rem" },
screens: { xs: "480px" },
fontFamily: { sans: ['"Geist Variable"','ui-sans-serif','system-ui'], mono: ['"Geist Mono Variable"','ui-monospace','monospace'] },
keyframes: { indeterminate: { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(250%)" } }, rise: { from:{opacity:0,transform:"translateY(6px)"}, to:{opacity:1,transform:"none"} } },
animation: { indeterminate: "indeterminate 1.5s linear infinite", rise: "rise .22s var(--ease-out) both" },
```
**Palette codemod table** (find/replace on class strings — semantic, not visual, change):

| Find | Replace |
|---|---|
| `text-emerald-(300\|400)` (status/permit contexts) | `text-permit` |
| `text-emerald-(300\|400)` (decorative icon tint) | `text-muted-foreground` (or remove) |
| `bg-emerald-500/(10\|15\|20)` + `border-emerald-500/(25\|30\|40)` | `bg-permit/10 border-permit/25` (status) |
| `bg-emerald-950/…` `border-emerald-800/…` | `bg-permit/10 border-permit/25` |
| `*-amber-*`, `*-yellow-*` (pending/expiring) | `*-hold` |
| `*-rose-*`, `*-red-*` (deny) | `*-deny` |
| `*-sky-*`, `*-blue-*`, `*-indigo-*`, `*-purple-*` (crypto/depth) | `*-trust` |
| `*-fuchsia-*`, `*-cyan-*`, `*-violet-*` (modality) | modality tokens §3.3 |
| `focus-within:border-emerald-500/50` | `focus-within:border-trust/60` |

**Phase 2 — Primitives (1 day)** — Skin `button.tsx`, `badge.tsx`, `input`, `dialog`, `sheet`, `dropdown`, `tooltip`, `scroll-area`, toaster theme. Props/variants untouched.

**Phase 3 — Glyphs (1–2 days)** — Add `src/glyphs/*` (§5.5); codemod imports; `<EngineChip/>`; replace emoji. Visual diff review view-by-view.

**Phase 4 — Shell & Chat (2–3 days)** — Sidebar, TopBar status strip, Session ring, Antechamber, Message styles, citation seals, Composer + Depth dial, Closed-Gate refusal, Gate Path (loading + drawer).

**Phase 5 — Pages (3–5 days)** — Order of value: Vaults → Sources → Access → Audit → Chunks → Federation → Settings → Tests (+ reachability). Optional: virtualisation, compartment map.

**Phase 6 — Delight & polish (1–2 days)** — Chords, view transitions, scroll-linked hairline, print stylesheet, density/motion settings, empty-state illustrations.

**New files** (all presentational): `src/glyphs/{Glyph.tsx,set.tsx,index.tsx,glyphs.css}` · `src/components/ui/{strata.tsx,engine-chip.tsx,seal.tsx,gate-path.tsx,time-bar.tsx,identicon.tsx,session-ring.tsx}` · `src/styles/{tokens.css,motion.css}`.

**Files touched but not logic-changed:** all `components/**` (className/JSX wrappers), `index.css`, `tailwind.config.js`, `index.html`, `main.tsx` (font imports).

**Files never touched:** `context/AppContext.tsx`, `lib/*`, `types/*`, everything under `backend/`, `scripts/`.

---

## 12. Research notes & sources

**What I looked at and what it taught**

- **Linear / Vercel design systems (public DESIGN.md-style extractions).** A token-level diff of the two shows how little actually changes between "premium dark" and "premium light": the background goes `#08090a` ↔ `#fafafa`, brand colors differ, but the structure — hairline borders, mono labels, restrained surfaces — is identical. Takeaways used here: *shadow-as-border* elevation; very tight negative tracking on display type; mono for labels/identifiers; one accent. Gatelight keeps these *principles* but deliberately **differs** in palette (cool steel + chalk with Verdigris/Garnet/Saffron/Lapis semantics rather than indigo), icon language (own glyphs), and a single light-weight display voice — so it doesn't read as a Linear clone.
  Sources: the Linear↔Vercel token diff (webdesignhot.com/design.md), "Vercel Inspired Design System" write-up (design.hagicode.com), open-design.ai Vercel notes, and the *Linear Design System* neo-dark README (command palette, radar-pulse status badges, 200ms ease-out micro-interactions).
- **OKLCH for tokens.** Perceptually uniform lightness means equal-L semantic colors *look* equally prominent — essential for a system where Permit/Deny must be equally legible. Browser support cited in the tooling notes: Chrome 111+, Safari 15.4+. I author in OKLCH and ship HSL triplets so the current Tailwind pipeline needs no change.
  Sources: Smithery "design-system-modern-oklch" skill; Evil Martians' "OKLCH in CSS" (linked there).
- **Modern CSS motion.** Scroll-driven animations (`animation-timeline: scroll()/view()`), same-document View Transitions, `@property`, and `linear()` easing — compositor-friendly and increasingly available. The reports I found **disagree on Firefox** (some list partial/none for view transitions, others list newer versions), and Safari's scroll-driven support is recent — so every use here is feature-detected with a graceful fallback, and React view transitions need `flushSync`.
  Sources: oakoss "css-animation-patterns" (updated Mar 2026), rshvr "elite-css-animations" (Feb 2026), Chrome I/O 2024 web-UI recap.
- **Design-system distribution for AI agents.** The `DESIGN.md` format itself (tokens + principles in one file an agent can read) is now a common convention; this file follows it, with the addition of machine-usable CSS/TS blocks.

> I did **not** find a published precedent for several items here (clearance "strata" with JIT gap, hash identicon for audit blocks, claim-level underline links in a RAG UI, 84-cell test matrix). Those are original to this document — treat them as design hypotheses to validate with 3–5 users per persona (Alice/Bob/Charlie/Diana/Eve are already ready-made test profiles).

---

## 13. QA — Zero-Break checklist (run after every phase)

**Functional (must be identical before/after)**
- [ ] `python scripts/run_all_security_tests.py` → 84/84 · `npm run build` → no TS errors
- [ ] Login/Register, Logout, persona switch (demo) · session countdown, warning at 30s, renew, expiry
- [ ] Chat: send, refusal → Request access, citation → Evidence drawer, gate line → Trace drawer, LOW/MED/HIGH modes, file-scoped query, history select/rename/pin/delete
- [ ] Sources: create/edit/delete folder, upload (each modality), Ask Folder, Assign/Share
- [ ] Vaults: filter, search, grants, JIT request, owner/admin-only actions
- [ ] Access: grants/requests/matrix tabs, issue, revoke, approve/deny (SoD)
- [ ] Federation: export, import (valid + tampered) · Audit: live, verify, checkpoint, filters · Chunks: search, detail, refresh · Settings: users CRUD, theme · Command palette: every item
- [ ] Collapsed-sidebar rail: tooltips + navigation

**Visual**
- [ ] Steel & Chalk pass for every view; no hard-coded palette class remains (`grep -E "(emerald|amber|rose|sky|indigo|purple|cyan|fuchsia)-[0-9]"` → 0 outside modality tokens)
- [ ] Zero emoji in UI (`grep -P "[\x{1F300}-\x{1FAFF}]"` → 0)
- [ ] All contrast pairs ≥ 4.5:1 (axe / Lighthouse)
- [ ] `prefers-reduced-motion` → no motion remains
- [ ] Keyboard-only walkthrough of Chat → Evidence → Access request

**Offline**
- [ ] DevTools Network (airplane mode) → 0 failed requests · `scripts/verify_offline.py` passes · fonts served from same origin

---

### Appendix A — Do / Don't

| Do | Don't |
|---|---|
| Let color mean *decision* | Tint icons for flavor |
| Show real counts from the trace | Invent progress/confidence numbers |
| One ambient animation per screen | Animate backgrounds |
| Keep spec refs as quiet mono tags | Delete spec refs (judges & auditors use them) |
| Use glyph + word + color | Rely on hue alone |
| Reuse `Strata`, `Seal`, `TimeBar` across pages | Invent a new card per page |
| Feature-detect modern CSS | Assume Chromium |

### Appendix B — Component API sketches (new, presentational only)

```tsx
<Strata level={2} ceiling={3} size="md" />                // chips, headers, refusal diagram
<Seal state="verified|pending|broken" size={16} animate /> // citation, audit block, grant
<TimeBar from={iso} until={iso} warnAt={0.15} />           // grants, leases
<GatePath trace={trace?} pending={bool} depth="LOW|MEDIUM|HIGH" orientation="h|v" />
<EngineChip fileName={name?} compact />                    // replaces 3 duplicated functions
<SessionRing remaining={s} total={300} warning={bool} onRenew={fn} />
<Identicon hash="sha256…" size={20} />                     // deterministic 5×5 from hash bytes
<Glyph name="aperture" size={16} accent="var(--sec-allowed)" busy />
```

*End of DESIGN.md — Gatelight v1.0*
