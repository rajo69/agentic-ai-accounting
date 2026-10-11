import { Composition } from "remotion";
import { Launch } from "./Launch";
import { TOTAL_FRAMES } from "./timing";
import { video } from "./theme";

/** "Launch": the whole film. Its length is the sum of the measured voice beats plus the gaps (see timing.ts). */
export const LaunchComposition = () => (
  <Composition id="Launch" component={Launch} durationInFrames={TOTAL_FRAMES} fps={video.fps} width={video.width} height={video.height} />
);
