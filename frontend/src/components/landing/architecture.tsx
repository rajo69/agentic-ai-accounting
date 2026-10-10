"use client";

import { motion } from "framer-motion";

import { easeOutExpo, revealOnce } from "@/lib/motion";

import { ARCHITECTURE_URL, GITHUB_URL, README_URL } from "./links";
import { Container, SectionHeader } from "./section";

const W = 172;
const H = 56;

const NODES = [
  { id: "next", x: 20, y: 132, label: "Next.js", sub: "Vercel · app, demo" },
  { id: "api", x: 252, y: 132, label: "FastAPI", sub: "Railway · 34 routes" },
  { id: "graph", x: 484, y: 40, label: "LangGraph", sub: "categorise · reconcile" },
  { id: "claude", x: 688, y: 40, label: "Claude", sub: "Haiku 4.5 → Sonnet 4.6" },
  { id: "db", x: 484, y: 132, label: "Postgres", sub: "pgvector · audit log" },
  { id: "xero", x: 484, y: 224, label: "Xero API", sub: "OAuth2 · sync" },
];

const EDGES = [
  { id: "next-api", d: "M192 160 H252" },
  { id: "api-graph", d: "M424 160 C460 160 450 68 484 68" },
  { id: "graph-claude", d: "M656 68 H688" },
  { id: "api-db", d: "M424 160 H484" },
  { id: "api-xero", d: "M424 160 C460 160 450 252 484 252" },
  { id: "graph-db", d: "M570 96 V132", dashed: true },
];

const FACTS = [
  "FastAPI · 34 endpoints · OpenAPI contract",
  "pytest · 93 tests in CI",
  "LangGraph graph · Haiku 4.5 → Sonnet 4.6 escalation",
  "Instructor · Pydantic-validated structured outputs",
  "pgvector · precedent retrieval scoped to the organisation",
  "fuzzy risk engine · 8 rules · audit row per decision",
];

const LINKS = [
  { label: "README", href: README_URL },
  { label: "Architecture notes", href: ARCHITECTURE_URL },
  { label: "GitHub", href: GITHUB_URL },
];

/** Inline SVG system diagram: edges draw on reveal, nodes fade in. Decorative; facts carry the text. */
function Diagram() {
  return (
    <svg viewBox="0 0 880 320" role="img" aria-label="Next.js talks to FastAPI, which runs LangGraph agents calling Claude, stores precedents and the audit log in Postgres with pgvector, and syncs Xero through OAuth2." className="h-auto w-full">
      {EDGES.map((e, i) => (
        <motion.path
          key={e.id}
          d={e.d}
          fill="none"
          className="stroke-border-strong"
          strokeWidth={1.5}
          strokeDasharray={e.dashed ? "4 4" : undefined}
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 1 }}
          viewport={revealOnce}
          transition={{ duration: 0.9, ease: easeOutExpo, delay: 0.25 + i * 0.1 }}
        />
      ))}
      {NODES.map((n, i) => (
        <motion.g
          key={n.id}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={revealOnce}
          transition={{ duration: 0.6, ease: easeOutExpo, delay: 0.1 + i * 0.07 }}
        >
          <rect x={n.x} y={n.y} width={W} height={H} rx={8} className="fill-surface stroke-border" strokeWidth={1} />
          <rect x={n.x + 1} y={n.y + 1} width={W - 2} height={1} className="fill-white/5" />
          <text x={n.x + 16} y={n.y + 24} className="fill-foreground font-sans text-[14px] font-medium">
            {n.label}
          </text>
          <text x={n.x + 16} y={n.y + 42} className="fill-muted-foreground font-mono text-[10px]">
            {n.sub}
          </text>
        </motion.g>
      ))}
    </svg>
  );
}

export function Architecture() {
  return (
    <section id="engineering" className="relative z-10 scroll-mt-6 border-t border-border">
      <Container className="py-24 md:py-32">
        <SectionHeader
          index={4}
          eyebrow="How it is built"
          title="One API, two graphs, every answer validated."
          lead="A Next.js app on Vercel talks to a FastAPI service on Railway. Categorisation and reconciliation are LangGraph graphs that call Claude through Instructor, so each answer is validated before it is stored. Postgres holds the books, the pgvector precedents and the audit log."
        />
        <div className="mt-14 grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="self-start lg:col-span-8">
            <Diagram />
          </div>
          <div className="flex flex-col gap-10 self-start lg:col-span-4">
            <ul className="grid gap-x-8 gap-y-3 font-mono text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-1 lg:pt-2">
              {FACTS.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-border-strong" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {LINKS.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground"
                  >
                    {l.label} <span aria-hidden>↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
