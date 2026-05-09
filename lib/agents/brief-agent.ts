// ─── Brief Agent ───
// Converts chat conversation into a structured creative brief.

import { v4 as uuid } from "uuid";
import type { PipelineState, Brief } from "@/lib/types";
import type { AgentContext } from "./agent-graph";
import { generateBrief } from "@/lib/services/gemini";

export async function briefAgent(
  state: PipelineState,
  context: AgentContext
): Promise<{ state: PipelineState; output: Brief }> {
  try {
    context.log(`BriefAgent: Starting... state.brief present: ${!!state.brief}`);
    context.log("BriefAgent: Extracting creative brief from conversation...");

  const chatHistory = state.brief
    ? [] // If brief already exists, skip
    : (state as any).chatHistory || [];

  if (state.brief) {
    // UI-provided briefs may be partial — fill in required fields
    const completeBrief: Brief = {
      id: state.brief.id || uuid(),
      projectId: state.brief.projectId || state.projectId,
      title: state.brief.title || "Untitled",
      audience: state.brief.audience || "General",
      tone: state.brief.tone || "professional",
      keyMessages: Array.isArray(state.brief.keyMessages) ? state.brief.keyMessages : (state.brief.keyMessages ? [state.brief.keyMessages] : []),
      style: state.brief.style || "explainer",
      duration: state.brief.duration || 60,
      references: Array.isArray(state.brief.references) ? state.brief.references : (state.brief.references ? [state.brief.references] : []),
      constraints: Array.isArray(state.brief.constraints) ? state.brief.constraints : (state.brief.constraints ? [state.brief.constraints] : []),
      voiceId: state.brief.voiceId,
      createdAt: state.brief.createdAt || new Date().toISOString(),
    };

    context.log(`BriefAgent: Using existing brief — "${completeBrief.title}" (${completeBrief.style}, ${completeBrief.duration}s)`);
    return { state: { ...state, brief: completeBrief }, output: completeBrief };
  }

  const briefData = await generateBrief(chatHistory);

  const brief: Brief = {
    id: uuid(),
    projectId: state.projectId,
    ...briefData,
    references: [],
    constraints: Array.isArray(briefData.constraints) ? briefData.constraints : (briefData.constraints ? [briefData.constraints] : []),
    createdAt: new Date().toISOString(),
  };

  context.log(`BriefAgent: Brief created — "${brief.title}" (${brief.style}, ${brief.duration}s)`);

  return {
    state: { ...state, brief },
    output: brief,
  };
  } catch (err) {
    context.log(`BriefAgent: ERROR - ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
