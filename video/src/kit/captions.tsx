import { colors, fonts } from "../theme";
import { CAPTION_Y, W } from "../layout";
import { BEATS, BEAT_ORDER, type Beat } from "../timing";
import { enterStyle, seg } from "../timeline";

/**
 * Burned-in captions (RULES.md section 1): Geist 32 px, bottom band, one line at a time, a short
 * hairline above. Each beat's text is split at sentence and clause boundaries into lines of at most
 * `MAX` characters, and each line gets a share of the beat's measured audio time proportional to its
 * length. Stage directions in parentheses never reach the screen.
 */
const MAX = 72;

export function splitCaption(text: string): string[] {
  const clean = text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.?!]+[.?!]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const lines: string[] = [];
  let current = "";
  const push = () => {
    if (current) lines.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length <= MAX) {
      current = (current + " " + sentence).trim();
      continue;
    }
    push();
    if (sentence.length <= MAX) {
      current = sentence;
      continue;
    }
    // A sentence longer than a line is split on its own; its tail never shares a line with the next sentence.
    // Long sentence: break at commas or colons, then at words.
    const parts = sentence.split(/(?<=[,:;])\s+/);
    for (const part of parts) {
      if ((current + " " + part).trim().length <= MAX) {
        current = (current + " " + part).trim();
      } else {
        push();
        if (part.length <= MAX) current = part;
        else {
          for (const word of part.split(" ")) {
            if ((current + " " + word).trim().length <= MAX) current = (current + " " + word).trim();
            else {
              push();
              current = word;
            }
          }
        }
      }
    }
    push();
  }
  push();
  return lines;
}

interface Line {
  text: string;
  startMs: number;
  endMs: number;
}

function linesFor(beat: Beat): Line[] {
  const lines = splitCaption(beat.text);
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  let cursor = beat.startMs;
  return lines.map((text) => {
    const share = (text.length / total) * beat.durationMs;
    const line = { text, startMs: cursor, endMs: cursor + share };
    cursor += share;
    return line;
  });
}

const ALL_LINES: Line[] = BEAT_ORDER.flatMap((id) => linesFor(BEATS[id]));

export function Captions({ t, visible = true }: { t: number; visible?: boolean }) {
  if (!visible) return null;
  // The current line stays up through the gap until the next one starts (no empty flicker between beats).
  let current: Line | null = null;
  for (const line of ALL_LINES) {
    if (t >= line.startMs - 120) current = line;
    else break;
  }
  if (!current) return null;
  const nextStart = ALL_LINES[ALL_LINES.indexOf(current) + 1]?.startMs ?? Infinity;
  const hold = Math.min(current.endMs + 900, nextStart);
  if (t > hold) return null;
  const p = seg(t, current.startMs - 120, 240);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: CAPTION_Y, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, pointerEvents: "none" }}>
      <div style={{ width: 40, height: 1, background: colors.borderStrong }} />
      <div
        key={current.startMs}
        style={{
          fontFamily: fonts.sans,
          fontSize: 32,
          lineHeight: "40px",
          letterSpacing: "-0.01em",
          color: colors.foreground,
          maxWidth: W - 400,
          textAlign: "center",
          ...enterStyle(p, 6),
        }}
      >
        {current.text}
      </div>
    </div>
  );
}
