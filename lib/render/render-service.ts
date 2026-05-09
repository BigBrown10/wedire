// ─── Render Service ───
// Programmatically triggers the Remotion render and FFmpeg post-processing.

import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import type { CompositionSpec, RenderJob, RenderStatus } from "@/lib/types";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { processAudioMix, extractKeyframes } from "./ffmpeg-post";
import { performVisualCritique } from "../services/gemini";
import { purgeOldRenders } from "@/lib/utils/cleanup";

const CACHE_DIR = path.join(process.cwd(), ".wedire-cache");
const OUTPUT_DIR = path.join(process.cwd(), "public", "renders");

export async function startRenderJob(
  spec: CompositionSpec,
  onProgress?: (progress: number) => void
): Promise<RenderJob> {
  // Trigger Garbage Collection for old renders (> 6h)
  purgeOldRenders(6);

  const jobId = uuid();
  const startTime = Date.now();

  const job: RenderJob = {
    id: jobId,
    compositionSpecId: spec.id,
    status: "rendering" as RenderStatus,
    progress: 0,
    startedAt: new Date().toISOString(),
  };

  // Ensure directories exist
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rawVideoPath = path.join(CACHE_DIR, `raw_${jobId}.mp4`);
  const finalVideoPath = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  try {
    console.log(`[RenderService] Starting Remotion bundle for job ${jobId}...`);
    onProgress?.(5);

    // Bundle the Remotion project
    const bundledConfig = await bundle({
      entryPoint: path.join(process.cwd(), "remotion", "Root.tsx"),
      webpackOverride: (config) => config,
    });

    onProgress?.(20);

    // Get the composition
    const composition = await selectComposition({
      serveUrl: bundledConfig,
      id: "StoryVideo",
      inputProps: { spec },
    });

    console.log(`[RenderService] Rendering media (frames: ${composition.durationInFrames})...`);
    
    // Render the video via Remotion (visuals + basic audio)
    await renderMedia({
      composition,
      serveUrl: bundledConfig,
      codec: "h264",
      outputLocation: rawVideoPath,
      inputProps: { spec },
      onProgress: ({ progress }) => {
        // Map Remotion progress (0-1) to 20-80% of total progress
        const overallProgress = 20 + Math.round(progress * 60);
        onProgress?.(overallProgress);
      },
    });

    console.log(`[RenderService] Remotion render complete. Starting FFmpeg post-processing...`);
    onProgress?.(85);

    // Map audio tracks for FFmpeg - converting web paths back to absolute disk paths
    const audioTracks = spec.audioTracks.map(track => {
      let absoluteSrc = track.src;
      if (track.src.startsWith('/temp/')) {
        absoluteSrc = path.join(process.cwd(), 'public', track.src);
      }

      return {
        type: track.type,
        src: absoluteSrc,
        startMs: Math.round((track.startFrame / spec.fps) * 1000),
        volume: track.volume,
      };
    });

    // Run FFmpeg post-processing for advanced audio mix
    await processAudioMix({
      inputVideoPath: rawVideoPath,
      outputVideoPath: finalVideoPath,
      audioTracks,
      durationMs: Math.round((spec.durationInFrames / spec.fps) * 1000),
    });

    onProgress?.(100);
    console.log(`[RenderService] Job ${jobId} complete! Saved to ${finalVideoPath}`);

    // Cleanup raw video
    try { fs.unlinkSync(rawVideoPath); } catch {}
    
    // Cleanup temporary assets (Footage, Music, VO) to save disk space
    if (spec.correlationId) {
      const tempDir = path.join(process.cwd(), 'public', 'temp', spec.correlationId);
      
      // Perform Visual QA before cleaning up (frames are stored in tempDir)
      try {
        const qaDir = path.join(tempDir, 'qa');
        if (!fs.existsSync(qaDir)) fs.mkdirSync(qaDir, { recursive: true });
        
        const frames = await extractKeyframes(finalVideoPath, qaDir, 5);
        const qaResult = await performVisualCritique(frames, (spec as any).brief, (spec as any).segments);
        console.log(`[RenderService] Visual QA Score: ${qaResult.score}/10 - ${qaResult.feedback}`);
        (job as any).visualQA = qaResult;
      } catch (qaErr) {
        console.warn(`[RenderService] Visual QA failed:`, qaErr);
      }

      console.log(`[RenderService] Cleaning up temporary assets in ${tempDir}...`);
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`[RenderService] Cleanup failed for ${tempDir}:`, e);
      }
    }

    const stat = fs.statSync(finalVideoPath);

    return {
      ...job,
      status: "done" as RenderStatus,
      progress: 100,
      outputPath: `/renders/${jobId}.mp4`,
      completedAt: new Date().toISOString(),
      metrics: {
        renderTimeMs: Date.now() - startTime,
        fileSizeBytes: stat.size,
        resolution: `${spec.width}x${spec.height}`,
      },
    };

  } catch (error) {
    console.error(`[RenderService] Job ${jobId} failed:`, error);
    
    // Cleanup on failure
    try { fs.unlinkSync(rawVideoPath); } catch {}
    
    return {
      ...job,
      status: "failed" as RenderStatus,
      error: error instanceof Error ? error.message : "Unknown render error",
      completedAt: new Date().toISOString(),
    };
  }
}
