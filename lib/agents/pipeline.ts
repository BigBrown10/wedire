// ─── Pipeline Orchestrator ───
// Wires all agents into the execution graph.

import { v4 as uuid } from "uuid";
import { AgentGraph, type GraphDefinition, type GraphEvent } from "./agent-graph";
import { briefAgent } from "./brief-agent";
import { scriptAgent } from "./script-agent";
import { criticAgent } from "./critic-agent";
import { footageAgent } from "./footage-agent";
import { voiceAgent } from "./voice-agent";
import { audioAgent } from "./audio-agent";
import { assemblyAgent } from "./assembly-agent";
import { qaAgent } from "./qa-agent";
import { renderAgent } from "./render-agent";
import type { PipelineState, ChatMessage, Brief } from "@/lib/types";

const graphDefinition: GraphDefinition = {
  entryNode: "brief",
  nodes: [
    { name: "brief",    fn: briefAgent,    maxRetries: 1, timeoutMs: 30_000 },
    { name: "script",   fn: scriptAgent,   maxRetries: 1, timeoutMs: 60_000 },
    { name: "critic",   fn: criticAgent,   maxRetries: 0, timeoutMs: 30_000 },
    { name: "footage",  fn: footageAgent,  maxRetries: 2, timeoutMs: 600_000 },
    { name: "voice",    fn: voiceAgent,    maxRetries: 1, timeoutMs: 180_000 },
    { name: "audio",    fn: audioAgent,    maxRetries: 1, timeoutMs: 60_000 },
    { name: "assembly", fn: assemblyAgent, maxRetries: 0, timeoutMs: 30_000 },
    { name: "qa",       fn: qaAgent,       maxRetries: 0, timeoutMs: 10_000 },
    { name: "render",   fn: renderAgent,   maxRetries: 0, timeoutMs: 600_000 },
  ],
  edges: [
    { from: "brief", to: "script" },
    { from: "script", to: "critic" },
    {
      from: "critic",
      to: ["footage", "voice", "audio"],
      condition: (state) => {
        const critiqueStep = state.steps["critic"];
        const output = critiqueStep?.output as { pass: boolean } | undefined;
        return output?.pass !== false;
      }
    },
    {
      from: "critic",
      to: "script",
      condition: (state) => {
        const critiqueStep = state.steps["critic"];
        const output = critiqueStep?.output as { pass: boolean } | undefined;
        const retries = state.steps["script"]?.retryCount || 0;
        return output?.pass === false && retries < 2;
      }
    },
    { from: "footage", to: "assembly" },
    { from: "voice", to: "assembly" },
    { from: "audio", to: "assembly" },
    { from: "assembly", to: "qa" },
    {
      from: "qa",
      to: "render",
      condition: (state) => {
        const qaStep = state.steps["qa"];
        const output = qaStep?.output as { pass: boolean } | undefined;
        return output?.pass !== false;
      }
    },
  ],
};

export interface PipelineOptions {
  chatHistory?: ChatMessage[];
  brief?: Partial<Brief>;
  voiceId?: string;
  onEvent?: (event: GraphEvent) => void;
  onProgress?: (step: string, progress: number) => void;
}

export async function runPipeline(
  projectId: string,
  options: PipelineOptions = {}
): Promise<PipelineState> {
  const correlationId = uuid();

  const graph = new AgentGraph(graphDefinition, {
    onEvent: options.onEvent,
    onProgress: options.onProgress,
  });

  const initialState: PipelineState = {
    projectId,
    correlationId,
    chatHistory: options.chatHistory || [],
    steps: {},
    status: "idle",
  };

  if (options.brief) {
    initialState.brief = {
      ...options.brief,
      id: options.brief.id || uuid(),
    } as Brief;
  }

  return graph.run(initialState);
}
