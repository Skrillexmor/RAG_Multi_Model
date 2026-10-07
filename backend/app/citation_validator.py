from typing import List, Tuple, Dict, Any, Optional, Literal
from .models import Claim, Citation, EvidenceItem

ValidationStatus = Literal["VALID", "INVALID_CITATION", "UNSUPPORTED_CLAIM", "FORBIDDEN_SOURCE"]

class CitationValidator:
    """
    Architecture §25, §26, §27 & Master Spec §17, §25, §26 & UPGRADE_PROJECT §62..§65:
    Strict claim/citation grounding validator.
    Enforces exact quote verification (zero exceptions for short quotes - CIT-004),
    authorized source membership, and claim coverage.
    """

    @classmethod
    def validate_citations_and_claims(
        cls,
        claims: List[Claim],
        citations: List[Citation],
        authorized_evidence: List[EvidenceItem]
    ) -> Tuple[bool, ValidationStatus, str, List[Citation]]:
        """
        Validates citations against authorized evidence.
        Returns: (is_valid, status, reason, updated_citations)
        """
        evidence_map: Dict[str, str] = {ev.evidence_id: ev.content for ev in authorized_evidence}
        citation_map: Dict[str, Citation] = {}

        if not citations and claims:
            return False, "UNSUPPORTED_CLAIM", "Factual claims were made without citations (T-CIT-001).", citations

        updated_citations: List[Citation] = []

        # 1. Validate each citation
        for c in citations:
            # Check source authorization (T-CIT-002, T-CIT-003)
            if c.evidence_id not in evidence_map:
                return False, "FORBIDDEN_SOURCE", f"Citation {c.citation_id} references unauthorized or nonexistent evidence {c.evidence_id}.", citations

            canonical_text = evidence_map[c.evidence_id]

            # Exact quote verification algorithm (§26, §63, T-CIT-004)
            # Normalize whitespace for robust comparison
            norm_quote = " ".join(c.quote.lower().split())
            norm_canonical = " ".join(canonical_text.lower().split())

            # CIT-004: Removed 'len > 10' loophole! Even short quotes must exist in canonical source.
            if norm_quote not in norm_canonical:
                return False, "INVALID_CITATION", f"Fabricated quote in citation {c.citation_id}: quote does not exist in canonical source.", citations

            # Mark verified
            c_copy = c.model_copy(update={"verified": True})
            updated_citations.append(c_copy)
            citation_map[c.citation_id] = c_copy

        # 2. Validate claim coverage (§27, §64, T-CIT-006)
        for cl in claims:
            if not cl.citation_ids:
                return False, "UNSUPPORTED_CLAIM", "Claim without citation ID found.", updated_citations
            for cid in cl.citation_ids:
                if cid not in citation_map or not citation_map[cid].verified:
                    return False, "UNSUPPORTED_CLAIM", f"Claim links to unverified citation {cid}.", updated_citations

        return True, "VALID", "All citations verified against canonical evidence.", updated_citations

citation_validator = CitationValidator()
