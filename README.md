# DARS-RAG: Data-Authorization & Retrieval Security RAG (v4.0)

> **Offline-Native • Zero-Cloud • Data-Centric Authorization • Two-Gate Retrieval Firewall • AES-256-GCM Storage • 84/84 Pass Security Suite**

---

## 1. Executive Summary & Core Invariant

**DARS-RAG** is an offline, LAN-native, multi-modal Retrieval-Augmented Generation (RAG) platform where **authorization travels with the data**. 

Unlike conventional RAG applications where permissions are checked only at login or simulated via system prompts, DARS-RAG enforces the absolute security invariant:

$$\text{LLM\_CONTEXT}(u, q, t, p, d) \subseteq \text{AUTHORIZED\_EVIDENCE}(u, q, t, p, d)$$

> **Absolute Rule:** Unauthorized information never enters LLM context, vector payloads, citations, downloads, or logs. The LLM is not an authorization mechanism; data is authorized deterministically before retrieval and rechecked before delivery.

---

## 2. Architecture & The Two-Gate Retrieval Firewall

```text
AUTHENTICATED USER (Argon2id + JWT + Auth Epoch)
        ↓
ROLE + CLEARANCE + CURRENT USABLE GRANTS
        ↓
DATASET / RAG WORKSPACE SCOPE (Private by Default)
        ↓
TIME + PURPOSE + SCHEDULE + OPERATION VALIDATION
        ↓
[GATE A] SERVER-COMPILED RETRIEVAL FILTER (Ed25519 Signed)
        ↓
PERSISTENT QDRANT VECTOR CANDIDATES (Deterministic UUID5, No Plaintext)
        ↓
[GATE B] CANONICAL AUTHORIZATION RECHECK
  ├── Fresh Database Manifest & Policy Revalidation
  ├── AES-256-GCM Canonical Decryption via Vault KEK
  └── SHA-256 Content Hash Verification
        ↓
AUTHORIZED EVIDENCE ENVELOPE (With Expiration & Proof Object)
        ↓
LOCAL LLM REASONING (<UNTRUSTED_EVIDENCE_DATA> Delimiters)
        ↓
STRICT CLAIM & CITATION GROUNDING VALIDATION
        ↓
OUTPUT FIREWALL / DLP SCANNER
        ↓
CLIENT DELIVERY (CSP-Protected, Safe DOM)
```

---

## 3. Key Hardened Security Capabilities

| Security Area | Implementation & Invariant | Status |
|---|---|:---:|
| **Authentication** | Argon2id password hashing + JWT with `auth_epoch` revocation. Zero fallback; unauthenticated requests return HTTP 401. | **VERIFIED** |
| **Persona Switching** | Removed from production routes. Bound to `DEMO_MODE=true` on localhost. | **VERIFIED** |
| **Workspace Scope** | Workspaces default to `PRIVATE`. Explicit sharing grants required to expand scope. | **VERIFIED** |
| **Gate A (Vector Pre-Filter)** | Server compiles and cryptographically signs AST with Ed25519; arbitrary client filters are rejected. | **VERIFIED** |
| **Vector Storage** | Persistent disk Qdrant storage (`data/qdrant_storage`). Payload contains only metadata; zero plaintext source text. | **VERIFIED** |
| **Gate B (Canonical Store)** | Decrypts canonical chunks from AES-256-GCM storage with vault KEK; verifies content hash and SQL policy. | **VERIFIED** |
| **Structured Data & RLS** | Row-Level Security (RLS) and field projection: unauthorized columns (`salary`, `bank_account`) are completely omitted from results without schema leakage. | **VERIFIED** |
| **Grants & Delegation** | Monotonic attenuation (child $\subseteq$ parent actions, time, selectors). Recursive cascade revocation bumps vault epoch immediately. | **VERIFIED** |
| **JIT Access Requests** | Separation of Duties (requester cannot self-approve). Requires authorized dataset stewards/owners; supports N-of-M multi-approvals. | **VERIFIED** |
| **Citation Grounding** | Validates exact canonical quotes. Zero-exception policy (no short-quote bypass). Fabricated citations cause immediate refusal. | **VERIFIED** |
| **Prompt Injection & DLP** | Isolated `<UNTRUSTED_EVIDENCE_DATA>` blocks. Output DLP blocks private keys and passwords before response delivery. | **VERIFIED** |
| **Audit & Integrity** | Append-only audit log file + SHA-256 hash chaining + Ed25519 signed checkpoints. | **VERIFIED** |
| **Offline & Zero-Cloud** | `ALLOW_EXTERNAL_EGRESS=False`. Local FastEmbed neural embeddings, local Ollama LLM, local disk storage. | **VERIFIED** |

---

## 4. Quickstart Guide

### Prerequisites
- Python 3.10+
- Modern Web Browser (Chrome / Edge / Firefox)
- Optional: Local Ollama running `qwen2.5:3b` (system falls back to `SAFE_EXTRACTIVE_MODE` if LLM is offline)

