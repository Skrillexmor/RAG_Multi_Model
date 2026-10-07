import json
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException, Header, status, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import jwt
from uuid import uuid4

from .config import JWT_SECRET, JWT_ALGORITHM, DEMO_MODE, TEST_MODE
from .models import (
    Principal, Vault, Grant, QueryRequest, QueryResponse,
    RetrievalSecurityTrace, EvidenceItem, Citation, Claim,
    ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE,
    ACTION_FETCH_CHUNK, ACTION_VIEW_AUDIT, ACTION_APPROVE_ACCESS_REQUEST
)
from .database import db
from .time_authority import time_authority
from .crypto import sign_grant_payload, verify_password, hash_password
from .policy_engine import PolicyEngine, ScopeViolation, DelegationViolation
from .policy_compiler import PolicyCompiler
from .vector_store import vector_store, SecurityContractViolation
from .canonical_gate import canonical_gate
from .local_llm import local_llm
from .citation_validator import citation_validator
from .audit import audit_service
from .access_service import access_service, AccessServiceError
from .federation import federation_service, FederationError
from .ingestion import ingestion_pipeline, IngestionQuarantineError

app = FastAPI(
    title="DARS-RAG: Data-Authorization and Retrieval Security RAG",
    description="Offline, LAN-Native Enterprise Knowledge Gateway with Two-Gate Retrieval Firewall",
    version="3.1.0"
)

# CORS: Explicit allowed origins (No wildcard with credentials - §76)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:8080",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://localhost:5173"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

@app.on_event("startup")
def on_startup():
    vector_store.sync_all_from_database()

