// ─── Footage Agent ───
// Searches, ranks, and selects stock video clips for each shot.
// Pipeline: VideoAggregator (3 sources) → CLIP ranking → Gemini taste filtering

import { v4 as uuid } from "uuid";
import type { PipelineState, VisualPlan, ShotAssignment, Shot } from "@/lib/types";
import type { AgentContext } from "./agent-graph";
import { aggregateMultiQuery } from "@/lib/services/video-aggregator";
import { rankClipsBySimilarity } from "@/lib/services/clip";
import { rankFootageByTaste } from "@/lib/services/gemini";

import { downloadFile } from "@/lib/services/download-service";
import path from "path";
import fs from "fs";

export async function footageAgent(
  state: PipelineState,
  context: AgentContext
): Promise<{ state: PipelineState; output: VisualPlan }> {
  if (!state.shotList || !state.brief) {
    throw new Error("FootageAgent: Missing shotList or brief.");
  }

  // Create local footage directory in public folder for Remotion accessibility
  const tempDir = path.join(process.cwd(), "public", "temp", state.correlationId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  context.log(`FootageAgent: Finding footage for ${state.shotList.shots.length} shots...`);


  const assignments: ShotAssignment[] = await Promise.all(
    state.shotList.shots.map(async (shot) => {
      context.log(`FootageAgent: [Shot ${shot.index + 1}] Searching...`);

      // Step 1: Aggregate from all sources
      let { clips } = await aggregateMultiQuery(shot.searchQueries, 3);

      if (clips.length === 0) {
        context.log(`FootageAgent: [Shot ${shot.index + 1}] No clips found for specific queries, trying conceptual fallback...`);
        // Conceptual fallbacks: "technology", "abstract", "innovation"
        const fallbacks = ["future technology", "artificial intelligence", "abstract motion"];
        const fallbackRes = await aggregateMultiQuery(fallbacks, 5);
        clips = fallbackRes.clips;
      }

      if (clips.length === 0) {
        context.log(`FootageAgent: [Shot ${shot.index + 1}] CRITICAL - No footage found even with fallback. Returning null assignment.`);
        return null as any; // Filtered out later
      }

      // Step 2: CLIP ranking (visual similarity)
      const clipRanked = await rankClipsBySimilarity(shot.description, clips);
      const topN = clipRanked.slice(0, 5);

      // Step 3: Gemini taste filtering
      let candidates = topN;
      try {
        const tasteResult = await rankFootageByTaste(
          shot.description,
          topN.map(c => ({
            id: c.id,
            thumbnailUrl: c.thumbnailUrl,
            clipScore: c.clipScore || 0.5,
          })),
          state.brief.tone
        );

        const reordered = tasteResult.rankedClipIds
          .map(id => topN.find(c => c.id === id))
          .filter(Boolean) as typeof topN;

        if (reordered.length > 0) candidates = reordered;
      } catch (err) {
        // Fallback to CLIP ranking
      }

      // Selection (simple first-available for parallel safety)
      let chosenClip = candidates[0];
      
      // DOWNLOAD
      const fileExt = chosenClip.videoUrl.split('.').pop()?.split('?')[0] || 'mp4';
      const localFileName = `shot_${shot.index + 1}_${chosenClip.id}.${fileExt}`;
      const localFilePath = path.join(tempDir, localFileName);
      const webRelativePath = `/temp/${state.correlationId}/${localFileName}`;

      try {
        context.log(`FootageAgent: [Shot ${shot.index + 1}] Downloading...`);
        await downloadFile(chosenClip.videoUrl, localFilePath);
        chosenClip = { ...chosenClip, videoUrl: webRelativePath };
      } catch (err) {
        context.log(`FootageAgent: [Shot ${shot.index + 1}] Download failed, using remote URL`);
      }

      return {
        shotId: shot.id,
        chosenClip,
        alternates: candidates.filter(c => c.id !== chosenClip.id).slice(0, 3),
        startOffsetMs: 0,
        endOffsetMs: Math.min(shot.durationMs, chosenClip.duration * 1000),
      };
    })
  ).then(res => res.filter(Boolean));

  const visualPlan: VisualPlan = {
    id: uuid(),
    shotListId: state.shotList.id,
    assignments,
  };

  context.log(`FootageAgent: Visual plan complete — ${assignments.length} shots assigned`);

  return {
    state: { ...state, visualPlan },
    output: visualPlan,
  };
}
