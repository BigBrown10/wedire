// ─── ElevenLabs TTS Service ───
// Generates natural voiceover audio from script text.
// Handles chunked generation for long scripts.

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — clear, professional female voice
const MAX_CHARS_PER_REQUEST = 5000;

export interface VoiceOption {
  voiceId: string;
  name: string;
  category: string;
  previewUrl: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  durationMs: number;
  characterCount: number;
}

/**
 * Generate voiceover audio from text using ElevenLabs API.
 * Automatically chunks long text to respect API limits.
 */
export async function generateVoiceover(
  text: string,
  voiceId?: string,
  stability: number = 0.5,
  similarityBoost: number = 0.75
): Promise<TTSResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set. Get one at https://elevenlabs.io");
  }

  const effectiveVoiceId = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  // If text is short enough, generate in one shot
  if (text.length <= MAX_CHARS_PER_REQUEST) {
    return await generateChunk(apiKey, effectiveVoiceId, text, stability, similarityBoost);
  }

  // Split into chunks at sentence boundaries
  const chunks = splitIntoChunks(text, MAX_CHARS_PER_REQUEST);
  const results: TTSResult[] = [];

  for (const chunk of chunks) {
    const result = await generateChunk(apiKey, effectiveVoiceId, chunk, stability, similarityBoost);
    results.push(result);
    // Brief pause between requests to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Concatenate audio buffers
  const combinedBuffer = Buffer.concat(results.map(r => r.audioBuffer));
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const totalChars = results.reduce((sum, r) => sum + r.characterCount, 0);

  return {
    audioBuffer: combinedBuffer,
    durationMs: totalDurationMs,
    characterCount: totalChars,
  };
}

/**
 * Generate a single audio chunk via ElevenLabs text-to-speech API.
 */
async function generateChunk(
  apiKey: string,
  voiceId: string,
  text: string,
  stability: number,
  similarityBoost: number
): Promise<TTSResult> {
  const response = await fetch(
    `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      throw new Error("Invalid ElevenLabs API key.");
    }
    if (response.status === 429) {
      throw new Error("ElevenLabs rate limit reached. Try again later.");
    }
    throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  // Estimate duration: MP3 at ~128kbps
  const estimatedDurationMs = Math.round((audioBuffer.length * 8) / 128);

  return {
    audioBuffer,
    durationMs: estimatedDurationMs,
    characterCount: text.length,
  };
}

/**
 * List available voices from ElevenLabs.
 */
export async function getAvailableVoices(): Promise<VoiceOption[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set.");
  }

  const response = await fetch(`${ELEVENLABS_API_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch voices: ${response.status}`);
  }

  const data = await response.json();
  return (data.voices || []).map((v: Record<string, unknown>) => ({
    voiceId: v.voice_id as string,
    name: v.name as string,
    category: v.category as string || "unknown",
    previewUrl: v.preview_url as string || "",
  }));
}

/**
 * Check if the ElevenLabs API key is valid and get usage info.
 */
export async function checkElevenLabsHealth(): Promise<{
  available: boolean;
  characterCount?: number;
  characterLimit?: number;
  error?: string;
}> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return { available: false, error: "ELEVENLABS_API_KEY not set" };
  }

  try {
    const response = await fetch(`${ELEVENLABS_API_BASE}/user/subscription`, {
      headers: { "xi-api-key": apiKey },
    });

    if (!response.ok) {
      return { available: false, error: `API returned ${response.status}` };
    }

    const data = await response.json();
    return {
      available: true,
      characterCount: data.character_count,
      characterLimit: data.character_limit,
    };
  } catch {
    return { available: false, error: "Failed to connect to ElevenLabs" };
  }
}

// ─── Utilities ───

function splitIntoChunks(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks;
}
