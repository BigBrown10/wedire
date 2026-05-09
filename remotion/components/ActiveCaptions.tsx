import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { WordTimestamp } from '../../lib/types';

interface ActiveCaptionsProps {
  wordTimestamps: WordTimestamp[];
}

export const ActiveCaptions: React.FC<ActiveCaptionsProps> = ({ wordTimestamps }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTimeMs = (frame / fps) * 1000;

  // Find the words that should be visible in the current window (e.g., current word + 2 before and 2 after)
  const currentWordIndex = wordTimestamps.findIndex(
    w => currentTimeMs >= w.startMs && currentTimeMs <= w.endMs
  );

  if (currentWordIndex === -1) {
    // If between words, show nothing or the last word briefly
    return null;
  }

  // Define window size for captions
  const windowSize = 5; 
  const start = Math.max(0, currentWordIndex - Math.floor(windowSize / 2));
  const end = Math.min(wordTimestamps.length, start + windowSize);
  const visibleWords = wordTimestamps.slice(start, end);

  return (
    <AbsoluteFill style={{ 
      justifyContent: 'flex-end', 
      alignItems: 'center', 
      paddingBottom: '150px',
      pointerEvents: 'none'
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '12px',
        maxWidth: '80%',
        backgroundColor: 'rgba(0,0,0,0.3)',
        padding: '20px 40px',
        borderRadius: '24px',
        backdropFilter: 'blur(8px)',
      }}>
        {visibleWords.map((word, i) => {
          const isActive = currentTimeMs >= word.startMs && currentTimeMs <= word.endMs;
          
          return (
            <span
              key={`${word.word}-${i}`}
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: '72px',
                fontWeight: '900',
                textTransform: 'uppercase',
                color: isActive ? '#FFD700' : 'white', // Gold for active word
                transform: isActive ? 'scale(1.2)' : 'scale(1)',
                transition: 'transform 0.1s ease-out, color 0.1s ease-out',
                textShadow: '0 4px 12px rgba(0,0,0,0.5)',
              }}
            >
              {word.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
