// ─── Audio Agent ───
// Selects background music and detects beats for cut synchronization.

import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import type { PipelineState, MusicTrack } from "@/lib/types";
import type { AgentContext } from "./agent-graph";
import { fetchMusicTracks } from "@/lib/services/freesound";
import { detectBeats, estimateBPM } from "@/lib/services/beat-detector";

export async function audioAgent(
  state: PipelineState,
  context: AgentContext
): Promise<{ state: PipelineState; output: MusicTrack | null }> {
  if (!state.brief) {
    throw new Error("AudioAgent: Missing brief.");
  }

  context.log(`AudioAgent: Finding music for tone "${state.brief.tone}"...`);

  // Map brief tone to music mood
  const moodMap: Record<string, string> = {
    professional: "corporate",
    energetic: "motivational",
    cinematic: "cinematic",
    warm: "warm",
    serious: "dark",
    urgent: "aggressive",
    playful: "energetic",
  };
  const mood = moodMap[state.brief.tone.toLowerCase()] || state.brief.tone;

  // Fetch music tracks
  const tracks = await fetchMusicTracks(mood, 3);

  if (tracks.length === 0) {
    context.log("AudioAgent: No music found, proceeding without background music.");
    return { state, output: null };
  }

  // Pick the best track (first result from Freesound, sorted by rating)
  const chosenTrack = tracks[0];
  context.log(`AudioAgent: Selected "${chosenTrack.name}" by ${chosenTrack.author} (${chosenTrack.duration}s)`);

  // Download the music preview for beat detection
  try {
    const audioDir = path.join(process.cwd(), "public", "temp", state.correlationId || "default", "audio");
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const musicPath = path.join(audioDir, `music-${chosenTrack.id}.mp3`);
    const webRelativePath = `/temp/${state.correlationId || "default"}/audio/music-${chosenTrack.id}.mp3`;

    const response = await fetch(chosenTrack.audioUrl);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(musicPath, buffer);
      chosenTrack.audioUrl = webRelativePath;
      context.log(`AudioAgent: Music downloaded successfully (${Math.round(buffer.length / 1024)}KB)`);

      // Detect beats
      context.log("AudioAgent: Detecting beats...");
      const beats = await detectBeats(buffer);
      chosenTrack.beats = beats;
      chosenTrack.bpm = estimateBPM(beats);

      context.log(`AudioAgent: Detected ${beats.length} beats, ~${chosenTrack.bpm} BPM`);
    } else {
      context.log(`AudioAgent: Music download failed - Status ${response.status}`);
    }
  } catch (err) {
    context.log(`AudioAgent: Beat detection/Download failed: ${err instanceof Error ? err.message : err}`);
  }

  // Update audio plan if it exists
  const updatedAudioPlan = state.audioPlan
    ? { ...state.audioPlan, musicTrack: chosenTrack }
    : undefined;

  return {
    state: {
      ...state,
      audioPlan: updatedAudioPlan || state.audioPlan,
      beats: chosenTrack.beats,
    },
    output: chosenTrack,
  };
}
