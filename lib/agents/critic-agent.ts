// ─── Critic Agent ───
// Reviews script + shot list for quality. Can trigger re-generation.

import type { PipelineState } from "@/lib/types";
import type { AgentContext } from "./agent-graph";
import { critiqueScript, type CritiqueResult } from "@/lib/services/gemini";

export async function criticAgent(
  state: PipelineState,
  context: AgentContext
): Promise<{ state: PipelineState; output: CritiqueResult }> {
  if (!state.script || !state.shotList || !state.brief) {
    throw new Error("CriticAgent: Missing script, shotList, or brief.");
  }

  context.log("CriticAgent: Reviewing script and shot list...");
  const critique = await critiqueScript(state.script, state.shotList, state.brief);

  context.log(
    `CriticAgent: Score ${critique.score}/10 — ${critique.pass ? "PASS" : "NEEDS REVISION"}: ${critique.critique}`
  );

  if (!critique.pass) {
    context.log("CriticAgent: Quality threshold not met. Suggestions: " + (critique.suggestions || []).join("; "));
    // The pipeline graph handles the retry logic via conditional edges
  }

  return {
    state: {
      ...state,
      // Store critique result for UI display
    },
    output: critique,
  };
}
