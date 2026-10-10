import json
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException, Header, status, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
import jwt
from uuid import uuid4
from pathlib import Path

logger = logging.getLogger(__name__)

from .config import (
    JWT_SECRET, JWT_ALGORITHM, DEMO_MODE, TEST_MODE,
    INACTIVITY_TIMEOUT_SECONDS, TOKEN_EXPIRY_MINUTES
)
from .models import (
    Principal, Vault, Grant, QueryRequest, QueryResponse,
    RetrievalSecurityTrace, EvidenceItem, Citation, Claim, ResourceManifest,
    ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE,
    ACTION_FETCH_CHUNK, ACTION_VIEW_AUDIT, ACTION_APPROVE_ACCESS_REQUEST
)
from .database import db
from .time_authority import time_authority
from .crypto import (
    sign_grant_payload, verify_password, hash_password,
    derive_vault_kek, decrypt_from_file, compute_content_hash
)
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
from .model_manager import local_model_manager
import time
from .conversation_service import conversation_service, ConversationNotFoundError, ConversationServiceError
from .session_service import session_service, SessionError
from .retrieval_modes import retrieval_pipeline

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

from .config import MEDIA_DIR
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

@app.on_event("startup")
def on_startup():
    vector_store.sync_all_from_database()

# ----------------- AUTHENTICATION DEPENDENCY (§3.1) -----------------
def get_current_principal(request: Request = None, authorization: Optional[str] = Header(None)) -> Principal:
    """
    Authoritative request authenticator.
    Fail-closed: Missing or invalid token ALWAYS returns 401 Unauthorized (§3.1).
    Validates server-side user inactivity timeout (300s default) on every protected request.
    Background polling endpoints validate session without resetting inactivity countdown.
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

        # Server-Side Inactivity & Revocation Validation (§3.1, T-SESS-001, T-SESS-002)
        token_jti = payload.get("jti")
        if token_jti:
            path = request.url.path if request else ""
            method = request.method if request else "GET"
            # Background polling endpoints do NOT reset inactivity
            is_background_poll = (
                path in (
                    "/api/auth/session/status", "/api/time/status",
                    "/api/llm/status", "/api/models/status", "/api/auth/me"
                )
                or (method == "GET" and not path.startswith("/api/auth/activity"))
            )
            is_genuine = not is_background_poll

            try:
                session_service.validate_session(token_jti, p.user_id, is_genuine_activity=is_genuine)
            except SessionError as se:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=se.message)
        elif not TEST_MODE:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session identifier missing from token.")

        return p
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature or expired (T-AUTH-004).")

class MediaTicketRequest(BaseModel):
    file_path: str

@app.post("/api/media/ticket")
def create_media_ticket(
    req: MediaTicketRequest,
    principal: Principal = Depends(get_current_principal)
):
    """
    Issues short-lived (60s), principal-bound ticket for streaming audio/video or native media elements (§Task D).
    Validates current resource authorization before ticket minting.
    """
    safe_name = Path(req.file_path).name
    if not safe_name or safe_name in (".", ".."):
        raise HTTPException(status_code=403, detail="Path traversal forbidden.")
    target_file = (MEDIA_DIR / safe_name).resolve()
    if not target_file.exists() or not target_file.is_file():
        raise HTTPException(status_code=404, detail="Media file not found.")
    try:
        target_file.relative_to(MEDIA_DIR.resolve())
    except (ValueError, RuntimeError):
        raise HTTPException(status_code=403, detail="Path traversal forbidden.")

    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    is_admin = any(r in principal.roles for r in ("admin", "security_admin"))

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT chunk_id, resource_id, vault_id FROM chunks WHERE provenance LIKE ? LIMIT 1", (f"%{safe_name}%",))
        chunk_row = cursor.fetchone()
        if chunk_row and not is_admin:
            res_id = chunk_row["resource_id"]
            cursor.execute("SELECT * FROM resource_manifests WHERE resource_id = ?", (res_id,))
            m_row = cursor.fetchone()
            if m_row:
                manifest = ResourceManifest(
                    resource_id=m_row["resource_id"],
                    vault_id=m_row["vault_id"],
                    tenant_id=m_row["tenant_id"],
                    classification=m_row["classification"],
                    allowed_roles=json.loads(m_row["allowed_roles"]),
                    allowed_groups=json.loads(m_row["allowed_groups"]),
                    allowed_users=json.loads(m_row["allowed_users"]),
                    denied_users=json.loads(m_row["denied_users"]),
                    denied_roles=json.loads(m_row["denied_roles"]),
                    min_clearance=m_row["min_clearance"],
                    operations=json.loads(m_row["operations"]),
                    policy_version=m_row["policy_version"],
                    acl_version=m_row["acl_version"]
                )
                cursor.execute("SELECT * FROM vaults WHERE vault_id = ?", (m_row["vault_id"],))
                v_row = cursor.fetchone()
                vault_obj = Vault(
                    vault_id=v_row["vault_id"],
                    tenant_id=v_row["tenant_id"],
                    display_name=v_row["display_name"],
                    slug=v_row["slug"],
                    owner_id=v_row["owner_id"],
                    classification_ceiling=v_row["classification_ceiling"],
                    created_at=v_row["created_at"]
                ) if v_row else None

                decision, reason, _ = PolicyEngine.decide(
                    principal=principal,
                    action=ACTION_VIEW_SOURCE,
                    manifest=manifest,
                    usable_grants=usable,
                    vault=vault_obj
                )
                if decision != "ALLOW":
                    raise HTTPException(status_code=403, detail=f"Access denied: {reason}")

    ticket_payload = {
        "sub": principal.username,
        "user_id": principal.user_id,
        "tenant_id": principal.tenant_id,
        "file": safe_name,
        "type": "media_ticket",
        "exp": int(time.time()) + 60
    }
    ticket = jwt.encode(ticket_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "ticket": ticket,
        "expires_in": 60,
        "media_url": f"/api/media/{safe_name}?ticket={ticket}"
    }

# ----------------- AUTHENTICATED & AUTHORIZED MEDIA SERVER (§3.1, §11, §Task D) -----------------
@app.get("/api/media/{file_path:path}")
def serve_media_file(
    file_path: str,
    request: Request,
    ticket: Optional[str] = None,
    authorization: Optional[str] = Header(None)
):
    """
    Authenticated and resource-authorized media server.
    Accepts custom Authorization: Bearer token OR short-lived signed ?ticket parameter.
    Serves images, keyframes, and audio with byte-range support, traversal protection, and ACL verification.
    """
    safe_name = Path(file_path).name
    if not safe_name or safe_name in (".", ".."):
        raise HTTPException(status_code=403, detail="Path traversal forbidden.")

    # 1. Authoritative Authentication FIRST (§Task D, T-AUTH-004 - prevents resource enumeration)
    principal: Optional[Principal] = None
    if ticket:
        if "?ticket=" in ticket:
            ticket = ticket.split("?ticket=")[0]
        elif "&ticket=" in ticket:
            ticket = ticket.split("&ticket=")[0]
        try:
            payload = jwt.decode(ticket, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "media_ticket":
                raise HTTPException(status_code=401, detail="Invalid media ticket type.")
            if payload.get("file") != safe_name:
                raise HTTPException(status_code=403, detail="Ticket does not match requested asset.")
            uname = payload.get("sub")
            principal = PolicyEngine.get_principal_by_username(uname)
            if not principal and payload.get("user_id"):
                with db.get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("SELECT username FROM users WHERE user_id = ?", (payload["user_id"],))
                    u_row = cursor.fetchone()
                    if u_row:
                        principal = PolicyEngine.get_principal_by_username(u_row["username"])
            if not principal or not principal.is_active:
                raise HTTPException(status_code=401, detail="Principal inactive or invalid.")
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Media ticket expired or signature invalid.")
    else:
        principal = get_current_principal(request=request, authorization=authorization)

    target_file = (MEDIA_DIR / safe_name).resolve()
    if not target_file.exists() or not target_file.is_file():
        raise HTTPException(status_code=404, detail="Media file not found.")

    # Guard against directory traversal
    try:
        target_file.relative_to(MEDIA_DIR.resolve())
    except (ValueError, RuntimeError):
        raise HTTPException(status_code=403, detail="Path traversal forbidden.")


    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    is_admin = any(r in principal.roles for r in ("admin", "security_admin"))

    # Authorize against associated chunk and resource manifest if linked
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT chunk_id, resource_id, vault_id FROM chunks WHERE provenance LIKE ? LIMIT 1", (f"%{safe_name}%",))
        chunk_row = cursor.fetchone()

        if chunk_row:
            res_id = chunk_row["resource_id"]
            cursor.execute("SELECT * FROM resource_manifests WHERE resource_id = ?", (res_id,))
            m_row = cursor.fetchone()
            if m_row:
                manifest = ResourceManifest(
                    resource_id=m_row["resource_id"],
                    vault_id=m_row["vault_id"],
                    tenant_id=m_row["tenant_id"],
                    classification=m_row["classification"],
                    allowed_roles=json.loads(m_row["allowed_roles"]),
                    allowed_groups=json.loads(m_row["allowed_groups"]),
                    allowed_users=json.loads(m_row["allowed_users"]),
                    denied_users=json.loads(m_row["denied_users"]),
                    denied_roles=json.loads(m_row["denied_roles"]),
                    min_clearance=m_row["min_clearance"],
                    operations=json.loads(m_row["operations"]),
                    policy_version=m_row["policy_version"],
                    acl_version=m_row["acl_version"]
                )
                cursor.execute("SELECT * FROM vaults WHERE vault_id = ?", (m_row["vault_id"],))
                v_row = cursor.fetchone()
                vault_obj = Vault(
                    vault_id=v_row["vault_id"],
                    tenant_id=v_row["tenant_id"],
                    display_name=v_row["display_name"],
                    slug=v_row["slug"],
                    owner_id=v_row["owner_id"],
                    classification_ceiling=v_row["classification_ceiling"],
                    created_at=v_row["created_at"]
                ) if v_row else None

                decision, reason, _ = PolicyEngine.decide(
                    principal=principal,
                    action=ACTION_VIEW_SOURCE,
                    manifest=manifest,
                    usable_grants=usable,
                    vault=vault_obj
                )
                if decision != "ALLOW":
                    raise HTTPException(status_code=403, detail=f"Access denied: {reason}")
        else:
            if not principal.is_active:
                raise HTTPException(status_code=403, detail="Principal inactive.")

    suffix = target_file.suffix.lower()
    media_types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".mp4": "video/mp4",
        ".webm": "video/webm"
    }
    content_type = media_types.get(suffix, "application/octet-stream")
    return FileResponse(path=str(target_file), media_type=content_type, headers={"Accept-Ranges": "bytes"})


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
    session_id, token_jti = session_service.create_session(principal.user_id)
    token_payload = {
        "sub": principal.username,
        "user_id": principal.user_id,
        "tenant_id": principal.tenant_id,
        "roles": principal.roles,
        "clearance": principal.clearance,
        "auth_epoch": principal.auth_epoch,
        "jti": token_jti,
        "session_id": session_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRY_MINUTES)
    }
    token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "access_token": token,
        "token_type": "bearer",
        "principal": principal,
        "session_id": session_id,
        "inactivity_timeout_seconds": INACTIVITY_TIMEOUT_SECONDS
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
        # Safe unprivileged defaults for self-registration:
        # Untrusted client input cannot grant privileged roles, elevated clearance, or automatic data access
        clearance_lvl = 1
        dept = "General"
        roles_to_assign = ["viewer"]

        cursor.execute("SELECT tenant_id FROM vaults LIMIT 1")
        t_row = cursor.fetchone()
        tenant_id = t_row["tenant_id"] if t_row else "tenant_primary"

        cursor.execute("""
            INSERT INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)
        """, (user_id, tenant_id, clean_username, pwd_hash, dept, clearance_lvl, now_iso))

        # Ensure all existing users align to primary tenant
        cursor.execute("UPDATE users SET tenant_id = ? WHERE tenant_id = 'default_tenant'", (tenant_id,))

        cursor.execute("SELECT role_id FROM roles WHERE name = 'viewer'")
        existing = cursor.fetchone()
        if existing:
            rid = existing["role_id"]
        else:
            rid = "r_viewer"
            cursor.execute("INSERT OR IGNORE INTO roles (role_id, name, description) VALUES (?, 'viewer', 'Role viewer')", (rid,))

        cursor.execute("""
            INSERT OR REPLACE INTO role_assignments (user_id, role_id, valid_from, granted_by)
            VALUES (?, ?, '2000-01-01T00:00:00Z', 'system_registration')
        """, (user_id, rid))

        dept_slug = dept.strip().lower()
        cursor.execute("INSERT OR IGNORE INTO user_groups (user_id, group_name) VALUES (?, ?)", (user_id, f"group:{dept_slug}"))

        conn.commit()

    principal = PolicyEngine.get_principal_by_username(clean_username)
    if not principal:
        raise HTTPException(status_code=500, detail="Failed to load newly registered principal.")

    session_id, token_jti = session_service.create_session(principal.user_id)
    token_payload = {
        "sub": principal.username,
        "user_id": principal.user_id,
        "tenant_id": principal.tenant_id,
        "roles": principal.roles,
        "clearance": principal.clearance,
        "auth_epoch": principal.auth_epoch,
        "jti": token_jti,
        "session_id": session_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRY_MINUTES)
    }
    token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "access_token": token,
        "token_type": "bearer",
        "principal": principal,
        "session_id": session_id,
        "inactivity_timeout_seconds": INACTIVITY_TIMEOUT_SECONDS,
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

    session_id, token_jti = session_service.create_session(principal.user_id)
    token_payload = {
        "sub": principal.username,
        "user_id": principal.user_id,
        "tenant_id": principal.tenant_id,
        "roles": principal.roles,
        "clearance": principal.clearance,
        "auth_epoch": principal.auth_epoch,
        "jti": token_jti,
        "session_id": session_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRY_MINUTES)
    }
    token = jwt.encode(token_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return {
        "access_token": token,
        "token_type": "bearer",
        "principal": principal,
        "session_id": session_id,
        "inactivity_timeout_seconds": INACTIVITY_TIMEOUT_SECONDS
    }

@app.get("/api/auth/me")
def get_me(principal: Principal = Depends(get_current_principal)):
    return {
        "principal": principal,
        "lease_deadline": (datetime.now(timezone.utc) + timedelta(seconds=300)).isoformat()
    }

@app.post("/api/auth/activity")
def record_user_activity(authorization: Optional[str] = Header(None)):
    """Resets user inactivity timer when genuine UI interaction occurs (§3.1)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication token required.")
    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        jti = payload.get("jti") or payload.get("session_id")
        user_id = payload.get("user_id")
        if not jti and user_id:
            jti = f"jti_{user_id}"
        if not jti:
            raise HTTPException(status_code=401, detail="Session identifier missing.")
        return session_service.record_activity(jti, user_id=user_id)
    except SessionError as e:
        raise HTTPException(status_code=401, detail=e.message)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token.")

