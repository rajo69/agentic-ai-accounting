"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Settings } from "lucide-react";
import { isDemo } from "@/demo/flag";
import type { DemoSettings } from "@/demo";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader } from "@/components/app/page-header";
import { PanelSection } from "@/components/app/panel-section";
import { EmptyState } from "@/components/app/empty-state";
import { uiTransition } from "@/lib/motion";

/**
 * Settings is demo-only (S0 decision 4). Values come from the demo store through a dynamic import
 * so the seed stays out of this route's bundle in real mode; everything here is read-only.
 */

type Row = { label: string; value: React.ReactNode; hint?: string };

const Mono = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-small tabular-nums text-foreground">{children}</span>
);

function fmtBytes(n: number) {
  return n >= 1024 ? `${(n / 1024).toFixed(0)} KB` : `${n} B`;
}

function fmtWhen(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

function sections(d: DemoSettings): { eyebrow: string; blurb: string; rows: Row[] }[] {
  return [
    {
      eyebrow: "AI policy",
      blurb: "Thresholds decide what is coded automatically, what is suggested and what waits for a reviewer.",
      rows: [
        { label: "Auto-categorise at", value: <Mono>{d.auto_threshold.toFixed(2)}</Mono>, hint: "Confidence at or above this is applied without review." },
        { label: "Suggest at", value: <Mono>{d.suggest_threshold.toFixed(2)}</Mono>, hint: "Between the two thresholds the category is a suggestion." },
        { label: "Escalation threshold", value: <Mono>{d.escalation_threshold.toFixed(2)}</Mono>, hint: "Below this the primary model's answer is re-run on the stronger model." },
        { label: "Primary model", value: <StatusChip tone="info" dot={false} className="font-mono">{d.primary_model}</StatusChip> },
        { label: "Escalation model", value: <StatusChip tone="info" dot={false} className="font-mono">{d.escalation_model}</StatusChip> },
        { label: "Document model", value: <StatusChip tone="info" dot={false} className="font-mono">{d.document_model}</StatusChip>, hint: "Recorded on each generated document in real mode; the demo replays pre-written sections." },
        { label: "Risk rules", value: <Mono>{d.rule_count} plain-language rules</Mono>, hint: "Amount deviation, vendor frequency and time pattern; each fired rule is shown on the transaction." },
        { label: "Precedent retrieval", value: <StatusChip tone="warning" outline>Behind a flag</StatusChip>, hint: "Confirmed corrections are stored as precedents; retrieval is gated until the Xero terms question is settled." },
      ],
    },
    {
      eyebrow: "Sync",
      blurb: "How the books reach the console.",
      rows: [
        { label: "Source", value: <Mono>Xero (synthetic)</Mono> },
        { label: "Last sync", value: <Mono>{fmtWhen(d.synced_at)}</Mono> },
        { label: "Schedule", value: <Mono>Manual</Mono>, hint: "Run Sync from the dashboard; nothing runs on a timer in the demo." },
        {
          label: "Scope",
          value: <Mono>{d.counts.accounts} accounts · {d.counts.transactions} transactions · {d.counts.statements} statement lines</Mono>,
        },
        {
          label: "Documents",
          value: <Mono>Pre-rendered for the imported quarter</Mono>,
          hint: "The three templates are rendered once from the synthetic book with the real document templates; the period picker does not change them in the demo.",
        },
      ],
    },
    {
      eyebrow: "Notifications",
      blurb: "Nothing is sent from the demo.",
      rows: [
        { label: "Review digest", value: <StatusChip tone="muted">Off</StatusChip> },
        { label: "Job failures", value: <StatusChip tone="muted">Off</StatusChip> },
        { label: "Invitations", value: <StatusChip tone="muted">Simulated</StatusChip>, hint: "Team invites are recorded but no email leaves the browser." },
      ],
    },
    {
      eyebrow: "Data and privacy",
      blurb: "Where the data lives and how it leaves.",
      rows: [
        { label: "Storage", value: <Mono>This browser only · {fmtBytes(d.storage_bytes)}</Mono>, hint: "Demo state is kept in localStorage; Reset demo clears it." },
        { label: "Audit trail", value: <Mono>{d.counts.audit} rows</Mono>, hint: "Every AI proposal and every human decision so far in this demo." },
        { label: "Model provider", value: <Mono>Pre-written reasoning</Mono>, hint: "The demo replays reasoning generated from the fixtures; no model is called." },
        { label: "Export", value: <Mono>GET /api/v1/gdpr/export</Mono>, hint: "Real mode only." },
        { label: "Erase", value: <Mono>DELETE /api/v1/gdpr/erase</Mono>, hint: "Real mode only." },
      ],
    },
    {
      eyebrow: "Organisation",
      blurb: "The synthetic company behind the demo.",
      rows: [
        { label: "Name", value: <span className="text-sm text-foreground">{d.org_name}</span> },
        { label: "Reviewer", value: <Mono>{d.reviewer_email}</Mono> },
        { label: "Currency", value: <Mono>GBP</Mono> },
        { label: "Reporting", value: <Mono>MTD for Income Tax · quarterly</Mono> },
      ],
    },
  ];
}

export default function SettingsPage() {
  // Read after mount so server and client render the same markup.
  const [demo, setDemo] = useState<boolean | null>(null);
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  useEffect(() => {
    const on = isDemo();
    setDemo(on);
    if (!on) return;
    let cancelled = false;
    import("@/demo").then(({ demoSettings }) => {
      if (!cancelled) setSettings(demoSettings());
    });
    return () => {
      cancelled = true;
    };
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

  if (!settings) return null;

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
        {sections(settings).map((section) => (
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