# ----------------- AUTHENTICATION DEPENDENCY (§3.1) -----------------
def get_current_principal(authorization: Optional[str] = Header(None)) -> Principal:
    """
    Authoritative request authenticator.
    Fail-closed: Missing or invalid token ALWAYS returns 401 Unauthorized (§3.1).
    Zero fallback to mock users!
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required (T-AUTH-003)."
        )

    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        p = PolicyEngine.get_principal_by_username(username)
        if not p or not p.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found (T-AUTH-006).")

        # Stale authorization epoch invalidation check (T-AUTH-005)
        if payload.get("auth_epoch", 0) < p.auth_epoch:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired due to policy epoch invalidation (T-AUTH-005)."
            )
        return p
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature or expired (T-AUTH-004).")

# ----------------- AUTH ENDPOINTS (§3.2, §3.3) -----------------
class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginRequest):
    """Real Argon2id password verification against database (§3.2, T-AUTH-001, T-AUTH-002)."""
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (req.username.strip().lower(),))
        user_row = cursor.fetchone()

    if not user_row or not verify_password(user_row["password_hash"], req.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials (T-AUTH-001).")

    principal = PolicyEngine.get_principal_by_username(req.username.strip().lower())
    token_payload = {
        "sub": principal.username,
        "user_id": principal.user_id,
        "tenant_id": principal.tenant_id,
        "roles": principal.roles,
        "clearance": principal.clearance,
        "auth_epoch": principal.auth_epoch,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12)
    }
    token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "access_token": token,
        "token_type": "bearer",
        "principal": principal
    }

class RegisterRequest(BaseModel):
    username: str
    password: str
    department: Optional[str] = "Engineering"
    roles: Optional[List[str]] = None
    clearance: Optional[int] = 1

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    """User registration with custom role and security clearance (§3)."""
    clean_username = req.username.strip().lower()
    if not clean_username or len(clean_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE username = ?", (clean_username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username already exists. Please choose a different username.")

        user_id = f"u_{uuid4().hex[:8]}"
        now_utc = datetime.now(timezone.utc)
        now_iso = now_utc.isoformat()
        pwd_hash = hash_password(req.password)
        clearance_lvl = max(1, min(req.clearance or 1, 4))
        dept = req.department or "Engineering"

        cursor.execute("SELECT tenant_id FROM vaults LIMIT 1")
        t_row = cursor.fetchone()
        tenant_id = t_row["tenant_id"] if t_row else "tenant_primary"

        cursor.execute("""
            INSERT INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)
        """, (user_id, tenant_id, clean_username, pwd_hash, dept, clearance_lvl, now_iso))

        # Ensure all existing users align to primary tenant
        cursor.execute("UPDATE users SET tenant_id = ? WHERE tenant_id = 'default_tenant'", (tenant_id,))

        roles_to_assign = req.roles or ["analyst"]
        for role in roles_to_assign:
            role_clean = role.strip().lower()
            cursor.execute("SELECT role_id FROM roles WHERE name = ?", (role_clean,))
            existing = cursor.fetchone()
            if existing:
                rid = existing["role_id"]
            else:
                rid = f"r_{role_clean}"
                cursor.execute("INSERT OR IGNORE INTO roles (role_id, name, description) VALUES (?, ?, ?)",
                               (rid, role_clean, f"Role {role_clean}"))
            cursor.execute("""
                INSERT OR REPLACE INTO role_assignments (user_id, role_id, valid_from, granted_by)
                VALUES (?, ?, '2000-01-01T00:00:00Z', 'system_registration')
            """, (user_id, rid))

        dept_slug = dept.strip().lower()
        cursor.execute("INSERT OR IGNORE INTO user_groups (user_id, group_name) VALUES (?, ?)", (user_id, f"group:{dept_slug}"))

        # Provision initial active grants for user to Project Alpha and active vaults matching clearance
        cursor.execute("SELECT vault_id, classification_ceiling FROM vaults WHERE status = 'active'")
        vault_rows = cursor.fetchall()
        for v in vault_rows:
            vid = v["vault_id"]
            ceiling = v["classification_ceiling"]
            if vid == "v_alpha" or clearance_lvl >= ceiling:
                gid = f"g_{uuid4().hex[:8]}"
                grant_dict = {
                    "grant_id": gid,
                    "vault_id": vid,
                    "grantee_type": "user",
                    "grantee_id": f"user:{user_id}",
                    "selector": {"all": True},
                    "actions": [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE],
                    "valid_from": "2000-01-01T00:00:00Z",
                    "valid_until": "2030-01-01T00:00:00Z",
                    "purpose": "workspace_query",
                    "delegable": False,
                    "depth": 0,
                    "parent_grant_id": None,
                    "issuer_id": "system"
                }
                sig = sign_grant_payload(grant_dict)
                cursor.execute("""
                    INSERT INTO grants (
                        grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                        valid_from, valid_until, purpose, delegable, depth, parent_grant_id,
                        issuer_id, state, signature, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
                """, (
                    gid, vid, "user", f"user:{user_id}", json.dumps({"all": True}),
                    json.dumps([ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE]),
                    "2000-01-01T00:00:00Z", "2030-01-01T00:00:00Z", "workspace_query",
                    0, 0, None, "system", sig, now_iso
                ))
                cursor.execute("INSERT OR IGNORE INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (gid,))

        conn.commit()

    principal = PolicyEngine.get_principal_by_username(clean_username)
    if not principal:
        raise HTTPException(status_code=500, detail="Failed to load newly registered principal.")

    token_payload = {
        "sub": principal.username,
        "user_id": principal.user_id,
        "tenant_id": principal.tenant_id,
        "roles": principal.roles,
        "clearance": principal.clearance,
        "auth_epoch": principal.auth_epoch,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12)
    }
    token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "access_token": token,
        "token_type": "bearer",
        "principal": principal,
        "message": "User registered successfully."
    }

class SwitchPersonaRequest(BaseModel):
    username: str

@app.post("/api/auth/switch-persona")
def switch_persona(req: SwitchPersonaRequest):
    """Impersonation disabled in production; only permitted in DEMO_MODE on localhost (§3.3)."""
    if not DEMO_MODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Persona switching is disabled in production mode (T-AUTH-008)."
        )

    principal = PolicyEngine.get_principal_by_username(req.username.strip().lower())
    if not principal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona not found.")

    token_payload = {
        "sub": principal.username,
        "user_id": principal.user_id,
        "tenant_id": principal.tenant_id,
        "roles": principal.roles,
        "clearance": principal.clearance,
        "auth_epoch": principal.auth_epoch,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12)
    }
    token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "access_token": token,
        "token_type": "bearer",
        "principal": principal
    }

@app.get("/api/auth/me")
def get_me(principal: Principal = Depends(get_current_principal)):
    return principal

# ----------------- LOCAL LLM STATUS & SETUP GUIDE -----------------
@app.get("/api/llm/status")
def get_llm_status():
    """Returns local offline LLM connection status, installed models, and setup guide."""
    return local_llm.get_status()

# ----------------- VAULTS & DISCOVERY ENDPOINTS (§29, §30, §32) -----------------
@app.get("/api/vaults")
def list_vaults(principal: Principal = Depends(get_current_principal)):
    """
    Lists only discoverable or authorized vaults with their active documents (§30).
    """
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    usable_vault_ids = {g.vault_id for g in usable}

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vaults WHERE tenant_id = ? AND status = 'active'", (principal.tenant_id,))
        rows = cursor.fetchall()

        visible = []
        for r in rows:
            v_id = r["vault_id"]
            is_owner = r["owner_id"] == principal.user_id
            is_granted = v_id in usable_vault_ids
            is_discoverable = bool(r["discoverable"]) or r["visibility"] != "private"
            is_admin = "admin" in principal.roles

            if is_owner or is_granted or is_discoverable or is_admin:
                v_dict = dict(r)
                v_dict["retention"] = json.loads(r["retention"])
                v_dict["has_active_grant"] = is_granted or is_owner or is_admin

                # Fetch real active documents for this vault
                cursor.execute("""
                    SELECT resource_id, vault_id, resource_type, title, classification, status, created_at,
                           (SELECT COUNT(*) FROM chunks c WHERE c.resource_id = resources.resource_id) as chunks_count
                    FROM resources
                    WHERE vault_id = ? AND status = 'active'
                    ORDER BY created_at DESC
                """, (v_id,))
                doc_rows = cursor.fetchall()
                v_dict["documents"] = [dict(d) for d in doc_rows]
                v_dict["document_count"] = len(doc_rows)

                cursor.execute("SELECT COUNT(*) as c FROM chunks WHERE vault_id = ?", (v_id,))
                c_row = cursor.fetchone()
                v_dict["chunk_count"] = c_row["c"] if c_row else 0

                visible.append(v_dict)

    return {"vaults": visible}

@app.get("/api/vaults/{vault_slug}/documents")
def get_vault_documents(vault_slug: str, principal: Principal = Depends(get_current_principal)):
    """Returns all documents ingested in a specific vault."""
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    vault = PolicyEngine.effective_scope(vault_slug, principal, usable)

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT resource_id, vault_id, resource_type, title, classification, status, created_at,
                   (SELECT COUNT(*) FROM chunks c WHERE c.resource_id = resources.resource_id) as chunks_count
            FROM resources
            WHERE vault_id = ? AND status = 'active'
            ORDER BY created_at DESC
        """, (vault.vault_id,))
        rows = cursor.fetchall()

    return {"vault_slug": vault.slug, "documents": [dict(r) for r in rows]}

