import { AbsoluteFill, interpolate, Loop, spring, staticFile, useCurrentFrame, useVideoConfig, Video } from "remotion";
import type { CompositionShot } from "../../lib/types";

export const ShotSequence: React.FC<{ shot: CompositionShot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Basic motion effect (scale/pan)
  const scale = shot.motionEffect === 'zoom_in' 
    ? interpolate(frame, [0, shot.durationInFrames], [1, 1.1])
    : shot.motionEffect === 'zoom_out'
    ? interpolate(frame, [0, shot.durationInFrames], [1.1, 1])
    : 1;

  const origin = shot.motionEffect === 'pan_right' ? 'left center'
    : shot.motionEffect === 'pan_left' ? 'right center'
    : 'center center';

  return (
    <AbsoluteFill>
      {/* Background Layer: Video or Typography */}
      {shot.videoSrc ? (
        <AbsoluteFill
          style={{
            transform: `scale(${scale})`,
            transformOrigin: origin,
            filter: shot.visualStyle === 'black_and_white' ? 'grayscale(100%)' : 'none',
          }}
        >
          <Loop 
            durationInFrames={Math.max(1, Math.round(((shot.videoDurationMs - shot.videoStartOffsetMs) / 1000) * fps))}
          >
            <Video
              src={staticFile(shot.videoSrc)}
              startFrom={Math.round((shot.videoStartOffsetMs / 1000) * fps)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              volume={0}
            />
          </Loop>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ 
          background: 'linear-gradient(45deg, #1a1a1a, #2d2d2d)', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center' 
        }}>
          {/* Subtle geometric pattern or vector could go here */}
          <div style={{ 
            width: '80%', 
            height: '80%', 
            border: '2px solid rgba(255,255,255,0.1)',
            borderRadius: '40px',
            opacity: 0.5
          }} />
        </AbsoluteFill>
      )}

      {/* Text Overlay */}
      {shot.overlay && (
        <Overlay 
          text={shot.overlay.text} 
          position={shot.overlay.position} 
          styleType={shot.overlay.style} 
          fadeInFrame={shot.overlay.fadeInFrame}
          fadeOutFrame={shot.overlay.fadeOutFrame}
          shotDuration={shot.durationInFrames}
        />
      )}
    </AbsoluteFill>
  );
};

const Overlay: React.FC<{ 
  text: string, 
  position?: string, 
  styleType?: string, 
  fadeInFrame: number, 
  fadeOutFrame: number,
  shotDuration: number
}> = ({ text, position, styleType, fadeInFrame, fadeOutFrame, shotDuration }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Visibility check
  if (frame < fadeInFrame || frame > fadeOutFrame) return null;

  const durationInFrames = fadeOutFrame - fadeInFrame;
  const relativeFrame = frame - fadeInFrame;

  const opacity = interpolate(
    relativeFrame, 
    [0, 5, durationInFrames - 5, durationInFrames], 
    [0, 1, 1, 0], 
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  
  // Spring animation for text_slam
  const springValue = spring({
    frame: relativeFrame,
    fps,
    config: { stiffness: 200, damping: 20 },
  });

  const isTextSlam = styleType === 'text_slam';

  const posStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    padding: '40px',
    opacity,
    transform: isTextSlam ? `scale(${interpolate(springValue, [0, 1], [0.5, 1])}) rotate(${interpolate(springValue, [0, 1], [-5, 0])}deg)` : 'none',
    zIndex: 10,
  };

  if (position === 'top') posStyle.top = '10%';
  else if (position === 'bottom') posStyle.bottom = '10%';
  else posStyle.top = '40%';

  const textStyle: React.CSSProperties = {
    fontFamily: "'Outfit', sans-serif",
    color: isTextSlam ? '#ff1f1f' : 'white', // Bold Rick & Morty Red for slams
    fontSize: isTextSlam ? '140px' : '64px',
    fontWeight: '900',
    textAlign: 'center',
    textShadow: isTextSlam 
      ? '4px 4px 0px white, -4px -4px 0px white, 4px -4px 0px white, -4px 4px 0px white, 0 8px 24px rgba(0,0,0,0.5)'
      : '0 4px 12px rgba(0,0,0,0.8)',
    maxWidth: '90%',
    backgroundColor: isTextSlam ? 'transparent' : 'rgba(0,0,0,0.6)',
    padding: isTextSlam ? '0' : '16px 32px',
    borderRadius: '12px',
    letterSpacing: isTextSlam ? '-6px' : '-1px',
    textTransform: 'uppercase',
    lineHeight: 0.9,
  };

  return (
    <div style={posStyle}>
      <h2 style={textStyle}>
        {text}
      </h2>
    </div>
  );
};
