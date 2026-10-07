# Secure Multi-Modal RAG System with Data-Level Authorization (v3.0)

> **LAN-First • Zero-Cloud • Local-LLM • Two-Gate Retrieval Firewall • Cryptographic Audit Chain**

---

## 1. Executive Summary

This project implements a **Data-Authorization-First Retrieval-Augmented Generation (RAG) system** engineered for zero-trust private Local Area Networks (LAN). 

Unlike standard RAG chatbots where authorization is merely checked at user login or filtered in the client UI, this architecture enforces **Data-Level Authorization**:
1. **The data itself carries authorization policy:** Every PDF page, OCR image region, and database row has an immutable Authorization Manifest, classification level, and ACL selector.
2. **Two-Gate Retrieval Firewall:**
   - **Gate A (Vector Pre-Filter):** The server's Policy Compiler translates active Ed25519-signed grants into mandatory payload filters before any vector candidate lookup occurs. Client-supplied filters are rejected.
   - **Gate B (Post-Retrieval Canonical Gate):** Candidates are authoritatively re-checked against SQL Row-Level Security, latest ACL version, and context deadline before text enters model context.
3. **Architecture v3 Scoped Vaults:** Every piece of data belongs to a named **Vault** (e.g. `Finance-Q3`, `HR-Policies-2026`). A RAG scope works *strictly on that data*.
4. **Time-Bound Grants & Attenuated Delegation:** Permissions are granted with hard deadlines, schedules, and atomic quotas. Delegation only attenuates permissions (child ⊆ parent).
5. **Trusted Time Authority:** Detects clock rollback and clock jump attacks in disconnected offline environments.
6. **Citation-First Contract:** Answers are strictly grounded in authorized evidence. Quotes are verified character-for-character against canonical sources, or the answer is refused (`CLOSED-WORLD REFUSAL`).
7. **Cryptographic Audit Chain:** Every decision is logged with SHA-256 hash chaining `H(n) = SHA256(H(n-1) || canonical_event)`, proving complete tamper evidence.

---

## 2. Quickstart

### Prerequisites
- Python 3.10+
- Modern Web Browser (Edge / Chrome / Firefox)

### Installation & Run

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Seed the database with demo users, vaults, multi-modal files, and signed grants:**
   ```bash
   python scripts/seed_demo_data.py
   ```

3. **Run the 15-test automated security verification suite:**
   ```bash
   python scripts/run_all_security_tests.py
   ```

4. **Start the Secure RAG Gateway:**
   ```bash
   python -m backend.app.main
   ```

