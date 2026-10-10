import { AbsoluteFill, Audio, getStaticFiles, Sequence, staticFile, useCurrentFrame } from "remotion";
import { colors, fonts } from "./theme";
import { toMs } from "./layout";
import { BEATS, BEAT_ORDER, TEMPO } from "./timing";
import { ensureFonts } from "./fonts";
import { Captions } from "./kit/captions";
import { Title } from "./sections/title";
import { Problem } from "./sections/problem";
import { Product } from "./sections/product";
import { Built } from "./sections/built";
import { Judgement } from "./sections/judgement";
import { Honest } from "./sections/honest";
import { Close } from "./sections/close";

/** Voice files are local only (gitignored); the composition still builds and renders silently without them. */
function VoiceOver() {
  const present = new Set(getStaticFiles().map((f) => f.name));
  return (
    <>
      {BEAT_ORDER.map((id) => {
        const name = `vo/${id}.mp3`;
        if (!present.has(name)) return null;
        const beat = BEATS[id];
        return (
          <Sequence key={id} from={beat.start} durationInFrames={Math.max(1, beat.duration + 2)} name={`vo ${id}`}>
            <Audio src={staticFile(name)} playbackRate={TEMPO} />
          </Sequence>
        );
      })}
    </>
  );
}

export const Launch: React.FC = () => {
  ensureFonts();
  const frame = useCurrentFrame();
  const t = toMs(frame);
  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, fontFamily: fonts.sans, color: colors.foreground }}>
      <Title />
      <Problem />
      <Product />
      <Built />
      <Judgement />
      <Honest />
      <Close />
      <Captions t={t} />
      <VoiceOver />
    </AbsoluteFill>
  );
};
