import json
import math
import uuid
from typing import List, Dict, Any, Tuple, Optional
from fastembed import TextEmbedding
from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams, Distance, PointStruct, Filter, FieldCondition, MatchValue, MatchAny, Range
)
from .models import Chunk
from .policy_compiler import CompiledFilter
from .database import db
from .config import QDRANT_STORAGE_DIR

class SecurityContractViolation(Exception):
    """Raised when retrieval firewall invariants are violated."""
    pass

class RealNeuralVectorStore:
    """
    Production-grade Vector Store (§15, §16, §17, §273):
    1. FastEmbed ONNX 384-d Neural Dense Embeddings (BAAI/bge-small-en-v1.5).
    2. Persistent local disk-backed Qdrant Engine (data/qdrant_storage).
    3. Payload Minimization: Full plaintext chunk content is NOT stored in vector payloads.
    4. Deterministic stable vector IDs via UUID5.
    5. Cryptographically bound Gate A retrieval filter verification.
    """

    def __init__(self):
        self.embedding_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        self.collection_name = "secure_chunks"
        
        # Connect to persistent local disk storage (or memory if locked by another process)
        try:
            self.qdrant = QdrantClient(path=str(QDRANT_STORAGE_DIR))
        except Exception:
            self.qdrant = QdrantClient(":memory:")
        self._init_collection()

    def _init_collection(self):
        if not self.qdrant.collection_exists(self.collection_name):
            self.qdrant.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(size=384, distance=Distance.COSINE)
            )

    def embed_text(self, text: str) -> List[float]:
        """Generates real 384-dimensional dense neural embedding."""
        vectors = list(self.embedding_model.embed([text]))
        return [float(x) for x in vectors[0]]

    def get_deterministic_point_id(self, chunk_id: str) -> str:
        """Derives stable, cross-session UUID5 point ID from canonical chunk ID (§17)."""
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk_id))

    def index_chunk(self, chunk: Chunk):
        """
        Indexes chunk into persistent Qdrant with minimized metadata payload (§15).
        Plaintext chunk content is deliberately omitted to prevent vector dump exfiltration.
        """
        vector = self.embed_text(chunk.content)
        point_id = self.get_deterministic_point_id(chunk.chunk_id)

        self.qdrant.upsert(
            collection_name=self.collection_name,
            points=[
                PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "chunk_id": chunk.chunk_id,
                        "resource_id": chunk.resource_id,
                        "vault_id": chunk.vault_id,
                        "classification": chunk.classification,
                        "min_clearance": chunk.min_clearance,
                        "acl_selector": chunk.acl_selector,
                        "deny_selector": chunk.deny_selector,
                        "provenance": chunk.provenance,
                        "content_hash": chunk.content_hash,
                        "chunk_index": chunk.chunk_index,
                        "created_at": chunk.created_at
                        # Note: Plaintext 'content' is intentionally excluded (§15)
                    }
                )
            ]
        )

    def delete_resource_vectors(self, resource_id: str):
        """Cascading vector deletion for a deleted resource (§70)."""
        delete_filter = Filter(
            must=[FieldCondition(key="resource_id", match=MatchValue(value=resource_id))]
        )
        self.qdrant.delete(collection_name=self.collection_name, points_selector=delete_filter)

    def sync_all_from_database(self):
        """Syncs all database chunks into Qdrant."""
        self._init_collection()
        with db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM chunks")
            rows = cursor.fetchall()
            for row in rows:
                chunk = Chunk(
                    chunk_id=row["chunk_id"],
                    resource_id=row["resource_id"],
                    vault_id=row["vault_id"],
                    chunk_index=row["chunk_index"],
                    content=row["content"],
                    classification=row["classification"],
                    min_clearance=row["min_clearance"],
                    acl_selector=json.loads(row["acl_selector"]),
                    deny_selector=json.loads(row["deny_selector"]),
                    provenance=json.loads(row["provenance"]),
                    content_hash=row["content_hash"],
                    storage_path=row["storage_path"] if "storage_path" in row.keys() else None,
                    created_at=row["created_at"]
                )
                self.index_chunk(chunk)

    def search(self, query: str, compiled_filter: CompiledFilter, top_k: int = 10) -> List[Tuple[Chunk, float]]:
        """
        Executes Gate A pre-retrieval vector search with cryptographic filter validation (§18, §273).
        """
        # 1. Firewall Invariant: Reject ad-hoc or unverified client filters
        if not isinstance(compiled_filter, CompiledFilter):
            raise SecurityContractViolation("Direct search rejected: Query filter must be server-compiled CompiledFilter.")

        if not compiled_filter.is_valid():
            raise SecurityContractViolation("Security contract breach: Filter signature verification failed (T-RET-003).")

        filter_ast = compiled_filter.to_dict()

        # 2. Build Native Qdrant Filter
        qdrant_must = []
        for c in filter_ast.get("must", []):
            k = c["key"]
            if "match" in c:
                m = c["match"]
                if "value" in m:
                    qdrant_must.append(FieldCondition(key=k, match=MatchValue(value=m["value"])))
                elif "any" in m:
                    qdrant_must.append(FieldCondition(key=k, match=MatchAny(any=m["any"])))
            elif "range" in c:
                r = c["range"]
                qdrant_must.append(FieldCondition(key=k, range=Range(lte=r.get("lte"), gte=r.get("gte"))))

        qdrant_must_not = []
        for c in filter_ast.get("must_not", []):
            k = c["key"]
            if "match" in c:
                m = c["match"]
                if "value" in m:
                    qdrant_must_not.append(FieldCondition(key=k, match=MatchValue(value=m["value"])))
                elif "any" in m:
                    qdrant_must_not.append(FieldCondition(key=k, match=MatchAny(any=m["any"])))

        q_filter = Filter(must=qdrant_must, must_not=qdrant_must_not)

        # 3. Embed Query Vector
        query_vector = self.embed_text(query)

        # 4. Search via Qdrant query_points
        search_res = self.qdrant.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            query_filter=q_filter,
            limit=top_k
        )

        results: List[Tuple[Chunk, float]] = []
        for pt in search_res.points:
            p = pt.payload
            # Construct candidate metadata chunk (content will be fetched from canonical encrypted store by Gate B)
            c = Chunk(
                chunk_id=p["chunk_id"],
                resource_id=p["resource_id"],
                vault_id=p["vault_id"],
                chunk_index=p.get("chunk_index", 0),
                content="",  # Gate B will populate content from protected canonical store
                classification=p["classification"],
                min_clearance=p["min_clearance"],
                acl_selector=p.get("acl_selector", []),
                deny_selector=p.get("deny_selector", []),
                provenance=p.get("provenance", {}),
                content_hash=p.get("content_hash", ""),
                created_at=p.get("created_at", "")
            )
            results.append((c, pt.score))

        return results

vector_store = RealNeuralVectorStore()
