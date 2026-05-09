import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const TitleCard: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Subtle fade and zoom
  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, fps * 5], [1, 1.05], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#09090b", // Match UI dark mode
        justifyContent: "center",
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      <AbsoluteFill
        style={{
          opacity,
          transform: `scale(${scale})`,
          justifyContent: "center",
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
        }}
      >
        <h1
          style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "120px",
            fontWeight: 800,
            color: "white",
            margin: 0,
            textAlign: "center",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h1>

        {subtitle && (
          <h2
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: "48px",
              fontWeight: 500,
              color: "#a1a1aa",
              margin: 0,
              textAlign: "center",
              maxWidth: "80%",
            }}
          >
            {subtitle}
          </h2>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
