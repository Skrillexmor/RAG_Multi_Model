import re
import json
import urllib.request
from typing import List, Dict, Any, Tuple, Optional
from .models import EvidenceItem, Claim, Citation, Vault
from .config import LLM_BASE_URL, LLM_MODEL, LLM_TIMEOUT_SECONDS, LLM_RUNTIME

class LocalLLM:
    """
    Local LLM Adapter implementing Master Spec §17, §19, §20, §41 & UPGRADE_PROJECT §57..§66.
    1. Delimited untrusted data boundaries.
    2. Strict structured JSON contract with model-produced claims and citations.
    3. Explicit Safe Extractive Fallback mode when offline LLM is unavailable.
    4. Output DLP / secret filtering.
    """

    def __init__(self):
        self.ollama_url = f"{LLM_BASE_URL.rstrip('/')}/api/generate"

    def _call_ollama(self, prompt: str, system_prompt: str) -> Optional[Dict[str, Any]]:
        """Queries local Ollama endpoint requesting structured JSON."""
        try:
            req_data = json.dumps({
                "model": LLM_MODEL,
                "prompt": prompt,
                "system": system_prompt,
                "stream": False,
                "format": "json"
            }).encode("utf-8")
            req = urllib.request.Request(
                self.ollama_url,
                data=req_data,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=LLM_TIMEOUT_SECONDS) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                response_str = data.get("response", "")
                return json.loads(response_str)
        except Exception:
            return None

    def output_dlp_scan(self, text: str) -> bool:
        """Output DLP Firewall (§66): Screens answer for leaked secrets, credentials, or keys."""
        leak_patterns = [
            r"-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----",
            r"(?i)(password|passwd|pwd)\s*[:=]\s*[^\s,;]{4,}",
            r"(?i)bearer\s+[a-zA-Z0-9_\-\.]{16,}",
            r"(?i)AKIA[0-9A-Z]{16}"
        ]
        return any(re.search(pat, text) for pat in leak_patterns)

    def generate(
        self,
        query: str,
        vault: Vault,
        evidence: List[EvidenceItem]
    ) -> Tuple[str, List[Claim], List[Citation], str, Optional[str]]:
        """
        Generates grounded, citation-backed response strictly from authorized evidence.
        Returns: (answer_text, claims, citations, generation_mode, refusal_reason)
        Modes: 'LLM_GROUNDED', 'SAFE_EXTRACTIVE_MODE', 'ANSWER_BLOCKED'
        """
        # 1. Closed-world check (§192): Refuse if no authorized evidence
        if not evidence:
            refusal_text = f"No authorized source supports this request within your current access scope for {vault.display_name}."
            return refusal_text, [], [], "ANSWER_BLOCKED", "INSUFFICIENT_AUTHORIZED_EVIDENCE"

        # 2. Prompt injection defense (§60, §92)
        injection_keywords = [
            "ignore previous", "ignore all rules", "reveal restricted",
            "reveal hidden", "system prompt", "bypass acl", "you are now unrestricted"
        ]
        lowered_q = query.lower()
        if any(kw in lowered_q for kw in injection_keywords):
            refusal_text = "Authorization policy cannot be overridden by user prompts. The request has been safely denied."
            return refusal_text, [], [], "ANSWER_BLOCKED", "PROMPT_INJECTION_REJECTED"

        # 3. Construct Untrusted Evidence Envelope (§61, §210)
        evidence_lines = []
        canonical_citation_lookup: Dict[str, Citation] = {}

        for idx, item in enumerate(evidence):
            c_id = f"C{idx + 1}"
            locator = item.provenance.get("locator", f"Section {idx + 1}")
            exact_content = item.content.strip()

            evidence_lines.append(f"[ID: {c_id}] (Locator: {locator})\n{exact_content}\n")
            canonical_citation_lookup[c_id] = Citation(
                citation_id=c_id,
                evidence_id=item.evidence_id,
                vault_name=vault.display_name,
                locator=locator,
                quote=exact_content,
                verified=False
            )

        evidence_envelope = "\n".join(evidence_lines)

        system_prompt = (
            "SYSTEM CONTRACT: You are the answer synthesis component of a secure retrieval system.\n"
            f"CLOSED WORLD: You may ONLY use the facts inside <UNTRUSTED_EVIDENCE_DATA> from dataset {vault.display_name}.\n"
            "OUTPUT FORMAT: Return valid JSON with:\n"
            "  'answer': string with citation markers like [C1],\n"
            "  'claims': [ {'text': string, 'citation_ids': ['C1']} ],\n"
            "  'citations': [ {'citation_id': 'C1', 'locator': string, 'quote': string} ]\n"
            "Never invent facts or citations not present in the evidence."
        )

        user_prompt = (
            f"USER QUERY: {query}\n\n"
            f"<UNTRUSTED_EVIDENCE_DATA>\n{evidence_envelope}\n</UNTRUSTED_EVIDENCE_DATA>\n"
        )

        # 4. Attempt local Ollama inference
        parsed_json = self._call_ollama(user_prompt, system_prompt)
        if parsed_json and "answer" in parsed_json and "claims" in parsed_json:
            full_answer = parsed_json["answer"]

            # DLP output firewall (§66)
            if self.output_dlp_scan(full_answer):
                return "Answer withheld because it could not be safely verified by output DLP filters.", [], [], "ANSWER_BLOCKED", "OUTPUT_DLP_VIOLATION"

            claims = []
            for cl in parsed_json.get("claims", []):
                claims.append(Claim(text=cl.get("text", ""), citation_ids=cl.get("citation_ids", [])))

            citations = []
            for cit in parsed_json.get("citations", []):
                cid = cit.get("citation_id")
                orig_cit = canonical_citation_lookup.get(cid)
                if orig_cit:
                    citations.append(Citation(
                        citation_id=cid,
                        evidence_id=orig_cit.evidence_id,
                        vault_name=orig_cit.vault_name,
                        locator=cit.get("locator", orig_cit.locator),
                        quote=cit.get("quote", orig_cit.quote),
                        verified=False
                    ))

            return full_answer, claims, citations, "LLM_GROUNDED", None

        # 5. Explicit Safe Extractive Mode (§58, §213)
        # When local LLM is offline or not installed, provide verifiable extracted claims
        extracted_citations: List[Citation] = list(canonical_citation_lookup.values())
        extracted_claims: List[Claim] = []
        answer_parts: List[str] = [f"[SAFE EXTRACTIVE MODE — Dataset: {vault.display_name}]"]

        for cit in extracted_citations:
            snippet = cit.quote[:180] + "..." if len(cit.quote) > 180 else cit.quote
            claim_text = f"According to {cit.locator}: \"{snippet}\" [{cit.citation_id}]"
            extracted_claims.append(Claim(text=claim_text, citation_ids=[cit.citation_id]))
            answer_parts.append(claim_text)

        full_extractive_answer = "\n\n".join(answer_parts)
        return full_extractive_answer, extracted_claims, extracted_citations, "SAFE_EXTRACTIVE_MODE", None

local_llm = LocalLLM()
