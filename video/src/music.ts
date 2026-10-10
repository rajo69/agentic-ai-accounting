import { BEATS, BEAT_ORDER, TOTAL_FRAMES } from "./timing";
import { video } from "./theme";

/**
 * The music bed's gain curve, a pure function of the frame (`scripts/music.py` writes the bed to
 * `public/music/bed.wav`, normalised to -18 dBFS; the voice sits around -17 dBFS). Under the voice the
 * bed ducks to `duck` (-16 dB), in the gaps it rests at `bed` (-7.5 dB), it opens fully for the lead-in
 * before the first word and fades over the last two seconds. `scripts/timing.py` mirrors this curve for
 * the stems, so keep the two in step.
 */
export const MUSIC = { bed: 0.42, duck: 0.16, intro: 0.55, fadeFrames: 60, rampIn: 10, rampOut: 16 } as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function musicGain(frame: number): number {
  let voice = 0;
  for (const id of BEAT_ORDER) {
    const b = BEATS[id];
    const a = clamp01((frame - (b.start - MUSIC.rampIn)) / MUSIC.rampIn);
    const z = clamp01((b.start + b.duration + MUSIC.rampOut - frame) / MUSIC.rampOut);
    voice = Math.max(voice, Math.min(a, z));
  }
  const firstStart = BEATS[BEAT_ORDER[0]].start;
  const rest = frame < firstStart - MUSIC.rampIn ? MUSIC.intro : MUSIC.bed;
  const g = rest + (MUSIC.duck - rest) * voice;
  const fade = clamp01((TOTAL_FRAMES - frame) / MUSIC.fadeFrames);
  return g * fade;
}

export const MUSIC_SECONDS = TOTAL_FRAMES / video.fps;