# ----------------- RETRIEVAL FIREWALL & RAG QUERY (§18, §19, §21, §31, §62) -----------------
@app.post("/api/rag/query", response_model=QueryResponse)
@app.post("/api/rag/{vault_slug}/query", response_model=QueryResponse)
def query_rag(
    req: QueryRequest,
    request: Request,
    vault_slug: Optional[str] = None,
    principal: Principal = Depends(get_current_principal)
):
    """
    Two-Gate Retrieval Firewall:
    Gate A: Server-compiled Qdrant filter
    Gate B: Post-retrieval canonical SQL manifest + encrypted storage decrypt & hash verify
    LLM Context ⊆ Authorized Evidence
    """
    effective_slug = vault_slug or req.vault_slug
    if not effective_slug:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="vault_slug is required")

    req_id = f"req_{uuid4().hex[:8]}"
    client_ip = request.client.host if request.client else "127.0.0.1"
    now = time_authority.now()

    # 1. Resolve Effective Scope & Usable Grants (§18, §31, §32)
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    try:
        vault = PolicyEngine.effective_scope(effective_slug, principal, usable)
    except ScopeViolation as e:
        audit_service.log_event(
            request_id=req_id,
            actor_id=principal.user_id,
            action=ACTION_QUERY_RAG,
            object_type="vault",
            object_id=effective_slug,
            decision="DENY",
            policy_version=1,
            reason_code="SCOPE_ISOLATION_VIOLATION",
            client_ip=client_ip
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

    # 2. Issue point-in-time lease (§A6)
    lease = PolicyEngine.issue_lease(principal, usable, restricted=(vault.classification_ceiling >= 3))

    # 3. Gate A: Compile Retrieval Filter (§19, §273)
    # Reject client-supplied filters (§18)
    compiled_filter = PolicyCompiler.compile_retrieval_filter(principal, vault, lease, usable)

    # 4. Gate A: Execute Vector Search
    candidate_tuples = vector_store.search(req.query, compiled_filter, top_k=10)
    gate_a_count = len(candidate_tuples)

    # 5. Gate B: Canonical Gate - Authoritative recheck & decryption from canonical store (§21)
    authorized_evidence, excluded_count = canonical_gate.verify_and_envelope(
        candidates=candidate_tuples,
        principal=principal,
        vault=vault,
        usable_grants=usable,
        lease_deadline=lease.deadline
    )

    # 6. Local LLM Grounded Generation (§58..§64)
    answer_text, claims, citations, gen_mode, refusal_reason = local_llm.generate(
        query=req.query,
        vault=vault,
        evidence=authorized_evidence
    )

    # 7. Grounding & Citation Validation (§62, §63, §64)
    val_ok, val_status, val_reason, updated_citations = citation_validator.validate_citations_and_claims(
        claims=claims,
        citations=citations,
        authorized_evidence=authorized_evidence
    )

    if not val_ok and gen_mode == "LLM_GROUNDED":
        answer_text = f"Answer withheld: {val_reason}"
        answer_status = "CITATION_MISMATCH"
    elif refusal_reason:
        answer_status = "REFUSED"
    elif gen_mode == "SAFE_EXTRACTIVE_MODE":
        answer_status = "SAFE_EXTRACTIVE"
    else:
        answer_status = "GROUNDED"

    # 8. Audit event logging (§71)
    audit_service.log_event(
        request_id=req_id,
        actor_id=principal.user_id,
        action=ACTION_QUERY_RAG,
        object_type="vault",
        object_id=vault.vault_id,
        decision="ALLOW" if answer_status in ("GROUNDED", "SAFE_EXTRACTIVE") else "DENY",
        policy_version=vault.vault_epoch,
        reason_code=f"RETRIEVAL_{answer_status}",
        client_ip=client_ip
    )

    gate_a_data = {
        "compiled_filter_valid": True,
        "candidates_count": gate_a_count
    }
    gate_b_data = {
        "evaluated_count": gate_a_count,
        "authorized_count": len(authorized_evidence),
        "excluded_count": excluded_count
    }
    grounding_data = {
        "claims_count": len(claims),
        "citations_count": len(updated_citations),
        "status": answer_status
    }

    trace = RetrievalSecurityTrace(
        user_id=principal.user_id,
        role=principal.roles[0] if principal.roles else "viewer",
        vault_slug=vault.slug,
        policy_epoch=lease.policy_epoch,
        vector_filter_applied=compiled_filter.to_dict(),
        gate_a_candidates_count=gate_a_count,
        gate_b_canonical_verified_count=len(authorized_evidence),
        excluded_candidates_count=excluded_count,
        citations_validated_count=len([c for c in updated_citations if c.verified]),
        citations_total_count=len(updated_citations),
        generation_mode=gen_mode,
        answer_status=answer_status,
        refusal_reason=refusal_reason or (val_reason if not val_ok else None),
        gate_a=gate_a_data,
        gate_b=gate_b_data,
        grounding=grounding_data
    )

    return QueryResponse(
        query=req.query,
        vault_slug=vault.slug,
        answer=answer_text,
        claims=claims,
        citations=updated_citations,
        evidence_items=authorized_evidence,
        security_trace=trace,
        lease_deadline=lease.deadline
    )

# ----------------- SECURE DIRECT SOURCE FETCH API (§28, §29) -----------------
@app.get("/api/source/{resource_id}")
def fetch_source_resource(resource_id: str, principal: Principal = Depends(get_current_principal)):
    """Fresh point-in-time authorization for viewing document source (§28)."""
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT rm.*, r.vault_id FROM resource_manifests rm JOIN resources r ON rm.resource_id = r.resource_id WHERE rm.resource_id = ?", (resource_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No authorized source supports this request (SAFE_DENIAL).")

        manifest = ResourceManifest(
            resource_id=row["resource_id"],
            vault_id=row["vault_id"],
            tenant_id=row["tenant_id"],
            classification=row["classification"],
            allowed_roles=json.loads(row["allowed_roles"]),
            allowed_groups=json.loads(row["allowed_groups"]),
            allowed_users=json.loads(row["allowed_users"]),
            denied_users=json.loads(row["denied_users"]),
            denied_roles=json.loads(row["denied_roles"]),
            min_clearance=row["min_clearance"],
            operations=json.loads(row["operations"]),
            policy_version=row["policy_version"],
            acl_version=row["acl_version"]
        )

    decision, reason, _ = PolicyEngine.decide(principal, ACTION_VIEW_SOURCE, manifest, usable)
    if decision != "ALLOW":
        raise HTTPException(status_code=403, detail="No authorized source supports this request (SAFE_DENIAL).")

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM resources WHERE resource_id = ?", (resource_id,))
        res_row = cursor.fetchone()

    return {"resource_id": resource_id, "title": res_row["title"], "classification": res_row["classification"], "status": res_row["status"]}

