import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

STORAGE_DIR = BASE_DIR / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
QUARANTINE_DIR = STORAGE_DIR / "quarantine"
QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)
ENCRYPTED_DIR = STORAGE_DIR / "encrypted"
ENCRYPTED_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "secure_rag.db"
QDRANT_STORAGE_DIR = DATA_DIR / "qdrant_storage"
QDRANT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Security Constants
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-lan-jwt-signing-key-minimum-32-chars-long!")
JWT_ALGORITHM = "HS256"
LEASE_TTL_SECONDS = int(os.getenv("LEASE_TTL_SECONDS", "300"))  # 5 min default
RESTRICTED_LEASE_TTL_SECONDS = int(os.getenv("RESTRICTED_LEASE_TTL_SECONDS", "30"))  # 30s for restricted vaults
CLOCK_SKEW_SECONDS = int(os.getenv("CLOCK_SKEW_SECONDS", "30"))
CLOCK_JUMP_HOURS = int(os.getenv("CLOCK_JUMP_HOURS", "6"))

# Offline / Network constraints
ALLOW_EXTERNAL_EGRESS = False
API_PORT = int(os.getenv("API_PORT", "8000"))
API_HOST = os.getenv("API_HOST", "0.0.0.0")

# Vector & Embedding
EMBEDDING_DIM = 384
DEFAULT_VECTOR_COLLECTION = "secure_chunks"
