// ─── Gemini Service ───
// LLM backbone for script generation, critique, brief extraction, and taste filtering.
// Uses Gemini 2.0 Flash with structured JSON output.

import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import type { Brief, Script, ShotList, NarrationSegment, Shot, StockVideoClip, ChatMessage } from "@/lib/types";

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

function getModel() {
  if (model) return model;
  const apiKey = process.env.GEMINI_API_KEY || "";
  console.log(`[GeminiService] Initializing with model: gemini-3-flash-preview, key length: ${apiKey.length}`);
  genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
  return model;
}

// ─── Brief Generation ───

const briefSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING, description: "A short, catchy project title" },
    audience: { type: SchemaType.STRING, description: "Target audience description" },
    tone: { type: SchemaType.STRING, description: "Desired tone (e.g., 'professional', 'energetic', 'cinematic', 'warm')" },
    keyMessages: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "3-5 key messages the video should convey"
    },
    style: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["brand_story", "explainer", "tutorial", "social_short"],
      description: "Video style category"
    },
    duration: { type: SchemaType.INTEGER, description: "Target duration in seconds (30-120)" },
    constraints: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Any creative constraints or requirements"
    }
  },
  required: ["title", "audience", "tone", "keyMessages", "style", "duration"]
};

export async function generateBrief(chatHistory: ChatMessage[]): Promise<Omit<Brief, 'id' | 'projectId' | 'createdAt' | 'references'>> {
  const conversationText = chatHistory
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const prompt = `You are a senior creative director at a top video production agency.
Analyze the following conversation and extract a structured creative brief for a short-form video (30-120 seconds).

Focus on:
- What story does the user want to tell?
- Who is the target audience?
- What is the desired tone and style?
- What are the key messages?
- Any constraints mentioned?

Conversation:
${conversationText}

Generate a comprehensive creative brief.`;

  const result = await getModel().generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
      responseSchema: briefSchema,
    }
  });

  return JSON.parse(result.response.text());
}

const scriptSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    narrativeArc: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["hook_context_insight_cta", "problem_solution", "story_reveal"],
      description: "The narrative structure used"
    },
    segments: {
      type: SchemaType.ARRAY,
      description: "Narration segments in chronological order",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          text: { type: SchemaType.STRING, description: "The narration text for this segment" },
          estimatedDurationMs: { type: SchemaType.INTEGER, description: "Estimated spoken duration in milliseconds" },
          emotion: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["neutral", "excited", "serious", "warm", "urgent"],
            description: "The emotional tone for this segment"
          }
        },
        required: ["text", "estimatedDurationMs", "emotion"]
      }
    }
  },
  required: ["narrativeArc", "segments"]
};

export async function generateScript(brief: Brief): Promise<Omit<Script, 'id' | 'briefId'>> {
  const prompt = `You are an elite scriptwriter for short-form video content.

Write a narration script for the following video brief:

Title: ${brief.title}
Audience: ${brief.audience}
Tone: ${brief.tone}
Style: ${brief.style}
Target Duration: ${brief.duration} seconds
Key Messages: ${brief.keyMessages.join(", ")}
${brief.constraints.length > 0 ? `Constraints: ${brief.constraints.join(", ")}` : ""}

Rules:
- Write for a high-status, luxury, or raw confessional tone.
- BAN GENERIC METAPHORS: Never use words like "tapestry", "cathedral", "symphony", "dance", or "canvas".
- PUNCHY HOOK: Start with a pattern-interrupt hook that commands attention in 3 seconds.
- RAW & DIRECT: Keep sentences short (under 10 words). Use simple, impactful language.
- NO AI-SLOP: Avoid flowery, descriptive filler. Every word must earn its place.
- Break into segments (3-8 seconds each). Total must sum to exactly ${brief.duration} seconds.
- Use a spoken, conversational cadence — not a textbook.
- CRITICAL: The total estimatedDurationMs of all segments MUST SUM UP EXACTLY to ${brief.duration} seconds.
- INFINITE LOOP: The last sentence must perfectly bridge back to the first sentence, creating a seamless loop for social media.
`;

  const result = await getModel().generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json",
      responseSchema: scriptSchema,
    }
  });

  const parsed = JSON.parse(result.response.text());
  const totalEstimatedDurationMs = parsed.segments.reduce(
    (sum: number, s: NarrationSegment) => sum + s.estimatedDurationMs, 0
  );

  return { ...parsed, totalEstimatedDurationMs };
}

