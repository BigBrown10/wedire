import { NextResponse } from "next/server";
import { getAvailableVoices } from "@/lib/services/elevenlabs";

export async function GET() {
  try {
    const voices = await getAvailableVoices();
    return NextResponse.json({ voices });
  } catch (error) {
    console.error("[Voices API]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch voices" },
      { status: 500 }
    );
  }
}
