import { useEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { colors, fonts } from "../theme";
import { W, H } from "../layout";
import type { BeatId } from "../timing";
import { beatWords } from "../words";
import { clamp01, outExpo, outQuart, seg } from "../timeline";

/**
 * Kinetic typography in the grammar of the owner's reference (a music-cut SaaS launch ad): one to four
 * words on screen at a time, each word popping in on the moment it is spoken (scale 1.2 to 1, a short
 * focus pull from blur, 260 ms), the group re-centring as words arrive, the whole phrase leaving (scale
 * 0.92, blur) just before the next phrase begins. Accent words are set in Instrument Serif italic in the
 * kinetic accent colour; everything else is Geist 500. Widths are measured with a hidden span carrying
 * the same style (a canvas measure missed the loaded Geist face and the letter spacing), so the layout is
 * a pure function of the frame once the fonts are loaded. The first React pass runs while Geist is still
 * loading, and Chrome re-lays the visible text out when it arrives but nothing re-measures, so `useFontsReady`
 * holds the frame and re-renders once `document.fonts` reports loaded; widths are cached only then.
 */
export interface Phrase {
  /** Word index range [from, to) into the beat's words. */
  from: number;
  to: number;
  /** Indices (absolute, into the beat) set in the serif italic accent. */
  accent?: number[];
  /** Hold after the last word ends when there is no next phrase (ms). */
  hold?: number;
}

interface WordStyle {
  fontFamily: string;
  fontWeight: number;
  fontStyle: string;
  fontSize: number;
  letterSpacing: string;
}

const fontsLoaded = () => typeof document !== "undefined" && document.fonts.status === "loaded";

/** True once every registered face has loaded; delays the render until then and re-renders on arrival. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(fontsLoaded);
  const handle = useRef<number | null>(null);
  if (handle.current === null && !ready && typeof document !== "undefined") handle.current = delayRender("kinetic: fonts");
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  useEffect(() => {
    if (ready && handle.current !== null) {
      continueRender(handle.current);
      handle.current = null;
    }
  }, [ready]);
  useEffect(
    () => () => {
      if (handle.current !== null) {
        continueRender(handle.current);
        handle.current = null;
      }
    },
    [],
  );
  return ready;
}

const widths = new Map<string, number>();
function measure(text: string, st: WordStyle): number {
  const key = `${st.fontFamily}|${st.fontWeight}|${st.fontStyle}|${st.fontSize}|${st.letterSpacing}|${text}`;
  const hit = widths.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === "undefined") return text.length * 0.52 * st.fontSize;
  const el = document.createElement("span");
  Object.assign(el.style, {
    position: "absolute",
    visibility: "hidden",
    whiteSpace: "nowrap",
    left: "-99999px",
    top: "0",
    lineHeight: "1",
    fontFamily: st.fontFamily,
    fontWeight: String(st.fontWeight),
    fontStyle: st.fontStyle,
    fontSize: `${st.fontSize}px`,
    letterSpacing: st.letterSpacing,
  });
  el.textContent = text;
  document.body.appendChild(el);
  const w = el.getBoundingClientRect().width;
  el.remove();
  if (fontsLoaded()) widths.set(key, w);
  return w;
}

export const KINETIC_ACCENT = "#a594ff";

export function Kinetic({
  t,
  beat,
  phrases,
  size = 112,
  cx = W / 2,
  cy = H / 2,
  accentColor = KINETIC_ACCENT,
  exitLead = 180,
  color = colors.foreground,
}: {
  t: number;
  beat: BeatId;
  phrases: Phrase[];
  size?: number;
  cx?: number;
  cy?: number;
  accentColor?: string;
  exitLead?: number;
  color?: string;
}) {
  useFontsReady();
  const words = beatWords(beat);
  const gap = size * 0.26;
  const out: React.ReactNode[] = [];
  phrases.forEach((ph, pi) => {
    const first = words[ph.from];
    const last = words[Math.min(ph.to, words.length) - 1];
    if (!first || !last) return;
    const next = phrases[pi + 1] ? words[phrases[pi + 1].from] : undefined;
    const exitAt = next ? next.start - exitLead : last.end + (ph.hold ?? 600);
    const inAt = first.start - 80;
    if (t < inAt) return;
    const eo = seg(t, exitAt, 220, outQuart);
    if (eo >= 1) return;
    // Layout: each word's width, scaled by its own entrance, so the group re-centres as words arrive.
    const items = [];
    for (let i = ph.from; i < Math.min(ph.to, words.length); i++) {
      const w = words[i];
      const accent = ph.accent?.includes(i) ?? false;
      const px = accent ? size * 1.14 : size;
      const st: WordStyle = accent
        ? { fontFamily: fonts.serif, fontWeight: 400, fontStyle: "italic", fontSize: px, letterSpacing: "-0.01em" }
        : { fontFamily: fonts.sans, fontWeight: 500, fontStyle: "normal", fontSize: px, letterSpacing: "-0.035em" };
      const width = measure(w.w, st);
      const p = seg(t, w.start - 60, 260, outExpo);
      // The slot opens faster than the word pops (the reference re-lays out in about a frame), so the
      // earlier words slide to make room while the new word is still arriving.
      const slot = seg(t, w.start - 60, 120, outQuart);
      items.push({ w, accent, px, width, p, slot, st });
    }
    const total = items.reduce((n, it, k) => n + it.width * it.slot + (k > 0 ? gap * it.slot : 0), 0);
    let x = -total / 2;
    const exitScale = 1 - 0.08 * eo;
    const exitBlur = 10 * eo;
    out.push(
      <div
        key={`${beat}-${pi}`}
        style={{
          position: "absolute",
          left: cx,
          top: cy,
          width: 0,
          height: 0,
          opacity: 1 - eo,
          transform: `scale(${exitScale.toFixed(4)})`,
          filter: exitBlur > 0.2 ? `blur(${exitBlur.toFixed(2)}px)` : undefined,
          whiteSpace: "nowrap",
        }}
      >
        {items.map((it, k) => {
          const slotLeft = x + (k > 0 ? gap * it.slot : 0);
          x = slotLeft + it.width * it.slot;
          if (it.p <= 0) return null;
          // Anchored to the slot's left edge and scaled from there, the entering word grows into empty space.
          const left = slotLeft;
          const scale = 1.22 - 0.22 * it.p;
          const blur = 12 * (1 - clamp01(it.p * 1.3));
          return (
            <span
              key={it.w.start}
              style={{
                position: "absolute",
                left,
                top: -it.px * 0.56,
                fontFamily: it.st.fontFamily,
                fontStyle: it.st.fontStyle,
                fontWeight: it.st.fontWeight,
                fontSize: it.px,
                lineHeight: 1,
                letterSpacing: it.st.letterSpacing,
                color: it.accent ? accentColor : color,
                opacity: it.p,
                transform: `scale(${scale.toFixed(4)})`,
                transformOrigin: "0% 60%",
                filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
                whiteSpace: "nowrap",
              }}
            >
              {it.w.w}
            </span>
          );
        })}
      </div>,
    );
  });
  return <>{out}</>;
}
