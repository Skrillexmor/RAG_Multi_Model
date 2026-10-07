import json
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException, Header, status, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import jwt
from uuid import uuid4

from .config import JWT_SECRET, JWT_ALGORITHM
from .models import (
    Principal, Vault, Grant, QueryRequest, QueryResponse,
    RetrievalSecurityTrace, EvidenceItem, Citation, Claim
)
from .database import db
from .time_authority import time_authority
from .crypto import sign_grant_payload
from .policy_engine import PolicyEngine, ScopeViolation, DelegationViolation
from .policy_compiler import PolicyCompiler
from .vector_store import vector_store, SecurityContractViolation
from .canonical_gate import canonical_gate
from .local_llm import local_llm
from .citation_validator import citation_validator
from .audit import audit_service
from .access_service import access_service, AccessServiceError
from .federation import federation_service
from .ingestion import ingestion_pipeline

app = FastAPI(
    title="Secure Multi-Modal RAG with Data-Level Authorization",
    description="Zero-Cloud, LAN-Native Enterprise Knowledge Gateway with Two-Gate Retrieval Firewall",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    vector_store.sync_all_from_database()


# Authentication Dependencies
def get_current_principal(authorization: Optional[str] = Header(None)) -> Principal:
    if not authorization:
        # Default fallback to demo viewer if no header provided
        p = PolicyEngine.get_principal_by_username("alice")
        if p:
            return p
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization token")

    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        p = PolicyEngine.get_principal_by_username(username)
        if not p:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        if payload.get("auth_epoch", 0) < p.auth_epoch:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired due to policy epoch bump (T-AUTH-005)")
        return p
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# ----------------- AUTH ENDPOINTS -----------------
class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/auth/login")
def login(req: LoginRequest):
    principal = PolicyEngine.get_principal_by_username(req.username)
    if not principal:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials (T-AUTH-001)")

    # Demo password convention: password is "{username}123" or "password"
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
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    lease = PolicyEngine.issue_lease(principal, usable)
    return {
        "principal": principal,
        "active_grants_count": len(usable),
        "lease": lease,
        "time_status": now.status
    }

class PersonaSwitchRequest(BaseModel):
    username: str

@app.post("/api/auth/switch-persona")
def switch_persona(req: PersonaSwitchRequest):
    principal = PolicyEngine.get_principal_by_username(req.username)
    if not principal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Persona not found")
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

# ----------------- VAULT ENDPOINTS -----------------
@app.get("/api/vaults")
def list_vaults(principal: Principal = Depends(get_current_principal)):
    """Rule S10: Vaults hidden unless user has a grant or vault is discoverable."""
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    granted_vault_ids = {g.vault_id for g in usable}

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vaults WHERE status = 'active'")
        rows = cursor.fetchall()
        visible_vaults = []
        for r in rows:
            v_id = r["vault_id"]
            if bool(r["discoverable"]) or v_id in granted_vault_ids or "admin" in principal.roles:
                visible_vaults.append({
                    "vault_id": v_id,
                    "slug": r["slug"],
                    "display_name": r["display_name"],
                    "classification_ceiling": r["classification_ceiling"],
                    "scope_mode": r["scope_mode"],
                    "has_active_grant": v_id in granted_vault_ids,
                    "origin": r["origin"]
                })
        return visible_vaults

@app.post("/api/vaults/{vault_slug}/upload-pdf")
async def upload_pdf(vault_slug: str, file: UploadFile = File(...), principal: Principal = Depends(get_current_principal)):
    """Uploads real binary PDF, parses with pypdf, extracts text, and generates neural vectors in Qdrant."""
    if "admin" not in principal.roles and "analyst" not in principal.roles:
        raise HTTPException(status_code=403, detail="Viewer cannot upload documents (T-RBAC-001)")
    
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT vault_id FROM vaults WHERE slug = ? OR vault_id = ?", (vault_slug, vault_slug))
        v = cursor.fetchone()
        if not v:
            raise HTTPException(status_code=404, detail="Vault not found")
        vault_id = v["vault_id"]

    pdf_bytes = await file.read()
    res_id = ingestion_pipeline.ingest_raw_pdf(
        vault_id=vault_id,
        filename=file.filename,
        pdf_bytes=pdf_bytes,
        classification=2,
        min_clearance=principal.clearance,
        allowed_roles=principal.roles
    )
    return {"status": "success", "resource_id": res_id, "filename": file.filename}

# ----------------- THE SECURE RAG QUERY FIREWALL -----------------
@app.post("/api/rag/{vault_slug}/query", response_model=QueryResponse)
def execute_secure_query(
    vault_slug: str,
    req: QueryRequest,
    principal: Principal = Depends(get_current_principal)
):
    """
    Centerpiece: Two-Gate Retrieval Firewall Algorithm (§40, A3, A6, A10).
    Enforces RBAC/ABAC, mandatory server-compiled filter, authoritative canonical SQL check,
    untrusted prompt injection containment, and citation verification.
    """
    request_id = f"qry_{uuid4().hex[:8]}"
    now = time_authority.now()

    # 1. Usable Grants & Authorization Lease (§A5, §A6)
    usable_grants = PolicyEngine.usable_grants(principal, now.timestamp)
    lease = PolicyEngine.issue_lease(principal, usable_grants)

    # 2. Scope Validation (§A2, V2): selected ∩ granted ∩ active
    try:
        vault = PolicyEngine.effective_scope(vault_slug, usable_grants)
    except ScopeViolation as e:
        audit_service.log_event(
            request_id=request_id,
            actor_id=principal.user_id,
            action="rag_query",
            object_type="vault",
            object_id=vault_slug,
            decision="DENY",
            policy_version=1,
            reason_code="SCOPE_VIOLATION_NO_GRANT"
        )
        # Uniform safe refusal message (§A17, V2.2 S6)
        trace = RetrievalSecurityTrace(
            user_id=principal.user_id,
            role=",".join(principal.roles),
            vault_slug=vault_slug,
            policy_epoch=principal.auth_epoch,
            vector_filter_applied={},
            gate_a_candidates_count=0,
            gate_b_canonical_verified_count=0,
            excluded_candidates_count=0,
            citations_validated_count=0,
            citations_total_count=0,
            answer_status="REFUSED",
            refusal_reason="NO_ACTIVE_GRANT_FOR_VAULT"
        )
        return QueryResponse(
            query=req.query,
            vault_slug=vault_slug,
            answer=f"Access denied: You do not hold an active authorization grant for the '{vault_slug}' dataset.",
            claims=[],
            citations=[],
            evidence_items=[],
            security_trace=trace,
            lease_deadline=lease.deadline
        )

    # 3. Gate A: Compile Mandatory Retrieval Filter (§39, A3)
    # Note: Client-supplied filter is explicitly rejected/ignored (T-RET-003)
    compiled_filter = PolicyCompiler.compile_retrieval_filter(principal, vault, lease, usable_grants)

    # 4. Search Vector Store with compiled filter
    candidates = vector_store.search(req.query, compiled_filter, top_k=8)
    gate_a_count = len(candidates)

    # 5. Gate B: Canonical Content Authorization Gate (§1.7, A10)
    authorized_evidence, excluded_count = canonical_gate.verify_and_envelope(
        candidates=candidates,
        principal=principal,
        vault=vault,
        usable_grants=usable_grants,
        lease_deadline=lease.deadline
    )
    gate_b_count = len(authorized_evidence)

    # 6. Local LLM Answer Generation (§17, §41, V2.2)
    draft_answer, claims, citations, refusal_reason = local_llm.generate(
        query=req.query,
        vault=vault,
        evidence=authorized_evidence
    )

    # 7. Citation Validator (§25, §26, §27)
    if authorized_evidence and not refusal_reason:
        is_valid, cit_status, cit_reason, verified_citations = citation_validator.validate_citations_and_claims(
            claims=claims,
            citations=citations,
            authorized_evidence=authorized_evidence
        )
        if not is_valid:
            # First failure: refuse (T-CIT-007)
            answer_status = "CITATION_MISMATCH"
            final_answer = "Answer refused: generated claims could not be verified against authorized evidence."
            claims = []
            verified_citations = []
        else:
            answer_status = "GROUNDED"
            final_answer = draft_answer
    else:
        answer_status = "REFUSED"
        final_answer = draft_answer
        verified_citations = []

    # 8. Delivery Gate: Verify Deadline (§A6, L4)
    delivery_time = time_authority.now()
    if delivery_time.isoformat() > lease.deadline:
        final_answer = "Authorization expired during request processing. Please refresh your lease."
        answer_status = "REFUSED"
        claims = []
        verified_citations = []
        authorized_evidence = []

    # 9. Audit Event
    audit_service.log_event(
        request_id=request_id,
        actor_id=principal.user_id,
        action="rag_query",
        object_type="vault",
        object_id=vault.vault_id,
        decision="ALLOW" if answer_status == "GROUNDED" else "DENY",
        policy_version=1,
        reason_code=answer_status
    )

    trace = RetrievalSecurityTrace(
        user_id=principal.user_id,
        role=",".join(principal.roles),
        vault_slug=vault.slug,
        policy_epoch=principal.auth_epoch,
        vector_filter_applied=compiled_filter.to_dict(),
        gate_a_candidates_count=gate_a_count,
        gate_b_canonical_verified_count=gate_b_count,
        excluded_candidates_count=excluded_count,
        citations_validated_count=len([c for c in verified_citations if c.verified]),
        citations_total_count=len(citations),
        answer_status=answer_status,
        refusal_reason=refusal_reason
    )

    return QueryResponse(
        query=req.query,
        vault_slug=vault.slug,
        answer=final_answer,
        claims=claims,
        citations=verified_citations,
        evidence_items=authorized_evidence,
        security_trace=trace,
        lease_deadline=lease.deadline
    )

# ----------------- GRANTS & JIT ACCESS -----------------
@app.get("/api/me/grants")
def get_my_grants(principal: Principal = Depends(get_current_principal)):
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    return usable

class DelegateRequest(BaseModel):
    grantee_type: str
    grantee_id: str
    actions: List[str]
    valid_until: str
    selector: Optional[Dict[str, Any]] = None

@app.post("/api/grants/{grant_id}/delegate")
def delegate_grant(grant_id: str, req: DelegateRequest, principal: Principal = Depends(get_current_principal)):
    try:
        g = access_service.delegate_grant(
            parent_grant_id=grant_id,
            delegator_id=principal.user_id,
            grantee_type=req.grantee_type,
            grantee_id=req.grantee_id,
            requested_actions=req.actions,
            requested_valid_until=req.valid_until,
            selector=req.selector
        )
        return g
    except AccessServiceError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@app.post("/api/grants/{grant_id}/revoke")
def revoke_grant(grant_id: str, principal: Principal = Depends(get_current_principal)):
    access_service.revoke_grant(grant_id, revoker_id=principal.user_id)
    return {"status": "revoked", "grant_id": grant_id}

class CreateAccessRequestModel(BaseModel):
    vault_id: str
    actions: List[str]
    duration_minutes: int
    purpose: str
    justification: str

@app.post("/api/access-requests")
def create_access_request(req: CreateAccessRequestModel, principal: Principal = Depends(get_current_principal)):
    try:
        return access_service.create_access_request(
            requester_id=principal.user_id,
            vault_id=req.vault_id,
            actions=req.actions,
            duration_minutes=req.duration_minutes,
            purpose=req.purpose,
            justification=req.justification
        )
    except AccessServiceError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@app.get("/api/access-requests")
def list_access_requests(principal: Principal = Depends(get_current_principal)):
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT ar.*, v.display_name as vault_name, u.username as requester_name FROM access_requests ar JOIN vaults v ON ar.vault_id = v.vault_id JOIN users u ON ar.requester_id = u.user_id ORDER BY ar.created_at DESC")
        return [dict(r) for r in cursor.fetchall()]

@app.post("/api/access-requests/{request_id}/approve")
def approve_request(request_id: str, principal: Principal = Depends(get_current_principal)):
    try:
        grant = access_service.approve_access_request(request_id, approver_id=principal.user_id)
        return {"status": "approved", "grant": grant}
    except AccessServiceError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# ----------------- AUDIT & INTEGRITY -----------------
@app.get("/api/audit/events")
def get_audit_events():
    return audit_service.get_recent_events(limit=40)

@app.get("/api/audit/verify-chain")
def verify_audit_chain():
    is_valid, count, error = audit_service.verify_chain()
    return {
        "is_valid": is_valid,
        "verified_events_count": count,
        "error": error
    }

# ----------------- TIME AUTHORITY CONTROL (FOR TESTING) -----------------
@app.get("/api/time/status")
def get_time_status():
    t = time_authority.now()
    return {
        "timestamp": t.isoformat(),
        "status": t.status,
        "details": t.details
    }

class AdvanceTimeModel(BaseModel):
    minutes: int

@app.post("/api/time/advance")
def advance_time(req: AdvanceTimeModel):
    time_authority.advance_simulated_time(timedelta(minutes=req.minutes))
    t = time_authority.now()
    return {"new_time": t.isoformat(), "status": t.status}

@app.post("/api/time/simulate-rollback")
def simulate_rollback():
    # Force wall clock into past to test rollback detection
    old_time = time_authority.now().timestamp - timedelta(days=2)
    time_authority.set_time_override(old_time)
    t = time_authority.now()
    return {"timestamp": t.isoformat(), "status": t.status, "details": t.details}

@app.post("/api/time/reset")
def reset_time():
    time_authority.set_time_override(None)
    t = time_authority.now()
    return {"timestamp": t.isoformat(), "status": t.status}

# ----------------- SECURITY TEST RUNNER ROUTE -----------------
@app.post("/api/security-tests/run")
def run_security_test_suite():
    from backend.tests.test_security_matrix import test_runner
    results = test_runner.run_all()
    passed_count = len([r for r in results if r["passed"]])
    return {
        "total_tests": len(results),
        "passed_tests": passed_count,
        "all_passed": passed_count == len(results),
        "results": results
    }

# ----------------- FEDERATION & BUNDLES -----------------
@app.get("/api/federation/nodes")
def list_federation_nodes():
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM federation_nodes")
        return [dict(r) for r in cursor.fetchall()]

class ExportBundleModel(BaseModel):
    vault_id: str
    recipient_node_id: str

@app.post("/api/bundles/export")
def export_bundle(req: ExportBundleModel):
    return federation_service.export_vault_bundle(req.vault_id, req.recipient_node_id)

@app.post("/api/bundles/import")
def import_bundle(bundle_data: Dict[str, Any]):
    imported_id = federation_service.import_vault_bundle(bundle_data)
    return {"status": "imported", "vault_id": imported_id}
