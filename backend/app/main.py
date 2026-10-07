from pathlib import Path
from fastapi.staticfiles import StaticFiles
from .api import app

# Mount frontend UI assets
FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    from .config import API_HOST, API_PORT
    uvicorn.run("backend.app.main:app", host=API_HOST, port=API_PORT, reload=True)
