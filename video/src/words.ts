import raw from "./vo-words.json";
import { BEATS, TEMPO, type BeatId } from "./timing";

/**
 * When each spoken word starts and ends, in absolute composition milliseconds. The timings come from
 * `scripts/words.py` (faster-whisper over the generated beats, aligned to the script words) and are
 * committed in `vo-words.json`; a beat without data falls back to a proportional split by length.
 * The kinetic type and the captions both read this, so the word on screen is the word being said.
 */
export interface WordTime {
  w: string;
  start: number;
  end: number;
}

type Raw = Record<string, { words: { w: string; s: number; e: number }[] }>;
const data = raw as Raw;

const cache = new Map<BeatId, WordTime[]>();

export function beatWords(id: BeatId): WordTime[] {
  const hit = cache.get(id);
  if (hit) return hit;
  const beat = BEATS[id];
  const words = beat.text.split(/\s+/).filter(Boolean);
  const entry = data[id];
  let out: WordTime[];
  if (entry && entry.words.length === words.length) {
    out = entry.words.map((x) => ({ w: x.w, start: beat.startMs + (x.s * 1000) / TEMPO, end: beat.startMs + (x.e * 1000) / TEMPO }));
  } else {
    const total = words.reduce((n, w) => n + w.length + 1, 0) || 1;
    let cursor = beat.startMs;
    out = words.map((w) => {
      const d = ((w.length + 1) / total) * beat.durationMs;
      const r = { w, start: cursor, end: cursor + d };
      cursor += d;
      return r;
    });
  }
  cache.set(id, out);
  return out;
}

/** Start of word `i` of a beat (absolute ms). */
export const wordAt = (id: BeatId, i: number) => beatWords(id)[Math.min(i, beatWords(id).length - 1)].start;
