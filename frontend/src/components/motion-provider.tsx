"use client";

import { MotionConfig } from "framer-motion";

/** Honours the OS reduced-motion setting for every framer-motion animation in the tree. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
