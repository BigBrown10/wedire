// ─── Health Check API ───
// Reports system readiness: API keys, FFmpeg, CLIP model, WhisperX sidecar.

import { NextResponse } from "next/server";
import { checkElevenLabsHealth } from "@/lib/services/elevenlabs";
import { checkClipHealth } from "@/lib/services/clip";
import { checkWhisperXHealth } from "@/lib/services/whisperx";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  // Gemini API Key
  checks.gemini = {
    ok: !!process.env.GEMINI_API_KEY,
    detail: process.env.GEMINI_API_KEY ? "API key set" : "GEMINI_API_KEY not set",
  };

  // ElevenLabs
  try {
    const el = await checkElevenLabsHealth();
    checks.elevenlabs = {
      ok: el.available,
      detail: el.available
        ? `${el.characterCount?.toLocaleString()}/${el.characterLimit?.toLocaleString()} chars used`
        : el.error || "Unavailable",
    };
  } catch {
    checks.elevenlabs = { ok: false, detail: "Check failed" };
  }

  // Pexels
  checks.pexels = {
    ok: !!process.env.PEXELS_API_KEY,
    detail: process.env.PEXELS_API_KEY ? "API key set" : "PEXELS_API_KEY not set",
  };

  // Pixabay
  checks.pixabay = {
    ok: !!process.env.PIXABAY_API_KEY,
    detail: process.env.PIXABAY_API_KEY ? "API key set" : "PIXABAY_API_KEY not set (optional)",
  };

  // Coverr
  checks.coverr = {
    ok: !!process.env.COVERR_API_KEY,
    detail: process.env.COVERR_API_KEY ? "API key set" : "COVERR_API_KEY not set (optional)",
  };

  // Freesound
  checks.freesound = {
    ok: !!process.env.FREESOUND_API_KEY,
    detail: process.env.FREESOUND_API_KEY ? "API key set" : "FREESOUND_API_KEY not set (optional)",
  };

  // CLIP Model
  try {
    const clip = await checkClipHealth();
    checks.clip = {
      ok: clip.available,
      detail: clip.available ? clip.modelName : clip.error || "Model not loaded",
    };
  } catch {
    checks.clip = { ok: false, detail: "Check failed (model may need download)" };
  }

  // WhisperX Sidecar
  const whisperx = await checkWhisperXHealth();
  checks.whisperx = {
    ok: whisperx,
    detail: whisperx ? "Sidecar running on :8321" : "Sidecar offline (optional — VO timing will use estimates)",
  };

  // FFmpeg
  let ffmpegOk = false;
  try {
    const { execSync } = require("child_process");
    execSync("ffmpeg -version", { stdio: "pipe" });
    ffmpegOk = true;
  } catch {}
  checks.ffmpeg = {
    ok: ffmpegOk,
    detail: ffmpegOk ? "FFmpeg found" : "FFmpeg not found in PATH",
  };

  const allCriticalOk = checks.gemini.ok && checks.pexels.ok;

  return NextResponse.json({
    status: allCriticalOk ? "ready" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
}