5. **Open the Web UI:**
   Navigate to [http://localhost:8000](http://localhost:8000) in your browser.

---

## 3. Demo Persona Walkthrough

Use the **Persona Switcher** in the top navigation bar to test each role against the same corpus:

| Persona | Role & Clearance | Granted Vaults | What Happens on Query |
|---|---|---|---|
| **Alice** | Finance Analyst (L2) | `Finance-Q3`, `Company-Public` | ✅ Retrieves Q3 budget & allocations.<br>❌ Asking for Bob's salary yields **Zero leaks / Refusal**.<br>❌ Cross-vault query to `HR-Policies-2026` is blocked at Scope Gate. |
| **Bob** | HR Specialist (L2) | `HR-Policies-2026`, `Company-Public` | ✅ Retrieves compensation bands and HR benefits.<br>❌ Cannot access Finance Q3 internal vendor margins. |
| **Charlie** | Engineering Analyst (L2) | `Engineering-Core`, `Company-Public` | ✅ Retrieves offline network topology and crypto specs.<br>❌ Cannot access HR or Finance data. |
| **Diana** | Security Admin (L3) | All Vaults | ✅ Can inspect all data compartments, audit logs, and approve JIT access requests. |
| **Eve** | Untrusted Contractor (L0) | `Company-Public` only | ❌ Attempting to query any internal vault is immediately refused. |

---

## 4. Automated Security Test Matrix (15/15 Pass)

Run `python scripts/run_all_security_tests.py` or click **"Run Security Test Suite"** in the UI:

| Test ID | Security Invariant / Attack | Result | Proof Mechanism |
|---|---|:---:|---|
| `T-AUTH-005` | Policy Epoch Invalidation | **PASS** | Session invalidated upon monotonic epoch bump |
| `T-RET-001` | Pre-Retrieval Vector Isolation | **PASS** | Zero unauthorized HR chunks returned to Finance Analyst |
| `T-RET-003` | Client Filter Tamper Rejection | **PASS** | `SecurityContractViolation` on ad-hoc filter |
| `T-RET-006` | Canonical Gate Authoritative Check | **PASS** | Secondary SQL RLS blocks unentitled resource |
| `T-CIT-002` | Fake Citation ID Rejection | **PASS** | `FORBIDDEN_SOURCE` status returned |
| `T-CIT-004` | Fabricated Quote Verification | **PASS** | Exact quote matching detects ungrounded hallucination |
| `T-INJ-001` | Direct Prompt Injection Defense | **PASS** | Prompt injection keyword detected and refused |
| `T-INJ-002` | Indirect Untrusted Data Containment | **PASS** | Document-embedded injection sanitized and neutralized |
| `T-EXF-001` | Cross-Vault Scope Isolation (Rule S2) | **PASS** | `ScopeViolation` when querying ungranted vault |
| `T-V3-TIME-001` | Time-Enforced Grant Expiry | **PASS** | Expired grants rejected at use time |
| `T-V3-TIME-002` | Trusted Time Monotonic Rollback Defense | **PASS** | Clock rollback detected, status set to `CLOCK_ROLLBACK` |
| `T-V3-SOD-001` | Separation of Duties (Four-Eyes Rule) | **PASS** | Requester cannot approve their own JIT request |
| `T-V3-DEL-001` | Delegation Attenuation Rule (D1) | **PASS** | Escalated action rejected by delegation validator |
| `T-V3-CASCADE-001` | Cascade Revocation Consistency | **PASS** | Revoking parent immediately invalidates child grants |
| `T-V3-AUDIT-001` | Cryptographic Hash Chain Integrity | **PASS** | Unbroken SHA-256 hash chain verified |

---

## 5. Repository Structure

```
d:/RAG/
├── backend/
│   ├── app/
│   │   ├── config.py             # System paths, keys & constants
│   │   ├── time_authority.py     # Trusted Time Authority (A7, V9)
│   │   ├── crypto.py             # AES-256-GCM, Ed25519, SHA-256 hash chains
│   │   ├── models.py             # Pydantic schemas (Principal, Vault, Grant, Proof)
│   │   ├── database.py           # Relational SQLite engine with RLS abstractions
│   │   ├── policy_engine.py      # Usable grants, ABAC pipeline, Scope resolution
│   │   ├── policy_compiler.py    # Compiler for Gate A Vector payload filter AST
│   │   ├── vector_store.py       # Vector index with contract tests & cosine ranking
│   │   ├── canonical_gate.py     # Gate B Canonical database check & proof generation
│   │   ├── ingestion.py          # Multi-modal PDF, OCR image & DB row ingestion
│   │   ├── local_llm.py          # Local generation adapter with closed-world refusal
│   │   ├── citation_validator.py # Exact quote verification & claim grounding
│   │   ├── audit.py              # Hash-chained append-only event store
│   │   ├── access_service.py     # JIT access requests, approvals & delegation
│   │   ├── federation.py         # Tier 2 Query-in-Place & Tier 3 .rvault bundles
│   │   ├── api.py                # FastAPI REST router
│   │   └── main.py               # Application entrypoint
│   └── tests/
│       └── test_security_matrix.py # 15 Automated Security Invariant Tests
├── frontend/
│   ├── index.html                # Single Page App interface
│   ├── index.css                 # Dark-mode glassmorphic design system
│   └── app.js                    # Dynamic UI logic & trace inspector
├── scripts/
│   ├── seed_demo_data.py         # Multi-modal dataset & grant seeder
│   └── run_all_security_tests.py # CLI security test runner
├── docker-compose.yml            # Network-segmented container architecture
├── Dockerfile                    # Container definition
├── requirements.txt              # Python requirements
└── README.md                     # Complete project documentation
```

---

## 6. Security Invariant Statement

> **"The LLM does not decide what the user is allowed to know. The deterministic Retrieval Firewall and Canonical Gate decide what evidence the LLM is allowed to see."**
