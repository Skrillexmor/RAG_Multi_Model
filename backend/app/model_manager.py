import os
import io
import gc
import json
import time
import base64
import logging
import threading
import subprocess
import urllib.request
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# Ensure FFmpeg directory is in Windows PATH
_FFMPEG_PATHS = [
    r"C:\Users\Viraj Garach\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg.Essentials_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.1-essentials_build\bin",
    r"C:\Program Files\Softdeluxe\Free Download Manager",
]
for _p in _FFMPEG_PATHS:
    if os.path.exists(_p) and _p not in os.environ.get("PATH", ""):
        os.environ["PATH"] = _p + os.pathsep + os.environ.get("PATH", "")

OLLAMA_BASE_URL = os.getenv("LLM_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
VISION_MODEL = os.getenv("VISION_MODEL", "qwen2.5vl:3b")
TEXT_MODEL = os.getenv("LLM_MODEL", "gemma3:4b")
WHISPER_MODEL_NAME = os.getenv("WHISPER_MODEL", "base")

class LocalModelManager:
    """
    Centralized Multimodal Model & Memory Manager.
    
    STRICT LAPTOP RAM INVARIANT:
    At any given time, ONLY ONE model is allowed in active working memory.
    All other models are immediately unloaded ('on rest') to ensure
    laptop RAM is never overloaded and system resources remain stable.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._active_model_name: Optional[str] = None
        self._last_active_time: float = time.time()

    @property
    def current_active_model(self) -> Optional[str]:
        return self._active_model_name

    def unload_all_ollama_models(self):
        """
        Forcefully unloads any model currently resident in Ollama VRAM/RAM
        using ollama stop.
        """
        try:
            ps_url = f"{OLLAMA_BASE_URL}/api/ps"
            req = urllib.request.Request(ps_url)
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                models = data.get("models", [])
                for m in models:
                    m_name = m.get("name") or m.get("model")
                    if m_name:
                        self._unload_single_ollama_model(m_name)
        except Exception as e:
            logger.debug(f"Ollama ps check note: {e}")
            self._unload_single_ollama_model(VISION_MODEL)
            self._unload_single_ollama_model(TEXT_MODEL)

    def _unload_single_ollama_model(self, model_name: str):
        """Stops the model immediately via CLI or API to free memory."""
        try:
            subprocess.run(["ollama", "stop", model_name], capture_output=True, timeout=10)
            logger.info(f"[ModelManager] Successfully stopped Ollama model: {model_name}")
        except Exception:
            try:
                gen_url = f"{OLLAMA_BASE_URL}/api/generate"
                payload = json.dumps({"model": model_name, "keep_alive": 0}).encode("utf-8")
                req = urllib.request.Request(gen_url, data=payload, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=4) as resp:
                    resp.read()
            except Exception:
                pass

    def detect_model_by_filename(self, filename: str) -> Dict[str, str]:
        """Auto-detects the optimal offline model and modality based on file extension."""
        ext = Path(filename).suffix.lower()
        if ext in {".mp3", ".wav", ".m4a", ".ogg", ".flac"}:
            return {
                "model_id": f"whisper-{WHISPER_MODEL_NAME}",
                "model_name": "Whisper Base (Speech-to-Text)",
                "modality": "audio",
                "badge": "🎙️ Whisper",
                "description": "Speech-to-text with segment timestamps and verbatim speech capture"
            }
        elif ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}:
            return {
                "model_id": VISION_MODEL,
                "model_name": "Qwen 2.5-VL 3B (Vision & OCR)",
                "modality": "image",
                "badge": "👁️ Qwen-VL",
                "description": "Visual diagram, flowchart, table, and UI comprehension"
            }
        elif ext in {".mp4", ".mkv", ".mov", ".avi", ".webm"}:
            return {
                "model_id": f"{VISION_MODEL} + whisper",
                "model_name": "Multimodal Vision + Whisper",
                "modality": "video",
                "badge": "🎬 Qwen-VL + Whisper",
                "description": "Keyframe scene extraction + spoken dialogue transcription"
            }
        else:
            return {
                "model_id": TEXT_MODEL,
                "model_name": "Gemma 3 4B (Neural LLM)",
                "modality": "document",
                "badge": "💬 Gemma 3",
                "description": "Dense vector retrieval & grounded neural synthesis"
            }

    def get_system_status(self) -> Dict[str, Any]:
        """Returns the status of all local offline models and current active memory state."""
        installed_ollama = []
        try:
            tags_url = f"{OLLAMA_BASE_URL}/api/tags"
            req = urllib.request.Request(tags_url)
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                installed_ollama = [m.get("name", "") for m in data.get("models", [])]
        except Exception:
            pass

        currently_resident = []
        try:
            ps_url = f"{OLLAMA_BASE_URL}/api/ps"
            req = urllib.request.Request(ps_url)
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                currently_resident = [m.get("name", "") for m in data.get("models", [])]
        except Exception:
            pass

        return {
            "single_model_policy_active": True,
            "current_active_model": self._active_model_name or ("none (all on rest)" if not currently_resident else currently_resident[0]),
            "ollama_resident_models": currently_resident,
            "installed_models": {
                "vision": VISION_MODEL if any(VISION_MODEL in m for m in installed_ollama) else "not_installed",
                "chat": TEXT_MODEL if any(TEXT_MODEL in m for m in installed_ollama) else "not_installed",
                "audio": f"whisper-{WHISPER_MODEL_NAME} (faster-whisper int8 CPU)"
            },
            "offline_compliance": "100% Local / Zero Cloud Egress"
        }

    # ==========================================
    # 1. AUDIO: WHISPER SPEECH-TO-TEXT PIPELINE
    # ==========================================
    def transcribe_audio(
        self,
        audio_path_or_bytes: Any,
        filename: str = "audio_recording"
    ) -> List[Dict[str, Any]]:
        """
        Transcribes audio using local faster-whisper on CPU with int8 quantization.
        Strict RAM Invariant:
        1. Purges all Ollama models before loading Whisper.
        2. Executes speech recognition with segment timestamps.
        3. Completely deletes Whisper instance and runs gc.collect() immediately.
        """
        with self._lock:
            # Step 1: Ensure all other models are on rest
            self.unload_all_ollama_models()
            gc.collect()
            self._active_model_name = f"whisper-{WHISPER_MODEL_NAME}"
            logger.info(f"[ModelManager] Active model switched to: {self._active_model_name}")

            temp_audio_file = None
            try:
                # Prepare audio path or array
                if isinstance(audio_path_or_bytes, (bytes, bytearray)):
                    from .config import QUARANTINE_DIR
                    temp_ext = Path(filename).suffix.lower() or ".wav"
                    temp_audio_file = QUARANTINE_DIR / f"temp_transcribe_{int(time.time()*1000)}{temp_ext}"
                    temp_audio_file.write_bytes(audio_path_or_bytes)
                    audio_target = str(temp_audio_file)
                else:
                    audio_target = str(audio_path_or_bytes)

                # Decode audio via ffmpeg to mono 16kHz float32 numpy array
                audio_array = self._load_audio_array(audio_target)
                if audio_array is None or len(audio_array) == 0:
                    return [{
                        "start": 0.0,
                        "end": 0.0,
                        "timestamp": "00:00 - 00:00",
                        "text": f"Audio file {filename} contains no audible speech track."
                    }]

                # Load Whisper with CPU int8 quantization
                from faster_whisper import WhisperModel
                whisper_model = WhisperModel(WHISPER_MODEL_NAME, device="cpu", compute_type="int8")

                segments, info = whisper_model.transcribe(
                    audio_array,
                    beam_size=5,
                    vad_filter=True,
                    vad_parameters=dict(min_silence_duration_ms=500)
                )

                results = []
                for s in segments:
                    text_clean = s.text.strip()
                    if not text_clean:
                        continue
                    m_start, s_start = int(s.start // 60), int(s.start % 60)
                    m_end, s_end = int(s.end // 60), int(s.end % 60)
                    ts_str = f"{m_start:02d}:{s_start:02d} - {m_end:02d}:{s_end:02d}"
                    results.append({
                        "start": round(s.start, 2),
                        "end": round(s.end, 2),
                        "timestamp": ts_str,
                        "text": text_clean,
                        "language": info.language
                    })

                # If speech recognition returned no segments
                if not results:
                    duration_sec = len(audio_array) / 16000.0
                    m_dur, s_dur = int(duration_sec // 60), int(duration_sec % 60)
                    results.append({
                        "start": 0.0,
                        "end": round(duration_sec, 2),
                        "timestamp": f"00:00 - {m_dur:02d}:{s_dur:02d}",
                        "text": f"Audio recording {filename} processed. No spoken speech detected (ambient/silence)."
                    })

                logger.info(f"[ModelManager] Transcribed {len(results)} segments for {filename}")
                return results

            except Exception as e:
                logger.error(f"[ModelManager] Whisper transcription failed: {e}", exc_info=True)
                return [{
                    "start": 0.0,
                    "end": 0.0,
                    "timestamp": "00:00",
                    "text": f"Audio recording {filename} ingested. Speech transcription encountered: {str(e)}"
                }]

            finally:
                # Cleanup Whisper instance from RAM
                try:
                    del whisper_model
                except Exception:
                    pass
                gc.collect()
                self._active_model_name = None
                logger.info("[ModelManager] Whisper purged from RAM. Model on rest.")

                if temp_audio_file and temp_audio_file.exists():
                    try:
                        temp_audio_file.unlink()
                    except Exception:
                        pass

    def _load_audio_array(self, file_path: str, sr: int = 16000) -> Optional[np.ndarray]:
        """Decodes any audio file format to mono 16kHz float32 using ffmpeg."""
        try:
            cmd = [
                "ffmpeg", "-nostdin", "-threads", "0",
                "-i", file_path,
                "-f", "s16le", "-ac", "1", "-ar", str(sr), "-"
            ]
            out = subprocess.run(cmd, capture_output=True, check=True).stdout
            return np.frombuffer(out, np.int16).flatten().astype(np.float32) / 32768.0
        except Exception as e:
            logger.warning(f"[ModelManager] FFmpeg audio decode error: {e}")
            return None

    # ==========================================
    # 2. VISION: QWEN-VL IMAGE REASONING PIPELINE
    # ==========================================
    def analyze_image(
        self,
        image_bytes: bytes,
        filename: str = "image_asset"
    ) -> Dict[str, Any]:
        """
        Analyzes image using Qwen-VL (qwen2.5vl:3b) + OCR.
        Strict RAM Invariant:
        1. Purges any running LLM / Whisper before calling Qwen-VL.
        2. Executes deep visual analysis with Qwen-VL.
        3. Forcefully stops/unloads Qwen-VL immediately after response.
        4. Triggers gc.collect().
        """
        with self._lock:
            # Step 1: Ensure all models are on rest
            self.unload_all_ollama_models()
            gc.collect()
            self._active_model_name = VISION_MODEL
            logger.info(f"[ModelManager] Active model switched to: {self._active_model_name}")

            visual_caption = ""
            ocr_text = ""

            try:
                # 1. OCR extraction via EasyOCR / pytesseract
                try:
                    import easyocr
                    reader = easyocr.Reader(['en'], gpu=False)
                    ocr_results = reader.readtext(io.BytesIO(image_bytes), detail=0)
                    ocr_text = " ".join(ocr_results).strip()
                    del reader
                    gc.collect()
                except Exception:
                    try:
                        from PIL import Image
                        import pytesseract
                        pil_img = Image.open(io.BytesIO(image_bytes))
                        ocr_text = pytesseract.image_to_string(pil_img).strip()
                    except Exception:
                        ocr_text = ""

                # 2. Local Vision AI reasoning via Qwen-VL
                b64_img = base64.b64encode(image_bytes).decode("utf-8")
                vision_prompt = (
                    "Describe and analyze the contents of this image in clear detail. "
                    "If it shows scenery, landscapes, or objects, describe what is visible. "
                    "If it shows diagrams, flowcharts, text, or tables, explain them thoroughly."
                )

                def _query_vision(p: str) -> str:
                    payload = json.dumps({
                        "model": VISION_MODEL,
                        "prompt": p,
                        "images": [b64_img],
                        "stream": False
                    }).encode("utf-8")
                    r = urllib.request.Request(
                        f"{OLLAMA_BASE_URL}/api/generate",
                        data=payload,
                        headers={"Content-Type": "application/json"}
                    )
                    with urllib.request.urlopen(r, timeout=300) as resp:
                        data = json.loads(resp.read().decode("utf-8"))
                        return data.get("response", "").strip()

                visual_caption = _query_vision(vision_prompt)

                # Fallback: if model returned refusal or too short, retry with direct descriptive prompt
                refusal_phrases = ["can't assist", "cannot assist", "sorry, but i", "unable to assist"]
                if any(phrase in visual_caption.lower() for phrase in refusal_phrases) or len(visual_caption) < 20:
                    logger.info("[ModelManager] Vision model returned refusal or short output, retrying with fallback prompt...")
                    fallback_prompt = "Describe what is visible in this picture in detail, including nature, objects, scenery, and colors."
                    alt_caption = _query_vision(fallback_prompt)
                    if alt_caption and not any(phrase in alt_caption.lower() for phrase in refusal_phrases):
                        visual_caption = alt_caption

            except Exception as e:
                logger.warning(f"[ModelManager] Qwen-VL vision inference note: {e}")
                visual_caption = f"Image asset {filename} parsed via local offline visual engine."

            finally:
                # Purge Qwen-VL from Ollama RAM
                self._unload_single_ollama_model(VISION_MODEL)
                gc.collect()
                self._active_model_name = None
                logger.info("[ModelManager] Qwen-VL purged from RAM. Model on rest.")

            # Combine parts
            combined_parts = []
            if visual_caption:
                combined_parts.append(f"Visual Analysis & Understanding:\n{visual_caption}")
            if ocr_text:
                combined_parts.append(f"Verbatim In-Image Text (OCR):\n{ocr_text}")
            if not combined_parts:
                combined_parts.append(f"Image asset {filename} ingested into knowledge compartment.")

            return {
                "visual_caption": visual_caption,
                "ocr_text": ocr_text,
                "combined_text": "\n\n".join(combined_parts)
            }

    # ==========================================
    # 3. CHAT: LOCAL LLM GENERATION PIPELINE
    # ==========================================
    def generate_chat_response(
        self,
        prompt: str,
        system_prompt: str,
        model_name: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Executes text LLM reasoning with single-model memory protection.
        Purges Vision/Whisper before running Gemma-3, and stops/unloads after inference.
        """
        target_model = model_name or TEXT_MODEL

        with self._lock:
            # Unload any other model currently in RAM
            self.unload_all_ollama_models()
            gc.collect()
            self._active_model_name = target_model
            logger.info(f"[ModelManager] Active model switched to: {self._active_model_name}")

            try:
                req_data = json.dumps({
                    "model": target_model,
                    "prompt": prompt,
                    "system": system_prompt,
                    "stream": False,
                    "format": "json"
                }).encode("utf-8")

                req = urllib.request.Request(
                    f"{OLLAMA_BASE_URL}/api/generate",
                    data=req_data,
                    headers={"Content-Type": "application/json"}
                )

                with urllib.request.urlopen(req, timeout=120) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    response_str = data.get("response", "").strip()

                    # Clean markdown codeblocks
                    if response_str.startswith("```json"):
                        response_str = response_str[7:]
                    elif response_str.startswith("```"):
                        response_str = response_str[3:]
                    if response_str.endswith("```"):
                        response_str = response_str[:-3]
                    response_str = response_str.strip()

                    try:
                        return json.loads(response_str)
                    except json.JSONDecodeError:
                        return {"answer": response_str, "claims": []}

            except Exception as e:
                logger.error(f"[ModelManager] LLM generation error: {e}")
                return None

            finally:
                self._unload_single_ollama_model(target_model)
                gc.collect()
                self._active_model_name = None
                logger.info(f"[ModelManager] {target_model} purged from RAM. Model on rest.")

local_model_manager = LocalModelManager()