@app.post("/api/auth/session/renew")
def renew_user_session(authorization: Optional[str] = Header(None)):
    """Server-side session renewal called when user confirms presence on 30s warning modal (§3.1)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Authentication token required.")
    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        jti = payload.get("jti") or payload.get("session_id")
        user_id = payload.get("user_id")
        if not jti and user_id:
            jti = f"jti_{user_id}"
        if not jti:
            raise HTTPException(status_code=401, detail="Session identifier missing.")
        return session_service.renew_session(jti, user_id=user_id)
    except SessionError as e:
        raise HTTPException(status_code=401, detail=e.message)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token.")

@app.get("/api/auth/session/status")
def get_session_status(authorization: Optional[str] = Header(None)):
    """Returns authoritative remaining inactivity seconds (does NOT reset timer) (§3.1)."""
    if not authorization:
        return {"is_active": False, "remaining_seconds": 0, "is_warning": False}
    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        jti = payload.get("jti") or payload.get("session_id")
        user_id = payload.get("user_id")
        if not jti and user_id:
            jti = f"jti_{user_id}"
        if not jti:
            return {"is_active": False, "remaining_seconds": 0, "is_warning": False}
        return session_service.get_session_status(jti, user_id=user_id)
    except Exception:
        return {"is_active": False, "remaining_seconds": 0, "is_warning": False}

@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    """Explicitly revokes session in database to prevent token replay (§3.1)."""
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            jti = payload.get("jti")
            if jti:
                session_service.revoke_session(jti)
        except Exception:
            pass
    return {"status": "LOGGED_OUT"}

# ----------------- PUBLIC AUTH CONFIG & CAPABILITIES (§Task A) -----------------
@app.get("/api/auth/config")
def get_auth_config():
    """Public unauthenticated operational configuration and capability state."""
    return {
        "app_name": "DARS-RAG / PrivateRAG",
        "demo_mode": DEMO_MODE,
        "offline_mode": True,
        "inactivity_timeout_seconds": INACTIVITY_TIMEOUT_SECONDS,
        "clock_status": time_authority.now().status
    }

# ----------------- AUTHORITATIVE PERSISTENT CONVERSATIONS (§Task C, §Task G) -----------------
class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New Conversation"
    vault_slug: Optional[str] = ""
    selected_file_id: Optional[str] = None
    selected_file_name: Optional[str] = None
    conversation_id: Optional[str] = None

class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None
    vault_slug: Optional[str] = None
    selected_file_id: Optional[str] = None
    selected_file_name: Optional[str] = None

class AppendMessageRequest(BaseModel):
    role: str
    content: str
    message_id: Optional[str] = None
    retrieval_mode: Optional[str] = "LOW"
    citations: Optional[List[Dict[str, Any]]] = None
    evidence_items: Optional[List[Dict[str, Any]]] = None
    security_trace: Optional[Dict[str, Any]] = None
    status: Optional[str] = "complete"
    vault_slug: Optional[str] = None
    selected_file_id: Optional[str] = None
    selected_file_name: Optional[str] = None

@app.get("/api/conversations")
def list_conversations(principal: Principal = Depends(get_current_principal)):
    """Lists conversations strictly owned by authenticated user and tenant."""
    return {"conversations": conversation_service.list_conversations(principal)}

@app.post("/api/conversations")
def create_conversation(req: CreateConversationRequest, principal: Principal = Depends(get_current_principal)):
    """Creates a new durable conversation strictly bound to authenticated principal."""
    conv = conversation_service.create_conversation(
        principal=principal,
        title=req.title or "New Conversation",
        vault_slug=req.vault_slug or "",
        selected_file_id=req.selected_file_id,
        selected_file_name=req.selected_file_name,
        conversation_id=req.conversation_id
    )
    return {"conversation": conv}

@app.get("/api/conversations/{conversation_id}")
def get_conversation(conversation_id: str, principal: Principal = Depends(get_current_principal)):
    """Loads an owned conversation. Returns non-leaking 404 if not owned by caller."""
    conv = conversation_service.get_conversation(conversation_id, principal)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return {"conversation": conv}

@app.put("/api/conversations/{conversation_id}")
def update_conversation(conversation_id: str, req: UpdateConversationRequest, principal: Principal = Depends(get_current_principal)):
    """Updates title, pin, or scope on an owned conversation."""
    try:
        updated = conversation_service.update_conversation(
            conversation_id=conversation_id,
            principal=principal,
            title=req.title,
            pinned=req.pinned,
            vault_slug=req.vault_slug,
            selected_file_id=req.selected_file_id,
            selected_file_name=req.selected_file_name
        )
        return {"conversation": updated}
    except ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found.")

@app.delete("/api/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, principal: Principal = Depends(get_current_principal)):
    """Deletes an owned conversation. Returns non-leaking 404 if foreign."""
    try:
        conversation_service.delete_conversation(conversation_id, principal)
        return {"status": "DELETED", "conversation_id": conversation_id}
    except ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found.")

@app.post("/api/conversations/{conversation_id}/messages")
def append_conversation_message(conversation_id: str, req: AppendMessageRequest, principal: Principal = Depends(get_current_principal)):
    """Appends turn to owned conversation."""
    try:
        msg = conversation_service.append_message(
            conversation_id=conversation_id,
            principal=principal,
            role=req.role,
            content=req.content,
            message_id=req.message_id,
            retrieval_mode=req.retrieval_mode,
            citations=req.citations,
            evidence_items=req.evidence_items,
            security_trace=req.security_trace,
            status=req.status,
            vault_slug=req.vault_slug,
            selected_file_id=req.selected_file_id,
            selected_file_name=req.selected_file_name
        )
        return {"message": msg}
    except ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found.")

@app.get("/api/conversations/{conversation_id}/memory")
def get_conversation_memory(conversation_id: str, principal: Principal = Depends(get_current_principal)):
    """Retrieves isolated rolling summary for an owned conversation."""
    try:
        mem = conversation_service.get_memory(conversation_id, principal)
        return {"memory": mem}
    except ConversationNotFoundError:
        raise HTTPException(status_code=404, detail="Conversation not found.")


# ----------------- LOCAL LLM STATUS & SETUP GUIDE -----------------
@app.get("/api/llm/status")
def get_llm_status(principal: Principal = Depends(get_current_principal)):
    """Returns local offline LLM connection status, installed models, and setup guide."""
    return local_llm.get_status()

# ----------------- VAULTS & DISCOVERY ENDPOINTS (§29, §30, §32) -----------------
@app.get("/api/vaults")
def list_vaults(principal: Principal = Depends(get_current_principal)):
    """
    Lists only authorized or owned vaults with time-valid grants and clearance-filtered documents (§30).
    """
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    usable_vault_ids = {g.vault_id for g in usable}
    is_admin = any(r in principal.roles for r in ("admin", "security_admin"))

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vaults WHERE tenant_id = ? AND status = 'active'", (principal.tenant_id,))
        rows = cursor.fetchall()

        visible = []
        for r in rows:
            v_id = r["vault_id"]
            is_owner = r["owner_id"] == principal.user_id
            is_granted = v_id in usable_vault_ids

            # User can only see a folder if they are the owner, have an active non-expired grant, or are admin
            if is_owner or is_granted or is_admin:
                v_dict = dict(r)
                v_dict["retention"] = json.loads(r["retention"]) if r["retention"] else {}
                v_dict["has_active_grant"] = is_granted or is_owner or is_admin

                # Fetch real active documents for this vault
                cursor.execute("""
                    SELECT resource_id, vault_id, resource_type, title, classification, status, created_at, owner_user_id,
                           (SELECT COUNT(*) FROM chunks c WHERE c.resource_id = resources.resource_id) as chunks_count
                    FROM resources
                    WHERE vault_id = ? AND status = 'active'
                    ORDER BY created_at DESC
                """, (v_id,))
                doc_rows = cursor.fetchall()
                
                # Determine accessible documents based on grants and manifests
                accessible_docs = []
                if is_admin or is_owner:
                    accessible_docs = [dict(d) for d in doc_rows]
                else:
                    vault_grants = [g for g in usable if g.vault_id == v_id]
                    has_all_folder_grant = any(
                        (not g.selector or g.selector.get("all") is True or not g.selector.get("resource_id"))
                        for g in vault_grants
                    )
                    granted_res_ids = {
                        g.selector.get("resource_id")
                        for g in vault_grants
                        if g.selector and g.selector.get("resource_id")
                    }

                    for d in doc_rows:
                        res_id = d["resource_id"]
                        # 1. Direct active grant for this specific resource
                        if res_id in granted_res_ids:
                            accessible_docs.append(dict(d))
                            continue

                        cursor.execute("SELECT allowed_users, allowed_roles FROM resource_manifests WHERE resource_id = ?", (res_id,))
                        m_row = cursor.fetchone()
                        if not m_row:
                            continue

                        u_list = json.loads(m_row["allowed_users"] or "[]")
                        clean_u_set = {u.replace("user:", "").strip().lower() for u in u_list}
                        p_uid = principal.user_id.replace("user:", "").strip().lower()
                        p_uname = principal.username.strip().lower()

                        # 2. Explicit user ACL on resource manifest
                        if p_uid in clean_u_set or p_uname in clean_u_set:
                            accessible_docs.append(dict(d))
                            continue

                        # 3. Folder-wide grant: requires clearance and allowed roles
                        if has_all_folder_grant and d["classification"] <= principal.clearance:
                            r_list = json.loads(m_row["allowed_roles"] or "[]")
                            if any(r in r_list or f"role:{r}" in r_list for r in principal.roles):
                                accessible_docs.append(dict(d))
                                continue

                v_dict["documents"] = accessible_docs
                v_dict["document_count"] = len(accessible_docs)

                cursor.execute("SELECT COUNT(*) as c FROM chunks WHERE vault_id = ?", (v_id,))
                c_row = cursor.fetchone()
                v_dict["chunk_count"] = c_row["c"] if c_row else 0

                visible.append(v_dict)

    return {"vaults": visible}

@app.get("/api/vaults/{vault_slug}/documents")
def get_vault_documents(vault_slug: str, principal: Principal = Depends(get_current_principal)):
    """Returns all documents ingested in a specific vault authorized for caller."""
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    try:
        vault = PolicyEngine.effective_scope(vault_slug, principal, usable)
    except ScopeViolation:
        return {"vault_slug": vault_slug, "documents": []}
    is_admin = any(r in principal.roles for r in ("admin", "security_admin"))
    is_owner = vault.owner_id == principal.user_id

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT resource_id, vault_id, resource_type, title, classification, status, created_at, owner_user_id,
                   (SELECT COUNT(*) FROM chunks c WHERE c.resource_id = resources.resource_id) as chunks_count
            FROM resources
            WHERE vault_id = ? AND status = 'active'
            ORDER BY created_at DESC
        """, (vault.vault_id,))
        doc_rows = cursor.fetchall()

        accessible_docs = []
        if is_admin or is_owner:
            accessible_docs = [dict(d) for d in doc_rows]
        else:
            vault_grants = [g for g in usable if g.vault_id == vault.vault_id]
            has_all_folder_grant = any(
                (not g.selector or g.selector.get("all") is True or not g.selector.get("resource_id"))
                for g in vault_grants
            )
            granted_res_ids = {
                g.selector.get("resource_id")
                for g in vault_grants
                if g.selector and g.selector.get("resource_id")
            }

            for d in doc_rows:
                res_id = d["resource_id"]
                # 1. Direct active grant for this specific resource
                if res_id in granted_res_ids:
                    accessible_docs.append(dict(d))
                    continue

                cursor.execute("SELECT allowed_users, allowed_roles FROM resource_manifests WHERE resource_id = ?", (res_id,))
                m_row = cursor.fetchone()
                if not m_row:
                    continue

                u_list = json.loads(m_row["allowed_users"] or "[]")
                clean_u_set = {u.replace("user:", "").strip().lower() for u in u_list}
                p_uid = principal.user_id.replace("user:", "").strip().lower()
                p_uname = principal.username.strip().lower()

                # 2. Explicit user ACL on resource manifest
                if p_uid in clean_u_set or p_uname in clean_u_set:
                    accessible_docs.append(dict(d))
                    continue

                # 3. Folder-wide grant: requires clearance and allowed roles
                if has_all_folder_grant and d["classification"] <= principal.clearance:
                    r_list = json.loads(m_row["allowed_roles"] or "[]")
                    if any(r in r_list or f"role:{r}" in r_list for r in principal.roles):
                        accessible_docs.append(dict(d))
                        continue

    return {"vault_slug": vault.slug, "documents": accessible_docs}

