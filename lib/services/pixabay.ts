// ─── Pixabay Video Service ───
// Searches Pixabay for free stock video clips.

import type { StockVideoClip } from "@/lib/types";

const PIXABAY_API_BASE = "https://pixabay.com/api/videos/";

interface PixabayVideoHit {
  id: number;
  pageURL: string;
  type: string;
  tags: string;
  duration: number;
  videos: {
    large?: { url: string; width: number; height: number; size: number };
    medium?: { url: string; width: number; height: number; size: number };
    small?: { url: string; width: number; height: number; size: number };
  };
  user: string;
  userImageURL: string;
}

interface PixabayVideoResponse {
  total: number;
  totalHits: number;
  hits: PixabayVideoHit[];
}

/**
 * Search Pixabay for stock video clips.
 * Returns normalized StockVideoClip objects.
 */
export async function searchPixabayVideos(
  query: string,
  count: number = 10
): Promise<StockVideoClip[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    console.warn("[Pixabay] PIXABAY_API_KEY not set, skipping.");
    return [];
  }

  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    per_page: String(Math.min(count, 200)),
    page: "1",
    video_type: "film",
    min_width: "1280",
    safesearch: "true",
  });

  try {
    const response = await fetch(`${PIXABAY_API_BASE}?${params}`);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("[Pixabay] Rate limit reached.");
        return [];
      }
      console.warn(`[Pixabay] API error ${response.status}`);
      return [];
    }

    const data: PixabayVideoResponse = await response.json();

    return (data.hits || []).map((v) => {
      // Prefer large, fallback to medium
      const videoFile = v.videos.large || v.videos.medium || v.videos.small;

      return {
        id: `pixabay-${v.id}`,
        source: "pixabay" as const,
        query,
        thumbnailUrl: `https://i.vimeocdn.com/video/${v.id}_640x360.jpg`, // Pixabay uses Vimeo CDN
        videoUrl: videoFile?.url || "",
        duration: v.duration,
        width: videoFile?.width || 1920,
        height: videoFile?.height || 1080,
        author: v.user,
        license: "Pixabay License (free, no attribution required)",
      };
    }).filter(v => v.videoUrl);
  } catch (err) {
    console.warn("[Pixabay] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