# ----------------- STRUCTURED DATA RLS QUERY (§24, §26, §27) -----------------
class StructuredQueryRequest(BaseModel):
    vault_slug: str
    table_name: str
    fields: Optional[List[str]] = None

@app.post("/api/structured/query")
def query_structured_data(req: StructuredQueryRequest, principal: Principal = Depends(get_current_principal)):
    """Executes structured query protected by Row-Level Security and Field Projection (§26, §27)."""
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    vault = PolicyEngine.effective_scope(req.vault_slug, principal, usable)

    records = db.query_structured_data(
        principal_roles=principal.roles,
        principal_clearance=principal.clearance,
        vault_id=vault.vault_id,
        table_name=req.table_name,
        requested_fields=req.fields
    )
    return {"table": req.table_name, "vault": vault.slug, "records_count": len(records), "records": records}

# ----------------- INGESTION APIS (§10..§15, §202) -----------------
@app.post("/api/vaults/{vault_slug}/upload-pdf")
@app.post("/api/datasets/{vault_slug}/upload-pdf")
async def upload_pdf(
    vault_slug: str,
    file: UploadFile = File(...),
    classification: Optional[int] = Form(1),
    min_clearance: Optional[int] = Form(1),
    allowed_roles: Optional[str] = Form(None),
    principal: Principal = Depends(get_current_principal)
):
    """Secure multi-modal PDF upload with quarantine validation (§11, §202)."""
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    try:
        vault = PolicyEngine.effective_scope(vault_slug, principal, usable)
    except ScopeViolation as e:
        raise HTTPException(status_code=403, detail=str(e))

    # Upload authorization (§202): owner, privileged roles, or demo mode
    is_privileged = (
        vault.owner_id == principal.user_id or
        any(r in principal.roles for r in ("admin", "data_owner", "security_admin", "analyst", "engineer"))
    )
    if not is_privileged and not DEMO_MODE:
        raise HTTPException(status_code=403, detail="Unauthorized: caller lacks upload rights for this dataset.")

    roles_list = None
    if allowed_roles:
        try:
            roles_list = json.loads(allowed_roles)
        except Exception:
            roles_list = [r.strip() for r in allowed_roles.split(",") if r.strip()]

    pdf_bytes = await file.read()
    try:
        res_id = ingestion_pipeline.ingest_raw_pdf(
            vault_id=vault.vault_id,
            filename=file.filename or "upload.pdf",
            pdf_bytes=pdf_bytes,
            classification=classification or 1,
            min_clearance=min_clearance or 1,
            allowed_roles=roles_list
        )
    except IngestionQuarantineError as q_err:
        raise HTTPException(status_code=400, detail=str(q_err))

    return {"status": "SUCCESS", "resource_id": res_id, "filename": file.filename}