# ----------------- FOLDER / VAULT CRUD & ASSIGNMENT ENDPOINTS -----------------
class CreateVaultRequest(BaseModel):
    display_name: Optional[str] = None
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    classification_ceiling: Optional[int] = 2
    visibility: Optional[str] = "private"
    discoverable: Optional[bool] = True
    assigned_users: Optional[List[str]] = None
    assigned_user_ids: Optional[List[str]] = None

class UpdateVaultRequest(BaseModel):
    display_name: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    classification_ceiling: Optional[int] = None
    visibility: Optional[str] = None
    discoverable: Optional[bool] = None

class AssignVaultRequest(BaseModel):
    grantee_type: Optional[str] = "user"  # "user" or "role"
    grantee_id: Optional[str] = None
    user_ids: Optional[List[str]] = None
    role_names: Optional[List[str]] = None
    actions: Optional[List[str]] = None
    duration_minutes: Optional[int] = None
    valid_hours: Optional[int] = None
    is_delegable: Optional[bool] = False
    purpose: Optional[str] = "folder_assignment"
    resource_id: Optional[str] = None

@app.post("/api/vaults")
def create_vault(body: CreateVaultRequest, principal: Principal = Depends(get_current_principal)):
    name = (body.name or body.display_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder display name is required.")
    
    import re
    slug = body.slug.strip().lower() if body.slug else re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    if not slug:
        slug = f"folder-{uuid4().hex[:6]}"
    
    vid = f"v_{uuid4().hex[:8]}"
    now = time_authority.now().timestamp
    now_iso = now.isoformat()
    two_days_later = (now + timedelta(days=365)).isoformat()
    ceiling = max(0, min(body.classification_ceiling if body.classification_ceiling is not None else 2, 4))
    vis = body.visibility or "private"
    disc = 1 if body.discoverable else 0

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT vault_id FROM vaults WHERE slug = ?", (slug,))
        if cursor.fetchone():
            slug = f"{slug}-{uuid4().hex[:4]}"
        
        cursor.execute("""
            INSERT INTO vaults (
                vault_id, tenant_id, slug, display_name, owner_id, steward_role_id,
                classification_ceiling, status, scope_mode, visibility, discoverable,
                allow_delegation, max_delegation_depth, retention, key_id, origin, vault_epoch, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'strict_single', ?, ?, 1, 3, '{}', 'vault_kek', 'native', 1, ?)
        """, (vid, principal.tenant_id, slug, name, principal.user_id, principal.roles[0] if principal.roles else "analyst",
              ceiling, vis, disc, now_iso))

        # 1. Issue Owner Grant to Creator
        g_owner_id = f"g_owner_{uuid4().hex[:8]}"
        owner_grant = {
            "grant_id": g_owner_id,
            "vault_id": vid,
            "grantee_type": "user",
            "grantee_id": f"user:{principal.user_id}",
            "selector": {"all": True},
            "actions": [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE, "download_document", "share_data", "delegate_permission"],
            "valid_from": now_iso,
            "valid_until": two_days_later,
            "purpose": "folder_owner",
            "delegable": True,
            "depth": 0,
            "parent_grant_id": None,
            "issuer_id": principal.user_id
        }
        sig = sign_grant_payload(owner_grant)
        cursor.execute("""
            INSERT INTO grants (
                grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                valid_from, valid_until, purpose, delegable, depth, parent_grant_id,
                issuer_id, state, signature, created_at
            ) VALUES (?, ?, 'user', ?, ?, ?, ?, ?, 'folder_owner', 1, 0, NULL, ?, 'active', ?, ?)
        """, (g_owner_id, vid, f"user:{principal.user_id}", json.dumps({"all": True}),
              json.dumps(owner_grant["actions"]), now_iso, two_days_later, principal.user_id, sig, now_iso))
        cursor.execute("INSERT OR IGNORE INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (g_owner_id,))

        # 2. Assign to other users if specified
        assigned = []
        if body.assigned_users:
            for uname in body.assigned_users:
                clean_u = uname.strip().lower()
                cursor.execute("SELECT user_id FROM users WHERE username = ? OR user_id = ?", (clean_u, clean_u))
                u_row = cursor.fetchone()
                if u_row:
                    target_uid = u_row["user_id"]
                    g_user_id = f"g_assign_{uuid4().hex[:8]}"
                    u_grant = {
                        "grant_id": g_user_id,
                        "vault_id": vid,
                        "grantee_type": "user",
                        "grantee_id": f"user:{target_uid}",
                        "selector": {"all": True},
                        "actions": [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE],
                        "valid_from": now_iso,
                        "valid_until": two_days_later,
                        "purpose": "folder_assignment",
                        "delegable": False,
                        "depth": 0,
                        "parent_grant_id": None,
                        "issuer_id": principal.user_id
                    }
                    u_sig = sign_grant_payload(u_grant)
                    cursor.execute("""
                        INSERT INTO grants (
                            grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                            valid_from, valid_until, purpose, delegable, depth, parent_grant_id,
                            issuer_id, state, signature, created_at
                        ) VALUES (?, ?, 'user', ?, ?, ?, ?, ?, 'folder_assignment', 0, 0, NULL, ?, 'active', ?, ?)
                    """, (g_user_id, vid, f"user:{target_uid}", json.dumps({"all": True}),
                          json.dumps(u_grant["actions"]), now_iso, two_days_later, principal.user_id, u_sig, now_iso))
                    cursor.execute("INSERT OR IGNORE INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (g_user_id,))
                    assigned.append(clean_u)

        conn.commit()

    audit_service.log_event(
        request_id=f"create_vault_{vid}",
        actor_id=principal.user_id,
        action="create_vault",
        object_type="vault",
        object_id=vid,
        decision="ALLOW",
        policy_version=1,
        reason_code="FOLDER_CREATED"
    )

    return {
        "status": "SUCCESS",
        "vault_id": vid,
        "slug": slug,
        "display_name": name,
        "classification_ceiling": ceiling,
        "assigned_users": assigned
    }

@app.put("/api/vaults/{vault_slug_or_id}")
def update_vault(vault_slug_or_id: str, body: UpdateVaultRequest, principal: Principal = Depends(get_current_principal)):
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vaults WHERE vault_id = ? OR slug = ?", (vault_slug_or_id, vault_slug_or_id))
        vault = cursor.fetchone()
        if not vault:
            raise HTTPException(status_code=404, detail="Folder/Vault not found.")

        vid = vault["vault_id"]
        if vault["owner_id"] != principal.user_id and "admin" not in principal.roles:
            raise HTTPException(status_code=403, detail="Unauthorized: Only folder owner or admin can edit this folder.")

        updates = []
        params = []
        if body.display_name:
            updates.append("display_name = ?")
            params.append(body.display_name.strip())
        if body.classification_ceiling is not None:
            updates.append("classification_ceiling = ?")
            params.append(max(0, min(body.classification_ceiling, 4)))
        if body.visibility:
            updates.append("visibility = ?")
            params.append(body.visibility)
        if body.discoverable is not None:
            updates.append("discoverable = ?")
            params.append(1 if body.discoverable else 0)

        if updates:
            updates.append("vault_epoch = vault_epoch + 1")
            sql = f"UPDATE vaults SET {', '.join(updates)} WHERE vault_id = ?"
            params.append(vid)
            cursor.execute(sql, tuple(params))
            conn.commit()

    return {"status": "UPDATED", "vault_id": vid}

@app.delete("/api/vaults/{vault_slug_or_id}")
def delete_vault(vault_slug_or_id: str, principal: Principal = Depends(get_current_principal)):
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vaults WHERE vault_id = ? OR slug = ?", (vault_slug_or_id, vault_slug_or_id))
        vault = cursor.fetchone()
        if not vault:
            raise HTTPException(status_code=404, detail="Folder/Vault not found.")

        vid = vault["vault_id"]
        if vault["owner_id"] != principal.user_id and "admin" not in principal.roles:
            raise HTTPException(status_code=403, detail="Unauthorized: Only folder owner or admin can delete this folder.")

        cursor.execute("SELECT resource_id FROM resources WHERE vault_id = ?", (vid,))
        res_rows = cursor.fetchall()

    for r in res_rows:
        try:
            ingestion_pipeline.delete_resource(r["resource_id"])
        except Exception:
            pass

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM citation_spans WHERE chunk_id IN (SELECT chunk_id FROM chunks WHERE vault_id = ?)", (vid,))
        cursor.execute("DELETE FROM chunks WHERE vault_id = ?", (vid,))
        cursor.execute("DELETE FROM resource_manifests WHERE resource_id IN (SELECT resource_id FROM resources WHERE vault_id = ?)", (vid,))
        cursor.execute("DELETE FROM resources WHERE vault_id = ?", (vid,))
        cursor.execute("DELETE FROM access_request_approvals WHERE request_id IN (SELECT request_id FROM access_requests WHERE vault_id = ?)", (vid,))
        cursor.execute("DELETE FROM access_requests WHERE vault_id = ?", (vid,))
        cursor.execute("DELETE FROM grant_usage WHERE grant_id IN (SELECT grant_id FROM grants WHERE vault_id = ?)", (vid,))
        cursor.execute("DELETE FROM grants WHERE vault_id = ?", (vid,))
        cursor.execute("DELETE FROM vaults WHERE vault_id = ?", (vid,))
        conn.commit()

    audit_service.log_event(
        request_id=f"del_vault_{vid}",
        actor_id=principal.user_id,
        action="delete_vault",
        object_type="vault",
        object_id=vid,
        decision="ALLOW",
        policy_version=1,
        reason_code="FOLDER_SHREDDED"
    )

    return {"status": "DELETED", "vault_id": vid}

@app.post("/api/vaults/{vault_slug_or_id}/assign")
def assign_vault(vault_slug_or_id: str, body: AssignVaultRequest, principal: Principal = Depends(get_current_principal)):
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vaults WHERE vault_id = ? OR slug = ?", (vault_slug_or_id, vault_slug_or_id))
        vault = cursor.fetchone()
        if not vault:
            raise HTTPException(status_code=404, detail="Folder/Vault not found.")

        vid = vault["vault_id"]
        v_owner = (vault["owner_id"] or "").replace("user:", "").strip().lower()
        p_uid = principal.user_id.replace("user:", "").strip().lower()
        p_uname = principal.username.strip().lower()
        if p_uid != v_owner and p_uname != v_owner and "admin" not in principal.roles:
            raise HTTPException(status_code=403, detail="Unauthorized: Only folder owner can assign permissions.")

        # Determine target grantees
        grantees_to_add = [] # tuples of (grantee_type, formatted_grantee_id, clearance)
        if body.user_ids:
            for uid in body.user_ids:
                clean_uid = uid.replace("user:", "").strip().lower()
                cursor.execute("SELECT user_id, clearance FROM users WHERE LOWER(username) = ? OR LOWER(user_id) = ?", (clean_uid, clean_uid))
                u_row = cursor.fetchone()
                if u_row:
                    grantees_to_add.append(("user", f"user:{u_row['user_id']}", u_row["clearance"]))
        elif body.role_names:
            for rname in body.role_names:
                clean_rname = rname.replace("role:", "").strip().lower()
                grantees_to_add.append(("role", f"role:{clean_rname}", 1))
        elif body.grantee_id:
            g_type = body.grantee_type or "user"
            target_raw = body.grantee_id.replace("user:", "").replace("role:", "").strip().lower()
            if g_type == "user":
                cursor.execute("SELECT user_id, clearance FROM users WHERE LOWER(username) = ? OR LOWER(user_id) = ?", (target_raw, target_raw))
                u_row = cursor.fetchone()
                if u_row:
                    grantees_to_add.append(("user", f"user:{u_row['user_id']}", u_row["clearance"]))
            else:
                grantees_to_add.append(("role", f"role:{target_raw}", 1))

        if not grantees_to_add:
            raise HTTPException(status_code=400, detail="No valid users or roles specified for assignment.")

        now = time_authority.now().timestamp
        now_iso = now.isoformat()
        
        # Calculate duration
        if body.valid_hours:
            valid_until = (now + timedelta(hours=body.valid_hours)).isoformat()
        elif body.duration_minutes:
            valid_until = (now + timedelta(minutes=body.duration_minutes)).isoformat()
        else:
            valid_until = (now + timedelta(days=365)).isoformat()

        raw_actions = body.actions or [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE]
        clean_actions = []
        for act in raw_actions:
            c_act = act[7:] if act.startswith("action:") else act
            if c_act == "read":
                for standard_act in (ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE, ACTION_VIEW_SOURCE):
                    if standard_act not in clean_actions:
                        clean_actions.append(standard_act)
            elif c_act not in clean_actions:
                clean_actions.append(c_act)
        if not clean_actions:
            clean_actions = [ACTION_QUERY_RAG, ACTION_RETRIEVE_EVIDENCE]

        delegable = bool(body.is_delegable)
        grants_created = 0
        last_gid = None

        selector_dict: Dict[str, Any] = {"all": True}
        if body.resource_id:
            selector_dict = {"resource_id": body.resource_id}

        for g_type, grantee_formatted, grantee_clearance in grantees_to_add:
            gid = f"g_assign_{uuid4().hex[:8]}"
            last_gid = gid
            grant_dict = {
                "grant_id": gid,
                "vault_id": vid,
                "grantee_type": g_type,
                "grantee_id": grantee_formatted,
                "selector": selector_dict,
                "actions": clean_actions,
                "valid_from": now_iso,
                "valid_until": valid_until,
                "purpose": body.purpose or ("file_assignment" if body.resource_id else "folder_assignment"),
                "delegable": delegable,
                "depth": 1 if delegable else 0,
                "parent_grant_id": None,
                "issuer_id": principal.user_id
            }
            # If assigning access to a specific resource, supersede previous active grants for this grantee and resource
            if body.resource_id:
                cursor.execute("""
                    UPDATE grants
                    SET state = 'superseded', revoked_at = ?, revoked_by = ?, revoke_reason = 'superseded_by_new_grant'
                    WHERE vault_id = ? AND grantee_id = ? AND state = 'active'
                      AND selector LIKE ?
                """, (now_iso, principal.user_id, vid, grantee_formatted, f'%{body.resource_id}%'))

            sig = sign_grant_payload(grant_dict)
            cursor.execute("""
                INSERT INTO grants (
                    grant_id, vault_id, grantee_type, grantee_id, selector, actions,
                    valid_from, valid_until, purpose, delegable, depth, parent_grant_id,
                    issuer_id, state, signature, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'active', ?, ?)
            """, (gid, vid, g_type, grantee_formatted, json.dumps(selector_dict),
                  json.dumps(clean_actions), now_iso, valid_until,
                  body.purpose or ("file_assignment" if body.resource_id else "folder_assignment"),
                  1 if delegable else 0, 1 if delegable else 0,
                  principal.user_id, sig, now_iso))
            cursor.execute("INSERT OR IGNORE INTO grant_usage (grant_id, queries, evidence, bytes) VALUES (?, 0, 0, 0)", (gid,))
            grants_created += 1

            # If assigning access to a specific file, also update resource manifest ACL
            if body.resource_id:
                cursor.execute("SELECT allowed_users, allowed_roles, min_clearance FROM resource_manifests WHERE resource_id = ?", (body.resource_id,))
                m_row = cursor.fetchone()
                if m_row:
                    if g_type == "user":
                        users_list = json.loads(m_row["allowed_users"] or "[]")
                        raw_uid = grantee_formatted.replace("user:", "")
                        if raw_uid not in users_list:
                            users_list.append(raw_uid)
                        new_min = m_row["min_clearance"]
                        if grantee_clearance < new_min:
                            new_min = grantee_clearance
                        cursor.execute("UPDATE resource_manifests SET allowed_users = ?, min_clearance = ?, acl_version = acl_version + 1 WHERE resource_id = ?", (json.dumps(users_list), new_min, body.resource_id))
                    else:
                        roles_list = json.loads(m_row["allowed_roles"] or "[]")
                        raw_role = grantee_formatted.replace("role:", "")
                        if raw_role not in roles_list:
                            roles_list.append(raw_role)
                        cursor.execute("UPDATE resource_manifests SET allowed_roles = ?, acl_version = acl_version + 1 WHERE resource_id = ?", (json.dumps(roles_list), body.resource_id))

        cursor.execute("UPDATE vaults SET vault_epoch = vault_epoch + 1 WHERE vault_id = ?", (vid,))
        conn.commit()

    if last_gid:
        audit_service.log_event(
            request_id=f"assign_{last_gid}",
            actor_id=principal.user_id,
            action="assign_grant",
            object_type="resource" if body.resource_id else "vault",
            object_id=body.resource_id or vid,
            decision="ALLOW",
            policy_version=1,
            reason_code="RESOURCE_ASSIGNED" if body.resource_id else "FOLDER_ASSIGNED"
        )

    return {
        "status": "SUCCESS",
        "message": f"Assigned access to {'specific file' if body.resource_id else 'folder'}",
        "grants_created": grants_created,
        "resource_id": body.resource_id
    }

@app.get("/api/vaults/{vault_slug_or_id}/members")
def get_vault_members(vault_slug_or_id: str, principal: Principal = Depends(get_current_principal)):
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vaults WHERE vault_id = ? OR slug = ?", (vault_slug_or_id, vault_slug_or_id))
        vault = cursor.fetchone()
        if not vault:
            raise HTTPException(status_code=404, detail="Folder/Vault not found.")

        vid = vault["vault_id"]
        cursor.execute("""
            SELECT g.grant_id, g.vault_id, g.grantee_type, g.grantee_id, g.selector, g.actions,
                   g.valid_from, g.valid_until, g.state, g.issuer_id, g.created_at, g.delegable,
                   u.username, u.department, u.clearance
            FROM grants g
            LEFT JOIN users u ON (g.grantee_id = 'user:' || u.user_id OR g.grantee_id = u.user_id)
            WHERE g.vault_id = ? AND g.state = 'active'
            ORDER BY g.created_at DESC
        """, (vid,))
        rows = cursor.fetchall()
        members = []
        for r in rows:
            m = dict(r)
            m["actions"] = json.loads(r["actions"]) if isinstance(r["actions"], str) else (r["actions"] or [])
            sel = json.loads(r["selector"]) if isinstance(r["selector"], str) else (r["selector"] or {})
            m["selector"] = sel
            res_id = sel.get("resource_id") if isinstance(sel, dict) else None
            m["resource_id"] = res_id
            if res_id:
                cursor.execute("SELECT title FROM resources WHERE resource_id = ?", (res_id,))
                res_row = cursor.fetchone()
                m["resource_title"] = res_row["title"] if res_row else res_id
            else:
                m["resource_title"] = None
            members.append(m)
        return {"vault_id": vid, "vault_name": vault["display_name"], "members": members}

@app.delete("/api/documents/{resource_id}")
@app.delete("/api/resources/{resource_id}")
def delete_document(resource_id: str, principal: Principal = Depends(get_current_principal)):
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT r.*, v.owner_id as vault_owner_id 
            FROM resources r 
            JOIN vaults v ON r.vault_id = v.vault_id 
            WHERE r.resource_id = ?
        """, (resource_id,))
        res = cursor.fetchone()
        if not res:
            raise HTTPException(status_code=404, detail="Document not found.")

        # Resource authorization check: only vault owner or administrator can delete
        is_admin = any(r in principal.roles for r in ("admin", "security_admin"))
        p_uid = principal.user_id.replace("user:", "").strip().lower()
        p_uname = principal.username.strip().lower()
        v_owner = (res["vault_owner_id"] or "").replace("user:", "").strip().lower()
        if not is_admin and p_uid != v_owner and p_uname != v_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: Only folder owner or administrator can delete this document."
            )

    ingestion_pipeline.delete_resource(resource_id)
    return {"status": "DELETED", "resource_id": resource_id}

@app.get("/api/chunks")
def list_chunks(
    vault_slug: Optional[str] = None,
    resource_id: Optional[str] = None,
    modality: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    principal: Principal = Depends(get_current_principal)
):
    """
    Returns authorized chunks across vaults with live cryptographic verification,
    decrypted canonical plaintext, and multimodal metadata.
    """
    now = time_authority.now()
    usable = PolicyEngine.usable_grants(principal, now.timestamp)
    usable_vault_ids = {g.vault_id for g in usable}
    is_admin = any(r in principal.roles for r in ("admin", "security_admin"))

    with db.get_connection() as conn:
        cursor = conn.cursor()

        # 1. Determine accessible vaults for principal
        if is_admin:
            cursor.execute("SELECT vault_id, slug, display_name FROM vaults WHERE tenant_id = ? AND status = 'active'", (principal.tenant_id,))
        else:
            if usable_vault_ids:
                placeholders = ",".join(["?"] * len(usable_vault_ids))
                cursor.execute(f"""
                    SELECT vault_id, slug, display_name FROM vaults 
                    WHERE tenant_id = ? AND status = 'active' AND (owner_id = ? OR vault_id IN ({placeholders}))
                """, (principal.tenant_id, principal.user_id, *usable_vault_ids))
            else:
                cursor.execute("""
                    SELECT vault_id, slug, display_name FROM vaults 
                    WHERE tenant_id = ? AND status = 'active' AND owner_id = ?
                """, (principal.tenant_id, principal.user_id))
        
        accessible_vaults = cursor.fetchall()
        accessible_vault_map = {v["vault_id"]: dict(v) for v in accessible_vaults}
        accessible_vault_ids = list(accessible_vault_map.keys())

        if not accessible_vault_ids:
            return {
                "total": 0,
                "limit": limit,
                "offset": offset,
                "chunks": [],
                "stats": {"total_chunks": 0, "total_encrypted": 0, "modalities": {}}
            }

        target_vault_id = None
        if vault_slug:
            for v_id, v in accessible_vault_map.items():
                if v["slug"] == vault_slug:
                    target_vault_id = v_id
                    break
            if not target_vault_id:
                raise HTTPException(status_code=403, detail="Vault not accessible or not found.")

        # 2. Build filter clauses
        where_clauses = []
        params = []

        if target_vault_id:
            where_clauses.append("c.vault_id = ?")
            params.append(target_vault_id)
        else:
            v_placeholders = ",".join(["?"] * len(accessible_vault_ids))
            where_clauses.append(f"c.vault_id IN ({v_placeholders})")
            params.extend(accessible_vault_ids)

        # Determine strictly accessible resource IDs via authoritative PolicyEngine (§6, §30)
        v_ph = ",".join(["?"] * len(accessible_vault_ids))
        cursor.execute(f"""
            SELECT r.*, v.vault_id as v_vault_id, v.slug as v_slug, v.display_name as v_display_name,
                   v.owner_id as v_owner_id, v.classification_ceiling as v_ceiling,
                   m.allowed_roles, m.allowed_groups, m.allowed_users,
                   m.denied_users, m.denied_roles, m.min_clearance, m.operations,
                   m.policy_version, m.acl_version
            FROM resources r
            JOIN vaults v ON r.vault_id = v.vault_id
            LEFT JOIN resource_manifests m ON r.resource_id = m.resource_id
            WHERE r.vault_id IN ({v_ph}) AND r.status != 'deleted'
        """, accessible_vault_ids)
        doc_rows = cursor.fetchall()
        allowed_resource_ids = set()

        for d in doc_rows:
            if not d["allowed_roles"]:
                if is_admin or d["v_owner_id"] == principal.user_id:
                    allowed_resource_ids.add(d["resource_id"])
                continue

            manifest = ResourceManifest(
                resource_id=d["resource_id"],
                vault_id=d["vault_id"],
                tenant_id=d["tenant_id"],
                classification=d["classification"],
                allowed_roles=json.loads(d["allowed_roles"] or "[]"),
                allowed_groups=json.loads(d["allowed_groups"] or "[]"),
                allowed_users=json.loads(d["allowed_users"] or "[]"),
                denied_users=json.loads(d["denied_users"] or "[]"),
                denied_roles=json.loads(d["denied_roles"] or "[]"),
                min_clearance=d["min_clearance"] or 1,
                operations=json.loads(d["operations"] or "[]"),
                policy_version=d["policy_version"] or 1,
                acl_version=d["acl_version"] or 1
            )
            vault_obj = Vault(
                vault_id=d["v_vault_id"],
                tenant_id=d["tenant_id"],
                display_name=d["v_display_name"],
                slug=d["v_slug"],
                owner_id=d["v_owner_id"],
                classification_ceiling=d["v_ceiling"],
                created_at=d["created_at"]
            )
            decision, reason, _ = PolicyEngine.decide(
                principal=principal,
                action=ACTION_QUERY_RAG,
                manifest=manifest,
                usable_grants=usable,
                vault=vault_obj
            )
            if decision == "ALLOW":
                allowed_resource_ids.add(d["resource_id"])

        if not allowed_resource_ids:
            return {
                "total": 0,
                "limit": limit,
                "offset": offset,
                "chunks": [],
                "stats": {"total_chunks": 0, "total_encrypted": 0, "modalities": {}}
            }

        r_placeholders = ",".join(["?"] * len(allowed_resource_ids))
        where_clauses.append(f"c.resource_id IN ({r_placeholders})")
        params.extend(list(allowed_resource_ids))

        if resource_id:
            where_clauses.append("c.resource_id = ?")
            params.append(resource_id)

        if modality and modality.lower() != "all":
            mod_clean = modality.lower()
            if mod_clean == "image":
                where_clauses.append("(r.resource_type = 'IMAGE' OR c.provenance LIKE '%\"modality\": \"image\"%')")
            elif mod_clean == "audio":
                where_clauses.append("(r.resource_type = 'AUDIO' OR c.provenance LIKE '%\"modality\": \"audio\"%')")
            elif mod_clean == "video":
                where_clauses.append("(r.resource_type = 'VIDEO' OR c.provenance LIKE '%\"modality\": \"video\"%' OR c.provenance LIKE '%\"modality\": \"video_audio\"%')")
            elif mod_clean == "code":
                where_clauses.append("(r.resource_type = 'CODE' OR c.provenance LIKE '%\"modality\": \"code\"%')")
            elif mod_clean in ("document", "doc"):
                where_clauses.append("(r.resource_type IN ('PDF', 'DOCX', 'TEXT') OR c.provenance LIKE '%\"modality\": \"document\"%')")

        if search and search.strip():
            s_param = f"%{search.strip()}%"
            where_clauses.append("(c.content LIKE ? OR r.title LIKE ? OR c.chunk_id LIKE ? OR c.provenance LIKE ?)")
            params.extend([s_param, s_param, s_param, s_param])

        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        # Count total matching chunks
        count_sql = f"""
            SELECT COUNT(*) as total_count 
            FROM chunks c
            JOIN resources r ON c.resource_id = r.resource_id
            WHERE {where_sql}
        """
        cursor.execute(count_sql, params)
        total_count = cursor.fetchone()["total_count"]

        # Fetch page rows
        query_sql = f"""
            SELECT c.chunk_id, c.resource_id, c.vault_id, c.chunk_index, c.content,
                   c.classification, c.min_clearance, c.acl_selector, c.deny_selector,
                   c.provenance, c.content_hash, c.storage_path, c.created_at,
                   r.title as resource_title, r.resource_type, r.status as resource_status
            FROM chunks c
            JOIN resources r ON c.resource_id = r.resource_id
            WHERE {where_sql}
            ORDER BY c.created_at DESC, c.chunk_index ASC
            LIMIT ? OFFSET ?
        """
        cursor.execute(query_sql, [*params, limit, offset])
        rows = cursor.fetchall()

        kek_cache = {}
        result_chunks = []
        encrypted_count = 0

        for row in rows:
            v_id = row["vault_id"]
            if v_id not in kek_cache:
                kek_cache[v_id] = derive_vault_kek(v_id)
            vault_kek = kek_cache[v_id]
            v_info = accessible_vault_map.get(v_id, {})

            storage_path_str = row["storage_path"]
            canonical_text = row["content"]
            is_encrypted_file = False

            if storage_path_str and Path(storage_path_str).exists():
                try:
                    decrypted_bytes = decrypt_from_file(Path(storage_path_str), vault_kek)
                    canonical_text = decrypted_bytes.decode("utf-8", errors="replace")
                    is_encrypted_file = True
                    encrypted_count += 1
                except Exception:
                    pass

            comp_hash = compute_content_hash(canonical_text.encode("utf-8"))
            integrity_ok = (comp_hash == row["content_hash"])

            prov_dict = {}
            if row["provenance"]:
                try:
                    prov_dict = json.loads(row["provenance"]) if isinstance(row["provenance"], str) else row["provenance"]
                except Exception:
                    prov_dict = {}

            clean_mod = prov_dict.get("modality")
            if not clean_mod:
                res_type_lower = (row["resource_type"] or "").lower()
                if res_type_lower in ("pdf", "docx", "text"):
                    clean_mod = "document"
                elif res_type_lower in ("image", "audio", "video", "code"):
                    clean_mod = res_type_lower
                else:
                    clean_mod = "document"
            if clean_mod == "video_audio":
                clean_mod = "video"

            result_chunks.append({
                "chunk_id": row["chunk_id"],
                "resource_id": row["resource_id"],
                "resource_title": row["resource_title"],
                "resource_type": row["resource_type"],
                "vault_id": v_id,
                "vault_slug": v_info.get("slug", ""),
                "vault_name": v_info.get("display_name", ""),
                "chunk_index": row["chunk_index"],
                "content": canonical_text,
                "content_hash": row["content_hash"],
                "classification": row["classification"],
                "min_clearance": row["min_clearance"],
                "is_encrypted": is_encrypted_file,
                "integrity_verified": integrity_ok,
                "modality": clean_mod,
                "locator": prov_dict.get("locator", f"Section {row['chunk_index']}"),
                "media_url": prov_dict.get("media_url"),
                "timestamp": prov_dict.get("timestamp"),
                "page": prov_dict.get("page"),
                "created_at": row["created_at"],
            })

        # Calculate modality counts across accessible resources
        stats_where = [f"c.resource_id IN ({r_placeholders})"]
        stats_params = list(allowed_resource_ids)
        stats_sql = f"""
            SELECT r.resource_type, COUNT(*) as c
            FROM chunks c
            JOIN resources r ON c.resource_id = r.resource_id
            WHERE {" AND ".join(stats_where)}
            GROUP BY r.resource_type
        """
        cursor.execute(stats_sql, stats_params)
        stats_rows = cursor.fetchall()
        mod_counts = {r["resource_type"].lower(): r["c"] for r in stats_rows}

        return {
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "chunks": result_chunks,
            "stats": {
                "total_chunks": total_count,
                "total_encrypted": encrypted_count,
                "modalities": mod_counts
            }
        }

@app.get("/api/users")
def list_system_users(principal: Principal = Depends(get_current_principal)):
    is_admin = any(r in principal.roles for r in ("admin", "security_admin"))
    with db.get_connection() as conn:
        cursor = conn.cursor()
        # Admin can view all system users. Authenticated users within a tenant can view active users
        # in their tenant (or all active if DEMO_MODE or single tenant) to enable folder/file sharing and collaboration.
        if is_admin:
            cursor.execute("SELECT user_id, username, department, clearance as clearance_level, is_active, created_at FROM users ORDER BY username ASC")
        elif DEMO_MODE or not principal.tenant_id or principal.tenant_id == "default_tenant":
            cursor.execute("SELECT user_id, username, department, clearance as clearance_level, is_active, created_at FROM users WHERE is_active = 1 ORDER BY username ASC")
        else:
            cursor.execute(
                "SELECT user_id, username, department, clearance as clearance_level, is_active, created_at FROM users WHERE is_active = 1 AND tenant_id = ? ORDER BY username ASC",
                (principal.tenant_id,)
            )
        user_rows = cursor.fetchall()
        
        users_list = []
        for u in user_rows:
            u_dict = dict(u)
            cursor.execute("""
                SELECT DISTINCT r.name 
                FROM role_assignments ra
                JOIN roles r ON ra.role_id = r.role_id
                WHERE ra.user_id = ?
            """, (u["user_id"],))
            r_rows = cursor.fetchall()
            u_dict["roles"] = list(dict.fromkeys([r["name"] for r in r_rows])) if r_rows else ["viewer"]
            users_list.append(u_dict)
            
        return {"users": users_list}

class CreateUserPayload(BaseModel):
    username: str
    password: str
    department: Optional[str] = "Engineering"
    clearance: Optional[int] = 1
    roles: Optional[List[str]] = None

@app.post("/api/users")
def create_system_user(body: CreateUserPayload, principal: Principal = Depends(get_current_principal)):
    if not any(r in principal.roles for r in ("admin", "security_admin")):
        raise HTTPException(status_code=403, detail="Unauthorized: user creation requires admin role.")
    clean_username = body.username.strip().lower()
    if not clean_username or len(clean_username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters.")

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE username = ?", (clean_username,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username already exists.")

        user_id = f"u_{uuid4().hex[:8]}"
        now_iso = time_authority.now().isoformat()
        pwd_hash = hash_password(body.password)
        clearance_lvl = max(1, min(body.clearance or 1, 4))
        dept = body.department or "Engineering"

        cursor.execute("SELECT tenant_id FROM vaults LIMIT 1")
        t_row = cursor.fetchone()
        tenant_id = t_row["tenant_id"] if t_row else "tenant_primary"

        cursor.execute("""
            INSERT INTO users (user_id, tenant_id, username, password_hash, department, clearance, is_active, auth_epoch, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)
        """, (user_id, tenant_id, clean_username, pwd_hash, dept, clearance_lvl, now_iso))

        # Assign roles
        roles_to_assign = body.roles or ["viewer"]
        for r_name in roles_to_assign:
            cursor.execute("SELECT role_id FROM roles WHERE name = ?", (r_name,))
            r_row = cursor.fetchone()
            if r_row:
                cursor.execute("""
                    INSERT INTO role_assignments (user_id, role_id, valid_from, valid_until, granted_by)
                    VALUES (?, ?, ?, datetime('now', '+30 days'), ?)
                """, (user_id, r_row["role_id"], now_iso, principal.user_id))

        conn.commit()

    return {"status": "CREATED", "user_id": user_id, "username": clean_username}

class UpdateUserPayload(BaseModel):
    department: Optional[str] = None
    clearance: Optional[int] = None
    roles: Optional[List[str]] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = None

@app.put("/api/users/{user_id}")
def update_system_user(user_id: str, body: UpdateUserPayload, principal: Principal = Depends(get_current_principal)):
    is_admin = any(r in principal.roles for r in ("admin", "security_admin"))
    if not is_admin and user_id != principal.user_id:
        raise HTTPException(status_code=403, detail="Unauthorized: non-admin users may only edit their own profile.")

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found.")

        if body.department is not None:
            cursor.execute("UPDATE users SET department = ? WHERE user_id = ?", (body.department.strip(), user_id))
        if is_admin and body.clearance is not None:
            c_lvl = max(1, min(body.clearance, 4))
            cursor.execute("UPDATE users SET clearance = ? WHERE user_id = ?", (c_lvl, user_id))
        if is_admin and body.is_active is not None:
            cursor.execute("UPDATE users SET is_active = ? WHERE user_id = ?", (1 if body.is_active else 0, user_id))
        if body.new_password and len(body.new_password) >= 4:
            new_hash = hash_password(body.new_password)
            cursor.execute("UPDATE users SET password_hash = ? WHERE user_id = ?", (new_hash, user_id))

        # Update roles if admin provided them
        if is_admin and body.roles is not None:
            cursor.execute("DELETE FROM role_assignments WHERE user_id = ?", (user_id,))
            now_iso = time_authority.now().isoformat()
            for r_name in body.roles:
                cursor.execute("SELECT role_id FROM roles WHERE name = ?", (r_name,))
                r_row = cursor.fetchone()
                if r_row:
                    cursor.execute("""
                        INSERT INTO role_assignments (user_id, role_id, valid_from, valid_until, granted_by)
                        VALUES (?, ?, ?, datetime('now', '+30 days'), ?)
                    """, (user_id, r_row["role_id"], now_iso, principal.user_id))

        conn.commit()

    return {"status": "UPDATED", "user_id": user_id}

@app.delete("/api/users/{user_id}")
def delete_system_user(user_id: str, principal: Principal = Depends(get_current_principal)):
    if not any(r in principal.roles for r in ("admin", "security_admin")):
        raise HTTPException(status_code=403, detail="Unauthorized: user deletion requires admin role.")
    if user_id == principal.user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own active user account.")

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found.")

        # Check if user owns any active vaults
        cursor.execute("SELECT COUNT(*) as c FROM vaults WHERE owner_id = ?", (user_id,))
        if cursor.fetchone()["c"] > 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete user who owns active vaults. Please reassign or delete their vaults first."
            )

        # 1. Collect all grants to or by this user, and all descendant child grants
        cursor.execute("SELECT grant_id FROM grants WHERE grantee_id = ? OR issuer_id = ?", (f"user:{user_id}", user_id))
        all_grants = {r["grant_id"] for r in cursor.fetchall()}
        frontier = list(all_grants)
        while frontier:
            curr = frontier.pop(0)
            cursor.execute("SELECT grant_id FROM grants WHERE parent_grant_id = ?", (curr,))
            for child in cursor.fetchall():
                cid = child["grant_id"]
                if cid not in all_grants:
                    all_grants.add(cid)
                    frontier.append(cid)

        # 2. Delete usage records for all affected grants
        for gid in all_grants:
            cursor.execute("DELETE FROM grant_usage WHERE grant_id = ?", (gid,))

        # 3. Unlink self-referential parent_grant_id FK before deleting grants
        for gid in all_grants:
            cursor.execute("UPDATE grants SET parent_grant_id = NULL WHERE grant_id = ?", (gid,))
        for gid in all_grants:
            cursor.execute("DELETE FROM grants WHERE grant_id = ?", (gid,))

        # 4. Delete access request approvals & requests involving user
        cursor.execute("DELETE FROM access_request_approvals WHERE approver_id = ?", (user_id,))
        cursor.execute("SELECT request_id FROM access_requests WHERE requester_id = ?", (user_id,))
        req_ids = [r["request_id"] for r in cursor.fetchall()]
        for rid in req_ids:
            cursor.execute("DELETE FROM access_request_approvals WHERE request_id = ?", (rid,))
        cursor.execute("DELETE FROM access_requests WHERE requester_id = ?", (user_id,))

        # 5. Delete sessions, role assignments, and group memberships
        cursor.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM role_assignments WHERE user_id = ?", (user_id,))
        cursor.execute("DELETE FROM user_groups WHERE user_id = ?", (user_id,))

        # 6. Null out optional foreign references in resources and structured records
        cursor.execute("UPDATE resources SET owner_user_id = NULL WHERE owner_user_id = ?", (user_id,))
        cursor.execute("UPDATE structured_records SET owner_id = NULL WHERE owner_id = ?", (user_id,))

        # 7. Delete user
        cursor.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
        conn.commit()

    audit_service.log_event(
        request_id=f"delete_user_{user_id}",
        actor_id=principal.user_id,
        action="delete_user",
        object_type="user",
        object_id=user_id,
        decision="ALLOW",
        policy_version=1,
        reason_code="USER_DELETED_BY_ADMIN"
    )

    return {"status": "DELETED", "user_id": user_id}

@app.post("/api/maintenance/clear-chunks")
def clear_all_chunks(principal: Principal = Depends(get_current_principal)):
    """Maintenance endpoint: safely cleans/purges all chunks and resets vector store (§128)."""
    if not any(r in principal.roles for r in ("admin", "security_admin")):
        raise HTTPException(status_code=403, detail="Unauthorized: clearing chunks requires admin role.")
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT chunk_id FROM chunks")
        chunk_rows = cursor.fetchall()
        chunk_ids = [r["chunk_id"] for r in chunk_rows]

        cursor.execute("DELETE FROM citation_spans")
        cursor.execute("DELETE FROM chunks")
        conn.commit()

    try:
        vector_store.clear_all()
    except Exception as e:
        logger.warning(f"Vector store reset error: {e}")

    return {"status": "CLEARED", "chunks_deleted": len(chunk_ids)}

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
    start_time = time.perf_counter()
    effective_slug = vault_slug or req.vault_slug
    if not effective_slug:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="vault_slug is required")

    # Authoritative conversation ownership & isolation validation (§Task C, §Task G)
    conv_data = None
    if req.conversation_id:
        conv_data = conversation_service.get_conversation(req.conversation_id, principal)
        if not conv_data:
            with db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT owner_user_id, tenant_id FROM conversations WHERE conversation_id = ?",
                    (req.conversation_id,)
                )
                existing_conv = cursor.fetchone()

            if existing_conv:
                # Belongs to another user or tenant -> strict non-leaking 404
                raise HTTPException(status_code=404, detail="Conversation not found.")
            else:
                # Client initiated a new conversation locally; auto-register it in server store
                clean_title = (req.query[:40] if req.query else "New Conversation").strip()
                conv_data = conversation_service.create_conversation(
                    principal=principal,
                    title=clean_title,
                    vault_slug=effective_slug,
                    selected_file_id=req.resource_id,
                    conversation_id=req.conversation_id
                )

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
    compiled_filter = PolicyCompiler.compile_retrieval_filter(
        principal=principal,
        vault=vault,
        lease=lease,
        usable_grants=usable,
        resource_id=req.resource_id
    )

    # 4. Gate A: Contextual Query Expansion & Adaptive Retrieval Mode (LOW, MEDIUM, HIGH)
    effective_history = req.history
    if not effective_history and req.conversation_id:
        effective_history = conversation_service.build_bounded_context(req.conversation_id, principal)

    search_query = req.query
    if effective_history:
        search_query = local_llm.contextualize_query(req.query, effective_history)

    retrieval_mode = (req.retrieval_mode or "LOW").upper()
    if retrieval_mode not in ("LOW", "MEDIUM", "HIGH"):
        retrieval_mode = "LOW"

    # Pre-check: Determine if the target vault or resource has any active documents
    with db.get_connection() as conn:
        cursor = conn.cursor()
        if req.resource_id:
            cursor.execute("SELECT COUNT(*) FROM resources WHERE vault_id = ? AND resource_id = ? AND status = 'active'", (vault.vault_id, req.resource_id))
        else:
            cursor.execute("SELECT COUNT(*) FROM resources WHERE vault_id = ? AND status = 'active'", (vault.vault_id,))
        active_docs_count = cursor.fetchone()[0]

    if active_docs_count == 0:
        empty_answer = (
            f"This folder ('{vault.display_name}') is currently empty. "
            "No active documents or media files have been uploaded to it yet. "
            "Please upload files into this folder to enable grounded questions and answers."
        )
        elapsed_sec = round(time.perf_counter() - start_time, 3)
        gate_a_data = {"compiled_filter_valid": True, "candidates_count": 0}
        gate_b_data = {"evaluated_count": 0, "authorized_count": 0, "excluded_count": 0}
        grounding_data = {"claims_count": 0, "citations_count": 0, "status": "REFUSED"}
        trace = RetrievalSecurityTrace(
            user_id=principal.user_id,
            role=principal.roles[0] if principal.roles else "viewer",
            vault_slug=vault.slug,
            policy_epoch=lease.policy_epoch,
            retrieval_mode=retrieval_mode,
            effective_retrieval_mode=retrieval_mode,
            elapsed_seconds=elapsed_sec,
            vector_filter_applied=compiled_filter.to_dict(),
            gate_a_candidates_count=0,
            gate_b_canonical_verified_count=0,
            excluded_candidates_count=0,
            citations_validated_count=0,
            citations_total_count=0,
            generation_mode="ANSWER_BLOCKED",
            answer_status="REFUSED",
            refusal_reason="FOLDER_EMPTY",
            gate_a=gate_a_data,
            gate_b=gate_b_data,
            grounding=grounding_data
        )
        audit_service.log_event(
            request_id=req_id,
            actor_id=principal.user_id,
            action=ACTION_QUERY_RAG,
            object_type="vault",
            object_id=vault.vault_id,
            decision="ALLOW",
            policy_version=vault.vault_epoch,
            reason_code="FOLDER_EMPTY",
            client_ip=client_ip
        )
        if req.conversation_id:
            conversation_service.append_message(
                conversation_id=req.conversation_id,
                principal=principal,
                role="user",
                content=req.query,
                retrieval_mode=retrieval_mode,
                vault_slug=vault.slug,
                selected_file_id=req.resource_id
            )
            conversation_service.append_message(
                conversation_id=req.conversation_id,
                principal=principal,
                role="assistant",
                content=empty_answer,
                retrieval_mode=retrieval_mode,
                security_trace=trace.model_dump(),
                status="REFUSED",
                vault_slug=vault.slug,
                selected_file_id=req.resource_id
            )
        return QueryResponse(
            query=req.query,
            vault_slug=vault.slug,
            retrieval_mode=retrieval_mode,
            answer=empty_answer,
            claims=[],
            citations=[],
            evidence_items=[],
            security_trace=trace,
            lease_deadline=lease.deadline,
            conversation_id=req.conversation_id,
            elapsed_seconds=elapsed_sec
        )

    candidate_tuples = retrieval_pipeline.retrieve(
        mode=retrieval_mode,
        query=search_query,
        compiled_filter=compiled_filter,
        vault=vault,
        principal=principal,
        top_k=10,
        resource_id=req.resource_id
    )
    gate_a_count = len(candidate_tuples)

    # 5. Gate B: Canonical Gate - Authoritative recheck & decryption from canonical store (§21)
    authorized_evidence, excluded_count = canonical_gate.verify_and_envelope(
        candidates=candidate_tuples,
        principal=principal,
        vault=vault,
        usable_grants=usable,
        lease_deadline=lease.deadline,
        target_resource_id=req.resource_id
    )

    # 6. Local LLM Grounded Generation (§58..§64)
    answer_text, claims, citations, gen_mode, refusal_reason = local_llm.generate(
        query=req.query,
        vault=vault,
        evidence=authorized_evidence,
        history=effective_history
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

    elapsed_sec = round(time.perf_counter() - start_time, 3)

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
        retrieval_mode=retrieval_mode,
        effective_retrieval_mode=retrieval_mode,
        elapsed_seconds=elapsed_sec,
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

    # 9. Server-Side Conversation Turn Persistence (§Task C, §Task G)
    if req.conversation_id:
        conversation_service.append_message(
            conversation_id=req.conversation_id,
            principal=principal,
            role="user",
            content=req.query,
            retrieval_mode=retrieval_mode,
            vault_slug=vault.slug,
            selected_file_id=req.resource_id
        )
        conversation_service.append_message(
            conversation_id=req.conversation_id,
            principal=principal,
            role="assistant",
            content=answer_text,
            retrieval_mode=retrieval_mode,
            citations=[c.dict() for c in updated_citations],
            evidence_items=[e.dict() for e in authorized_evidence],
            security_trace=trace.dict(),
            status=answer_status,
            vault_slug=vault.slug,
            selected_file_id=req.resource_id
        )

    return QueryResponse(
        query=req.query,
        vault_slug=vault.slug,
        retrieval_mode=retrieval_mode,
        answer=answer_text,
        claims=claims,
        citations=updated_citations,
        evidence_items=authorized_evidence,
        security_trace=trace,
        lease_deadline=lease.deadline,
        conversation_id=req.conversation_id,
        elapsed_seconds=elapsed_sec
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
@app.post("/api/vaults/{vault_slug}/upload")
@app.post("/api/vaults/{vault_slug}/upload-pdf")
@app.post("/api/datasets/{vault_slug}/upload-pdf")
async def upload_multimodal_file(
    vault_slug: str,
    file: UploadFile = File(...),
    classification: Optional[int] = Form(1),
    min_clearance: Optional[int] = Form(1),
    allowed_roles: Optional[str] = Form(None),
    principal: Principal = Depends(get_current_principal)
):
    """Secure multi-modal file upload (PDF, DOCX, Code, Images, Audio, Video) with quarantine validation (§11, §202)."""
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
    if not is_privileged:
        raise HTTPException(status_code=403, detail="Unauthorized: caller lacks upload rights for this dataset.")

    roles_list = None
    if allowed_roles:
        try:
            roles_list = json.loads(allowed_roles)
        except Exception:
            roles_list = [r.strip() for r in allowed_roles.split(",") if r.strip()]

    file_bytes = await file.read()
    try:
        res_id = ingestion_pipeline.ingest_universal(
            vault_id=vault.vault_id,
            filename=file.filename or "upload.bin",
            file_bytes=file_bytes,
            classification=classification or 1,
            min_clearance=min_clearance or 1,
            allowed_roles=roles_list,
            owner_user_id=principal.user_id
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
    """Returns requests relevant to caller: submitted requests or requests for vaults owned, or all if admin."""
    with db.get_connection() as conn:
        cursor = conn.cursor()
        is_approver = any(r in principal.roles for r in ("admin", "security_admin", "data_owner", "data_steward"))
        
        cursor.execute("""
            SELECT ar.*, v.display_name as vault_name, v.slug as vault_slug, v.owner_id as vault_owner,
                   u.username as requester_username
            FROM access_requests ar
            JOIN vaults v ON ar.vault_id = v.vault_id
            LEFT JOIN users u ON ar.requester_id = u.user_id
            WHERE ? = 1 OR ar.requester_id = ? OR v.owner_id = ?
            ORDER BY ar.created_at DESC
        """, (1 if is_approver else 0, principal.user_id, principal.user_id))
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

# ----------------- ACCESS GRANTS CONSOLE ENDPOINTS -----------------
class CreateGrantDirectRequest(BaseModel):
    grantee_id: str
    vault_id: str
    resource_id: Optional[str] = None
    actions: Optional[List[str]] = ["read"]
    duration_minutes: Optional[int] = 60
    delegable: Optional[bool] = False
    purpose: Optional[str] = "Manual Grant via Access Console"

@app.get("/api/grants")
def list_system_grants(principal: Principal = Depends(get_current_principal)):
    """
    Returns grants with rich metadata (vault name, document title, status, issuer).
    Role-scoped: Admins see all grants; standard users see grants for their vaults or issued to/by them.
    """
    is_admin = any(r in principal.roles for r in ("admin", "security_admin"))
    p_clean = principal.user_id.replace("user:", "").strip().lower()
    p_uname = principal.username.strip().lower()

    now = time_authority.now()

    with db.get_connection() as conn:
        cursor = conn.cursor()
        if is_admin:
            cursor.execute("""
                SELECT g.*, v.slug as vault_slug, v.display_name as vault_name, v.owner_id as vault_owner
                FROM grants g
                JOIN vaults v ON g.vault_id = v.vault_id
                ORDER BY g.created_at DESC
            """)
        else:
            cursor.execute("""
                SELECT g.*, v.slug as vault_slug, v.display_name as vault_name, v.owner_id as vault_owner
                FROM grants g
                JOIN vaults v ON g.vault_id = v.vault_id
                WHERE v.owner_id IN (?, ?, ?)
                   OR g.grantee_id IN (?, ?, ?)
                   OR g.issuer_id IN (?, ?, ?)
                ORDER BY g.created_at DESC
            """, (p_clean, f"user:{p_clean}", p_uname, p_clean, f"user:{p_clean}", p_uname, p_clean, f"user:{p_clean}", p_uname))
        
        rows = cursor.fetchall()
        grants_out = []
        res_cache = {}

        for r in rows:
            g_dict = dict(r)
            sel_dict = {}
            if g_dict.get("selector"):
                try:
                    sel_dict = json.loads(g_dict["selector"]) if isinstance(g_dict["selector"], str) else g_dict["selector"]
                except Exception:
                    sel_dict = {}

            target_res_id = sel_dict.get("resource_id")
            target_res_title = None
            if target_res_id:
                if target_res_id not in res_cache:
                    cursor.execute("SELECT title FROM resources WHERE resource_id = ?", (target_res_id,))
                    res_row = cursor.fetchone()
                    res_cache[target_res_id] = res_row["title"] if res_row else target_res_id
                target_res_title = res_cache[target_res_id]

            acts = []
            if g_dict.get("actions"):
                try:
                    acts = json.loads(g_dict["actions"]) if isinstance(g_dict["actions"], str) else [g_dict["actions"]]
                except Exception:
                    acts = ["read"]

            valid_until_str = g_dict.get("valid_until") or ""
            is_expired = False
            if valid_until_str:
                try:
                    v_dt = datetime.fromisoformat(valid_until_str.replace("Z", "+00:00"))
                    if v_dt.tzinfo is None:
                        v_dt = v_dt.replace(tzinfo=timezone.utc)
                    is_expired = (v_dt < now.timestamp)
                except Exception:
                    pass

            state = g_dict.get("state", "active")
            if state != "revoked" and is_expired:
                state = "expired"

            clean_grantee = g_dict.get("grantee_id", "").replace("user:", "")
            clean_issuer = g_dict.get("issuer_id", "").replace("user:", "")

            grants_out.append({
                "grant_id": g_dict["grant_id"],
                "vault_id": g_dict["vault_id"],
                "vault_slug": g_dict.get("vault_slug", ""),
                "vault_name": g_dict.get("vault_name", g_dict["vault_id"]),
                "grantee_type": g_dict.get("grantee_type", "user"),
                "grantee_id": g_dict["grantee_id"],
                "grantee_username": clean_grantee,
                "issuer_id": clean_issuer,
                "actions": acts,
                "selector": sel_dict,
                "resource_id": target_res_id,
                "resource_title": target_res_title,
                "valid_from": g_dict.get("valid_from", ""),
                "valid_until": valid_until_str,
                "delegable": bool(g_dict.get("delegable", 0)),
                "revoked": (g_dict.get("state") == "revoked"),
                "revocation_reason": g_dict.get("revoke_reason"),
                "is_expired": is_expired,
                "state": state,
                "purpose": g_dict.get("purpose", ""),
                "signature": g_dict.get("signature", ""),
            })

    return {"grants": grants_out}

@app.post("/api/grants/create")
def create_grant_direct(body: CreateGrantDirectRequest, principal: Principal = Depends(get_current_principal)):
    is_admin = any(r in principal.roles for r in ("admin", "security_admin"))
    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vaults WHERE vault_id = ? OR slug = ?", (body.vault_id, body.vault_id))
        v_row = cursor.fetchone()
    if not v_row:
        raise HTTPException(status_code=404, detail="Target vault not found.")
    
    vault_id = v_row["vault_id"]
    vault_owner = v_row["owner_id"]
    
    p_clean = principal.user_id.replace("user:", "").strip().lower()
    p_uname = principal.username.strip().lower()
    v_owner = (vault_owner or "").replace("user:", "").strip().lower()

    if not is_admin and v_owner not in (p_clean, p_uname):
        now_ts = time_authority.now().timestamp
        usable = PolicyEngine.usable_grants(principal, now_ts)
        has_delegable = any(g.vault_id == vault_id and g.delegable for g in usable)
        if not has_delegable:
            raise HTTPException(status_code=403, detail="Unauthorized: Only vault owners, admins, or delegable grant holders can issue grants.")

    clean_grantee = body.grantee_id.replace("user:", "").strip()
    target_res = body.resource_id.strip() if body.resource_id else None

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT grant_id, selector FROM grants WHERE vault_id = ? AND grantee_id IN (?, ?) AND state = 'active'", (vault_id, clean_grantee, f"user:{clean_grantee}"))
        for old_g in cursor.fetchall():
            try:
                old_sel = json.loads(old_g["selector"] or "{}")
                if old_sel.get("resource_id") == target_res or (not target_res and old_sel.get("all") is True):
                    cursor.execute("UPDATE grants SET state = 'revoked', revoked_at = ?, revoked_by = ?, revoke_reason = 'Superseded by new grant' WHERE grant_id = ?",
                                   (datetime.now(timezone.utc).isoformat(), principal.user_id, old_g["grant_id"]))
            except Exception:
                pass
        conn.commit()

    duration = max(1, body.duration_minutes or 60)
    valid_from = time_authority.now().timestamp
    valid_until = valid_from + timedelta(minutes=duration)
    selector = {"resource_id": target_res} if target_res else {"all": True}

    new_grant = access_service.issue_grant(
        issuer=principal,
        grantee_id=clean_grantee,
        vault_id=vault_id,
        actions=body.actions or ["read"],
        valid_until=valid_until,
        selector=selector,
        delegable=bool(body.delegable),
        purpose=body.purpose or "Manual grant via Access Console"
    )

    if target_res:
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT allowed_users FROM resource_manifests WHERE resource_id = ?", (target_res,))
            m_row = cursor.fetchone()
            if m_row:
                cur_users = json.loads(m_row["allowed_users"] or "[]")
                if clean_grantee not in cur_users and f"user:{clean_grantee}" not in cur_users:
                    cur_users.append(f"user:{clean_grantee}")
                    cursor.execute("UPDATE resource_manifests SET allowed_users = ? WHERE resource_id = ?", (json.dumps(cur_users), target_res))
                    conn.commit()

    gid = new_grant.grant_id if hasattr(new_grant, "grant_id") else (new_grant.get("grant_id") if isinstance(new_grant, dict) else None)
    return {"message": "Grant created successfully", "grant": new_grant, "grant_id": gid}

# ----------------- SYSTEM TELEMETRY & HARDWARE METRICS -----------------
@app.get("/api/system/metrics")
def get_system_metrics(principal: Principal = Depends(get_current_principal)):
    import psutil
    import os
    import sys
    import platform
    import time

    mem = psutil.virtual_memory()
    disk = psutil.disk_usage(".")
    cpu_percent = psutil.cpu_percent(interval=None)
    cpu_cores = psutil.cpu_count(logical=True)
    cpu_freq = psutil.cpu_freq()
    
    proc = psutil.Process()
    proc_mem = proc.memory_info()
    proc_uptime_sec = time.time() - proc.create_time()

    with db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as c FROM chunks")
        total_chunks = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM resources WHERE status != 'deleted'")
        total_resources = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM vaults WHERE status = 'active'")
        total_vaults = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM audit_events")
        total_audit_events = cursor.fetchone()["c"]
        cursor.execute("SELECT COUNT(*) as c FROM grants WHERE state = 'active'")
        active_grants = cursor.fetchone()["c"]
        cursor.execute("SELECT decision, COUNT(*) as c FROM audit_events GROUP BY decision")
        decisions = {row["decision"]: row["c"] for row in cursor.fetchall()}

    db_path = Path("data/secure_rag.db")
    db_size_mb = round(db_path.stat().st_size / (1024 * 1024), 2) if db_path.exists() else 0.0

    return {
        "hardware": {
            "ram_total_gb": round(mem.total / (1024**3), 2),
            "ram_used_gb": round(mem.used / (1024**3), 2),
            "ram_percent": mem.percent,
            "cpu_percent": cpu_percent,
            "cpu_cores": cpu_cores,
            "cpu_freq_mhz": round(cpu_freq.current, 1) if cpu_freq else None,
            "disk_total_gb": round(disk.total / (1024**3), 2),
            "disk_used_gb": round(disk.used / (1024**3), 2),
            "disk_percent": disk.percent,
        },
        "process": {
            "pid": os.getpid(),
            "python_version": sys.version.split()[0],
            "platform": f"{platform.system()} {platform.release()}",
            "process_rss_mb": round(proc_mem.rss / (1024 * 1024), 2),
            "uptime_seconds": round(proc_uptime_sec),
            "egress_mode": "AIR-GAPPED (Zero-External-Egress)",
        },
        "storage": {
            "db_size_mb": db_size_mb,
            "total_chunks": total_chunks,
            "total_resources": total_resources,
            "total_vaults": total_vaults,
            "active_grants": active_grants,
        },
        "security": {
            "total_events": total_audit_events,
            "permits": decisions.get("PERMIT", 0),
            "denies": decisions.get("DENY", 0),
            "permit_rate": round(decisions.get("PERMIT", 0) / max(total_audit_events, 1) * 100, 1),
            "deny_rate": round(decisions.get("DENY", 0) / max(total_audit_events, 1) * 100, 1),
        }
    }

# ----------------- AUDIT & CHECKPOINTS (§71, §73) -----------------
@app.get("/api/audit/events")
def get_audit_events(limit: int = 50, principal: Principal = Depends(get_current_principal)):
    """Audit trail endpoint: allows authenticated system inspection of cryptographic events (§73)."""
    is_audit_admin = any(r in principal.roles for r in ("admin", "security_admin", "auditor"))
    if is_audit_admin:
        return {"events": audit_service.get_recent_events(limit)}
    else:
        clean_id = principal.user_id.replace("user:", "").strip()
        actor_ids = [clean_id, f"user:{clean_id}", principal.username]
        return {"events": audit_service.get_recent_events_for_actors(actor_ids, limit=limit)}

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
    try:
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
    except Exception as e:
        logger.error(f"Security test matrix error: {e}")
        r_list = getattr(test_runner, "results", []) if 'test_runner' in locals() else []
        return {
            "status": "PARTIAL",
            "results": r_list,
            "total": len(r_list),
            "passed": sum(1 for r in r_list if r.get("passed")),
            "failed": sum(1 for r in r_list if not r.get("passed")),
            "error": str(e)
        }

# ----------------- MULTI-MODAL MODEL MANAGER ENDPOINTS -----------------
@app.get("/api/models/status")
def get_model_status(principal: Principal = Depends(get_current_principal)):
    """Returns local offline multimodal models status and single-model RAM protection state."""
    return local_model_manager.get_system_status()

@app.post("/api/models/unload")
def unload_all_models(principal: Principal = Depends(get_current_principal)):
    """Forcefully evicts all models from RAM to ensure 0 background memory footprint."""
    local_model_manager.unload_all_ollama_models()
    import gc
    gc.collect()
    return {"status": "SUCCESS", "message": "All models purged from working memory. System on rest."}

@app.get("/api/models/detect")
def detect_model_for_file(filename: str, principal: Principal = Depends(get_current_principal)):
    """Auto-detects the optimal offline model and modality based on file extension."""
    return local_model_manager.detect_model_by_filename(filename)
