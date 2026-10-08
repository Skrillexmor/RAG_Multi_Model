import os
import json
import base64
import hashlib
from pathlib import Path
from typing import Tuple, Dict, Any, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .config import DATA_DIR, MASTER_KEK_HEX

# Load or generate Master Key
MASTER_KEK = bytes.fromhex(MASTER_KEK_HEX)

# Argon2id Password Hasher (OWASP recommended)
try:
    from argon2 import PasswordHasher
    from argon2.exceptions import VerifyMismatchError
    _ph = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=1, hash_len=32, salt_len=16)
    def hash_password(password: str) -> str:
        return _ph.hash(password)
    def verify_password(password_hash: str, password: str) -> bool:
        try:
            return _ph.verify(password_hash, password)
        except Exception:
            return False
except ImportError:
    # Scrypt fallback if argon2-cffi unavailable
    def hash_password(password: str) -> str:
        salt = os.urandom(16)
        dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
        return f"scrypt${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"
    def verify_password(password_hash: str, password: str) -> bool:
        try:
            parts = password_hash.split("$")
            if len(parts) != 3 or parts[0] != "scrypt":
                return False
            salt = base64.b64decode(parts[1])
            expected_dk = base64.b64decode(parts[2])
            actual_dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1)
            return hashlib.sha256(expected_dk).digest() == hashlib.sha256(actual_dk).digest()
        except Exception:
            return False

# Persistent Ed25519 System Signing Keypair for Grants & Audits
_KEY_FILE = DATA_DIR / "system_ed25519_key.pem"
if _KEY_FILE.exists():
    with open(_KEY_FILE, "rb") as f:
        _signing_private_key = serialization.load_pem_private_key(f.read(), password=None)
else:
    _signing_private_key = ed25519.Ed25519PrivateKey.generate()
    with open(_KEY_FILE, "wb") as f:
        f.write(_signing_private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ))

_signing_public_key = _signing_private_key.public_key()

def get_system_public_key_bytes() -> bytes:
    return _signing_public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )

def get_system_public_key_hex() -> str:
    return get_system_public_key_bytes().hex()

def sign_data(data: bytes) -> bytes:
    """Signs bytes using the Ed25519 private key."""
    return _signing_private_key.sign(data)

def verify_signature(public_key_bytes: bytes, data: bytes, signature: bytes) -> bool:
    """Verifies Ed25519 signature fail-closed."""
    try:
        pub = ed25519.Ed25519PublicKey.from_public_bytes(public_key_bytes)
        pub.verify(signature, data)
        return True
    except Exception:
        return False

# Standard RFC 5869 HKDF Key Derivation with domain separation (§101)
def derive_key(purpose: str, salt: bytes, context_info: str, length: int = 32) -> bytes:
    """
    Standard HKDF derivation with strict domain separation:
    - DATA_ENCRYPTION
    - GRANT_SIGNING
    - BUNDLE_ENCRYPTION
    - AUDIT_CHECKPOINT
    """
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=length,
        salt=salt,
        info=f"{purpose}:{context_info}".encode("utf-8")
    )
    return hkdf.derive(MASTER_KEK)

def derive_vault_kek(vault_id: str) -> bytes:
    """Derives Vault Key Encryption Key via standard HKDF."""
    return derive_key(
        purpose="DATA_ENCRYPTION",
        salt=b"dars_vault_kek_salt_v1",
        context_info=f"vault:{vault_id}"
    )

# AES-256-GCM Blob & File Encryption (§3.5, §100)
def encrypt_blob(plaintext: bytes, key: bytes) -> Tuple[bytes, bytes]:
    """Encrypts data using AES-256-GCM returning (12-byte nonce, ciphertext_with_tag)."""
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return nonce, ciphertext

def decrypt_blob(nonce: bytes, ciphertext: bytes, key: bytes) -> bytes:
    """Decrypts AES-256-GCM ciphertext fail-closed."""
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None)

