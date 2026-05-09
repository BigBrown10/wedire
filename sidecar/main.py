"""
WhisperX Sidecar — Minimal FastAPI service for word-level VO alignment.
Accepts audio files and returns word-level timestamps + pause detection.

Run with: uvicorn sidecar.main:app --port 8321
"""

import os
import tempfile
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="WhisperX Sidecar", version="1.0.0")

# Allow CORS from the Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-loaded WhisperX model
_model = None
_align_model = None
_align_metadata = None


class WordTimestamp(BaseModel):
    word: str
    start: float  # seconds
    end: float    # seconds
    confidence: float


class PausePoint(BaseModel):
    start: float  # seconds
    end: float    # seconds
    type: str     # 'breath', 'sentence', 'paragraph'


class AlignmentResponse(BaseModel):
    words: List[WordTimestamp]
    pauses: List[PausePoint]
    duration: float


def get_model():
    """Lazy-load the WhisperX model (first call is slow)."""
    global _model, _align_model, _align_metadata
    if _model is None:
        import whisperx
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"

        print(f"[WhisperX] Loading model on {device} ({compute_type})...")
        _model = whisperx.load_model("base", device, compute_type=compute_type)

        # Load alignment model
        _align_model, _align_metadata = whisperx.load_align_model(
            language_code="en", device=device
        )
        print("[WhisperX] Model loaded successfully.")

    return _model, _align_model, _align_metadata


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "whisperx-sidecar"}


@app.post("/align", response_model=AlignmentResponse)
async def align_audio(audio: UploadFile = File(...)):
    """
    Accept an audio file and return word-level timestamps.
    Supports MP3, WAV, M4A formats.
    """
    try:
        import whisperx
        import torch

        model, align_model, align_metadata = get_model()
        device = "cuda" if torch.cuda.is_available() else "cpu"

        # Save uploaded file to temp
        suffix = os.path.splitext(audio.filename or "audio.mp3")[1] or ".mp3"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await audio.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Load and transcribe
            audio_data = whisperx.load_audio(tmp_path)
            result = model.transcribe(audio_data, batch_size=16)

            # Align words
            aligned = whisperx.align(
                result["segments"],
                align_model,
                align_metadata,
                audio_data,
                device,
                return_char_alignments=False,
            )

            # Extract word timestamps
            words = []
            for segment in aligned.get("segments", []):
                for word_info in segment.get("words", []):
                    if "start" in word_info and "end" in word_info:
                        words.append(WordTimestamp(
                            word=word_info.get("word", ""),
                            start=round(word_info["start"], 3),
                            end=round(word_info["end"], 3),
                            confidence=round(word_info.get("score", 0.9), 3),
                        ))

            # Detect pauses
            pauses = []
            for i in range(1, len(words)):
                gap = words[i].start - words[i - 1].end
                if gap >= 0.3:
                    pause_type = "paragraph" if gap >= 0.8 else ("sentence" if gap >= 0.5 else "breath")
                    pauses.append(PausePoint(
                        start=round(words[i - 1].end, 3),
                        end=round(words[i].start, 3),
                        type=pause_type,
                    ))

            # Calculate total duration
            duration = len(audio_data) / 16000  # WhisperX uses 16kHz

            return AlignmentResponse(
                words=words,
                pauses=pauses,
                duration=round(duration, 3),
            )
        finally:
            os.unlink(tmp_path)

    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="WhisperX not installed. Run: pip install -r sidecar/requirements.txt"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8321)
