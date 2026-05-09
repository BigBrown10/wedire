// ─── Voice Agent ───
// Generates voiceover audio for each script segment using ElevenLabs.
// Optionally aligns with WhisperX for word-level timestamps.

import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import type { PipelineState, AudioPlan, VOSegment } from "@/lib/types";
import type { AgentContext } from "./agent-graph";
import { generateVoiceover, getAvailableVoices } from "@/lib/services/elevenlabs";
import { alignAudio } from "@/lib/services/whisperx";

// Default curated premium ElevenLabs voices
const VOICE_MAP: Record<string, string> = {
  cinematic: "pNInz6obpgDQGcFmaJgB", // Adam - Deep, dominant
  warm: "EXAVITQu4vr4xnSDxMaL",      // Sarah - Mature, reassuring
  professional: "onwK4e9ZLuTAKqWW03F9", // Daniel - Steady broadcaster
  energetic: "TX3LPaxmHKxFdv7VOQHJ", // Liam - Young, energetic
  young: "TX3LPaxmHKxFdv7VOQHJ",     // Liam - Young, energetic
  social: "TX3LPaxmHKxFdv7VOQHJ",    // Liam
  serious: "N2lVS1w4EtoT3dr4eOWO",   // Callum - Husky
  natural: "IKne3meq5aSn9XLyUdCD",   // Charlie - Deep, confident
  luxury: "pNInz6obpgDQGcFmaJgB",    // Adam
};

function selectVoiceForTone(tone: string): string {
  const normalized = tone.toLowerCase();
  for (const [key, voiceId] of Object.entries(VOICE_MAP)) {
    if (normalized.includes(key)) return voiceId;
  }
  return VOICE_MAP.natural; // Default fallback
}

export async function voiceAgent(
  state: PipelineState,
  context: AgentContext
): Promise<{ state: PipelineState; output: AudioPlan }> {
  if (!state.script) {
    throw new Error("VoiceAgent: Missing script.");
  }

  context.log(`VoiceAgent: Generating VO for ${state.script.segments.length} segments...`);

  // Create temp directory for audio files in public folder for Remotion accessibility
  const audioDir = path.join(process.cwd(), "public", "temp", state.correlationId, "audio");
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
  }

  const voSegments: VOSegment[] = [];

  let voiceId = state.brief?.voiceId;

  if (!voiceId) {
    // Priority 1: Map from curated voices based on tone/style
    const toneMatched = selectVoiceForTone(state.brief?.tone || "natural");
    if (toneMatched) {
      voiceId = toneMatched;
    } else {
      // Priority 2: Try to get any available voice from the API
      const availableVoices = await getAvailableVoices().catch(() => []);
      if (availableVoices.length > 0) {
        voiceId = availableVoices[0].voiceId;
      }
    }
  }

  if (!voiceId) voiceId = "IKne3meq5aSn9XLyUdCD"; // Final safety net: Charlie (Conversational)

  context.log(`VoiceAgent: Selected voice ID ${voiceId} for tone "${state.brief?.tone}"`);

  const segments = await Promise.all(state.script.segments.map(async (segment) => {
    context.log(`VoiceAgent: [Segment ${segment.id}] Generating VO...`);
    let ttsResult;
    try {
      ttsResult = await generateVoiceover(segment.text, voiceId);
    } catch (err) {
      context.log(`VoiceAgent: [Segment ${segment.id}] Voice generation failed with ID ${voiceId}, falling back to Rachel: ${err}`);
      ttsResult = await generateVoiceover(segment.text, "21m00Tcm4TlvDq8ikWAM"); // Rachel fallback
    }
    const audioPath = path.join(audioDir, `${segment.id}.mp3`);
    fs.writeFileSync(audioPath, ttsResult.audioBuffer);
    const alignment = await alignAudio(ttsResult.audioBuffer);
    
    context.log(`VoiceAgent: [Segment ${segment.id}] ${ttsResult.durationMs}ms, ${alignment.words.length} words aligned`);
    
    return {
      narrationSegmentId: segment.id,
      audioUrl: `/temp/${state.correlationId}/audio/${segment.id}.mp3`,
      durationMs: ttsResult.durationMs,
      wordTimestamps: alignment.words,
      pauses: alignment.pauses,
    };
  }));

  voSegments.push(...segments);

  // Collect all word timestamps for the assembly agent
  const allWordTimestamps = voSegments.flatMap(s => s.wordTimestamps);

  const audioPlan: AudioPlan = {
    id: uuid(),
    scriptId: state.script.id,
    voSegments,
    musicTrack: null, // Will be filled by audio agent
    totalDurationMs: voSegments.reduce((sum, s) => sum + s.durationMs, 0),
  };

  context.log(`VoiceAgent: Audio plan complete — ${voSegments.length} segments, ${Math.round(audioPlan.totalDurationMs / 1000)}s total`);

  return {
    state: { ...state, audioPlan, wordTimestamps: allWordTimestamps },
    output: audioPlan,
  };
}
