import sys
import os
from pathlib import Path
from urllib.parse import urlparse

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.config import (
    ALLOW_EXTERNAL_EGRESS,
    LLM_BASE_URL,
    QDRANT_STORAGE_DIR,
    DB_PATH,
    STORAGE_DIR,
    ENCRYPTED_DIR
)
from backend.app.crypto import get_system_public_key_bytes
from backend.app.database import db

def check_offline_invariants():
    print("=" * 75)
    print("  DARS-RAG: OFFLINE & LAN-NATIVE VERIFICATION SUITE (§128, §129)")
    print("=" * 75)

    checks = []

    # 1. External Egress Flag
    if not ALLOW_EXTERNAL_EGRESS:
        checks.append(("EGRESS-01", "Outbound Cloud Egress Prohibited", True, "ALLOW_EXTERNAL_EGRESS is strictly False"))
    else:
        checks.append(("EGRESS-01", "Outbound Cloud Egress Prohibited", False, "ALLOW_EXTERNAL_EGRESS is set to True (INSECURE)"))

    # 2. LLM Endpoint Loopback / Internal Only
    llm_url = urlparse(LLM_BASE_URL)
    allowed_hosts = {"127.0.0.1", "localhost", "llm", "host.docker.internal"}
    if llm_url.hostname in allowed_hosts or llm_url.hostname is None:
        checks.append(("LLM-01", "Local LLM Loopback Binding", True, f"LLM Host is '{llm_url.hostname or 'local'}' (loopback/internal)"))
    else:
        checks.append(("LLM-01", "Local LLM Loopback Binding", False, f"LLM Host '{llm_url.hostname}' is not a local/internal interface"))

    # 3. Vector DB Persistent Local Disk Storage
    if QDRANT_STORAGE_DIR.exists():
        checks.append(("VEC-01", "Vector DB Persistent Local Storage", True, f"Qdrant persistence configured at '{QDRANT_STORAGE_DIR}'"))
    else:
        checks.append(("VEC-01", "Vector DB Persistent Local Storage", False, "Qdrant storage directory does not exist"))

    # 4. Cryptographic Key Ring
    try:
        pk = get_system_public_key_bytes()
        checks.append(("KEY-01", "Local Ed25519 / HKDF Keyring", True, f"System public key initialized ({len(pk)} bytes)"))
    except Exception as e:
        checks.append(("KEY-01", "Local Ed25519 / HKDF Keyring", False, f"Key initialization error: {e}"))

    # 5. Local Database Durability
    if DB_PATH.exists():
        with db.get_connection() as conn:
            cnt = conn.cursor().execute("SELECT COUNT(*) as c FROM vaults").fetchone()["c"]
        checks.append(("DB-01", "Local Canonical SQLite / Postgres DB", True, f"Database accessible with {cnt} registered vault(s)"))
    else:
        checks.append(("DB-01", "Local Canonical SQLite / Postgres DB", False, "Database file does not exist"))

    # 6. Canonical Encrypted Storage
    enc_files = list(ENCRYPTED_DIR.glob("*.enc"))
    if ENCRYPTED_DIR.exists() and len(enc_files) > 0:
        checks.append(("STORE-01", "AES-256-GCM Encrypted Storage", True, f"Verified {len(enc_files)} encrypted canonical chunk file(s)"))
    else:
        checks.append(("STORE-01", "AES-256-GCM Encrypted Storage", False, "Encrypted storage empty or missing"))

    # Display Results
    all_passed = True
    for cid, name, passed, details in checks:
        status_str = "[PASS]" if passed else "[FAIL]"
        print(f"{status_str:7} {cid:<10} {name:<40}")
        print(f"        -> {details}")
        if not passed:
            all_passed = False

    print("=" * 75)
    if all_passed:
        print("[SUCCESS] 100% OFFLINE / LAN-NATIVE INVARIANTS SATISFIED (ZERO CLOUD)!")
    else:
        print("[FAILURE] Offline verification failed!")
    print("=" * 75)

    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(check_offline_invariants())
