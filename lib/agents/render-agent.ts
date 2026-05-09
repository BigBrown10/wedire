// ─── Render Agent ───
// Final pipeline stage: triggers Remotion render + FFmpeg post-processing.
// Only runs if QA passes. Produces the final MP4 video.

import type { PipelineState, RenderJob } from "@/lib/types";
import type { AgentContext } from "./agent-graph";
import { startRenderJob } from "@/lib/render/render-service";

export async function renderAgent(
  state: PipelineState,
  context: AgentContext
): Promise<{ state: PipelineState; output: RenderJob }> {
  if (!state.compositionSpec) {
    throw new Error("RenderAgent: Missing composition spec.");
  }

  // Gate: only render if QA passed
  const qaStep = state.steps["qa"];
  const qaOutput = qaStep?.output as { pass: boolean } | undefined;
  if (qaOutput && !qaOutput.pass) {
    throw new Error("RenderAgent: QA did not pass — aborting render.");
  }

  context.log(
    `RenderAgent: Starting render — ` +
    `${state.compositionSpec.shots.length} shots, ` +
    `${state.compositionSpec.durationInFrames} frames @ ${state.compositionSpec.fps}fps`
  );

  const renderJob = await startRenderJob(state.compositionSpec, (progress) => {
    context.log(`RenderAgent: Render progress ${progress}%`);
  });

  if (renderJob.status === "failed") {
    throw new Error(`RenderAgent: Render failed — ${renderJob.error}`);
  }

  context.log(
    `RenderAgent: Render complete — ` +
    `${renderJob.outputPath} ` +
    `(${renderJob.metrics?.renderTimeMs ? Math.round(renderJob.metrics.renderTimeMs / 1000) + "s" : "unknown"}, ` +
    `${renderJob.metrics?.fileSizeBytes ? Math.round(renderJob.metrics.fileSizeBytes / 1024 / 1024) + "MB" : "unknown"})`
  );

  return {
    state: { ...state, renderJob },
    output: renderJob,
  };
}
