"use client";

import { Eyebrow } from "@/components/ui/eyebrow";
import { AnimatedMark, Lockup, Logo, Wordmark } from "@/components/brand/logo";

function Tile({ bg, children, label }: { bg: string; children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`flex size-16 items-center justify-center rounded-lg ${bg}`}>{children}</div>
      <span className="font-mono text-[10px] text-subtle-foreground">{label}</span>
    </div>
  );
}

/** Rough browser-tab simulation: tile favicon next to a title, light and dark chrome. */
function TabSim({ light }: { light: boolean }) {
  return (
    <div
      className={`flex h-9 w-56 items-center gap-2 rounded-t-md px-3 ${light ? "bg-[#f1f3f4] text-[#202124]" : "bg-[#202124] text-[#e8eaed]"}`}
    >
      <span className="flex size-4 items-center justify-center rounded-[3px] bg-[#09090c]">
        <Logo size={12} className="text-[#ebebf0]" />
      </span>
      <span className="truncate text-[12px]">AI Accountant</span>
    </div>
  );
}

export function BrandSection() {
  return (
    <section className="border-t border-border py-12 md:py-16">
      <div className="grid gap-8 md:grid-cols-12">
        <div className="md:col-span-3">
          <Eyebrow index={0}>Brand</Eyebrow>
          <p className="mt-3 max-w-[26ch] text-small text-muted-foreground">
            A disc split by a check-shaped gap: the stamp, seen up close. One colour, 24 unit grid, thicker gap at
            20 px and below. Hover any animated mark to replay.
          </p>
          <p className="mt-3 max-w-[26ch] text-small text-muted-foreground">
            Wordmark: &ldquo;AI&rdquo; in Instrument Serif italic, &ldquo;Accountant&rdquo; in Geist.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-10 md:col-span-9">
          <div className="rounded-lg border border-border bg-surface p-6">
            <div className="mb-4 font-mono text-eyebrow uppercase text-subtle-foreground">
              animated · beat 1 the stamp lands · beat 2 the tick cuts through
            </div>
            <div className="flex flex-wrap items-end gap-10">
              <AnimatedMark size={96} className="text-foreground" />
              <AnimatedMark size={64} className="text-foreground" />
              <AnimatedMark size={32} className="text-foreground" />
              <div className="flex size-16 items-center justify-center rounded-lg bg-primary">
                <AnimatedMark size={36} className="text-white" />
              </div>
              <div className="ml-auto">
                <div className="mb-2 font-mono text-[10px] uppercase text-subtle-foreground">loop (video)</div>
                <AnimatedMark size={48} mode="loop" every={2500} className="text-foreground" />
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 font-mono text-eyebrow uppercase text-subtle-foreground">static · sizes</div>
            <div className="flex flex-wrap items-end gap-6">
              {[16, 20, 24, 32, 48, 64].map((s) => (
                <div key={s} className="flex flex-col items-center gap-2">
                  <Logo size={s} className="text-foreground" />
                  <span className="font-mono text-[10px] text-subtle-foreground">{s}</span>
                </div>
              ))}
              <div className="ml-auto flex gap-4">
                <Tile bg="bg-primary" label="primary tile">
                  <Logo size={32} className="text-white" />
                </Tile>
                <Tile bg="bg-foreground" label="inverse">
                  <Logo size={32} className="text-background" />
                </Tile>
                <Tile bg="bg-surface-2 border border-border" label="muted">
                  <Logo size={32} className="text-muted-foreground" />
                </Tile>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 font-mono text-eyebrow uppercase text-subtle-foreground">lockups</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex h-16 items-center justify-between rounded-lg border border-border bg-background px-5">
                <Lockup animated />
                <span className="font-mono text-[10px] uppercase text-subtle-foreground">landing nav · animated</span>
              </div>
              <div className="flex h-16 items-center justify-between rounded-lg border border-border bg-surface px-5">
                <Lockup />
                <span className="font-mono text-[10px] uppercase text-subtle-foreground">sidebar · static</span>
              </div>
              <div className="flex h-16 items-center justify-between rounded-lg border border-border bg-surface px-5">
                <Lockup className="text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase text-subtle-foreground">muted (footer)</span>
              </div>
              <div className="flex h-16 items-center justify-between rounded-lg border border-border bg-surface px-5">
                <Wordmark className="text-[22px]" />
                <span className="font-mono text-[10px] uppercase text-subtle-foreground">wordmark only · 22</span>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 font-mono text-eyebrow uppercase text-subtle-foreground">favicon · app/icon.svg</div>
            <div className="flex flex-wrap gap-3">
              <TabSim light />
              <TabSim light={false} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
