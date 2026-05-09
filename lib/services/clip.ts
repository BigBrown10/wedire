// ─── CLIP Vision Service ───
// Computes text-image similarity using CLIP ViT-B/32 via @xenova/transformers.
// Runs on CPU in Node.js — no Python or GPU required.

import type { StockVideoClip } from "@/lib/types";

// Lazy-loaded pipeline to avoid blocking startup
let clipPipeline: any = null;
let pipelineLoading: Promise<any> | null = null;

/**
 * Load the CLIP pipeline (lazy, singleton).
 * First call downloads the model (~350MB) and caches it.
 */
async function getClipPipeline() {
  if (clipPipeline) return clipPipeline;
  if (pipelineLoading) return pipelineLoading;

  pipelineLoading = (async () => {
    try {
      const { pipeline } = await import("@xenova/transformers");
      console.log("[CLIP] Loading CLIP ViT-B/32 model (first run downloads ~350MB)...");
      clipPipeline = await pipeline(
        "zero-shot-image-classification",
        "Xenova/clip-vit-base-patch32"
      );
      console.log("[CLIP] Model loaded successfully.");
      return clipPipeline;
    } catch (err) {
      pipelineLoading = null;
      throw err;
    }
  })();

  return pipelineLoading;
}

/**
 * Score a list of stock video clips against a text description.
 * Uses clip thumbnails for visual similarity comparison.
 * Returns clips sorted by similarity (best first) with clipScore filled.
 */
export async function rankClipsBySimilarity(
  description: string,
  clips: StockVideoClip[]
): Promise<StockVideoClip[]> {
  if (clips.length === 0) return [];

  try {
    const pipe = await getClipPipeline();

    // Score each clip's thumbnail against the description
    const scored = await Promise.all(
      clips.map(async (clip) => {
        try {
          const result = await pipe(clip.thumbnailUrl, [description, "generic stock footage"]);
          // result is an array of { label, score }
          const matchScore = result.find((r: any) => r.label === description)?.score || 0;
          return { ...clip, clipScore: matchScore };
        } catch {
          // If individual scoring fails, give a neutral score
          return { ...clip, clipScore: 0.5 };
        }
      })
    );

    // Sort by CLIP score (best match first)
    return scored.sort((a, b) => (b.clipScore || 0) - (a.clipScore || 0));
  } catch (err) {
    console.warn("[CLIP] Ranking failed, returning unsorted:", err instanceof Error ? err.message : err);
    // Return clips with neutral scores
    return clips.map(c => ({ ...c, clipScore: 0.5 }));
  }
}

/**
 * Check if the CLIP model is available and loadable.
 */
export async function checkClipHealth(): Promise<{
  available: boolean;
  modelName: string;
  error?: string;
}> {
  try {
    await getClipPipeline();
    return { available: true, modelName: "Xenova/clip-vit-base-patch32" };
  } catch (err) {
    return {
      available: false,
      modelName: "Xenova/clip-vit-base-patch32",
      error: err instanceof Error ? err.message : "Failed to load CLIP model",
    };
  }
}
