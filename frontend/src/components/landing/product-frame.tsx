"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ScaledFrame } from "./scaled-frame";
import { CATEGORISE_DURATION, CategoriseScene } from "./scenes/categorise";
import { EXPLAIN_DURATION, ExplainScene } from "./scenes/explain";
import { RECONCILE_DURATION, ReconcileScene } from "./scenes/reconcile";
import { REPORT_DURATION, ReportScene } from "./scenes/report";
import { Shell, type ShellPage } from "./scenes/shell";
import { finalT } from "./scenes/timeline";
import { useSceneClock } from "./scenes/use-scene-clock";
import { Container, Reveal } from "./section";

export const FRAME_WIDTH = 1200;
export const FRAME_HEIGHT = 660;

type SceneId = "categorise" | "explain" | "reconcile" | "report";

const SCENES: {
  id: SceneId;
  label: string;
  page: ShellPage;
  duration: number;
  Scene: (props: { t: number }) => JSX.Element;
  description: string;
}[] = [
  {
    id: "categorise",
    label: "Categorise",
    page: "transactions",
    duration: CATEGORISE_DURATION,
    Scene: CategoriseScene,
    description:
      "Seven bank transactions are categorised: each receives an account code, a confidence percentage and a status chip. One, a scaffold hire invoice, needs review; its reasoning drawer opens with two sentences of reasoning and three fired risk rules.",
  },
  {
    id: "explain",
    label: "Explain",
    page: "transactions",
    duration: EXPLAIN_DURATION,
    Scene: ExplainScene,
    description:
      "A suggested transaction opened in full: the decision, the model that made it, the reasoning, the risk rules, and a history. The reviewer approves it and the audit row appears.",
  },
  {
    id: "reconcile",
    label: "Reconcile",
    page: "reconciliation",
    duration: RECONCILE_DURATION,
    Scene: ReconcileScene,
    description:
      "Six statement lines receive match statuses. The suggested line shows three scored candidates (amount, date, description); the best is confirmed.",
  },
  {
    id: "report",
    label: "Report",
    page: "documents",
    duration: REPORT_DURATION,
    Scene: ReportScene,
    description:
      "A management letter is generated for the quarter: the job runs, the document joins the list, and its first page previews with indicative figures.",
  },
];

/** Runs the clock for one scene; unmounts (and resets) when the tab changes. */
function ScenePlayer({
  scene,
  running,
  pinFinal,
}: {
  scene: (typeof SCENES)[number];
  running: boolean;
  pinFinal: boolean;
}) {
  const clock = useSceneClock(scene.duration, running && !pinFinal);
  const t = pinFinal ? finalT(scene.duration) : clock;
  return (
    <div className="h-full w-full" data-scene={scene.id} data-t={Math.round(t)}>
      <Shell active={scene.page}>
        <scene.Scene t={t} />
      </Shell>
    </div>
  );
}

/**
 * The hero product frame (DESIGN.md section 10.3): four scripted scenes built from the app's
 * own components and tokens. Loops; pauses on hover and off screen; final state under reduced
 * motion. The frame is decorative, so it is aria-hidden and each scene has a text description.
 */
export function ProductFrame() {
  const [tab, setTab] = useState<SceneId>("categorise");
  const [hovered, setHovered] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const inView = useInView(frameRef, { amount: 0.2 });
  const active = SCENES.find((s) => s.id === tab)!;
  // `?frame=final` pins every scene at its final state (screenshots, filming).
  const [pinFinal, setPinFinal] = useState(false);
  useEffect(() => {
    setPinFinal(new URLSearchParams(window.location.search).get("frame") === "final");
  }, []);

  return (
    <section id="product" className="relative z-10 scroll-mt-6">
      <Container>
        <Reveal>
          <Tabs value={tab} onValueChange={(v) => setTab(v as SceneId)}>
            <TabsList aria-label="Product scenes">
              {SCENES.map((s) => (
                <TabsTrigger key={s.id} value={s.id}>
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value={tab} className="mt-2">
              <p className="sr-only">{active.description}</p>
              <div
                ref={frameRef}
                aria-hidden
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{ transform: "perspective(2400px) rotateX(1deg)", transformOrigin: "50% 0" }}
              >
                <ScaledFrame
                  designWidth={FRAME_WIDTH}
                  designHeight={FRAME_HEIGHT}
                  className="rounded-xl border border-border bg-surface shadow-highlight"
                >
                  <ScenePlayer key={tab} scene={active} running={inView && !hovered} pinFinal={pinFinal} />
                </ScaledFrame>
              </div>
            </TabsContent>
          </Tabs>
        </Reveal>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          Scripted scenes built from the app’s components and synthetic data. Hover to pause; arrow keys switch tabs.
        </p>
      </Container>
    </section>
  );
}
