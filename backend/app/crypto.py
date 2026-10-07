import os
import json
import base64
import hashlib
from typing import Tuple, Dict, Any
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization

from .config import DATA_DIR

# Master KEK (derived or loaded from secure storage)
MASTER_KEY_HEX = os.getenv("MASTER_KEK", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
MASTER_KEK = bytes.fromhex(MASTER_KEY_HEX)

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

def sign_data(data: bytes) -> bytes:
    """Signs bytes using the Ed25519 private key."""
    return _signing_private_key.sign(data)

def verify_signature(public_key_bytes: bytes, data: bytes, signature: bytes) -> bool:
    """Verifies Ed25519 signature."""
    try:
        pub = ed25519.Ed25519PublicKey.from_public_bytes(public_key_bytes)
        pub.verify(signature, data)
        return True
    except Exception:
        return False

def sign_grant_payload(grant_dict: Dict[str, Any]) -> str:
    """Canonicalize grant dictionary and produce base64 Ed25519 signature."""
    canonical_bytes = json.dumps(grant_dict, sort_keys=True, separators=(",", ":")).encode("utf-8")
    sig = sign_data(canonical_bytes)
    return base64.b64encode(sig).decode("utf-8")

def verify_grant_signature(grant_dict: Dict[str, Any], sig_b64: str) -> bool:
    try:
        canonical_bytes = json.dumps(grant_dict, sort_keys=True, separators=(",", ":")).encode("utf-8")
        sig = base64.b64decode(sig_b64)
        return verify_signature(get_system_public_key_bytes(), canonical_bytes, sig)
    except Exception:
        return False

# AES-256-GCM Vault Data Encryption
def derive_vault_kek(vault_id: str) -> bytes:
    """Derive Vault KEK from Master KEK and Vault ID using HKDF-like SHA256 construction."""
    return hashlib.sha256(MASTER_KEK + vault_id.encode("utf-8")).digest()

def encrypt_blob(plaintext: bytes, key: bytes) -> Tuple[bytes, bytes]:
    """Encrypts data using AES-256-GCM returning (nonce, ciphertext_with_tag)."""
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    return nonce, ciphertext

def decrypt_blob(nonce: bytes, ciphertext: bytes, key: bytes) -> bytes:
    """Decrypts AES-256-GCM ciphertext."""
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None)

def compute_content_hash(data: bytes) -> str:
    """SHA-256 content hash."""
    return hashlib.sha256(data).hexdigest()

def compute_audit_hash(prev_hash: str, canonical_event_json: str) -> str:
    """Hash chain computation: H(n) = SHA256(H(n-1) || canonical_event_json)."""
    data = f"{prev_hash}||{canonical_event_json}".encode("utf-8")
    return hashlib.sha256(data).hexdigest()
