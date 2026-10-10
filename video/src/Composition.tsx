import { AbsoluteFill, Composition, interpolate, staticFile, useCurrentFrame } from "remotion";
import { colors, easeOutExpo, fonts, frames, video } from "./theme";

/**
 * Placeholder "Launch" composition from the S6 setup session: proves the render contract (fonts via
 * staticFile, frame-driven interpolation, the token colours) and reserves the id, size and fps that
 * S7 fills with the real beats. Duration is a 115 s placeholder; S7 sets it from the voice-over manifest.
 */
const geist = `@font-face { font-family: Geist; src: url(${staticFile("fonts/GeistVF.woff")}) format("woff"); font-weight: 100 900; }
@font-face { font-family: "Geist Mono"; src: url(${staticFile("fonts/GeistMonoVF.woff")}) format("woff"); font-weight: 100 900; }`;

export const Launch: React.FC = () => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, frames.reveal], [0, 1], { extrapolateRight: "clamp", easing: easeOutExpo });
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, fontFamily: fonts.sans, color: colors.foreground }}>
      <style>{geist}</style>
      <div style={{ position: "absolute", left: 160, top: 420, opacity: t, transform: `translateY(${(1 - t) * 12}px)` }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 22, color: colors.subtleForeground, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          AI Accountant
        </div>
        <div style={{ marginTop: 20, fontSize: 72, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.02, maxWidth: 1200 }}>
          The review layer for books that AI already coded.
        </div>
        <div style={{ marginTop: 28, fontFamily: fonts.mono, fontSize: 20, color: colors.mutedForeground }}>
          placeholder composition · frame {frame}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, backgroundColor: colors.border }} />
    </AbsoluteFill>
  );
};

export const LaunchComposition = () => (
  <Composition
    id="Launch"
    component={Launch}
    durationInFrames={115 * video.fps}
    fps={video.fps}
    width={video.width}
    height={video.height}
  />
);
