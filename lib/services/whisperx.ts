// ─── WhisperX Client ───
// Client for the Python sidecar that provides word-level VO alignment.
// Falls back gracefully if the sidecar is unavailable.

import type { WordTimestamp, PausePoint } from "@/lib/types";

const WHISPERX_URL = process.env.WHISPERX_URL || "http://127.0.0.1:8321";
const WHISPERX_TIMEOUT_MS = 120_000; // 120s — CPU inference + model loading is slow

export interface AlignmentResult {
  words: WordTimestamp[];
  pauses: PausePoint[];
  source: "whisperx" | "estimated";
}

/**
 * Send audio to WhisperX sidecar for word-level alignment.
 * Returns timestamps for each word and detected natural pauses.
 */
export async function alignAudio(audioBuffer: Buffer): Promise<AlignmentResult> {
  try {
    const healthy = await checkWhisperXHealth();
    if (!healthy) {
      console.warn("[WhisperX] Sidecar unavailable, using estimated timestamps");
      return estimateFallback(audioBuffer);
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/mpeg" });
    formData.append("audio", blob, "audio.mp3");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WHISPERX_TIMEOUT_MS);

    const response = await fetch(`${WHISPERX_URL}/align`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`WhisperX returned ${response.status}`);
    }

    const data = await response.json();

    const words: WordTimestamp[] = (data.words || []).map((w: Record<string, unknown>) => ({
      word: w.word as string,
      startMs: Math.round((w.start as number) * 1000),
      endMs: Math.round((w.end as number) * 1000),
      confidence: w.confidence as number || 0.9,
    }));

    const pauses = detectPauses(words);

    return { words, pauses, source: "whisperx" };
  } catch (err) {
    console.warn("[WhisperX] Alignment failed, using estimates:", err instanceof Error ? err.message : err);
    return estimateFallback(audioBuffer);
  }
}

/**
 * Detect natural pauses between words.
 * A pause is any gap >= minGapMs between consecutive words.
 */
export function detectPauses(words: WordTimestamp[], minGapMs: number = 300): PausePoint[] {
  const pauses: PausePoint[] = [];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startMs - words[i - 1].endMs;
    if (gap >= minGapMs) {
      let type: PausePoint['type'] = 'breath';
      if (gap >= 800) type = 'paragraph';
      else if (gap >= 500) type = 'sentence';

      pauses.push({
        startMs: words[i - 1].endMs,
        endMs: words[i].startMs,
        type,
      });
    }
  }

  return pauses;
}

/**
 * Check if the WhisperX sidecar is running and responsive.
 */
export async function checkWhisperXHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s for health check

    const response = await fetch(`${WHISPERX_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fallback: estimate word timestamps based on audio duration and character count.
 * This is rough but keeps the pipeline running without WhisperX.
 */
function estimateFallback(audioBuffer: Buffer): AlignmentResult {
  // Estimate total duration from MP3 buffer size (~128kbps)
  const estimatedDurationMs = Math.round((audioBuffer.length * 8) / 128);

  // We can't know the words without transcription, so return empty
  // The assembly agent will use segment-level timing instead
  return {
    words: [],
    pauses: [],
    source: "estimated",
  };
}
