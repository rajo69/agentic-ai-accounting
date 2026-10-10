"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Settings } from "lucide-react";
import { isDemo } from "@/demo/flag";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader } from "@/components/app/page-header";
import { PanelSection } from "@/components/app/panel-section";
import { EmptyState } from "@/components/app/empty-state";
import { uiTransition } from "@/lib/motion";

/**
 * Settings is demo-only (S0 decision 4). Values are the demo's static defaults until S5 wires
 * them to the demo store; everything here is read-only. No data fetching.
 */

type Row = { label: string; value: React.ReactNode; hint?: string };

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-small tabular-nums text-foreground">{children}</span>
);

const SECTIONS: { eyebrow: string; blurb: string; rows: Row[] }[] = [
  {
    eyebrow: "AI policy",
    blurb: "Thresholds decide what is coded automatically, what is suggested and what waits for a reviewer.",
    rows: [
      { label: "Auto-categorise at", value: <Mono>0.85</Mono>, hint: "Confidence at or above this is applied without review." },
      { label: "Suggest at", value: <Mono>0.50</Mono>, hint: "Between the two thresholds the category is a suggestion." },
      { label: "Escalation threshold", value: <Mono>0.85</Mono>, hint: "Below this the primary model's answer is re-run on the stronger model." },
      { label: "Primary model", value: <StatusChip tone="info" dot={false} className="font-mono">claude-haiku-4-5-20251001</StatusChip> },
      { label: "Escalation model", value: <StatusChip tone="info" dot={false} className="font-mono">claude-sonnet-4-5-20250929</StatusChip> },
      { label: "Precedent retrieval", value: <StatusChip tone="warning" outline>Behind a flag</StatusChip>, hint: "Confirmed corrections are stored as precedents; retrieval is gated until the Xero terms question is settled." },
    ],
  },
  {
    eyebrow: "Sync",
    blurb: "How the books reach the console.",
    rows: [
      { label: "Source", value: <Mono>Xero (synthetic)</Mono> },
      { label: "Schedule", value: <Mono>Manual</Mono>, hint: "Run Sync from the dashboard; nothing runs on a timer in the demo." },
      { label: "Scope", value: <Mono>Chart of accounts · bank transactions · statement lines</Mono> },
    ],
  },
  {
    eyebrow: "Notifications",
    blurb: "Nothing is sent from the demo.",
    rows: [
      { label: "Review digest", value: <StatusChip tone="muted">Off</StatusChip> },
      { label: "Job failures", value: <StatusChip tone="muted">Off</StatusChip> },
    ],
  },
  {
    eyebrow: "Data and privacy",
    blurb: "Where the data lives and how it leaves.",
    rows: [
      { label: "Storage", value: <Mono>This browser only</Mono>, hint: "Demo state is kept in localStorage; Reset data clears it." },
      { label: "Model provider", value: <Mono>Pre-written reasoning</Mono>, hint: "The demo replays reasoning generated from the fixtures; no model is called." },
      { label: "Export", value: <Mono>GET /api/v1/gdpr/export</Mono>, hint: "Real mode only." },
      { label: "Erase", value: <Mono>DELETE /api/v1/gdpr/erase</Mono>, hint: "Real mode only." },
    ],
  },
  {
    eyebrow: "Organisation",
    blurb: "The synthetic company behind the demo.",
    rows: [
      { label: "Name", value: <span className="text-sm text-foreground">Harlow &amp; Finch Ltd</span> },
      { label: "Reviewer", value: <Mono>reviewer@demo.invalid</Mono> },
      { label: "Currency", value: <Mono>GBP</Mono> },
      { label: "Reporting", value: <Mono>MTD for Income Tax · quarterly</Mono> },
    ],
  },
];

export default function SettingsPage() {
  // Read after mount so server and client render the same markup.
  const [demo, setDemo] = useState<boolean | null>(null);
  useEffect(() => {
    setDemo(isDemo());
  }, []);

  if (demo === null) return null;

  if (!demo) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <EmptyState
          icon={<Settings />}
          title="Settings is part of the demo."
          hint="In this build the policy, sync and privacy settings are shown with the synthetic company only."
        >
          <Button variant="outline" nativeButton={false} render={<Link href="/demo?skip_onboarding=1" />}>
            Open the demo
          </Button>
        </EmptyState>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={uiTransition}
      className="max-w-3xl space-y-6"
    >
      <PageHeader
        title="Settings"
        meta="Read-only in the demo"
        chip={<StatusChip tone="info" dot={false}>Demo</StatusChip>}
      />

      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <div key={section.eyebrow} className="rounded-lg border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <PanelSection eyebrow={section.eyebrow}>
                <p className="-mt-1 text-small text-muted-foreground">{section.blurb}</p>
              </PanelSection>
            </div>
            <dl>
              {section.rows.map((row) => (
                <div
                  key={row.label}
                  className="grid gap-1 border-b border-border px-5 py-3 last:border-b-0 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-4"
                >
                  <dt className="text-small text-muted-foreground">{row.label}</dt>
                  <dd className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">{row.value}</div>
                    {row.hint && <p className="mt-1 text-xs leading-5 text-subtle-foreground">{row.hint}</p>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
