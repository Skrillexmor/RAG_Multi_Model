import json
import math
from typing import List, Dict, Any, Tuple, Optional
from uuid import uuid4
from fastembed import TextEmbedding
from qdrant_client import QdrantClient
from qdrant_client.models import (
    VectorParams, Distance, PointStruct, Filter, FieldCondition, MatchValue, MatchAny, Range
)
from .models import Chunk
from .policy_compiler import CompiledFilter
from .database import db

class SecurityContractViolation(Exception):
    """Raised when retrieval firewall invariants are violated."""
    pass

class RealNeuralVectorStore:
    """
    Production-grade Vector Store combining:
    1. FastEmbed ONNX 384-d Neural Dense Embeddings (BAAI/bge-small-en-v1.5).
    2. Real Qdrant Vector Engine with strict payload filtering (Gate A) and tenant partitions.
    """

    def __init__(self):
        # Initialize local neural embedding model (cached locally, zero cloud)
        self.embedding_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        self.collection_name = "secure_chunks"
        
        # Initialize real embedded Qdrant engine
        self.qdrant = QdrantClient(location=":memory:")
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

    def index_chunk(self, chunk: Chunk):
        """Indexes chunk into real Qdrant collection with rich authorization payload."""
        vector = self.embed_text(chunk.content)
        # Use integer hash or UUID for point ID
        point_id = abs(hash(chunk.chunk_id)) % (10**12)
        
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
                        "content": chunk.content,
                        "provenance": chunk.provenance,
                        "content_hash": chunk.content_hash,
                        "chunk_index": chunk.chunk_index,
                        "created_at": chunk.created_at
                    }
                )
            ]
        )

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
                    created_at=row["created_at"]
                )
                self.index_chunk(chunk)

    def search(self, query: str, compiled_filter: CompiledFilter, top_k: int = 10) -> List[Tuple[Chunk, float]]:
        """
        Architecture A3 Contract:
        1. Must contain vault_id in filter.
        2. Must be an authentic CompiledFilter produced by PolicyCompiler (taint verification).
        """
        if not isinstance(compiled_filter, CompiledFilter) or not compiled_filter.taint_tag:
            raise SecurityContractViolation("FATAL: Vector search rejected! Filter was not produced by PolicyCompiler.")

        filter_ast = compiled_filter.to_dict()
        vault_id = filter_ast.get("vault_id")
        if not vault_id:
            raise SecurityContractViolation("FATAL: Vector search rejected! Missing mandatory vault_id filter.")

        query_vec = self.embed_text(query)

        # Build real Qdrant Filter Object
        user_subjects = filter_ast["must"][3]["match"]["any"]
        max_clearance = filter_ast["must"][1]["range"]["lte"]
        max_classification = filter_ast["must"][2]["range"]["lte"]

        # Must conditions: vault_id == X, clearance <= user, classification <= ceiling, acl_selector in subjects
        must_conditions = [
            FieldCondition(key="vault_id", match=MatchValue(value=vault_id)),
            FieldCondition(key="min_clearance", range=Range(lte=max_clearance)),
            FieldCondition(key="classification", range=Range(lte=max_classification)),
            FieldCondition(key="acl_selector", match=MatchAny(any=user_subjects))
        ]

        # Must not conditions: deny_selector any in user_subjects
        must_not_conditions = [
            FieldCondition(key="deny_selector", match=MatchAny(any=user_subjects))
        ]

        qdrant_filter = Filter(must=must_conditions, must_not=must_not_conditions)

        # Execute real Qdrant vector query
        results = self.qdrant.query_points(
            collection_name=self.collection_name,
            query=query_vec,
            query_filter=qdrant_filter,
            limit=top_k
        )

        candidates: List[Tuple[Chunk, float]] = []
        for point in results.points:
            p = point.payload
            chunk = Chunk(
                chunk_id=p["chunk_id"],
                resource_id=p["resource_id"],
                vault_id=p["vault_id"],
                chunk_index=p["chunk_index"],
                content=p["content"],
                classification=p["classification"],
                min_clearance=p["min_clearance"],
                acl_selector=p["acl_selector"],
                deny_selector=p["deny_selector"],
                provenance=p["provenance"],
                content_hash=p["content_hash"],
                created_at=p["created_at"]
            )
            candidates.append((chunk, float(point.score)))

        return candidates

vector_store = RealNeuralVectorStore()
