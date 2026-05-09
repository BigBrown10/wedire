import { v4 as uuid } from "uuid";
import type { PipelineState, CompositionSpec, CompositionShot } from "@/lib/types";
import type { AgentContext } from "./agent-graph";

export async function assemblyAgent(
  state: PipelineState,
  context: AgentContext
): Promise<{ state: PipelineState; output: CompositionSpec }> {
  if (!state.shotList || !state.visualPlan || !state.audioPlan) {
    throw new Error("AssemblyAgent: Missing shotList, visualPlan, or audioPlan.");
  }

  context.log("AssemblyAgent: Building composition spec...");

  const FPS = 30;
  const WIDTH = 1920;
  const HEIGHT = 1080;

  const shots: CompositionShot[] = [];
  
  // Track the absolute frame position
  let globalFrame = 0;

  // 1. Process segments and their associated shots (NO INTRO CARD)
  for (const voSeg of state.audioPlan.voSegments) {
    const segmentStartFrame = globalFrame;
    const segmentDurationFrames = Math.round((voSeg.durationMs / 1000) * FPS);
    
    // Find all shots for this segment: either they have a visual assignment OR they are typography shots
    const segmentShots = state.shotList.shots.filter(s => {
      if (s.narrationSegmentId !== voSeg.narrationSegmentId) return false;
      const hasAssignment = state.visualPlan.assignments.some(a => String(a.shotId) === String(s.id));
      return hasAssignment || s.type === 'typography';
    });
    
    if (segmentShots.length > 0) {
      const framesPerShot = Math.floor(segmentDurationFrames / segmentShots.length);
      let localFrame = segmentStartFrame;

      for (let i = 0; i < segmentShots.length; i++) {
        const shot = segmentShots[i];
        const assignment = state.visualPlan.assignments.find(a => String(a.shotId) === String(shot.id));
        
        // If last shot in segment, take the remaining frames
        const durationInFrames = (i === segmentShots.length - 1) 
          ? (segmentStartFrame + segmentDurationFrames - localFrame)
          : framesPerShot;

        shots.push({
          shotId: shot.id,
          startFrame: localFrame,
          durationInFrames,
          videoSrc: assignment?.chosenClip?.videoUrl || "", // Empty for typography
          videoStartOffsetMs: assignment?.startOffsetMs || 0,
          videoDurationMs: (assignment?.chosenClip?.duration || 0) * 1000,
          transition: shot.transition,
          transitionDurationFrames: shot.transition === 'cut' ? 0 : Math.round(FPS * 0.5),
          motionEffect: shot.motionEffect || 'static',
          overlay: shot.overlay ? {
            text: shot.overlay.text!,
            position: shot.overlay.position,
            style: shot.overlay.style,
            fadeInFrame: 5,
            fadeOutFrame: durationInFrames - 5,
          } : undefined,
          visualStyle: shot.visualStyle,
        });
        localFrame += durationInFrames;
      }
    } else {
      context.log(`AssemblyAgent: No valid shots found for segment ${voSeg.narrationSegmentId}, stretching previous shot to cover gap.`);
      if (shots.length > 0) {
        // Stretch the last shot to cover this segment's duration
        const lastShot = shots[shots.length - 1];
        lastShot.durationInFrames += segmentDurationFrames;
      } else {
        // No previous shot? This only happens if the FIRST segment is missing shots.
        context.log(`AssemblyAgent: CRITICAL - First segment missing shots. Gaps will occur.`);
      }
    }

    globalFrame += segmentDurationFrames;
  }

  // 1.1 Post-process: Ensure no gap at the beginning
  if (shots.length > 0 && shots[0].startFrame > 0) {
    context.log(`AssemblyAgent: Fixing gap at the start — stretching first shot back to frame 0`);
    const gap = shots[0].startFrame;
    shots[0].startFrame = 0;
    shots[0].durationInFrames += gap;
  }

  // Build audio tracks (Starting from frame 0)
  const audioTracks: CompositionSpec['audioTracks'] = [];
  let currentAudioFrame = 0;

  for (const voSeg of state.audioPlan.voSegments) {
    audioTracks.push({
      type: 'voiceover',
      src: voSeg.audioUrl,
      startFrame: currentAudioFrame,
      volume: 1.0,
    });
    currentAudioFrame += Math.round((voSeg.durationMs / 1000) * FPS);
  }

  if (state.audioPlan.musicTrack) {
    audioTracks.push({
      type: 'music',
      src: state.audioPlan.musicTrack.audioUrl,
      startFrame: 0,
      volume: 0.25, // Boosted music for impact
    });
  }

  const finalDurationInFrames = globalFrame;

  // Build word timestamps for Active Captions
  const wordTimestamps: WordTimestamp[] = [];
  let currentWordFrameOffset = 0;
  for (const voSeg of state.audioPlan.voSegments) {
    const segmentStartMs = (currentWordFrameOffset / FPS) * 1000;
    voSeg.wordTimestamps.forEach(wt => {
      wordTimestamps.push({
        ...wt,
        startMs: wt.startMs + segmentStartMs,
        endMs: wt.endMs + segmentStartMs,
      });
    });
    currentWordFrameOffset += Math.round((voSeg.durationMs / 1000) * FPS);
  }

  const compositionSpec: CompositionSpec = {
    id: uuid(),
    correlationId: state.correlationId,
    fps: FPS,
    width: WIDTH,
    height: HEIGHT,
    durationInFrames: finalDurationInFrames,
    shots,
    audioTracks,
    wordTimestamps,
  };

  return {
    state: { ...state, compositionSpec },
    output: compositionSpec,
  };
}
