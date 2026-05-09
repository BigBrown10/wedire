// ─── Generate API Route ───
// Triggers the full video generation pipeline.
// Streams progress events via Server-Sent Events.

import { NextRequest } from "next/server";
import { runPipeline } from "@/lib/agents/pipeline";
import { v4 as uuid } from "uuid";
import type { GraphEvent } from "@/lib/agents/agent-graph";

export const maxDuration = 600; // 10 minutes max (includes render time)

export async function POST(request: NextRequest) {
  try {
    const { chatHistory, brief, voiceId } = await request.json();

    if (!chatHistory && !brief) {
      return new Response(JSON.stringify({ error: "chatHistory or brief required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const projectId = uuid();

    // Create a readable stream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            // Stream may be closed
          }
        };

        try {
          const state = await runPipeline(projectId, {
            chatHistory,
            brief,
            voiceId,
            onEvent: (event: GraphEvent) => {
              sendEvent(event);
            },
            onProgress: (step, progress) => {
              sendEvent({ type: "progress", step, progress });
            },
          });

          // Send final state with all pipeline artifacts
          sendEvent({
            type: "pipeline_complete",
            timestamp: new Date().toISOString(),
            projectId,
            compositionSpec: state.compositionSpec,
            shotList: state.shotList,
            script: state.script,
            brief: state.brief,
            renderJob: state.renderJob,
          });

          // If render produced a video, send the video_ready event
          if (state.renderJob?.outputPath && state.renderJob.status === "done") {
            sendEvent({
              type: "video_ready",
              url: state.renderJob.outputPath,
              metrics: state.renderJob.metrics,
              timestamp: new Date().toISOString(),
            });
          }

          controller.close();
        } catch (err) {
          sendEvent({
            type: "pipeline_error",
            error: err instanceof Error ? err.message : "Pipeline failed",
            timestamp: new Date().toISOString(),
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Generate failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