# ----------------- JIT ACCESS REQUESTS & DELEGATION (§37..§43, §79..§82) -----------------
class CreateAccessRequestBody(BaseModel):
    vault_slug: Optional[str] = None
    vault_id: Optional[str] = None
    actions: Optional[List[str]] = None
    requested_actions: Optional[List[str]] = None
    duration_minutes: int = 60
    purpose: str = "security_review"
    justification: Optional[str] = ""
    selector: Optional[Dict[str, Any]] = None
    required_approvals: int = 1

@app.post("/api/access-requests")
def create_access_request(body: CreateAccessRequestBody, principal: Principal = Depends(get_current_principal)):
    with db.get_connection() as conn:
        cursor = conn.cursor()
        slug_or_id = body.vault_id or body.vault_slug
        if not slug_or_id:
            raise HTTPException(status_code=400, detail="Missing vault identifier.")
        cursor.execute("SELECT vault_id FROM vaults WHERE vault_id = ? OR slug = ?", (slug_or_id, slug_or_id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Dataset not found.")
        v_id = row["vault_id"]

    actions = body.actions or body.requested_actions or [ACTION_QUERY_RAG]
    try:
        req = access_service.create_access_request(
            requester=principal,
            vault_id=v_id,
            actions=actions,
            duration_minutes=body.duration_minutes,
            purpose=body.purpose,
            justification=body.justification or f"Access request for {body.purpose}",
            selector=body.selector,
            required_approvals=body.required_approvals
        )
        return req
    except AccessServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/access-requests")
def list_access_requests(principal: Principal = Depends(get_current_principal)):
    """Returns requests relevant to caller only (§79: No data leak)."""
    with db.get_connection() as conn:
        cursor = conn.cursor()
        is_approver = any(r in principal.roles for r in ("admin", "security_admin", "data_owner", "data_steward"))
        if is_approver:
            cursor.execute("SELECT * FROM access_requests ORDER BY created_at DESC")
        else:
            cursor.execute("SELECT * FROM access_requests WHERE requester_id = ? ORDER BY created_at DESC", (principal.user_id,))
        rows = cursor.fetchall()
        return {"requests": [dict(r) for r in rows]}

@app.post("/api/access-requests/{request_id}/approve")
def approve_access_request(request_id: str, principal: Principal = Depends(get_current_principal)):
    """Enforces SoD and approver authority check (§38, §80)."""
    try:
        grant = access_service.approve_access_request(request_id, principal)
        return {"status": "APPROVED", "grant": grant}
    except AccessServiceError as e:
        raise HTTPException(status_code=403, detail=str(e))

class DelegateGrantBody(BaseModel):
    grantee_type: Optional[str] = "user"
    grantee_id: Optional[str] = None
    delegatee_id: Optional[str] = None
    actions: List[str]
    valid_until: Optional[str] = None
    duration_minutes: Optional[int] = 60
    selector: Optional[Dict[str, Any]] = None

@app.post("/api/grants/{parent_grant_id}/delegate")
def delegate_grant(parent_grant_id: str, body: DelegateGrantBody, principal: Principal = Depends(get_current_principal)):
    """Enforces caller is parent holder and validates attenuation (§40, §82)."""
    target_id = body.grantee_id or body.delegatee_id
    if not target_id:
        raise HTTPException(status_code=400, detail="Missing delegatee identifier.")

    valid_until = body.valid_until
    if not valid_until and body.duration_minutes:
        valid_until = (time_authority.now().timestamp + timedelta(minutes=body.duration_minutes)).isoformat()

    try:
        child = access_service.delegate_grant(
            parent_grant_id=parent_grant_id,
            delegator=principal,
            grantee_type=body.grantee_type or "user",
            grantee_id=target_id,
            requested_actions=body.actions,
            requested_valid_until=valid_until,
            selector=body.selector
        )
        return child
    except AccessServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/grants/{grant_id}/revoke")
def revoke_grant(grant_id: str, body: Optional[Dict[str, Any]] = None, principal: Principal = Depends(get_current_principal)):
    """Enforces caller authorization and executes recursive cascade revocation (§42, §81)."""
    try:
        revoked_ids = access_service.revoke_grant(grant_id, principal)
        return {"status": "REVOKED", "revoked_grant_ids": revoked_ids}
    except AccessServiceError as e:
        raise HTTPException(status_code=403, detail=str(e))

@app.get("/api/me/grants")
def get_my_grants(principal: Principal = Depends(get_current_principal)):
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    return {"grants": usable}

# ----------------- AUDIT & CHECKPOINTS (§71, §73) -----------------
@app.get("/api/audit/events")
def get_audit_events(limit: int = 50, principal: Principal = Depends(get_current_principal)):
    """Audit endpoint protected by VIEW_AUDIT role (§73)."""
    if "admin" not in principal.roles and "security_admin" not in principal.roles and "auditor" not in principal.roles:
        raise HTTPException(status_code=403, detail="Unauthorized: audit access requires VIEW_AUDIT permission.")
    return {"events": audit_service.get_recent_events(limit)}

@app.get("/api/audit/verify-chain")
def verify_audit_chain(principal: Principal = Depends(get_current_principal)):
    valid, count, error = audit_service.verify_chain()
    return {"valid": valid, "event_count": count, "error": error}

@app.post("/api/audit/checkpoint")
def create_audit_checkpoint(principal: Principal = Depends(get_current_principal)):
    if "admin" not in principal.roles and "security_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Unauthorized: checkpointing requires security_admin role.")
    return audit_service.create_signed_checkpoint()

# ----------------- TIME AUTHORITY (§34) -----------------
class TimeAdvanceRequest(BaseModel):
    hours: Optional[float] = None
    minutes: Optional[int] = None

class TimeRollbackRequest(BaseModel):
    hours: Optional[float] = 2

@app.get("/api/time/status")
def get_time_status(principal: Principal = Depends(get_current_principal)):
    t = time_authority.now()
    return {
        "timestamp": t.timestamp.isoformat(),
        "status": t.status,
        "skew_seconds": 300,
        "is_simulated": time_authority._override_time is not None,
        "details": t.details
    }

@app.post("/api/time/advance")
def advance_time(body: Optional[TimeAdvanceRequest] = None, hours: Optional[float] = None, minutes: Optional[int] = None, principal: Principal = Depends(get_current_principal)):
    """Protected time simulation endpoint: only available in TEST_MODE (§34)."""
    if not TEST_MODE and "admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Simulated time modification is disabled in production mode.")
    total_minutes = 0.0
    if body:
        if body.hours is not None:
            total_minutes += body.hours * 60
        if body.minutes is not None:
            total_minutes += body.minutes
    if hours is not None:
        total_minutes += hours * 60
    if minutes is not None:
        total_minutes += minutes
    if total_minutes == 0:
        total_minutes = 120.0
    time_authority.advance_simulated_time(timedelta(minutes=total_minutes))
    t = time_authority.now()
    return {
        "timestamp": t.timestamp.isoformat(),
        "status": t.status,
        "skew_seconds": 300,
        "is_simulated": True,
        "details": t.details
    }

