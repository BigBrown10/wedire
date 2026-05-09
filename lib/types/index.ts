// ─── Wedire Storytelling Video Engine — Domain Types ───
// All core domain entities used across agents, services, and UI.

// ─── Video Dimensions ───
export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;

// ─── Brief ───
export interface Brief {
  id: string;
  projectId: string;
  title: string;
  audience: string;
  tone: string;
  keyMessages: string[];
  style: 'brand_story' | 'explainer' | 'tutorial' | 'social_short';
  duration: number; // target seconds (30–120)
  references: string[]; // URLs or moodboard links
  constraints: string[];
  voiceId?: string; // Optional user-selected ElevenLabs voice ID
  createdAt: string;
}

// ─── Script ───
export interface NarrationSegment {
  id: string;
  text: string;
  estimatedDurationMs: number;
  emotion: 'neutral' | 'excited' | 'serious' | 'warm' | 'urgent';
}

export interface Script {
  id: string;
  briefId: string;
  segments: NarrationSegment[];
  totalEstimatedDurationMs: number;
  narrativeArc: 'hook_context_insight_cta' | 'problem_solution' | 'story_reveal';
}

// ─── Shot List ───
export interface Shot {
  id: string;
  index: number;
  type: 'video' | 'typography';
  narrationSegmentId: string;
  description: string; // visual description for footage search
  searchQueries: string[]; // 2-3 queries for video aggregator
  durationMs: number;
  transition: 'cut' | 'fade' | 'dissolve' | 'slide';
  overlay?: {
    text?: string;
    position: 'center' | 'lower_third' | 'upper_left';
    style: 'title' | 'subtitle' | 'stat' | 'quote' | 'text_slam';
  };
  motionEffect?: 'ken_burns_in' | 'ken_burns_out' | 'static' | 'slow_zoom';
  visualStyle?: 'cinematic' | 'black_and_white' | 'high_contrast' | 'raw';
}

export interface ShotList {
  id: string;
  scriptId: string;
  shots: Shot[];
  introCard?: {
    title: string;
    subtitle?: string;
    durationMs: number;
  };
  outroCard?: {
    text: string;
    cta?: string;
    durationMs: number;
  };
}

// ─── Stock Video ───
export interface StockVideoClip {
  id: string;
  source: 'pexels' | 'pixabay' | 'coverr';
  query: string;
  thumbnailUrl: string;
  videoUrl: string;
  duration: number; // seconds
  width: number;
  height: number;
  author: string;
  license: string;
  clipScore?: number; // CLIP similarity score (0-1)
  tasteScore?: number; // Gemini taste score (0-10)
}

// ─── Visual Plan ───
export interface VisualPlan {
  id: string;
  shotListId: string;
  assignments: ShotAssignment[];
}

export interface ShotAssignment {
  shotId: string;
  chosenClip: StockVideoClip;
  alternates: StockVideoClip[]; // top 3 alternatives for swap
  startOffsetMs: number; // where to start in the source clip
  endOffsetMs: number;
}

// ─── Audio ───
export interface WordTimestamp {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface PausePoint {
  startMs: number;
  endMs: number;
  type: 'breath' | 'sentence' | 'paragraph';
}

export interface BeatEvent {
  timestampMs: number;
  strength: number; // 0-1
}

export interface TransientEvent {
  timestampMs: number;
  type: 'onset' | 'transient';
}

export interface VOSegment {
  narrationSegmentId: string;
  audioUrl: string; // local file path or URL
  durationMs: number;
  wordTimestamps: WordTimestamp[];
  pauses: PausePoint[];
}

export interface MusicTrack {
  id: string;
  name: string;
  source: 'freesound' | 'library';
  audioUrl: string;
  duration: number; // seconds
  author: string;
  license: string;
  bpm?: number;
  beats: BeatEvent[];
  tags: string[];
}

export interface AudioPlan {
  id: string;
  scriptId: string;
  voSegments: VOSegment[];
  musicTrack: MusicTrack | null;
  totalDurationMs: number;
}

// ─── Render ───
export interface CompositionSpec {
  id: string;
  correlationId?: string; // Links back to temporary asset directory
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  shots: CompositionShot[];
  introCard?: {
    title: string;
    subtitle?: string;
    durationInFrames: number;
  };
  outroCard?: {
    text: string;
    cta?: string;
    durationInFrames: number;
  };
  audioTracks: {
    type: 'voiceover' | 'music';
    src: string;
    startFrame: number;
    volume: number;
  }[];
  wordTimestamps?: WordTimestamp[];
}

export interface CompositionShot {
  shotId: string;
  startFrame: number;
  durationInFrames: number;
  videoSrc: string;
  videoStartOffsetMs: number;
  videoDurationMs: number; // Duration of the original source video
  transition: 'cut' | 'fade' | 'dissolve' | 'slide';
  transitionDurationFrames: number;
  motionEffect: 'ken_burns_in' | 'ken_burns_out' | 'static' | 'slow_zoom';
  overlay?: {
    text: string;
    position: 'center' | 'lower_third' | 'upper_left';
    style: 'title' | 'subtitle' | 'stat' | 'quote' | 'text_slam';
    fadeInFrame: number;
    fadeOutFrame: number;
  };
  visualStyle?: 'cinematic' | 'black_and_white' | 'high_contrast' | 'raw';
}

export type RenderStatus = 'queued' | 'rendering' | 'post_processing' | 'done' | 'failed';

export interface RenderJob {
  id: string;
  compositionSpecId: string;
  status: RenderStatus;
  progress: number; // 0-100
  outputPath?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  metrics?: {
    renderTimeMs: number;
    fileSizeBytes: number;
    resolution: string;
  };
}

// ─── Project ───
export interface Project {
  id: string;
  name: string;
  status: 'draft' | 'briefing' | 'generating' | 'review' | 'editing' | 'complete';
  brief?: Brief;
  script?: Script;
  shotList?: ShotList;
  visualPlan?: VisualPlan;
  audioPlan?: AudioPlan;
  compositionSpec?: CompositionSpec;
  renderJob?: RenderJob;
  chatHistory: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Agent Graph ───
export type AgentStatus = 'pending' | 'running' | 'paused' | 'done' | 'failed';

export interface AgentStep {
  agentName: string;
  status: AgentStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  output?: unknown;
}

export interface PipelineState {
  projectId: string;
  correlationId: string;
  currentStep: string;
  steps: Record<string, AgentStep>;
  brief?: Brief;
  script?: Script;
  shotList?: ShotList;
  visualPlan?: VisualPlan;
  audioPlan?: AudioPlan;
  compositionSpec?: CompositionSpec;
  renderJob?: RenderJob;
  wordTimestamps?: WordTimestamp[];
  beats?: BeatEvent[];
  error?: string;
  pausedForHITL: boolean;
  createdAt: string;
  updatedAt: string;
}
