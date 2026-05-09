// ─── QA Agent ───
// Validates the composition spec before rendering.
// Checks: media references exist, durations match, audio sync, etc.

import fs from "fs";
import path from "path";
import type { PipelineState } from "@/lib/types";
import type { AgentContext } from "./agent-graph";

export interface QAResult {
  pass: boolean;
  checks: QACheck[];
  warnings: string[];
  errors: string[];
}

interface QACheck {
  name: string;
  pass: boolean;
  message: string;
}

export async function qaAgent(
  state: PipelineState,
  context: AgentContext
): Promise<{ state: PipelineState; output: QAResult }> {
  if (!state.compositionSpec) {
    throw new Error("QAAgent: Missing composition spec.");
  }

  context.log("QAAgent: Running pre-render validation...");

  const checks: QACheck[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const spec = state.compositionSpec;

  // Check 1: Duration sanity
  const durationSec = spec.durationInFrames / spec.fps;
  if (durationSec < 3) {
    errors.push(`Video is only ${durationSec.toFixed(1)}s — too short.`);
    checks.push({ name: "min_duration", pass: false, message: `${durationSec.toFixed(1)}s is below 3s minimum` });
  } else if (durationSec < 10) {
    warnings.push(`Video is only ${durationSec.toFixed(1)}s — shorter than recommended 10s.`);
    checks.push({ name: "duration", pass: true, message: `${durationSec.toFixed(1)}s (warning: short)` });
  } else if (durationSec > 180) {
    warnings.push(`Video is ${durationSec.toFixed(1)}s — longer than recommended 120s.`);
    checks.push({ name: "max_duration", pass: true, message: `${durationSec.toFixed(1)}s (warning: > 120s)` });
  } else {
    checks.push({ name: "duration", pass: true, message: `${durationSec.toFixed(1)}s — within range` });
  }

  // Check 2: All shots have video sources
  const missingVideo = spec.shots.filter(s => !s.videoSrc);
  if (missingVideo.length > 0) {
    errors.push(`${missingVideo.length} shots missing video source`);
    checks.push({ name: "video_sources", pass: false, message: `${missingVideo.length} missing` });
  } else {
    checks.push({ name: "video_sources", pass: true, message: `All ${spec.shots.length} shots have sources` });
  }

  // Check 2.1: At least one shot exists
  if (spec.shots.length === 0) {
    errors.push("No shots were successfully assembled. Check footage and script agents.");
    checks.push({ name: "min_shots", pass: false, message: "0 shots assembled" });
  }

  // Check 3: Audio tracks exist
  const voTracks = spec.audioTracks.filter(a => a.type === "voiceover");
  const musicTracks = spec.audioTracks.filter(a => a.type === "music");
  if (voTracks.length === 0) {
    warnings.push("No voiceover tracks — video will be silent.");
  }
  checks.push({
    name: "audio_tracks",
    pass: voTracks.length > 0,
    message: `${voTracks.length} VO + ${musicTracks.length} music tracks`
  });

  // Check 4: Local audio files exist
  for (const track of spec.audioTracks) {
    if (track.src.startsWith("/") || track.src.includes(":\\")) {
      let diskPath = track.src;
      if (track.src.startsWith("/temp/")) {
        diskPath = path.join(process.cwd(), "public", track.src);
      }

      if (!fs.existsSync(diskPath)) {
        errors.push(`Audio file missing: ${diskPath}`);
        checks.push({ name: "audio_file", pass: false, message: `Missing: ${diskPath}` });
      }
    }
  }

  // Check 5: No overlapping shots
  for (let i = 1; i < spec.shots.length; i++) {
    const prev = spec.shots[i - 1];
    const curr = spec.shots[i];
    const prevEnd = prev.startFrame + prev.durationInFrames;
    if (curr.startFrame < prevEnd - curr.transitionDurationFrames) {
      warnings.push(`Shots ${i - 1} and ${i} overlap by ${prevEnd - curr.startFrame} frames`);
    }
  }
  checks.push({ name: "shot_overlap", pass: true, message: "No critical overlaps" });

  // Check 6: Resolution
  if (spec.width < 1280 || spec.height < 720) {
    warnings.push(`Resolution ${spec.width}x${spec.height} is below HD`);
  }
  checks.push({ name: "resolution", pass: true, message: `${spec.width}x${spec.height}` });

  const pass = errors.length === 0;

  const result: QAResult = { pass, checks, warnings, errors };

  context.log(
    `QAAgent: ${pass ? "PASS" : "FAIL"} — ` +
    `${checks.filter(c => c.pass).length}/${checks.length} checks passed, ` +
    `${warnings.length} warnings, ${errors.length} errors`
  );

  return {
    state,
    output: result,
  };
}