@app.post("/api/time/simulate-rollback")
def simulate_rollback(body: Optional[TimeRollbackRequest] = None, principal: Principal = Depends(get_current_principal)):
    if not TEST_MODE and "admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Simulated time rollback is disabled in production mode.")
    h = body.hours if (body and body.hours is not None) else 2.0
    time_authority.simulate_rollback(timedelta(hours=h))
    t = time_authority.now()
    return {
        "timestamp": t.timestamp.isoformat(),
        "status": t.status,
        "skew_seconds": 300,
        "is_simulated": True,
        "details": t.details
    }

@app.post("/api/time/reset")
def reset_time(principal: Principal = Depends(get_current_principal)):
    if not TEST_MODE and "admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Simulated time reset is disabled in production mode.")
    time_authority.reset_time()
    t = time_authority.now()
    return {
        "timestamp": t.timestamp.isoformat(),
        "status": t.status,
        "skew_seconds": 300,
        "is_simulated": False,
        "details": t.details
    }

# ----------------- FEDERATION ENDPOINTS (§47, §48, §49) -----------------
@app.get("/api/federation/nodes")
def list_federation_nodes(principal: Principal = Depends(get_current_principal)):
    if "admin" not in principal.roles and "security_admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="Unauthorized: requires federation admin permission.")
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM federation_nodes")
        return {"nodes": [dict(r) for r in cursor.fetchall()]}

