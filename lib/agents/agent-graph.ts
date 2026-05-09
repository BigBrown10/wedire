// ─── Agent Graph Executor ───
// A lightweight, LangGraph-inspired state machine for multi-agent workflows.
// Supports: typed nodes, conditional edges, parallel execution, HITL pauses, retries.

import { v4 as uuid } from "uuid";
import type { PipelineState, AgentStep, AgentStatus } from "@/lib/types";

// ─── Core Types ───

export type AgentFn<T = unknown> = (
  state: PipelineState,
  context: AgentContext
) => Promise<{ state: PipelineState; output: T }>;

export interface AgentNode {
  name: string;
  fn: AgentFn;
  maxRetries: number;
  timeoutMs: number;
}

export interface AgentEdge {
  from: string;
  to: string | string[]; // string[] = parallel execution
  condition?: (state: PipelineState) => boolean;
}

export interface AgentContext {
  correlationId: string;
  log: (message: string, data?: Record<string, unknown>) => void;
}

export interface GraphDefinition {
  nodes: AgentNode[];
  edges: AgentEdge[];
  entryNode: string;
}

// ─── Event Types ───
export type GraphEvent =
  | { type: 'node_start'; node: string; timestamp: string }
  | { type: 'node_complete'; node: string; timestamp: string; durationMs: number }
  | { type: 'node_error'; node: string; error: string; timestamp: string; retry: number }
  | { type: 'node_retry'; node: string; timestamp: string; attempt: number }
  | { type: 'parallel_start'; nodes: string[]; timestamp: string }
  | { type: 'parallel_complete'; nodes: string[]; timestamp: string }
  | { type: 'hitl_pause'; node: string; timestamp: string }
  | { type: 'pipeline_complete'; timestamp: string; totalMs: number }
  | { type: 'pipeline_error'; error: string; timestamp: string };

export type EventHandler = (event: GraphEvent) => void;

// ─── Graph Executor ───

export class AgentGraph {
  private nodes: Map<string, AgentNode> = new Map();
  private adjacency: Map<string, AgentEdge[]> = new Map();
  private entryNode: string;
  private eventHandlers: EventHandler[] = [];
  private onProgressHandler?: (step: string, progress: number) => void;

  constructor(definition: GraphDefinition, options: {
    onEvent?: EventHandler;
    onProgress?: (step: string, progress: number) => void;
  } = {}) {
    this.entryNode = definition.entryNode;
    if (options.onEvent) this.eventHandlers.push(options.onEvent);
    this.onProgressHandler = options.onProgress;

    for (const node of definition.nodes) {
      this.nodes.set(node.name, node);
    }

    for (const edge of definition.edges) {
      if (!this.adjacency.has(edge.from)) {
        this.adjacency.set(edge.from, []);
      }
      this.adjacency.get(edge.from)!.push(edge);
    }
  }