### Step 1: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 2: Seed the Demo Database & Encrypted Storage
```bash
python scripts/seed_demo_data.py --reset-demo
```
*Seeds users, mixed-security dataset (`Project Alpha`), structured employee records with RLS, and generates AES-256-GCM encrypted canonical files.*

**Demo Credentials:**
- `alice` / `alice123` (Data Owner & Finance Lead, L2)
- `bob` / `bob123` (HR Specialist, L2)
- `charlie` / `charlie123` (Engineer, L1)
- `diana` / `diana123` (Security Admin, L3)
- `eve` / `eve123` (Guest / Untrusted Viewer, L0)

### Step 3: Run the Automated Security Verification Matrix (84 Tests)
Run either via `pytest` or the standalone security CLI runner:
```bash
python -m pytest backend/tests/test_security_matrix.py
# OR
python scripts/run_all_security_tests.py
```
**Expected Result:** `84 passed / 0 failed (100% PASS)`.

### Step 4: Verify Zero-Cloud Offline Invariants
```bash
python scripts/verify_offline.py
```
**Expected Result:** `100% OFFLINE / LAN-NATIVE INVARIANTS SATISFIED (ZERO CLOUD)`.

### Step 5: Start the API Gateway & Frontend
```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```
Open your browser to: **[http://localhost:8000](http://localhost:8000)**

---

## 5. Security Test Suite Breakdown (84/84 PASS)

| Test Category | ID Range | Count | Invariants Verified |
|---|---|:---:|---|
| **Authentication** | `AUTH-001..010` | 10 | Argon2id verification, 401 fail-closed, expired tokens, auth epoch revocation, signature tampering. |
| **Dataset Scope** | `SCOPE-001..007` | 7 | Private-by-default, cross-tenant isolation, client override rejection, hidden vaults. |
| **Retrieval Firewall** | `RET-001..012` | 12 | Pre-retrieval vector isolation, Gate B canonical recheck, policy epoch mismatch, payload minimization. |
| **Structured Data & RLS** | `DB-001..008` | 8 | Row-level clearance, field projection (redacting salary/bank account), role denial overrides, record provenance. |
| **Grants & Delegation** | `GRANT-001..014` | 14 | Attenuation (actions, time, selectors), cascade revocation, SoD self-approval block, canonical signature check. |
| **Citations & Grounding** | `CIT-001..010` | 10 | Exact canonical quote matching, zero short-quote loopholes, citation-to-envelope binding, fabricated claim block. |
| **Prompt Injection & DLP** | `INJ-001..008` | 8 | Direct injection refusal, indirect evidence containment, credential secret scanning (AWS AKIA, private keys, passwords). |
| **Storage Security** | `STORE-001..006` | 6 | AES-256-GCM chunk file encryption, quarantine file upload validation, cascading deletion, deterministic UUID5 IDs. |
| **Federation & LAN** | `LAN-001..006` | 6 | Encrypted signed bundle export, tampered payload rejection, replay protection nonce store, recipient binding. |
| **Audit Integrity** | `AUDIT-001..003` | 3 | Immutable SHA-256 hash chain verification, tamper detection, signed Ed25519 audit checkpoints. |
| **TOTAL** | — | **84** | **84 PASSED / 0 FAILED** |

---

## 6. Live Hackathon Demonstration Scenarios

### Scenario A: Mixed-Security Document Isolation
1. Login as **Alice** (`alice123`). Query: *"What is the approved budget for Q3?"*
   - Allowed: Alice has finance clearance; answer with verified citations `[C1]` is returned.
2. Login as **Charlie** (`charlie123` - Engineer). Query: *"What is the approved budget for Q3?"*
   - Refused: Charlie has only Engineering access. Gate A excludes Finance chunks before vector search.
3. Query: *"What is the lead engineer salary?"*
   - Refused: Salary is RESTRICTED (Level 3) with explicit role denial for engineers.

### Scenario B: Temporary Access & Expiry
1. Alice issues a 10-minute temporary grant to Charlie for `Finance-Q3`.
2. Charlie queries the budget: **ALLOWED**.
3. Advance simulated time or wait for expiry: Charlie queries again: **DENIED (FAIL-CLOSED)**.

### Scenario C: Delegation Attenuation & Cascade Revocation
1. Alice delegates a grant to Bob with `DELEGABLE=true`.
2. Bob delegates to Charlie with reduced permissions.
3. Alice revokes Bob's grant: Charlie's descendant grant is **immediately and recursively invalidated**; vault epoch is incremented.

---

## 7. Known Limitations & Threat Model Boundaries

1. **Hardware Security Modules (HSM):** This implementation uses local filesystem-protected master keys (`data/.master_kek.hex`, `data/.jwt_secret`) derived via RFC 5869 HKDF. It does not replace a dedicated FIPS 140-2 hardware HSM.
2. **Grounding Verification:** Grounding is deterministic provenance verification (exact quote matching, character span verification, and closed-world refusal). It verifies provenance and evidence support, not mathematical truth of external real-world assertions.
3. **Local LLM Performance:** When running on low-resource machines (< 4 GB VRAM), local generation latency depends on Ollama quantization. In the absence of an active Ollama instance, the gateway transparently operates in `SAFE_EXTRACTIVE_MODE`.
