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

    def get_installed_models(self) -> List[str]:
        """Queries local Ollama /api/tags for downloaded models."""
        try:
            tags_url = f"{LLM_BASE_URL.rstrip('/')}/api/tags"
            req = urllib.request.Request(tags_url)
            with urllib.request.urlopen(req, timeout=2) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                models = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
                return models
        except Exception:
            return []

    def get_best_model(self) -> Tuple[Optional[str], List[str]]:
        """Finds best matching model from installed models or configured default."""
        installed = self.get_installed_models()
        if not installed:
            return None, []

        for m in installed:
            if m.startswith(LLM_MODEL) or LLM_MODEL in m:
                return m, installed

        preferred = ["llama3.2", "mistral", "llama3.1", "qwen2.5:3b", "qwen2.5", "phi3"]
        for pref in preferred:
            for m in installed:
                if m.startswith(pref) or pref in m:
                    return m, installed

        return installed[0], installed

    def get_status(self) -> Dict[str, Any]:
        """Provides status report for local offline LLM connection."""
        active_model, installed = self.get_best_model()
        is_connected = active_model is not None
        return {
            "connected": is_connected,
            "runtime": LLM_RUNTIME,
            "endpoint": LLM_BASE_URL,
            "active_model": active_model or LLM_MODEL,
            "installed_models": installed,
            "recommended_models": ["llama3.2", "mistral", "llama3.1:8b", "qwen2.5:3b"],
            "setup_guide": {
                "step1": "Download and install Ollama from https://ollama.com",
                "step2": "Open a terminal and run: ollama run llama3.2",
                "step3": "DARS-RAG will automatically connect and generate full neural RAG answers."
            }
        }

    def _call_ollama(self, prompt: str, system_prompt: str) -> Optional[Dict[str, Any]]:
        """Queries local Ollama endpoint requesting structured JSON."""
        model_name, _ = self.get_best_model()
        if not model_name:
            model_name = LLM_MODEL
        try:
            req_data = json.dumps({
                "model": model_name,
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
                response_str = data.get("response", "").strip()

                # Clean markdown fences if model wrapped response in backticks
                if response_str.startswith("```json"):
                    response_str = response_str[7:]
                elif response_str.startswith("```"):
                    response_str = response_str[3:]
                if response_str.endswith("```"):
                    response_str = response_str[:-3]
                response_str = response_str.strip()

                try:
                    parsed = json.loads(response_str)
                    if isinstance(parsed, dict):
                        return parsed
                except Exception:
                    # If model returned plain text or unescaped quotes, wrap as answer
                    if response_str:
                        return {"answer": response_str, "claims": [], "citations": []}
                return None
        except Exception as e:
            print(f"[Ollama Call Error] {e}")
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

    def contextualize_query(self, query: str, history: Optional[List[Dict[str, Any]]] = None) -> str:
        """
        Contextual Query Reformulation:
        If there is conversation history and the current query is anaphoric, elliptical,
        or a short follow-up (e.g., 'give me in detail', 'explain more', 'why?'),
        reformulates it into a standalone search query for Gate A vector retrieval.
        """
        if not history:
            return query

        recent_turns = [m for m in history if m.get("content")]
        if not recent_turns:
            return query

        last_msgs = recent_turns[-4:]
        pronouns_or_short = {"detail", "more", "why", "how", "what", "that", "this", "it", "them", "these", "example", "syntax", "compare"}
        query_words = set(query.lower().split())
        is_follow_up = len(query.split()) < 8 or bool(query_words.intersection(pronouns_or_short))

        if not is_follow_up:
            return query

        conv_text = []
        for m in last_msgs:
            role = m.get("role", "user").capitalize()
            content = m.get("content", "").strip()
            if role == "Assistant" and len(content) > 180:
                content = content[:180] + "..."
            conv_text.append(f"{role}: {content}")

        history_str = "\n".join(conv_text)
        rewrite_sys = (
            "Given the chat history and follow-up question, rewrite the follow-up question "
            "into a concise, self-contained search query. "
            "Do NOT answer the question. Output ONLY the standalone search query phrase."
        )
        rewrite_user = f"Chat History:\n{history_str}\n\nFollow-up question: {query}\n\nStandalone search query:"

        try:
            req_data = json.dumps({
                "model": LLM_MODEL,
                "prompt": rewrite_user,
                "system": rewrite_sys,
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 30}
            }).encode("utf-8")
            req = urllib.request.Request(self.ollama_url, data=req_data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                standalone = data.get("response", "").strip().strip('"\'')
                if standalone and len(standalone) > 3 and not standalone.lower().startswith("chat history"):
                    return standalone
        except Exception:
            pass

        last_user = next((m.get("content", "") for m in reversed(last_msgs) if m.get("role") == "user"), "")
        if last_user and last_user != query:
            return f"{last_user} {query}"

        return query

    def generate(
        self,
        query: str,
        vault: Vault,
        evidence: List[EvidenceItem],
        history: Optional[List[Dict[str, Any]]] = None
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

        # 3. Conversational Greeting & Introduction Handling
        GREETINGS = {"hi", "hello", "hey", "greetings", "good morning", "good evening", "good afternoon", "who are you", "help", "what can you do"}
        clean_q = lowered_q.strip().rstrip("?!. ")
        if clean_q in GREETINGS or any(clean_q == g for g in GREETINGS):
            greeting_sys = (
                f"You are the PrivateRAG Secure Assistant for '{vault.display_name}'. "
                "Reply directly, warmly, and concisely (1-2 sentences). Welcome the user and ask how you can help."
            )
            parsed_greeting = self._call_ollama(f"The user said: '{query}'. Provide a short, direct welcome.", greeting_sys)
            if parsed_greeting and parsed_greeting.get("answer"):
                return parsed_greeting["answer"].strip(), [], [], "LLM_GROUNDED", None
            else:
                default_greeting = (
                    f"Hello! I am your assistant for **{vault.display_name}**. "
                    "How can I help you with your documents today?"
                )
                return default_greeting, [], [], "LLM_GROUNDED", None

        # 4. Construct Untrusted Evidence Envelope (§61, §210)
        filtered_evidence = [e for e in evidence if len(e.content.strip()) >= 10]
        if not filtered_evidence:
            filtered_evidence = evidence

        evidence_lines = []
        canonical_citation_lookup: Dict[str, Citation] = {}

        for idx, item in enumerate(filtered_evidence):
            c_id = f"C{idx + 1}"
            locator = item.provenance.get("locator", f"Section {idx + 1}")
            exact_content = item.content.strip()

            evidence_lines.append(f"[ID: {c_id}] (Locator: {locator})\n{exact_content}\n")
            prov = item.provenance or {}
            canonical_citation_lookup[c_id] = Citation(
                citation_id=c_id,
                evidence_id=item.evidence_id,
                vault_name=vault.display_name,
                locator=locator,
                quote=exact_content,
                verified=False,
                modality=prov.get("modality", "document"),
                media_url=prov.get("media_url"),
                keyframe_url=prov.get("keyframe_url"),
                timestamp=prov.get("timestamp"),
            )

        evidence_envelope = "\n".join(evidence_lines)

        # Build conversation history block
        history_block = ""
        if history:
            clean_history = [m for m in history[-4:] if m.get("content")]
            if clean_history:
                h_lines = []
                for m in clean_history:
                    role_label = "User" if m.get("role") == "user" else "Assistant"
                    h_text = m.get("content", "").strip()
                    if len(h_text) > 250:
                        h_text = h_text[:250] + "..."
                    h_lines.append(f"{role_label}: {h_text}")
                history_block = f"<RECENT_CONVERSATION_HISTORY>\n" + "\n".join(h_lines) + "\n</RECENT_CONVERSATION_HISTORY>\n\n"

        system_prompt = (
            f"You are the PrivateRAG Secure Intelligence Assistant for workspace '{vault.display_name}'.\n"
            "INSTRUCTIONS:\n"
            "1. Answer ONLY what the user asks directly, concisely, and factually based on the authorized evidence.\n"
            "2. If the user asks a follow-up question (e.g., 'give me in detail', 'explain more'), maintain conversational continuity with the previous turns.\n"
            "3. Do NOT include generic conversational filler, unsolicited disclaimers, or lengthy preamble.\n"
            "4. Format your response cleanly using concise bullet points, bold key terms, and clear markdown.\n"
            "5. Cite sources directly using markers like [C1], [C2].\n"
            "6. Return your answer as a JSON object with keys:\n"
            "  \"answer\": \"your concise, direct markdown answer\",\n"
            "  \"claims\": [ {\"text\": \"factual sentence\", \"citation_ids\": [\"C1\"]} ],\n"
            "  \"citations\": [ {\"citation_id\": \"C1\", \"locator\": \"Page X\"} ]\n"
            "Never invent facts not present in the evidence."
        )

        user_prompt = (
            f"{history_block}"
            f"CURRENT USER QUERY: {query}\n\n"
            f"<UNTRUSTED_EVIDENCE_DATA>\n{evidence_envelope}\n</UNTRUSTED_EVIDENCE_DATA>\n"
        )

        # 5. Attempt local Ollama inference
        parsed_json = self._call_ollama(user_prompt, system_prompt)
        if parsed_json:
            full_answer = parsed_json.get("answer") or parsed_json.get("response") or parsed_json.get("result") or parsed_json.get("summary")
            if full_answer and len(full_answer.strip()) > 10:
                # DLP output firewall (§66)
                if self.output_dlp_scan(full_answer):
                    return "Answer withheld because it could not be safely verified by output DLP filters.", [], [], "ANSWER_BLOCKED", "OUTPUT_DLP_VIOLATION"

                # Extract or build citations
                citations: List[Citation] = []
                referenced_cids = set()

                raw_cits = parsed_json.get("citations", [])
                if raw_cits and isinstance(raw_cits, list):
                    for cit in raw_cits:
                        if isinstance(cit, dict):
                            cid = cit.get("citation_id")
                            orig_cit = canonical_citation_lookup.get(cid)
                            if orig_cit:
                                citations.append(Citation(
                                    citation_id=cid,
                                    evidence_id=orig_cit.evidence_id,
                                    vault_name=orig_cit.vault_name,
                                    locator=orig_cit.locator,
                                    quote=orig_cit.quote,  # Guarantee exact canonical quote
                                    verified=False
                                ))
                                referenced_cids.add(cid)

                # Fallback: if no citations parsed from model, attach top canonical citations
                if not citations:
                    top_cits = list(canonical_citation_lookup.values())[:3]
                    for orig_cit in top_cits:
                        citations.append(Citation(
                            citation_id=orig_cit.citation_id,
                            evidence_id=orig_cit.evidence_id,
                            vault_name=orig_cit.vault_name,
                            locator=orig_cit.locator,
                            quote=orig_cit.quote,
                            verified=False
                        ))
                        referenced_cids.add(orig_cit.citation_id)

                # Build claims matching verified citations
                claims: List[Claim] = []
                raw_claims = parsed_json.get("claims", [])
                if raw_claims and isinstance(raw_claims, list):
                    for cl in raw_claims:
                        if isinstance(cl, dict) and cl.get("text"):
                            cids = [cid for cid in cl.get("citation_ids", []) if cid in referenced_cids]
                            if not cids and citations:
                                cids = [citations[0].citation_id]
                            claims.append(Claim(text=cl["text"], citation_ids=cids))

                if not claims and citations:
                    claims.append(Claim(text=full_answer[:120], citation_ids=[citations[0].citation_id]))

                return full_answer, claims, citations, "LLM_GROUNDED", None

        # 6. High-Quality Safe Extractive Mode (§58, §213)
        # When local LLM is offline or busy, provide structured, readable synthesis
        valid_citations: List[Citation] = [c for c in canonical_citation_lookup.values() if len(c.quote.strip()) > 15]
        if not valid_citations:
            valid_citations = list(canonical_citation_lookup.values())[:5]

        extracted_claims: List[Claim] = []
        answer_parts: List[str] = []

        for cit in valid_citations:
            snippet = cit.quote.strip()
            short_quote = snippet[:280] + "..." if len(snippet) > 280 else snippet
            claim_text = f"**{cit.locator}**: {short_quote} [{cit.citation_id}]"
            extracted_claims.append(Claim(text=claim_text, citation_ids=[cit.citation_id]))
            answer_parts.append(f"- **{cit.locator}**: {short_quote} [{cit.citation_id}]")

        full_extractive_answer = "\n".join(answer_parts)
        return full_extractive_answer, extracted_claims, valid_citations, "SAFE_EXTRACTIVE_MODE", None

local_llm = LocalLLM()