  /** Subscribe to graph execution events. */
  onEvent(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emit(event: GraphEvent): void {
    for (const handler of this.eventHandlers) {
      try { handler(event); } catch { /* non-critical */ }
    }
  }

  /** Execute the graph from the entry node to completion. */
  async run(initialState: PipelineState): Promise<PipelineState> {
    const correlationId = initialState.correlationId || uuid();
    const startTime = Date.now();
    let state = { ...initialState, correlationId };

    const context: AgentContext = {
      correlationId,
      log: (message, data) => {
        console.log(`[${correlationId.slice(0, 8)}] ${message}`, data || "");
      },
    };

    try {
      state = await this.executeNode(this.entryNode, state, context);
      
      const totalMs = Date.now() - startTime;
      this.emit({ type: 'pipeline_complete', timestamp: new Date().toISOString(), totalMs });
      return state;
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      this.emit({ type: 'pipeline_error', error, timestamp: new Date().toISOString() });
      return { ...state, error };
    }
  }

  private async executeNode(
    nodeName: string,
    state: PipelineState,
    context: AgentContext,
    isParallel = false
  ): Promise<PipelineState> {
    const node = this.nodes.get(nodeName);
    if (!node) throw new Error(`Unknown node: ${nodeName}`);

    // Check for HITL pause
    if (state.pausedForHITL) {
      this.emit({ type: 'hitl_pause', node: nodeName, timestamp: new Date().toISOString() });
      return state;
    }

    // Initialize step tracking
    state = this.updateStep(state, nodeName, 'running');
    this.emit({ type: 'node_start', node: nodeName, timestamp: new Date().toISOString() });
    const nodeStart = Date.now();

    // Execute with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= node.maxRetries; attempt++) {
      if (attempt > 0) {
        context.log(`Retrying ${nodeName} (attempt ${attempt + 1}/${node.maxRetries + 1})`);
        this.emit({ type: 'node_retry', node: nodeName, timestamp: new Date().toISOString(), attempt });
        await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
      }

      try {
        // Execute with timeout
        const result = await Promise.race([
          node.fn(state, context),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${nodeName} timed out after ${node.timeoutMs}ms`)), node.timeoutMs)
          ),
        ]);

        state = result.state;
        state = this.updateStep(state, nodeName, 'done', undefined, result.output);
        if (this.onProgressHandler) this.onProgressHandler(nodeName, 100);

        const durationMs = Date.now() - nodeStart;
        this.emit({ type: 'node_complete', node: nodeName, timestamp: new Date().toISOString(), durationMs });

        // If this is a parallel node, return state immediately and let the parent handle the transition
        if (isParallel) {
          return state;
        }

        // Find and execute next nodes
        return await this.executeNextNodes(nodeName, state, context);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.emit({
          type: 'node_error',
          node: nodeName,
          error: lastError.message,
          timestamp: new Date().toISOString(),
          retry: attempt,
        });
      }
    }

    // All retries exhausted
    state = this.updateStep(state, nodeName, 'failed', lastError?.message);
    throw lastError || new Error(`${nodeName} failed`);
  }

  private async executeNextNodes(
    fromNode: string,
    state: PipelineState,
    context: AgentContext
  ): Promise<PipelineState> {
    const edges = this.adjacency.get(fromNode) || [];

    // Find matching edges (check conditions)
    const matchingEdges = edges.filter(e => !e.condition || e.condition(state));

    if (matchingEdges.length === 0) {
      return state; // Terminal node
    }

    // Collect all next nodes
    const nextNodes: string[] = [];
    for (const edge of matchingEdges) {
      if (Array.isArray(edge.to)) {
        nextNodes.push(...edge.to);
      } else {
        nextNodes.push(edge.to);
      }
    }

    // If multiple nodes, execute in parallel
    if (nextNodes.length > 1) {
      this.emit({ type: 'parallel_start', nodes: nextNodes, timestamp: new Date().toISOString() });

      const results = await Promise.all(
        nextNodes.map(n => this.executeNode(n, { ...state }, context, true))
      );

      // Merge parallel results into state
      for (const result of results) {
        state = this.mergeStates(state, result);
      }

      this.emit({ type: 'parallel_complete', nodes: nextNodes, timestamp: new Date().toISOString() });

      // Check for edges from the parallel group
      // Convention: edges from parallel nodes go to a "join" node
      const joinEdges = nextNodes.flatMap(n => this.adjacency.get(n) || []);
      const joinNodes = [...new Set(joinEdges.map(e => Array.isArray(e.to) ? e.to : [e.to]).flat())];

      // Execute join nodes that haven't been executed yet
      for (const joinNode of joinNodes) {
        if (!state.steps[joinNode] || state.steps[joinNode].status === 'pending') {
          state = await this.executeNode(joinNode, state, context);
        }
      }

      return state;
    }

    // Single next node
    return this.executeNode(nextNodes[0], state, context);
  }

  private updateStep(
    state: PipelineState,
    nodeName: string,
    status: AgentStatus,
    error?: string,
    output?: unknown
  ): PipelineState {
    const existing = state.steps[nodeName] || {
      agentName: nodeName,
      status: 'pending',
      retryCount: 0,
    };

    return {
      ...state,
      currentStep: nodeName,
      steps: {
        ...state.steps,
        [nodeName]: {
          ...existing,
          status,
          ...(status === 'running' ? { startedAt: new Date().toISOString() } : {}),
          ...(status === 'done' || status === 'failed' ? { completedAt: new Date().toISOString() } : {}),
          ...(error ? { error } : {}),
          ...(output !== undefined ? { output } : {}),
          retryCount: status === 'failed' ? existing.retryCount + 1 : existing.retryCount,
        },
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private mergeStates(base: PipelineState, overlay: PipelineState): PipelineState {
    const mergedSteps = { ...base.steps };
    
    // Intelligently merge steps: never overwrite a final status with a pending one
    for (const [nodeName, step] of Object.entries(overlay.steps)) {
      const existing = mergedSteps[nodeName];
      if (!existing || existing.status === 'pending' || step.status !== 'pending') {
        mergedSteps[nodeName] = step;
      }
    }

    // Deep merge audioPlan: voice-agent sets voSegments, audio-agent sets musicTrack.
    // A shallow merge would let whichever finishes last clobber the other's data.
    const mergedAudioPlan = this.mergeAudioPlans(base.audioPlan, overlay.audioPlan);

    // Accumulate array fields from parallel branches (deduplicated)
    const mergedWordTimestamps = overlay.wordTimestamps?.length
      ? overlay.wordTimestamps
      : base.wordTimestamps;

    const mergedBeats = overlay.beats?.length
      ? overlay.beats
      : base.beats;

    return {
      ...base,
      ...overlay,
      steps: mergedSteps,
      // Preserve non-null values from either branch
      brief: overlay.brief || base.brief,
      script: overlay.script || base.script,
      shotList: overlay.shotList || base.shotList,
      visualPlan: overlay.visualPlan || base.visualPlan,
      audioPlan: mergedAudioPlan,
      compositionSpec: overlay.compositionSpec || base.compositionSpec,
      wordTimestamps: mergedWordTimestamps,
      beats: mergedBeats,
    };
  }

  /**
   * Deep merge two AudioPlan objects.
   * voice-agent produces { voSegments, totalDurationMs } while
   * audio-agent produces / patches { musicTrack }. We need both.
   */
  private mergeAudioPlans(
    a: PipelineState['audioPlan'],
    b: PipelineState['audioPlan']
  ): PipelineState['audioPlan'] {
    if (!a && !b) return undefined;
    if (!a) return b;
    if (!b) return a;

    return {
      id: a.id || b.id,
      scriptId: a.scriptId || b.scriptId,
      // Keep voSegments from whichever plan has them (voice-agent)
      voSegments: a.voSegments.length > 0 ? a.voSegments : b.voSegments,
      // Keep musicTrack from whichever plan has it (audio-agent)
      musicTrack: a.musicTrack || b.musicTrack,
      // Use the longer duration (VO-driven)
      totalDurationMs: Math.max(a.totalDurationMs, b.totalDurationMs),
    };
  }
}
