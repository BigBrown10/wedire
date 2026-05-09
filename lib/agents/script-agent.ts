// ─── Script Agent ───
// Generates timestamped narration script and initial shot list from a brief.

import { v4 as uuid } from "uuid";
import type { PipelineState, Script, ShotList, NarrationSegment } from "@/lib/types";
import type { AgentContext } from "./agent-graph";
import { generateScript, generateShotList } from "@/lib/services/gemini";

export async function scriptAgent(
  state: PipelineState,
  context: AgentContext
): Promise<{ state: PipelineState; output: { script: Script; shotList: ShotList } }> {
  if (!state.brief) {
    throw new Error("ScriptAgent: No brief found in state.");
  }

  context.log("ScriptAgent: Generating narration script...");
  const scriptData = await generateScript(state.brief);

  const script: Script = {
    id: uuid(),
    briefId: state.brief.id,
    segments: scriptData.segments.map((s: NarrationSegment, i: number) => ({
      ...s,
      id: `seg-${i}`,
    })),
    totalEstimatedDurationMs: scriptData.totalEstimatedDurationMs,
    narrativeArc: scriptData.narrativeArc,
  };

  context.log(`ScriptAgent: Script created — ${script.segments.length} segments, ~${Math.round(script.totalEstimatedDurationMs / 1000)}s`);

  // Generate shot list based on script
  context.log("ScriptAgent: Generating shot list...");
  const shotListData = await generateShotList(script, state.brief);

  const shotList: ShotList = {
    id: uuid(),
    scriptId: script.id,
    ...shotListData,
  };

  context.log(`ScriptAgent: Shot list created — ${shotList.shots.length} shots`);

  return {
    state: { ...state, script, shotList },
    output: { script, shotList },
  };
}
