"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Link2, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfidenceMeter } from "@/components/ui/confidence-meter";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Input } from "@/components/ui/input";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { STATUS_STYLES, StatusChip } from "@/components/ui/status-chip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { reveal, stagger } from "@/lib/motion";

// ── Data ──────────────────────────────────────────────────────────────────────

const COLOUR_TOKENS: { name: string; hsl: string; swatch: string; use: string }[] = [
  { name: "background", hsl: "240 10% 4%", swatch: "bg-background", use: "canvas" },
  { name: "surface", hsl: "240 8% 7%", swatch: "bg-surface", use: "sidebar, cards" },
  { name: "surface-2", hsl: "240 7% 10%", swatch: "bg-surface-2", use: "hover, inputs" },
  { name: "border", hsl: "240 6% 16%", swatch: "bg-border", use: "hairlines" },
  { name: "border-strong", hsl: "240 6% 22%", swatch: "bg-border-strong", use: "focused borders" },
  { name: "foreground", hsl: "240 8% 93%", swatch: "bg-foreground", use: "primary text" },
  { name: "muted-foreground", hsl: "240 5% 60%", swatch: "bg-muted-foreground", use: "secondary text" },
  { name: "subtle-foreground", hsl: "240 5% 42%", swatch: "bg-subtle-foreground", use: "eyebrows" },
  { name: "primary", hsl: "246 84% 67%", swatch: "bg-primary", use: "the one accent" },
  { name: "success", hsl: "152 56% 45%", swatch: "bg-success", use: "auto, confirmed" },
  { name: "warning", hsl: "38 92% 55%", swatch: "bg-warning", use: "suggested, review" },
  { name: "danger", hsl: "0 70% 60%", swatch: "bg-danger", use: "rejected, high risk" },
  { name: "info", hsl: "199 89% 48%", swatch: "bg-info", use: "informational" },
];

const STATUS_ITEMS = {
  all: "All statuses",
  uncategorised: "Uncategorised",
  suggested: "Suggested",
  auto_categorised: "Auto-categorised",
  confirmed: "Confirmed",
  needs_review: "Needs review",
  rejected: "Rejected",
};
const PERIOD_ITEMS = { q1: "Q1 2026", q4: "Q4 2025", q3: "Q3 2025" };
const CATEGORY_ITEMS = { utilities: "Utilities", software: "Software subscriptions", travel: "Travel" };

const AMOUNTS = ["12,004.19", "1,240.00", "86.40", "-430.00", "0.99"];

const ROWS = [
  { date: "2026-04-02", contact: "Octopus Energy", category: "Utilities", status: "auto_categorised", conf: 0.96, amount: "-184.20" },
  { date: "2026-04-03", contact: "Figma Inc", category: "Software subscriptions", status: "suggested", conf: 0.72, amount: "-45.00" },
  { date: "2026-04-03", contact: "Acme Ltd", category: "Sales", status: "confirmed", conf: 0.99, amount: "12,004.19" },
  { date: "2026-04-05", contact: "TfL Travel", category: "Travel", status: "needs_review", conf: 0.41, amount: "-19.60" },
  { date: "2026-04-06", contact: "Unknown payee", category: "—", status: "uncategorised", conf: null, amount: "-430.00" },
];

const EASINGS = [
  { name: "out-expo", value: "cubic-bezier(0.16, 1, 0.3, 1)", path: "M0 100 C 16 0, 30 0, 100 0", use: "reveals, 600 ms" },
  { name: "out-quart", value: "cubic-bezier(0.25, 1, 0.5, 1)", path: "M0 100 C 25 0, 50 0, 100 0", use: "hover 150 ms, UI 200 ms" },
];

// ── Layout helpers ────────────────────────────────────────────────────────────

