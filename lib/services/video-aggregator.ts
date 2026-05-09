// ─── Video Aggregator ───
// Queries Pexels, Pixabay, and Coverr in parallel, normalizes results,
// and deduplicates into a unified pool for CLIP ranking.

import type { StockVideoClip } from "@/lib/types";
import { searchPexelsVideos } from "./pexels";
import { searchPixabayVideos } from "./pixabay";
import { searchCoverrVideos } from "./coverr";

export interface AggregationResult {
  clips: StockVideoClip[];
  sources: {
    pexels: number;
    pixabay: number;
    coverr: number;
  };
  totalFetched: number;
  errors: string[];
}

/**
 * Search all stock video sources in parallel and return a unified pool.
 * Gracefully degrades if any source is unavailable.
 */
export async function aggregateStockVideos(
  query: string,
  countPerSource: number = 5
): Promise<AggregationResult> {
  const errors: string[] = [];

  // Query all sources in parallel
  const results = await Promise.allSettled([
    searchPexelsVideos(query, countPerSource),
    searchPixabayVideos(query, countPerSource),
    searchCoverrVideos(query, countPerSource),
  ]);

  const pexelsClips = results[0].status === "fulfilled" ? results[0].value : [];
  const pixabayClips = results[1].status === "fulfilled" ? results[1].value : [];
  const coverrClips = results[2].status === "fulfilled" ? results[2].value : [];

  if (results[0].status === "rejected") errors.push(`Pexels: ${results[0].reason}`);
  if (results[1].status === "rejected") errors.push(`Pixabay: ${results[1].reason}`);
  if (results[2].status === "rejected") errors.push(`Coverr: ${results[2].reason}`);

  // Combine all clips
  const allClips = [...pexelsClips, ...pixabayClips, ...coverrClips];

  // Deduplicate by checking for very similar video URLs
  const seen = new Set<string>();
  const unique = allClips.filter(clip => {
    // Use a simplified key for dedup
    const key = `${clip.source}-${clip.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (errors.length > 0) {
    console.error(`[VideoAggregator] Errors for query "${query}":`, errors.join("; "));
  }

  console.log(
    `[VideoAggregator] Query: "${query}" → ` +
    `Pexels: ${pexelsClips.length}, Pixabay: ${pixabayClips.length}, Coverr: ${coverrClips.length} → ` +
    `${unique.length} unique clips`
  );

  return {
    clips: unique,
    sources: {
      pexels: pexelsClips.length,
      pixabay: pixabayClips.length,
      coverr: coverrClips.length,
    },
    totalFetched: allClips.length,
    errors,
  };
}

/**
 * Search multiple queries and aggregate all results.
 * Used by the footage agent to search 2-3 queries per shot.
 */
export async function aggregateMultiQuery(
  queries: string[],
  countPerQueryPerSource: number = 3
): Promise<AggregationResult> {
  const allResults = await Promise.all(
    queries.map(q => aggregateStockVideos(q, countPerQueryPerSource))
  );

  const allClips: StockVideoClip[] = [];
  const errors: string[] = [];
  const sources = { pexels: 0, pixabay: 0, coverr: 0 };

  for (const result of allResults) {
    allClips.push(...result.clips);
    errors.push(...result.errors);
    sources.pexels += result.sources.pexels;
    sources.pixabay += result.sources.pixabay;
    sources.coverr += result.sources.coverr;
  }

  // Global dedup across all queries
  const seen = new Set<string>();
  const unique = allClips.filter(clip => {
    if (seen.has(clip.id)) return false;
    seen.add(clip.id);
    return true;
  });

  return {
    clips: unique,
    sources,
    totalFetched: allClips.length,
    errors: [...new Set(errors)],
  };
}
