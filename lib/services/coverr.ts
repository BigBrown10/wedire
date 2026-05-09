// ─── Coverr Video Service ───
// Searches Coverr for curated, high-quality stock video clips.
// Free tier: 50 requests/hour.

import type { StockVideoClip } from "@/lib/types";

const COVERR_API_BASE = "https://api.coverr.co";

interface CoverrVideo {
  id: string;
  title: string;
  duration: number;
  urls: {
    mp4?: string;
    "mp4-720p"?: string;
    "mp4-1080p"?: string;
  };
  thumbnail: string;
  tags: string[];
  contributor?: { name: string };
}

interface CoverrSearchResponse {
  hits: CoverrVideo[];
  total: number;
}

/**
 * Search Coverr for curated stock video clips.
 * Returns normalized StockVideoClip objects.
 */
export async function searchCoverrVideos(
  query: string,
  count: number = 10
): Promise<StockVideoClip[]> {
  const apiKey = process.env.COVERR_API_KEY;
  if (!apiKey) {
    console.warn("[Coverr] COVERR_API_KEY not set, skipping.");
    return [];
  }

  try {
    const params = new URLSearchParams({
      query,
      page_size: String(Math.min(count, 25)),
    });

    const response = await fetch(`${COVERR_API_BASE}/videos?${params}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("[Coverr] Rate limit reached (50 req/hr free tier).");
        return [];
      }
      if (response.status === 401) {
        console.warn("[Coverr] Invalid API key.");
        return [];
      }
      console.warn(`[Coverr] API error ${response.status}`);
      return [];
    }

    const data: CoverrSearchResponse = await response.json();

    return (data.hits || []).map((v) => {
      const videoUrl = v.urls?.["mp4-1080p"] || v.urls?.["mp4-720p"] || v.urls?.mp4 || "";

      return {
        id: `coverr-${v.id}`,
        source: "coverr" as const,
        query,
        thumbnailUrl: v.thumbnail || "",
        videoUrl,
        duration: v.duration || 10,
        width: v.urls?.["mp4-1080p"] ? 1920 : 1280,
        height: v.urls?.["mp4-1080p"] ? 1080 : 720,
        author: v.contributor?.name || "Coverr",
        license: "Coverr License (free with attribution)",
      };
    }).filter(v => v.videoUrl);
  } catch (err) {
    console.warn("[Coverr] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