function Section({
  index,
  title,
  note,
  children,
}: {
  index: number;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-12 md:py-16">
      <div className="grid gap-8 md:grid-cols-12">
        <div className="md:col-span-3">
          <Eyebrow index={index}>{title}</Eyebrow>
          {note && <p className="mt-3 max-w-[26ch] text-small text-muted-foreground">{note}</p>}
        </div>
        <div className="min-w-0 md:col-span-9">{children}</div>
      </div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 font-mono text-eyebrow uppercase text-subtle-foreground">{children}</div>;
}

function Group({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Kit() {
  const [replayKey, setReplayKey] = useState(0);

  return (
    <main className="mx-auto max-w-[1200px] px-6 pb-24 pt-16 md:pt-24">
      {/* Header */}
      <header className="mb-16 md:mb-24">
        <Eyebrow>Design system · stage S1 · development only</Eyebrow>
        <h1 className="mt-6 max-w-[16ch] text-display text-balance">
          The parts, before the <em className="font-serif font-normal italic">product</em>.
        </h1>
        <p className="mt-6 max-w-[52ch] text-lead text-muted-foreground">
          Every token, type size and primitive shared by the landing page, the demo and the real app.
          Dark only. Geist Sans, Geist Mono, one accent.
        </p>
      </header>

      {/* 01 Colour */}
      <Section index={1} title="Colour" note="Thirteen tokens. Greys carry a trace of indigo (hue 240) so the accent sits in them.">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {COLOUR_TOKENS.map((t) => (
            <div key={t.name}>
              <div className={`h-14 rounded-md border border-border ${t.swatch}`} />
              <div className="mt-2.5 font-mono text-xs text-foreground">--{t.name}</div>
              <div className="font-mono text-xs text-subtle-foreground">{t.hsl}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{t.use}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* 02 Type */}
      <Section index={2} title="Type" note="Sentence case, full stops, tight tracking on headings. Mono for anything you would copy or add up.">
        <div className="flex flex-col gap-10">
          <div>
            <Label>display · clamp(40, 6vw, 64) · 600 · -0.035em</Label>
            <p className="max-w-[18ch] text-display text-balance">
              Every AI-coded transaction, reviewed with <em className="font-serif font-normal italic">evidence</em>.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <Label>h2 · clamp(28, 3.2vw, 40)</Label>
              <h2 className="text-h2">Explain every decision.</h2>
            </div>
            <div>
              <Label>h3 · 20</Label>
              <h3 className="text-h3">Reasoning and fired rules</h3>
            </div>
            <div>
              <Label>lead · 17 / 1.6 · muted</Label>
              <p className="text-lead text-muted-foreground">
                Xero and its assistant record and reconcile. This checks the books before you sign them off.
              </p>
            </div>
            <div>
              <Label>body 15 · small 13</Label>
              <p className="text-body">
                <span className="text-foreground">Two-tone paragraphs are allowed once.</span>{" "}
                <span className="text-muted-foreground">
                  The second clause steps back to muted so the eye lands on the first.
                </span>
              </p>
              <p className="mt-2 text-small text-muted-foreground">Small: footnotes, deltas, table captions.</p>
            </div>
          </div>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <Label>eyebrow · mono 11 · 0.08em</Label>
              <div className="flex flex-wrap gap-6">
                <Eyebrow index={1}>Categorise</Eyebrow>
                <Eyebrow index={2}>Explain</Eyebrow>
                <Eyebrow>Review layer for Xero</Eyebrow>
              </div>
            </div>
            <div>
              <Label>mono numerals · tabular</Label>
              <div className="flex items-start gap-10">
                <ul className="font-mono text-sm tabular-nums">
                  {AMOUNTS.map((a) => (
                    <li key={a} className="flex w-32 justify-between">
                      <span className="text-subtle-foreground">GBP</span>
                      <span className={a.startsWith("-") ? "text-foreground" : "text-success"}>{a}</span>
                    </li>
                  ))}
                </ul>
                <div className="font-mono text-xs leading-6 text-muted-foreground">
                  <div>ACC-4010</div>
                  <div>2026-04-06T09:14Z</div>
                  <div>txn_7f3a9c</div>
                  <div className="text-subtle-foreground">haiku-4-5 → sonnet-4-6</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* 03 Buttons */}
      <Section index={3} title="Buttons" note="Three real tiers. 36 px default, 40 in the hero. Press scales to 0.98; nothing else moves.">
        <div className="flex flex-col gap-8">
          <Group label="variants">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Reject</Button>
              <Button variant="link">Link</Button>
            </div>
          </Group>
          <Group label="sizes · xs 28 · sm 32 · md 36 · lg 40">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="xs" variant="outline">
                <RefreshCw /> Sync
              </Button>
              <Button size="sm" variant="outline">
                <RefreshCw /> Sync
              </Button>
              <Button variant="outline">
                <RefreshCw /> Sync
              </Button>
              <Button size="lg" variant="outline">
                <RefreshCw /> Sync
              </Button>
              <Button size="icon" variant="outline" aria-label="Close">
                <X />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label="Close">
                <X />
              </Button>
            </div>
          </Group>
          <Group label="hero pair · disabled">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" variant="outline">
                <Link2 /> Connect Xero
              </Button>
              <Button size="lg">
                Launch demo <ArrowUpRight />
              </Button>
              <Button disabled>Categorising…</Button>
              <Button variant="outline" disabled>
                Disabled
              </Button>
            </div>
          </Group>
        </div>
      </Section>

      {/* 04 Inputs */}
      <Section index={4} title="Inputs" note="36 px, surface-2, hairline. Focus is a ring-coloured border plus a soft 2 px halo. Tab through them.">
        <div className="grid gap-6 md:grid-cols-2">
          <Group label="input">
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
                <Input placeholder="Search transactions" className="pl-9" />
              </div>
              <Input defaultValue="Octopus Energy" />
              <Input defaultValue="not-an-email" aria-invalid />
              <Input placeholder="Disabled" disabled />
            </div>
          </Group>
          <Group label="select · popup sized to trigger">
            <div className="flex flex-col gap-3">
              <Select defaultValue="all" items={STATUS_ITEMS}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="uncategorised">Uncategorised</SelectItem>
                  <SelectItem value="suggested">Suggested</SelectItem>
                  <SelectItem value="auto_categorised">Auto-categorised</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="needs_review">Needs review</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select items={PERIOD_ITEMS}>
                <SelectTrigger size="sm" className="w-full sm:w-44">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="q1">Q1 2026</SelectItem>
                  <SelectItem value="q4">Q4 2025</SelectItem>
                  <SelectItem value="q3">Q3 2025</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Group>
        </div>
      </Section>

      {/* 05 Chips */}
      <Section index={5} title="Chips" note="Status chips use the exact API strings. Needs review is the one outline chip: a question, not a verdict.">
        <div className="flex flex-col gap-8">
          <Group label="status map">
            <div className="flex flex-wrap gap-2">
              {Object.keys(STATUS_STYLES).map((s) => (
                <StatusChip key={s} status={s} />
              ))}
            </div>
          </Group>
          <Group label="unknown status falls back to muted · no dot">
            <div className="flex flex-wrap gap-2">
              <StatusChip status="manually_matched" />
              <StatusChip status="auto_categorised" dot={false} />
              <StatusChip tone="info">Escalated to Sonnet</StatusChip>
              <StatusChip tone="primary" dot={false}>
                haiku-4-5
              </StatusChip>
            </div>
          </Group>
          <Group label="badge (neutral labels)">
            <div className="flex flex-wrap gap-2">
              <Badge>34 endpoints</Badge>
              <Badge variant="primary">Haiku 4.5</Badge>
              <Badge variant="secondary">v0.2.8</Badge>
              <Badge variant="outline">ebm</Badge>
              <Badge variant="destructive">Failed</Badge>
              <Badge variant="ghost">optional</Badge>
            </div>
          </Group>
        </div>
      </Section>

      {/* 06 KPI */}
      <Section index={6} title="KPI tiles" note="Label, 28 px mono value, one line of context. No sparklines, no icons.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Accounts" value="128" delta="Chart of accounts synced" />
          <KpiTile label="Transactions" value="2,418" delta="Q1 2026" />
          <KpiTile label="Uncategorised" value="37" delta="-12 since yesterday" deltaTone="success" />
          <KpiTile label="Unreconciled" value="19" delta="+3 this week" deltaTone="danger" />
        </div>
      </Section>

      {/* 07 Confidence */}
      <Section index={7} title="Confidence" note="4 px track. Tiers at 0.85 and 0.5, the thresholds the explanation panel already uses.">
        <div className="grid gap-5 md:grid-cols-2">
          {[
            { v: 0.96, l: "high · auto" },
            { v: 0.72, l: "medium · suggested" },
            { v: 0.31, l: "low · needs review" },
            { v: null, l: "no score" },
          ].map((m) => (
            <div key={m.l} className="rounded-lg border border-border bg-surface p-4">
              <Label>{m.l}</Label>
              <ConfidenceMeter value={m.v} />
            </div>
          ))}
        </div>
      </Section>

      {/* 08 Table */}
      <Section index={8} title="Table" note="44 px rows, mono header, amounts right-aligned in mono. The selected row carries a 2 px primary bar.">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-36">Confidence</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((r, i) => (
                <TableRow key={r.contact} data-state={i === 1 ? "selected" : undefined}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.date}</TableCell>
                  <TableCell className="text-foreground">{r.contact}</TableCell>
                  <TableCell className="text-muted-foreground">{r.category}</TableCell>
                  <TableCell>
                    <StatusChip status={r.status} />
                  </TableCell>
                  <TableCell>
                    <ConfidenceMeter value={r.conf} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    <span className={r.amount.startsWith("-") ? "text-foreground" : "text-success"}>{r.amount}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* 09 Tabs */}
      <Section index={9} title="Tabs" note="Underline for navigation, segmented for filters. The indicator slides; it does not fade.">
        <div className="grid gap-10 md:grid-cols-2">
          <Group label="line (default)">
            <Tabs defaultValue="categorise">
              <TabsList>
                <TabsTrigger value="categorise">Categorise</TabsTrigger>
                <TabsTrigger value="explain">Explain</TabsTrigger>
                <TabsTrigger value="reconcile">Reconcile</TabsTrigger>
                <TabsTrigger value="report">Report</TabsTrigger>
              </TabsList>
              <TabsContent value="categorise" className="text-muted-foreground">
                Rows receive confidence chips that count up in mono.
              </TabsContent>
              <TabsContent value="explain" className="text-muted-foreground">
                A reasoning drawer slides in from the right.
              </TabsContent>
              <TabsContent value="reconcile" className="text-muted-foreground">
                Candidates are scored on three axes and combined.
              </TabsContent>
              <TabsContent value="report" className="text-muted-foreground">
                A PDF with every decision and its evidence.
              </TabsContent>
            </Tabs>
          </Group>
          <Group label="segmented (filters)">
            <Tabs defaultValue="all">
              <TabsList variant="segmented">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="auto">Auto</TabsTrigger>
                <TabsTrigger value="suggested">Suggested</TabsTrigger>
                <TabsTrigger value="review">Review</TabsTrigger>
              </TabsList>
            </Tabs>
          </Group>
        </div>
      </Section>

      {/* 10 Overlays */}
      <Section index={10} title="Overlays" note="Dialog: fade and 3 percent scale, 200 ms. Drawer: 480 px from the right, 300 ms out-expo. Backdrop dims, never blurs.">
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>Correct category</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Correct category</DialogTitle>
                <DialogDescription>
                  Your choice is recorded against this transaction and becomes a precedent for similar ones.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Label>Category</Label>
                <Select defaultValue="utilities" items={CATEGORY_ITEMS}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utilities">Utilities</SelectItem>
                    <SelectItem value="software">Software subscriptions</SelectItem>
                    <SelectItem value="travel">Travel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
                <DialogClose render={<Button />}>Save correction</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger render={<Button variant="outline" />}>Open explanation drawer</SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Octopus Energy</SheetTitle>
                <SheetDescription>
                  <span className="font-mono tabular-nums">2026-04-02 · -184.20</span>
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-8 overflow-y-auto px-6 py-6">
                <div>
                  <Eyebrow>Decision</Eyebrow>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="text-base font-medium">Utilities</span>
                    <div className="flex items-center gap-2">
                      <StatusChip status="auto_categorised" />
                      <StatusChip tone="primary" dot={false}>
                        haiku-4-5
                      </StatusChip>
                    </div>
                  </div>
                  <ConfidenceMeter value={0.96} className="mt-4" />
                </div>
                <div>
                  <Eyebrow>Reasoning</Eyebrow>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    Payee is an energy supplier; the amount matches the monthly pattern on this account and the
                    previous three confirmed Utilities entries from the same payee.
                  </p>
                </div>
                <div>
                  <Eyebrow>Risk</Eyebrow>
                  <div className="mt-3 flex items-center gap-3">
                    <StatusChip status="low" />
                    <span className="font-mono text-small tabular-nums text-muted-foreground">0.12</span>
                  </div>
                </div>
              </div>
              <SheetFooter>
                <Button variant="destructive" size="sm">
                  Reject
                </Button>
                <Button size="sm">Confirm</Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <Button variant="ghost" onClick={() => toast.success("Category confirmed", { description: "Octopus Energy → Utilities" })}>
            Toast: success
          </Button>
          <Button variant="ghost" onClick={() => toast.error("Xero sync failed", { description: "Token expired. Reconnect to continue." })}>
            Toast: error
          </Button>
          <Button variant="ghost" onClick={() => toast("Saved")}>
            Toast: plain
          </Button>
        </div>
      </Section>

      {/* 11 Card */}
      <Section index={11} title="Card" note="Surface, hairline, 8 px. Footer gets a half-step darker band. No shadows, no hover scale.">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>Sync, categorise and reconcile the current period.</CardDescription>
              <CardAction>
                <Badge variant="secondary">Q1 2026</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {[
                ["Sync", "2,418 transactions", "auto_categorised"],
                ["Categorise", "37 remaining", "suggested"],
                ["Reconcile", "19 unmatched", "unmatched"],
              ].map(([step, meta, status]) => (
                <div key={step} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-foreground">{step}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">{meta}</span>
                  <StatusChip status={status}>{status === "auto_categorised" ? "Done" : status === "suggested" ? "Running" : "Queued"}</StatusChip>
                </div>
              ))}
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button variant="ghost" size="sm">
                View log
              </Button>
              <Button size="sm">Run pipeline</Button>
            </CardFooter>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Small card</CardTitle>
              <CardDescription>Tighter padding for side panels.</CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground">
              Use for forms beside a list, never for three-in-a-row feature cards.
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* 12 Motion */}
      <Section index={12} title="Motion" note="Two curves. Reveals: opacity and 12 px rise, 600 ms, 50 ms stagger, once at 20 percent in view.">
        <div className="grid gap-8 md:grid-cols-2">
          <Group label="easings">
            <div className="flex gap-6">
              {EASINGS.map((e) => (
                <div key={e.name} className="flex flex-col gap-2">
                  <svg viewBox="-8 -8 116 116" className="size-28 rounded-md border border-border bg-surface">
                    <path d="M0 100 L100 100 M0 100 L0 0" className="stroke-border" strokeWidth="1" fill="none" />
                    <path d="M0 100 L100 0" className="stroke-border" strokeWidth="1" strokeDasharray="3 3" fill="none" />
                    <path d={e.path} className="stroke-primary" strokeWidth="2" fill="none" strokeLinecap="round" />
                  </svg>
                  <div className="font-mono text-xs text-foreground">{e.name}</div>
                  <div className="font-mono text-[11px] text-subtle-foreground">{e.value}</div>
                  <div className="text-xs text-muted-foreground">{e.use}</div>
                </div>
              ))}
            </div>
          </Group>
          <Group label="reveal + stagger">
            <motion.div
              key={replayKey}
              variants={stagger()}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-3 gap-3"
            >
              {["Categorise", "Explain", "Reconcile"].map((s, i) => (
                <motion.div key={s} variants={reveal} className="rounded-lg border border-border bg-surface p-4">
                  <Eyebrow index={i + 1}>{s}</Eyebrow>
                  <div className="mt-3 font-mono text-kpi tabular-nums">{[96, 72, 41][i]}%</div>
                </motion.div>
              ))}
            </motion.div>
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => setReplayKey((k) => k + 1)}>
              <RefreshCw /> Replay
            </Button>
          </Group>
        </div>
      </Section>

      <footer className="border-t border-border pt-8 font-mono text-xs text-subtle-foreground">
        /kit · returns 404 in production · tokens in globals.css · mapping in tailwind.config.ts
      </footer>
    </main>
  );
}
