"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { reveal, revealOnce, stagger } from "@/lib/motion";

/**
 * DESIGN.md section 5: text 5 columns, product 7 columns, alternating; never three cards.
 * The headline carries the section; no eyebrow. `children` is the desktop crop, `mobile` the
 * phone-width crop (each scene has a narrow composition, so nothing is scaled below legibility).
 */
export function CapabilityRow({
  title,
  body,
  fact,
  flip = false,
  mobile,
  children,
}: {
  title: string;
  body: ReactNode;
  /** One plain fact in mono, no separators. */
  fact: string;
  /** Product on the left, text on the right. */
  flip?: boolean;
  mobile: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid items-center gap-10 md:grid-cols-12 md:gap-12">
      <motion.div
        variants={stagger()}
        initial="hidden"
        whileInView="visible"
        viewport={revealOnce}
        className={cn("md:col-span-5", flip && "md:order-2")}
      >
        <motion.h2 variants={reveal} className="text-balance font-serif text-h2-serif text-foreground">
          {title}
        </motion.h2>
        <motion.p variants={reveal} className="mt-4 text-body text-muted-foreground">
          {body}
        </motion.p>
        <motion.p variants={reveal} className="mt-5 font-mono text-xs text-muted-foreground">
          {fact}
        </motion.p>
      </motion.div>

      <motion.div
        variants={reveal}
        initial="hidden"
        whileInView="visible"
        viewport={revealOnce}
        aria-hidden
        className={cn("min-w-0 md:col-span-7", flip && "md:order-1")}
      >
        <div className="hidden sm:block">{children}</div>
        <div className="sm:hidden">{mobile}</div>
      </motion.div>
    </div>
  );
}
