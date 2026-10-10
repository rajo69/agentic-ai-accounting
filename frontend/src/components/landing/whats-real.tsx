"use client";

import { motion } from "framer-motion";

import { reveal, revealOnce, stagger } from "@/lib/motion";

import { Container, SectionHeader } from "./section";

/** Lifted from the product narrative: what is live, what is demo, what is published. */
const LINES = [
  {
    term: "Live",
    text: "The pipeline runs against a connected Xero organisation with real Claude calls: sync, categorise, reconcile, generate the letter, record every decision.",
  },
  {
    term: "Demo",
    text: "A synthetic company with pre-written reasoning and simulated jobs, so anyone can click through without an account. Nothing in the demo reaches Xero.",
  },
  {
    term: "Open source",
    text: "The code, the plan and the known limitations are on GitHub. Accuracy figures are not published until a reproducible evaluation is committed with its provenance.",
  },
];

export function WhatsReal() {
  return (
    <section id="real" className="relative z-10 border-t border-border">
      <Container className="py-24 md:py-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <SectionHeader index={5} eyebrow="What is real" title="What is live, what is demo." className="lg:col-span-5" />
          <motion.dl
            variants={stagger(0.08)}
            initial="hidden"
            whileInView="visible"
            viewport={revealOnce}
            className="flex flex-col divide-y divide-border border-y border-border lg:col-span-7"
          >
            {LINES.map((l) => (
              <motion.div key={l.term} variants={reveal} className="grid gap-2 py-6 sm:grid-cols-[140px_1fr] sm:gap-6">
                <dt className="font-mono text-eyebrow uppercase text-muted-foreground sm:pt-1">{l.term}</dt>
                <dd className="text-body text-foreground/90">{l.text}</dd>
              </motion.div>
            ))}
          </motion.dl>
        </div>
      </Container>
    </section>
  );
}
