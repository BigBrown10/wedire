// ─── Freesound Music Service ───
// Fetches royalty-free instrumental music for video background tracks.

import type { MusicTrack } from "@/lib/types";

interface FreesoundResult {
  id: number;
  name: string;
  duration: number;
  previews?: {
    "preview-hq-mp3"?: string;
    "preview-lq-mp3"?: string;
  };
  username: string;
  license: string;
  tags: string[];
}

interface FreesoundResponse {
  count: number;
  results: FreesoundResult[];
}

const MOOD_KEYWORDS: Record<string, string> = {
  dark: "dark cinematic instrumental",
  motivational: "motivational epic instrumental",
  luxury: "luxury lounge smooth instrumental",
  gym: "intense workout instrumental beat",
  success: "triumphant orchestral instrumental",
  calm: "calm ambient piano instrumental",
  aggressive: "aggressive trap beat instrumental",
  emotional: "emotional piano cinematic instrumental",
  confident: "confident hip hop beat instrumental",
  corporate: "corporate upbeat instrumental",
  cinematic: "cinematic orchestral dramatic",
  warm: "warm acoustic guitar instrumental",
  energetic: "energetic pop instrumental upbeat",
  default: "cinematic instrumental background",
};

/**
 * Search Freesound for instrumental music tracks matching a mood.
 */
export async function fetchMusicTracks(
  mood: string,
  count: number = 5
): Promise<MusicTrack[]> {
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    console.warn("[Freesound] FREESOUND_API_KEY not set, skipping music.");
    return [];
  }

  const normalizedMood = mood.toLowerCase().trim();
  const searchQuery = MOOD_KEYWORDS[normalizedMood] || MOOD_KEYWORDS["default"];

  const params = new URLSearchParams({
    query: searchQuery,
    fields: "id,name,duration,previews,username,license,tags",
    filter: "duration:[15 TO 180]",
    sort: "rating_desc",
    page_size: String(Math.min(count * 2, 15)),
    token: apiKey,
  });

  try {
    const response = await fetch(`https://freesound.org/apiv2/search/text/?${params}`);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("[Freesound] Rate limit reached.");
        return [];
      }
      console.warn(`[Freesound] API error ${response.status}`);
      return [];
    }

    const data: FreesoundResponse = await response.json();

    const withPreviews = (data.results || []).filter(
      r => r.previews?.["preview-hq-mp3"]
    );

    return withPreviews.slice(0, count).map(r => ({
      id: `freesound-${r.id}`,
      name: r.name,
      source: "freesound" as const,
      audioUrl: r.previews!["preview-hq-mp3"]!,
      duration: Math.round(r.duration),
      author: r.username,
      license: r.license,
      tags: r.tags.slice(0, 5),
      beats: [], // Will be filled by beat detector
    }));
  } catch (err) {
    console.warn("[Freesound] Search failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
