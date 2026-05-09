// ─── Chat API Route ───
// Conversational brief builder powered by Gemini.
// Extracts brief structure from natural conversation.

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

const SYSTEM_PROMPT = `You are a senior creative director at a premium video production agency called Wedire Studio.

Your job is to help the user define their video project through natural conversation. You're warm, direct, and have impeccable taste.

As you chat, you're mentally building a creative brief with these fields:
- title: A catchy project name
- audience: Who is this video for?
- tone: What's the emotional tone? (professional, cinematic, warm, energetic, etc.)
- keyMessages: What 3-5 things must the video communicate?
- style: One of: brand_story, explainer, tutorial, social_short
- duration: Target length in seconds (30-120)
- constraints: Any must-haves or must-avoids

Ask clarifying questions naturally. Don't ask all questions at once — build the brief progressively.
When you have enough information for at least title, audience, tone, and style, include a JSON brief object in your response wrapped in <brief> tags.

Example:
<brief>{"title": "Quantum Compute Story", "audience": "Tech enthusiasts 25-45", "tone": "cinematic", "keyMessages": ["AI compute is growing exponentially", "This changes everything"], "style": "explainer", "duration": 60}</brief>

Keep your responses concise and conversational. No corporate speak.`;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided" }, { status: 400 });
    }

    // Build Gemini chat history
    const chatHistory = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
        { role: "model", parts: [{ text: "I understand. I'll help build the creative brief through natural conversation." }] },
        ...chatHistory,
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    });

    const responseText = result.response.text();

    // Extract brief if present
    let brief = null;
    const briefMatch = responseText.match(/<brief>([\s\S]*?)<\/brief>/);
    if (briefMatch) {
      try {
        brief = JSON.parse(briefMatch[1]);
      } catch {
        // Malformed brief JSON, ignore
      }
    }

    // Clean response text (remove brief tags)
    const cleanResponse = responseText.replace(/<brief>[\s\S]*?<\/brief>/g, "").trim();

    return NextResponse.json({
      response: cleanResponse,
      brief,
    });
  } catch (err) {
    console.error("[Chat API]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 }
    );
  }
}
