import { Composition, getInputProps } from "remotion";
import { StoryVideo } from "./StoryVideo";
import { VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS } from "../lib/types";

export const RemotionRoot: React.FC = () => {
  const inputProps = getInputProps() as any;
  const spec = inputProps?.spec;
  
  // Dynamically determine duration from input props, fallback to 15s
  const durationInFrames = spec?.durationInFrames || (VIDEO_FPS * 15);

  return (
    <>
      <Composition
        id="StoryVideo"
        component={StoryVideo}
        durationInFrames={Math.max(1, durationInFrames)}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{
          spec: spec || {
            id: "preview",
            fps: VIDEO_FPS,
            width: VIDEO_WIDTH,
            height: VIDEO_HEIGHT,
            durationInFrames: VIDEO_FPS * 15,
            shots: [],
            audioTracks: [],
          }
        }}
      />
    </>
  );
};

import { registerRoot } from "remotion";
registerRoot(RemotionRoot);
