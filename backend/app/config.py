import os
import secrets
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
MEDIA_DIR = STORAGE_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "secure_rag.db"
QDRANT_STORAGE_DIR = DATA_DIR / "qdrant_storage"
QDRANT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)

# Environment / Operational Mode
# Options: "production" (strict security, no impersonation, no simulated time), "demo" (for local presentation)
APP_MODE = os.getenv("APP_MODE", "demo").lower()
DEMO_MODE = APP_MODE in ("demo", "dev", "test")
TEST_MODE = os.getenv("TEST_MODE", "true" if DEMO_MODE else "false").lower() == "true"

# Cryptographic Keys & Secrets (Automatic local file generation if not in env)
_SECRET_KEY_FILE = DATA_DIR / ".jwt_secret"
if "JWT_SECRET" in os.environ:
    JWT_SECRET = os.environ["JWT_SECRET"]
elif _SECRET_KEY_FILE.exists():
    JWT_SECRET = _SECRET_KEY_FILE.read_text(encoding="utf-8").strip()
else:
    JWT_SECRET = secrets.token_hex(32)
    _SECRET_KEY_FILE.write_text(JWT_SECRET, encoding="utf-8")

JWT_ALGORITHM = "HS256"

_MASTER_KEK_FILE = DATA_DIR / ".master_kek.hex"
if "MASTER_KEK" in os.environ:
    MASTER_KEK_HEX = os.environ["MASTER_KEK"]
elif _MASTER_KEK_FILE.exists():
    MASTER_KEK_HEX = _MASTER_KEK_FILE.read_text(encoding="utf-8").strip()
else:
    MASTER_KEK_HEX = secrets.token_hex(32)
    _MASTER_KEK_FILE.write_text(MASTER_KEK_HEX, encoding="utf-8")

LEASE_TTL_SECONDS = int(os.getenv("LEASE_TTL_SECONDS", "300"))  # 5 min default
RESTRICTED_LEASE_TTL_SECONDS = int(os.getenv("RESTRICTED_LEASE_TTL_SECONDS", "30"))  # 30s for restricted vaults
CLOCK_SKEW_SECONDS = int(os.getenv("CLOCK_SKEW_SECONDS", "30"))
CLOCK_JUMP_HOURS = int(os.getenv("CLOCK_JUMP_HOURS", "6"))

# Offline / Zero-Cloud Constraints
ALLOW_EXTERNAL_EGRESS = False
API_PORT = int(os.getenv("API_PORT", "8000"))
API_HOST = os.getenv("API_HOST", "127.0.0.1")

# Vector & Embedding
EMBEDDING_DIM = 384
DEFAULT_VECTOR_COLLECTION = "secure_chunks"

# Local LLM Runtime configuration
LLM_RUNTIME = os.getenv("LLM_RUNTIME", "ollama")
LLM_MODEL = os.getenv("LLM_MODEL", "llama3.2")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://127.0.0.1:11434")
LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "120"))
MAX_LLM_CONCURRENCY = int(os.getenv("MAX_LLM_CONCURRENCY", "1"))

# Structured Data & Aggregation Privacy
MIN_SENSITIVE_AGGREGATE_GROUP_SIZE = int(os.getenv("MIN_SENSITIVE_AGGREGATE_GROUP_SIZE", "5"))
