"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { reveal, revealOnce, stagger } from "@/lib/motion";
import { Eyebrow } from "@/components/ui/eyebrow";

/** DESIGN.md section 5: 1200 px container, 24 px gutters. */
export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-[1248px] px-6", className)} {...props} />;
}

/** Reveal once at 20 percent in view (section headers and product frames only). */
export function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div variants={reveal} initial="hidden" whileInView="visible" viewport={revealOnce} className={className}>
      {children}
    </motion.div>
  );
}

/** Serif h2 ending in a full stop, optional lead. One eyebrow per three sections at most. */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={stagger()}
      initial="hidden"
      whileInView="visible"
      viewport={revealOnce}
      className={cn("max-w-[640px]", className)}
    >
      {eyebrow && (
        <motion.div variants={reveal} className="mb-4">
          <Eyebrow className="text-muted-foreground">{eyebrow}</Eyebrow>
        </motion.div>
      )}
      <motion.h2 variants={reveal} className="text-balance font-serif text-h2-serif text-foreground">
        {title}
      </motion.h2>
      {lead && (
        <motion.p variants={reveal} className="mt-4 text-lead text-muted-foreground">
          {lead}
        </motion.p>
      )}
    </motion.div>
  );
}
