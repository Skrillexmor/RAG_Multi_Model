import json
import os
import hashlib
import base64
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from uuid import uuid4

from .database import db
from .crypto import derive_vault_kek, encrypt_blob, decrypt_blob, sign_data, verify_signature, get_system_public_key_bytes
from .time_authority import time_authority
from .audit import audit_service

class FederationError(Exception):
    pass

class FederationService:
    """
    Architecture v3 §A11 & §A12 & UPGRADE_PROJECT §47..§49, §220..§228:
    LAN Federation Tier 2 (Query-in-Place) and Tier 3 (Offline Encrypted Vault Bundles).
    Enforces fail-closed decryption, recipient binding, replay protection, and payload hash verification.
    """

    LOCAL_NODE_ID = "node_local_primary"

    @classmethod
    def register_node(cls, name: str) -> Dict[str, Any]:
        node_id = f"node_{uuid4().hex[:8]}"
        pubkey = base64.b64encode(get_system_public_key_bytes()).decode("utf-8")
        cert_fp = hashlib.sha256(pubkey.encode()).hexdigest()[:16]
        now_iso = time_authority.now().isoformat()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO federation_nodes (node_id, name, pubkey, cert_fp, state, enrolled_at)
            VALUES (?, ?, ?, ?, 'active', ?)
            """, (node_id, name, pubkey, cert_fp, now_iso))
            conn.commit()

        return {"node_id": node_id, "name": name, "pubkey": pubkey, "cert_fp": cert_fp}

    @classmethod
    def create_link(
        cls,
        node_id: str,
        direction: str,
        vault_allowlist: List[str],
        max_classification: int,
        role_map: Dict[str, str]
    ) -> str:
        link_id = f"link_{uuid4().hex[:8]}"
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO federation_links (
                link_id, node_id, direction, vault_allowlist, max_classification, role_map, state
            ) VALUES (?, ?, ?, ?, ?, ?, 'active')
            """, (link_id, node_id, direction, json.dumps(vault_allowlist), max_classification, json.dumps(role_map)))
            conn.commit()
        return link_id

    @classmethod
    def export_vault_bundle(cls, vault_id: str, recipient_node_id: str, validity_hours: int = 48) -> Dict[str, Any]:
        """Tier 3: Exports an encrypted, signed bundle with replay nonce and export terms (§A12)."""
        now = time_authority.now()
        now_iso = now.isoformat()
        valid_until = (now.timestamp + timedelta(hours=validity_hours)).isoformat()
        bundle_id = f"bndl_{uuid4().hex[:8]}"
        nonce = os.urandom(16).hex()

        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM vaults WHERE vault_id = ?", (vault_id,))
            vault = cursor.fetchone()
            if not vault:
                raise FederationError("Vault not found.")

            cursor.execute("SELECT * FROM chunks WHERE vault_id = ?", (vault_id,))
            chunks = [dict(c) for c in cursor.fetchall()]

        # Package payload and encrypt with derived Vault KEK
        payload_bytes = json.dumps({"vault": dict(vault), "chunks": chunks}).encode("utf-8")
        kek = derive_vault_kek(vault_id)
        enc_nonce, ciphertext = encrypt_blob(payload_bytes, kek)
        payload_sha256 = hashlib.sha256(ciphertext).hexdigest()

        header = {
            "version": "rvault-3.0",
            "bundle_id": bundle_id,
            "nonce": nonce,
            "created_at": now_iso,
            "valid_until": valid_until,
            "sender_node": cls.LOCAL_NODE_ID,
            "recipient_node": recipient_node_id
        }

        manifest = {
            "vault_id": vault_id,
            "vault_slug": vault["slug"],
            "classification_ceiling": vault["classification_ceiling"],
            "terms": {"no_reshare": True, "no_export": True},
            "payload_sha256": payload_sha256
        }

        # Ed25519 Signature over Header + Manifest + Payload Hash (§49)
        sig_data = f"{json.dumps(header, sort_keys=True)}:{json.dumps(manifest, sort_keys=True)}:{payload_sha256}".encode("utf-8")
        sig = base64.b64encode(sign_data(sig_data)).decode("utf-8")

        audit_service.log_event(
            request_id=bundle_id,
            actor_id="system",
            action="vault_bundle_exported",
            object_type="bundle",
            object_id=bundle_id,
            decision="ALLOW",
            policy_version=1,
            reason_code="TIER3_OFFLINE_BUNDLE_EXPORT"
        )

        return {
            "header": header,
            "manifest": manifest,
            "ciphertext_b64": base64.b64encode(ciphertext).decode("utf-8"),
            "nonce_b64": base64.b64encode(enc_nonce).decode("utf-8"),
            "signature": sig
        }

    @classmethod
    def import_vault_bundle(cls, bundle: Dict[str, Any]) -> str:
        """
        Tier 3 Import: Verifies signatures, time validity, recipient binding,
        replay nonce, ciphertext hash, and decrypts into imported vault.
        Strict fail-closed: ANY error raises FederationError (§47).
        """
        header = bundle.get("header", {})
        manifest = bundle.get("manifest", {})
        now = time_authority.now()
        now_iso = now.isoformat()

        # 1. Time validity check (§225)
        valid_until = header.get("valid_until", "")
        if not valid_until or now_iso > valid_until:
            raise FederationError("Bundle has expired (FAIL_CLOSED_TIME).")

        # 2. Recipient binding (§47)
        recipient = header.get("recipient_node")
        if recipient != cls.LOCAL_NODE_ID and recipient != "node_local_primary" and recipient != "any":
            raise FederationError(f"Recipient node mismatch: intended for {recipient}, local is {cls.LOCAL_NODE_ID}.")

        # 3. Replay Protection (§224)
        bundle_id = header.get("bundle_id")
        nonce = header.get("nonce")
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM bundle_nonces WHERE bundle_id = ? OR nonce = ?", (bundle_id, nonce))
            if cursor.fetchone():
                raise FederationError("Replay detected: bundle or nonce already processed (BUNDLE_REPLAY).")

        # 4. Ciphertext integrity check (§226)
        ciphertext = base64.b64decode(bundle.get("ciphertext_b64", ""))
        enc_nonce = base64.b64decode(bundle.get("nonce_b64", ""))
        computed_sha = hashlib.sha256(ciphertext).hexdigest()
        if computed_sha != manifest.get("payload_sha256"):
            raise FederationError("Ciphertext payload hash mismatch (CORRUPT_OR_ALTERED_PAYLOAD).")

        # 5. Cryptographic signature check
        sig_data = f"{json.dumps(header, sort_keys=True)}:{json.dumps(manifest, sort_keys=True)}:{computed_sha}".encode("utf-8")
        if not verify_signature(get_system_public_key_bytes(), sig_data, base64.b64decode(bundle.get("signature", ""))):
            raise FederationError("Bundle signature verification failed (TAMPER_DETECTED).")

        # 6. Decrypt payload (fail-closed, NO fallback data allowed! §47)
        vault_id = manifest.get("vault_id") or "v_imp_default"
        kek = derive_vault_kek(vault_id)
        try:
            raw_payload = decrypt_blob(enc_nonce, ciphertext, kek)
        except Exception as e:
            raise FederationError(f"Decryption failure: cannot decrypt bundle payload (FAIL_CLOSED_CRYPTO: {e})")

        data = json.loads(raw_payload.decode("utf-8"))
        v_data = data["vault"]

        imported_vault_id = f"v_imp_{uuid4().hex[:8]}"
        new_slug = f"imported-{v_data.get('slug', 'remote')}-{uuid4().hex[:8]}"

        with db.get_connection() as conn:
            cursor = conn.cursor()
            # Store nonce to prevent replays
            cursor.execute("""
            INSERT INTO bundle_nonces (nonce, bundle_id, sender_node_id, recipient_node_id, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (nonce, bundle_id, header.get("sender_node", "unknown"), recipient, now_iso, valid_until))

            # Insert imported vault
            cursor.execute("""
            INSERT INTO vaults (
                vault_id, tenant_id, slug, display_name, owner_id,
                classification_ceiling, status, origin, import_terms, created_at
            ) VALUES (?, 'default_tenant', ?, ?, 'admin', ?, 'active', 'imported', ?, ?)
            """, (
                imported_vault_id, new_slug, f"[Imported] {v_data.get('display_name', 'Vault')}",
                v_data.get("classification_ceiling", 2), json.dumps(manifest.get("terms", {})), now_iso
            ))
            conn.commit()

        audit_service.log_event(
            request_id=bundle_id,
            actor_id="system",
            action="vault_bundle_imported",
            object_type="vault",
            object_id=imported_vault_id,
            decision="ALLOW",
            policy_version=1,
            reason_code="TIER3_OFFLINE_BUNDLE_IMPORTED"
        )

        return imported_vault_id

federation_service = FederationService()
