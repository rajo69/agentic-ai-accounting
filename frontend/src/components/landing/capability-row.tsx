"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { reveal, revealOnce, stagger } from "@/lib/motion";
import { Eyebrow } from "@/components/ui/eyebrow";

/**
 * DESIGN.md section 5: text 5 columns, product 7 columns, alternating; never three cards.
 * Copy: eyebrow, h2 with a full stop, two sentences, one mono fact.
 */
export function CapabilityRow({
  index,
  eyebrow,
  title,
  body,
  fact,
  flip = false,
  children,
}: {
  index: number;
  eyebrow: string;
  title: string;
  body: ReactNode;
  fact: string;
  /** Product on the left, text on the right. */
  flip?: boolean;
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
        <motion.div variants={reveal}>
          <Eyebrow index={index} className="text-muted-foreground">
            {eyebrow}
          </Eyebrow>
        </motion.div>
        <motion.h2 variants={reveal} className="mt-4 text-balance text-h2 text-foreground">
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
        {children}
      </motion.div>
    </div>
  );
}
