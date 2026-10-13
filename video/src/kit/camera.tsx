import type { ReactNode } from "react";
import { outExpo, clamp01, outQuart } from "../timeline";

/**
 * A Screen-Studio style camera: keyframes name a focus point (in the child's own coordinates) and a
 * zoom; between keyframes the camera eases over `MOVE_MS` (out-expo, no overshoot). Identity is
 * scale 1 focused on the centre.
 */
export interface CameraKey {
  /** Absolute ms when the move towards this key starts. */
  at: number;
  scale: number;
  /** Focus point in child coordinates; defaults to the centre. */
  x?: number;
  y?: number;
  /** Move length in ms (default 700). */
  ms?: number;
}

const MOVE_MS = 700;

export function cameraState(keys: CameraKey[], t: number, width: number, height: number) {
  let scale = 1;
  let x = width / 2;
  let y = height / 2;
  for (const k of keys) {
    if (t < k.at) break;
    const p = outExpo(clamp01((t - k.at) / (k.ms ?? MOVE_MS)));
    const kx = k.x ?? width / 2;
    const ky = k.y ?? height / 2;
    scale = scale + (k.scale - scale) * p;
    x = x + (kx - x) * p;
    y = y + (ky - y) * p;
  }
  // Keep the viewport inside the child: the focus point cannot be closer to an edge than half the visible size.
  const halfW = width / scale / 2;
  const halfH = height / scale / 2;
  x = Math.min(Math.max(x, halfW), width - halfW);
  y = Math.min(Math.max(y, halfH), height - halfH);
  return { scale, x, y };
}

export function Camera({ keys, t, width, height, children }: { keys: CameraKey[]; t: number; width: number; height: number; children: ReactNode }) {
  const { scale, x, y } = cameraState(keys, t, width, height);
  const tx = width / 2 - x * scale;
  const ty = height / 2 - y * scale;
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width, height, transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: "0 0" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * An animated cursor: keyframes are places it arrives at; it leaves the previous place `ms` before
 * `at` and eases in (out-quart, so it decelerates into the target like a hand). `click` marks a press:
 * the arrow dips to 0.9 for 150 ms. The cursor hides before its first key and after `hideAt`.
 */
export interface CursorKey {
  /** Absolute ms when the cursor is at (x, y). */
  at: number;
  x: number;
  y: number;
  /** Travel time to get here (default 600). */
  ms?: number;
  click?: boolean;
}

export function cursorState(keys: CursorKey[], t: number) {
  if (keys.length === 0 || t < keys[0].at - (keys[0].ms ?? 600)) return null;
  let x = keys[0].x;
  let y = keys[0].y;
  let pressing = false;
  for (const k of keys) {
    const ms = k.ms ?? 600;
    const p = outQuart(clamp01((t - (k.at - ms)) / ms));
    if (p <= 0) break;
    x = x + (k.x - x) * p;
    y = y + (k.y - y) * p;
    if (k.click && t >= k.at && t < k.at + 150) pressing = true;
  }
  return { x, y, pressing };
}

export function Cursor({ keys, t, hideAt, scale = 1 }: { keys: CursorKey[]; t: number; hideAt?: number; scale?: number }) {
  const s = cursorState(keys, t);
  if (!s || (hideAt !== undefined && t >= hideAt)) return null;
  const size = 22 * scale;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ position: "absolute", left: s.x, top: s.y, transform: `scale(${s.pressing ? 0.88 : 1})`, transformOrigin: "4px 3px", pointerEvents: "none", zIndex: 50 }}
    >
      <path d="M5 3 L19 12.5 L12.6 13.6 L16.2 20.6 L13.5 22 L9.9 15 L5 19.6 Z" fill="#f5f5f7" stroke="#09090c" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
