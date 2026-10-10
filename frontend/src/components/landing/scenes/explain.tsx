"use client";

import { Bot, UserCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusChip } from "@/components/ui/status-chip";

import { ACME_EXPLANATION, ACME_HISTORY, ACME_TRANSACTION, type HistoryItem } from "./data";
import { ExplanationSections, FauxButton, SceneHeader } from "./parts";
import { enterStyle, gbp, outroOpacity, pressStyle, seg } from "./timeline";

/**
 * One transaction opened in full: DECISION, REASONING and RISK on the left, HISTORY on the
 * right. The reviewer approves at 5 s: the chip flips to confirmed and the audit row appears.
 */
export const EXPLAIN_DURATION = 8000;

const HISTORY_AT = [3400, 5400];
const ACTIONS_AT = 3700;
const APPROVE_AT = 5000;
const CONFIRMED_AT = 5300;

function HistoryRow({ item, p, last }: { item: HistoryItem; p: number; last: boolean }) {
  const Icon = item.action === "human_approve" ? UserCheck : Bot;
  return (
    <li className="relative flex gap-3 pb-5" style={enterStyle(p)}>
      {!last && <span aria-hidden className="absolute left-[11px] top-7 h-[calc(100%-20px)] w-px bg-border" />}
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
          item.action === "human_approve" ? "bg-success/10 text-success ring-success/20" : "bg-primary/10 text-primary ring-primary/20"
        )}
      >
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-small text-foreground">{item.title}</div>
        <div className="text-small text-muted-foreground">{item.detail}</div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{item.at}</div>
      </div>
    </li>
  );
}

export function ExplainScene({ t }: { t: number }) {
  const confirmed = t >= CONFIRMED_AT;
  const status = confirmed ? "confirmed" : ACME_EXPLANATION.status;
  const historyCount = confirmed ? 2 : 1;
  return (
    <div className="flex h-full flex-col" style={{ opacity: outroOpacity(t, EXPLAIN_DURATION) }}>
      <SceneHeader
        title={ACME_TRANSACTION.description}
        meta={`${ACME_TRANSACTION.date} · ${gbp(ACME_TRANSACTION.amount)} · ${ACME_TRANSACTION.reference}`}
        chip={<StatusChip status={status} />}
      >
        <span className="font-mono text-xs text-muted-foreground">Transactions / {ACME_TRANSACTION.reference}</span>
      </SceneHeader>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_340px] gap-6 px-6 pb-6">
        <div className="min-w-0 self-start rounded-lg border border-border bg-surface p-6">
          <ExplanationSections t={t} start={0} data={ACME_EXPLANATION} status={status} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
            <Eyebrow className="text-muted-foreground">History</Eyebrow>
            <ol className="flex flex-col">
              {ACME_HISTORY.slice(0, historyCount).map((item, i) => (
                <HistoryRow key={item.action} item={item} p={seg(t, HISTORY_AT[i], 500)} last={i === historyCount - 1} />
              ))}
            </ol>
          </div>
          <div className="flex gap-2" style={enterStyle(seg(t, ACTIONS_AT, 400))}>
            <FauxButton style={pressStyle(t, APPROVE_AT)} className={cn(confirmed && "opacity-50")}>
              Approve
            </FauxButton>
            <FauxButton variant="outline" className={cn(confirmed && "opacity-50")}>
              Correct
            </FauxButton>
            <FauxButton variant="destructive" className={cn(confirmed && "opacity-50")}>
              Reject
            </FauxButton>
          </div>
        </div>
      </div>
    </div>
  );
}
