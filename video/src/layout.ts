import { video } from "./theme";

/** Frame geometry shared by the sections. */
export const W = video.width;
export const H = video.height;

/** Left margin of every headline and the product frame (the landing's 1200 px container, centred). */
export const MARGIN_X = 200;

/**
 * The console frame: designed at 1200 x 675 (the landing frame's proportions) and scaled up so
 * 13 px UI text becomes 16.5 px on a 1080p canvas. The camera zooms on top of that.
 */
export const CONSOLE = {
  designW: 1200,
  designH: 675,
  scale: 1520 / 1200,
  left: MARGIN_X,
  top: 72,
} as const;
export const CONSOLE_W = CONSOLE.designW * CONSOLE.scale; // 1520
export const CONSOLE_H = CONSOLE.designH * CONSOLE.scale; // 855

/** Captions sit under the frame, in the bottom band. */
export const CAPTION_Y = 985;

export const msPerFrame = 1000 / video.fps;
export const toMs = (frame: number) => frame * msPerFrame;
export const toFrames = (ms: number) => Math.round(ms / msPerFrame);
