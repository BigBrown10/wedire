// ─── Pexels Video Service ───
// Searches Pexels for stock video clips (video-first, photos as fallback for stills).

import type { StockVideoClip } from "@/lib/types";

const PEXELS_API_BASE = "https://api.pexels.com";

interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  image: string; // thumbnail
  video_files: PexelsVideoFile[];
  user: { name: string };
}

interface PexelsVideoSearchResponse {
  total_results: number;
  videos: PexelsVideo[];
}

/**
 * Search Pexels for stock video clips.
 * Returns normalized StockVideoClip objects.
 */
export async function searchPexelsVideos(
  query: string,
  count: number = 10
): Promise<StockVideoClip[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY is not set.");
  }

  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(count, 80)),
    page: "1",
    orientation: "landscape",
    size: "medium",
  });

  const response = await fetch(`${PEXELS_API_BASE}/videos/search?${params}`, {
    headers: { Authorization: apiKey },
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("Pexels rate limit reached.");
    throw new Error(`Pexels API error ${response.status}`);
  }

  const data: PexelsVideoSearchResponse = await response.json();

  return (data.videos || []).map((v) => {
    // Pick the best quality HD file
    const hdFile = v.video_files
      .filter(f => f.quality === "hd" && f.width >= 1280)
      .sort((a, b) => b.width - a.width)[0]
      || v.video_files[0];

    return {
      id: `pexels-${v.id}`,
      source: "pexels" as const,
      query,
      thumbnailUrl: v.image,
      videoUrl: hdFile?.link || "",
      duration: v.duration,
      width: hdFile?.width || v.width,
      height: hdFile?.height || v.height,
      author: v.user.name,
      license: "Pexels License (free, no attribution required)",
    };
  }).filter(v => v.videoUrl);
}