def encrypt_to_file(plaintext: bytes, target_path: Path, key: bytes) -> str:
    """Encrypts plaintext with AES-256-GCM and writes binary [nonce(12)][ciphertext] to disk."""
    nonce, ct = encrypt_blob(plaintext, key)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "wb") as f:
        f.write(nonce + ct)
    return compute_content_hash(plaintext)

def decrypt_from_file(source_path: Path, key: bytes) -> bytes:
    """Reads [nonce(12)][ciphertext] from disk and decrypts via AES-256-GCM."""
    if not source_path.exists():
        raise FileNotFoundError(f"Encrypted canonical file not found: {source_path}")
    with open(source_path, "rb") as f:
        data = f.read()
    if len(data) < 28:  # 12 nonce + 16 auth tag minimum
        raise ValueError("Corrupt ciphertext file")
    nonce = data[:12]
    ciphertext = data[12:]
    return decrypt_blob(nonce, ciphertext, key)

def compute_content_hash(data: bytes) -> str:
    """SHA-256 content hash."""
    return hashlib.sha256(data).hexdigest()

def compute_audit_hash(prev_hash: str, canonical_event_json: str) -> str:
    """Hash chain computation: H(n) = SHA256(H(n-1) || canonical_event_json)."""
    data = f"{prev_hash}||{canonical_event_json}".encode("utf-8")
    return hashlib.sha256(data).hexdigest()

def sign_grant_payload(grant_dict: Dict[str, Any]) -> str:
    """
    Signs complete canonical grant claims covering all mutable and security-critical fields (§35, §36):
    actions, selector, delegable, depth, parent_grant_id, issuer_id, valid_from, valid_until, purpose, etc.
    """
    security_fields = {
        "grant_id": grant_dict.get("grant_id"),
        "vault_id": grant_dict.get("vault_id"),
        "grantee_type": grant_dict.get("grantee_type"),
        "grantee_id": grant_dict.get("grantee_id"),
        "selector": grant_dict.get("selector"),
        "actions": sorted(grant_dict.get("actions", [])),
        "valid_from": grant_dict.get("valid_from"),
        "valid_until": grant_dict.get("valid_until"),
        "purpose": grant_dict.get("purpose"),
        "delegable": bool(grant_dict.get("delegable", False)),
        "depth": grant_dict.get("depth", 0),
        "parent_grant_id": grant_dict.get("parent_grant_id"),
        "issuer_id": grant_dict.get("issuer_id")
    }
    canonical_bytes = json.dumps(security_fields, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = sign_data(canonical_bytes)
    return base64.b64encode(sig).decode("utf-8")

def verify_grant_signature(grant_dict: Dict[str, Any], sig_b64: str) -> bool:
    """Verifies that the grant signature matches the full canonical claims dictionary."""
    try:
        security_fields = {
            "grant_id": grant_dict.get("grant_id"),
            "vault_id": grant_dict.get("vault_id"),
            "grantee_type": grant_dict.get("grantee_type"),
            "grantee_id": grant_dict.get("grantee_id"),
            "selector": grant_dict.get("selector"),
            "actions": sorted(grant_dict.get("actions", [])),
            "valid_from": grant_dict.get("valid_from"),
            "valid_until": grant_dict.get("valid_until"),
            "purpose": grant_dict.get("purpose"),
            "delegable": bool(grant_dict.get("delegable", False)),
            "depth": grant_dict.get("depth", 0),
            "parent_grant_id": grant_dict.get("parent_grant_id"),
            "issuer_id": grant_dict.get("issuer_id")
        }
        canonical_bytes = json.dumps(security_fields, sort_keys=True, separators=(",", ":")).encode("utf-8")
        sig = base64.b64decode(sig_b64)
        return verify_signature(get_system_public_key_bytes(), canonical_bytes, sig)
    except Exception:
        return False
