import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import type { CompositionSpec } from "../lib/types";
import { ShotSequence } from "./components/ShotSequence";
import { ActiveCaptions } from "./components/ActiveCaptions";

export const StoryVideo: React.FC<{ spec: CompositionSpec }> = ({ spec }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Global Cinematic Grade Overlay */}
      <AbsoluteFill style={{ 
        zIndex: 5, 
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, transparent 20%, transparent 80%, rgba(0,0,0,0.4) 100%)',
        boxShadow: 'inset 0 0 100px rgba(0,0,0,0.3)'
      }} />

      {/* Shots */}
      {spec.shots.map((shot, index) => (
        <Sequence
          key={shot.shotId}
          from={shot.startFrame}
          durationInFrames={shot.durationInFrames + (index < spec.shots.length - 1 ? shot.transitionDurationFrames : 0)}
          name={`Shot ${index + 1}`}
        >
          <ShotSequence shot={shot} />
        </Sequence>
      ))}

      {/* Active Captions Layer */}
      {spec.wordTimestamps && (
        <AbsoluteFill style={{ zIndex: 20 }}>
          <ActiveCaptions wordTimestamps={spec.wordTimestamps} />
        </AbsoluteFill>
      )}

      {/* Audio Tracks */}
      {spec.audioTracks.map((track, i) => (
        <Sequence key={`audio-${i}`} from={track.startFrame}>
          <Audio src={staticFile(track.src)} volume={track.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