// ─── Shot List Generation ───

const shotListSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    introCard: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING },
        subtitle: { type: SchemaType.STRING },
        durationMs: { type: SchemaType.INTEGER }
      },
      required: ["title", "durationMs"]
    },
    outroCard: {
      type: SchemaType.OBJECT,
      properties: {
        text: { type: SchemaType.STRING },
        cta: { type: SchemaType.STRING },
        durationMs: { type: SchemaType.INTEGER }
      },
      required: ["text", "durationMs"]
    },
    shots: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          narrationSegmentIndex: { type: SchemaType.INTEGER, description: "Index of the narration segment this shot accompanies" },
          description: { type: SchemaType.STRING, description: "Cinematic visual description for stock footage search" },
          searchQueries: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "2-3 stock video search queries (photographic/cinematic terms, not abstract concepts)"
          },
          durationMs: { type: SchemaType.INTEGER },
          transition: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["cut", "fade", "dissolve", "slide"]
          },
          motionEffect: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["ken_burns_in", "ken_burns_out", "static", "slow_zoom"]
          },
          overlayText: { type: SchemaType.STRING, description: "Optional text overlay (stat, quote, or key phrase)" },
          overlayPosition: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["center", "lower_third", "upper_left"]
          },
          overlayStyle: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["title", "subtitle", "stat", "quote", "text_slam"]
          },
          visualStyle: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["cinematic", "black_and_white", "high_contrast", "raw"]
          }
        },
        required: ["narrationSegmentIndex", "description", "searchQueries", "durationMs", "transition", "motionEffect", "visualStyle"]
      }
    }
  },
  required: ["shots"]
};

export async function generateShotList(script: Script, brief: Brief): Promise<Omit<ShotList, 'id' | 'scriptId'>> {
  const segmentsText = script.segments
    .map((s, i) => `[${i}] (${s.estimatedDurationMs}ms, ${s.emotion}): "${s.text}"`)
    .join("\n");

  const prompt = `You are a senior video director creating a shot list for a ${brief.style} video.

Script segments:
${segmentsText}

Brief context:
- Tone: ${brief.tone}
- Audience: ${brief.audience}
- Style: ${brief.style}

1. STORYTELLING PACING: Prioritize meaning over movement. Use longer shots (4-7s) for key messages. Only cut when the concept changes.
2. KEYWORD DRIVEN: Identify the most impactful 1-2 words per segment. These are your "Shot Anchors". 
3. TYPOGRAPHY SHOTS: If a segment is abstract, or for dramatic emphasis, use a 'typography' shot (no videoSrc). This will render bold 'text_slam' animations on a classy blank screen or geometric background.
4. VISUAL CONTRAST: Mix 'cinematic' footage with 'typography' shots to create a premium, balanced feel.
5. TEXT SLAMS: Use 'text_slam' style for keywords. They should pop with impact.
6. UNIQUE FOOTAGE: When using video, ensure it's high-quality and directly relates to the keyword anchor.
7. CINEMATIC QUERIES: Use professional terms (e.g., 'macro 4k handheld', 'aerial moody drone').
8. CONSOLIDATION: Aim for 5-10 high-impact shots total for a 30s video, not 30 fast ones. Quality over quantity.
`;

  const result = await getModel().generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.5,
      responseMimeType: "application/json",
      responseSchema: shotListSchema,
    }
  });

  const parsed = JSON.parse(result.response.text());

  // Map parsed shots to domain model
  const shots: Shot[] = parsed.shots.map((s: Record<string, unknown>, i: number) => ({
    id: `shot-${i}`,
    index: i,
    narrationSegmentId: `seg-${s.narrationSegmentIndex}`,
    description: s.description as string,
    searchQueries: s.searchQueries as string[],
    durationMs: s.durationMs as number,
    transition: s.transition as Shot['transition'],
    motionEffect: s.motionEffect as Shot['motionEffect'],
    overlay: s.overlayText ? {
      text: s.overlayText as string,
      position: (s.overlayPosition as Shot['overlay'] extends { position: infer P } ? P : 'lower_third') || 'lower_third',
      style: (s.overlayStyle as Shot['overlay'] extends { style: infer S } ? S : 'subtitle') || 'subtitle',
    } : undefined,
  }));

  return {
    shots,
    introCard: parsed.introCard,
    outroCard: parsed.outroCard,
  };
}

