import manifest from "./vo-manifest.json";
import { video } from "./theme";

/**
 * Beat timing comes from the measured voice-over (`scripts/tts.py` writes `public/vo/manifest.json`
 * and the committed copy `src/vo-manifest.json`). Nothing here is guessed: a beat starts when its
 * audio file starts, lasts as long as the file, and the next beat follows after a short gap.
 */
export const BEAT_ORDER = [
  "hook",
  "problem1",
  "problem2",
  "product",
  "categorise1",
  "categorise2",
  "explain1",
  "explain2",
  "explain3",
  "decide1",
  "decide2",
  "reconcile1",
  "reconcile2",
  "report",
  "built1",
  "built2",
  "judgement1",
  "judgement2",
  "judgement3",
  "honest",
  "close",
] as const;

export type BeatId = (typeof BEAT_ORDER)[number];

/** Extra silence before a beat, in frames. Section openers get a breath; the title gets a lead-in. */
const LEAD: Partial<Record<BeatId, number>> = {
  hook: 36,
  problem1: 12,
  product: 14,
  categorise1: 8,
  explain1: 6,
  decide1: 6,
  reconcile1: 8,
  report: 6,
  built1: 70,
  judgement1: 12,
  honest: 10,
  close: 14,
};
const DEFAULT_GAP = 5;
/**
 * Playback rate of the voice files (pitch preserved by Chrome and by ffmpeg's atempo in the render).
 * The cloned voice reads at about 2.3 words/s; 1.12 brings 315 words to roughly two minutes.
 */
export const TEMPO = 1.12;
/** Frames held after the last word of the close. */
const TAIL = 60;

export interface Beat {
  id: BeatId;
  text: string;
  /** First frame of the audio. */
  start: number;
  /** Audio length in frames. */
  duration: number;
  /** Start in milliseconds (for the clock-driven scenes). */
  startMs: number;
  durationMs: number;
  /** Frame where the next beat's audio starts (or the composition ends). */
  next: number;
}

type Manifest = Record<string, { text: string; seconds: number | null; bytes?: number }>;
const m = manifest as Manifest;

function build(): { beats: Record<BeatId, Beat>; total: number } {
  const beats = {} as Record<BeatId, Beat>;
  let cursor = 0;
  const list: Beat[] = [];
  for (const id of BEAT_ORDER) {
    const entry = m[id];
    const seconds = (entry?.seconds ?? 0) / TEMPO;
    cursor += LEAD[id] ?? DEFAULT_GAP;
    const duration = Math.round(seconds * video.fps);
    const beat: Beat = {
      id,
      text: entry?.text ?? "",
      start: cursor,
      duration,
      startMs: (cursor * 1000) / video.fps,
      durationMs: seconds * 1000,
      next: 0,
    };
    beats[id] = beat;
    list.push(beat);
    cursor += duration;
  }
  const total = cursor + TAIL;
  list.forEach((b, i) => {
    b.next = i + 1 < list.length ? list[i + 1].start : total;
  });
  return { beats, total };
}

export const { beats: BEATS, total: TOTAL_FRAMES } = build();

export const ms = (id: BeatId) => BEATS[id].startMs;