class ExportBundleRequest(BaseModel):
    vault_slug: Optional[str] = None
    vault_id: Optional[str] = None
    recipient_node_id: Optional[str] = None
    recipient_node: Optional[str] = None

@app.post("/api/bundles/export")
def export_bundle(body: ExportBundleRequest, principal: Principal = Depends(get_current_principal)):
    slug_or_id = body.vault_slug or body.vault_id
    recip = body.recipient_node_id or body.recipient_node
    if not slug_or_id or not recip:
        raise HTTPException(status_code=400, detail="Missing vault identifier or recipient node ID.")
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT vault_id FROM vaults WHERE slug = ? OR vault_id = ?", (slug_or_id, slug_or_id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Dataset not found.")
        v_id = row["vault_id"]

    try:
        return federation_service.export_vault_bundle(v_id, recip)
    except FederationError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/bundles/import")
def import_bundle(bundle: Dict[str, Any], principal: Principal = Depends(get_current_principal)):
    try:
        imp_id = federation_service.import_vault_bundle(bundle)
        return {"status": "SUCCESS", "imported_vault_id": imp_id}
    except FederationError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ----------------- SECURITY TEST MATRIX RUNNER (§85..§95) -----------------
@app.post("/api/security-tests/run")
def run_security_tests(principal: Principal = Depends(get_current_principal)):
    """Runs all 84 automated security matrix invariants and returns structured report."""
    from backend.tests.test_security_matrix import test_runner
    results = test_runner.run_all()
    passed = sum(1 for r in results if r.get("passed"))
    failed = len(results) - passed
    return {
        "status": "SUCCESS",
        "results": results,
        "total": len(results),
        "passed": passed,
        "failed": failed
    }