// ─── Script Critique ───

const critiqueSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    score: { type: SchemaType.INTEGER, description: "Quality score 1-10" },
    pass: { type: SchemaType.BOOLEAN, description: "true if score >= 1 and content is publishable" },
    critique: { type: SchemaType.STRING, description: "1-2 sentence critique" },
    suggestions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Specific improvement suggestions"
    }
  },
  required: ["score", "pass", "critique"]
};

export interface CritiqueResult {
  score: number;
  pass: boolean;
  critique: string;
  suggestions: string[];
}

export async function critiqueScript(script: Script, shotList: ShotList, brief: Brief): Promise<CritiqueResult> {
  const prompt = `You are a creative director reviewing a video script and shot list.

Brief:
- Title: ${brief.title}
- Audience: ${brief.audience}
- Tone: ${brief.tone}
- Duration target: ${brief.duration}s

Script:
${script.segments.map((s, i) => `[${i}] ${s.text}`).join("\n")}

Shot count: ${shotList.shots.length}

Rate this content on:
1. Hook strength — does the opening 3 seconds command attention?
2. Pacing — does the rhythm feel natural?
3. Clarity — is the message clear?
4. Brand alignment — does it match the tone and audience?

Score 1-10. Pass if >= 5. Be constructive. If it generally hits the brief, pass it. Do not be overly harsh.`;

  const result = await getModel().generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: critiqueSchema,
    }
  });

  return JSON.parse(result.response.text());
}

// ─── Footage Taste Ranking ───

export interface TasteRankResult {
  rankedClipIds: string[];
  reasoning: string;
}

export async function rankFootageByTaste(
  shotDescription: string,
  candidates: { id: string; thumbnailUrl: string; clipScore: number }[],
  tone: string
): Promise<TasteRankResult> {
  const prompt = `You are a senior video editor with impeccable taste, selecting stock footage for a ${tone} video.

Shot description: "${shotDescription}"

These are the top ${candidates.length} footage candidates, already pre-ranked by visual similarity (CLIP score).
Re-rank them based on TASTE — which clips would a premium brand actually use?

Candidates:
${candidates.map((c, i) => `${i + 1}. ID: ${c.id}, CLIP score: ${c.clipScore.toFixed(3)}, thumbnail: ${c.thumbnailUrl}`).join("\n")}

Consider:
- Cinematic quality over stock-photo cheesiness
- Color grading consistency
- Compositional interest
- Emotional appropriateness for "${tone}" tone
- Avoid cliché stock footage (e.g., handshake, generic meeting room)

Return the clip IDs in your preferred order (best first), with a 1-sentence reasoning.`;

  const result = await getModel().generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          rankedClipIds: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Clip IDs in preference order"
          },
          reasoning: { type: SchemaType.STRING }
        },
        required: ["rankedClipIds", "reasoning"]
      },
    }
  });

  return JSON.parse(result.response.text());
}

export async function performVisualCritique(
  keyframes: string[],
  brief: Brief,
  segments: any[]
): Promise<{ score: number; feedback: string; pass: boolean }> {
  const prompt = `You are a world-class creative director reviewing the final render of a video.
  
  Brief Title: ${brief.title}
  Expected Tone: ${brief.tone}
  
  Watch these keyframes from the video. Rate the video from 1-10 on:
  1. Visual Consistency: Do the colors and styles match across shots?
  2. Brand Alignment: Does it feel like the premium experience requested?
  3. Pacing: Does the visual density feel right?
  
  Return a JSON object with score (number), feedback (string), and pass (boolean, true if score >= 7).`;

  const imageParts = keyframes.map(path => ({
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType: "image/jpeg"
    }
  }));

  const result = await getModel().generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }, ...imageParts] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    }
  });

  return JSON.parse(result.response.text());
}
