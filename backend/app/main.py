from pathlib import Path
from fastapi import Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .api import app

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
FRONTEND_DIR = FRONTEND_DIST if FRONTEND_DIST.exists() else BASE_DIR / "frontend"

# Mount static assets from built Vite bundle
assets_dir = FRONTEND_DIR / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    # Pass through API and system endpoints (return true 404 for unknown endpoints)
    if full_path.startswith("api") or full_path.startswith("health"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="API endpoint not found")

    file_path = FRONTEND_DIR / full_path
    if full_path and file_path.is_file():
        return FileResponse(file_path)

    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)

    return {"error": "Frontend build not found"}

if __name__ == "__main__":
    import uvicorn
    from .config import API_HOST, API_PORT
    uvicorn.run("backend.app.main:app", host=API_HOST, port=API_PORT, reload=True)
