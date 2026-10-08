import sqlite3
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.database import db
from backend.app.ingestion import ingestion_pipeline
from backend.app.vector_store import vector_store

def clean_fake_data():
    with db.get_connection() as conn:
        cur = conn.cursor()

        # 1. Delete fake Master Dossier
        fake_res = cur.execute("SELECT resource_id FROM resources WHERE title = 'Project Alpha Master Dossier'").fetchall()
        for r in fake_res:
            res_id = r["resource_id"]
            print(f"[*] Removing fake resource: {res_id} (Project Alpha Master Dossier)...")
            try:
                ingestion_pipeline.delete_resource(res_id)
            except Exception as e:
                print(f"Error deleting resource {res_id}: {e}")

        # 2. Delete test imported vaults
        imported_vaults = cur.execute("SELECT vault_id, slug FROM vaults WHERE slug LIKE 'imported-%'").fetchall()
        for v in imported_vaults:
            vid = v["vault_id"]
            print(f"[*] Removing test imported vault: {vid} ({v['slug']})...")
            # delete chunks vectors
            chunks = cur.execute("SELECT resource_id FROM resources WHERE vault_id = ?", (vid,)).fetchall()
            for c in chunks:
                try:
                    vector_store.delete_resource_vectors(c["resource_id"])
                except Exception:
                    pass
            cur.execute("DELETE FROM chunks WHERE vault_id = ?", (vid,))
            cur.execute("DELETE FROM resources WHERE vault_id = ?", (vid,))
            cur.execute("DELETE FROM grants WHERE vault_id = ?", (vid,))
            cur.execute("DELETE FROM vaults WHERE vault_id = ?", (vid,))

        conn.commit()
    print("[+] Fake seed data cleanup finished successfully.")

if __name__ == "__main__":
    clean_fake_data()
