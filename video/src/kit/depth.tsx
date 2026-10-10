import type { CSSProperties, ReactNode } from "react";

/**
 * Perspective, the reference's way of showing product UI: a mock-up tilted in space that settles (or
 * stays) at an angle. `p` interpolates every channel from `from` to `to`; the defaults carry a frame
 * from tilted, far and out of focus to flat and sharp.
 */
export interface Pose {
  rx?: number;
  ry?: number;
  rz?: number;
  scale?: number;
  x?: number;
  y?: number;
  z?: number;
  blur?: number;
  opacity?: number;
}

const FLAT: Required<Pose> = { rx: 0, ry: 0, rz: 0, scale: 1, x: 0, y: 0, z: 0, blur: 0, opacity: 1 };
export const TILTED_IN: Pose = { rx: 16, ry: -14, rz: 0, scale: 0.9, y: 60, z: -240, blur: 8, opacity: 0 };

function mix(a: number, b: number, p: number) {
  return a + (b - a) * p;
}

export function poseStyle(from: Pose, to: Pose, p: number, origin = "50% 55%"): CSSProperties {
  const f = { ...FLAT, ...from };
  const g = { ...FLAT, ...to };
  const rx = mix(f.rx, g.rx, p);
  const ry = mix(f.ry, g.ry, p);
  const rz = mix(f.rz, g.rz, p);
  const s = mix(f.scale, g.scale, p);
  const x = mix(f.x, g.x, p);
  const y = mix(f.y, g.y, p);
  const z = mix(f.z, g.z, p);
  const blur = mix(f.blur, g.blur, p);
  return {
    transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateX(${rx.toFixed(3)}deg) rotateY(${ry.toFixed(3)}deg) rotateZ(${rz.toFixed(3)}deg) scale(${s.toFixed(4)})`,
    transformOrigin: origin,
    transformStyle: "preserve-3d",
    filter: blur > 0.2 ? `blur(${blur.toFixed(2)}px)` : undefined,
    opacity: mix(f.opacity, g.opacity, p),
  };
}

/** A perspective stage; children carry `poseStyle`. */
export function Stage({ children, perspective = 2000, style }: { children: ReactNode; perspective?: number; style?: CSSProperties }) {
  return <div style={{ position: "absolute", inset: 0, perspective, perspectiveOrigin: "50% 50%", ...style }}>{children}</div>;
}
