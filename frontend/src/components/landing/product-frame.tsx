"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CATEGORISE_DURATION, CATEGORISE_START, CategoriseScene } from "./scenes/categorise";
import { EXPLAIN_DURATION, ExplainScene } from "./scenes/explain";
import {
  CATEGORISE_MOBILE_START,
  CategoriseMobile,
  ExplainMobile,
  MOBILE_HEIGHT,
  MOBILE_WIDTH,
  ReconcileMobile,
  ReportMobile,
} from "./scenes/mobile";
import { RECONCILE_DURATION, ReconcileScene } from "./scenes/reconcile";
import { REPORT_DURATION, ReportScene } from "./scenes/report";
import { Shell, type ShellPage } from "./scenes/shell";
import { finalT } from "./scenes/timeline";
import { useSceneClock } from "./scenes/use-scene-clock";
import { Container, Reveal } from "./section";

export const FRAME_WIDTH = 1200;
export const FRAME_HEIGHT = 660;

/** Below this container width the phone composition is used (Tailwind `sm`). */
const NARROW_BELOW = 640;

type SceneId = "categorise" | "explain" | "reconcile" | "report";
type SceneComponent = (props: { t: number }) => JSX.Element;

const SCENES: {
  id: SceneId;
  label: string;
  page: ShellPage;
  duration: number;
  Scene: SceneComponent;
  Mobile: SceneComponent;
  /** Where the first loop starts (desktop, phone); later loops run from 0. */
  start: [number, number];
  description: string;
}[] = [
  {
    id: "categorise",
    label: "Categorise",
    page: "transactions",
    duration: CATEGORISE_DURATION,
    Scene: CategoriseScene,
    Mobile: CategoriseMobile,
    start: [CATEGORISE_START, CATEGORISE_MOBILE_START],
    description:
      "Bank transactions are categorised: each receives an account code, a confidence percentage and a status chip. One, a scaffold hire invoice, needs review; its reasoning drawer opens with two sentences of reasoning and three fired risk rules.",
  },
  {
    id: "explain",
    label: "Explain",
    page: "transactions",
    duration: EXPLAIN_DURATION,
    Scene: ExplainScene,
    Mobile: ExplainMobile,
    start: [0, 0],
    description:
      "A suggested transaction opened in full: the decision, the model that made it, the reasoning, the risk rules, and a history. The reviewer approves it and the audit row appears.",
  },
  {
    id: "reconcile",
    label: "Reconcile",
    page: "reconciliation",
    duration: RECONCILE_DURATION,
    Scene: ReconcileScene,
    Mobile: ReconcileMobile,
    start: [0, 0],
    description:
      "Statement lines receive match statuses. The suggested line shows scored candidates (amount, date, description); the best is confirmed.",
  },
  {
    id: "report",
    label: "Report",
    page: "documents",
    duration: REPORT_DURATION,
    Scene: ReportScene,
    Mobile: ReportMobile,
    start: [0, 0],
    description:
      "A management letter is generated for the quarter: the job runs, the document joins the list, and its first page previews with the quarter's figures.",
  },
];

/** Runs the clock for one scene; unmounts (and resets) when the tab or the composition changes. */
function ScenePlayer({
  scene,
  narrow,
  running,
  pinFinal,
}: {
  scene: (typeof SCENES)[number];
  narrow: boolean;
  running: boolean;
  pinFinal: boolean;
}) {
  const clock = useSceneClock(scene.duration, running && !pinFinal, scene.start[narrow ? 1 : 0]);
  const t = pinFinal ? finalT(scene.duration) : clock;
  return (
    <div className="h-full w-full" data-scene={scene.id} data-t={Math.round(t)}>
      {narrow ? (
        <scene.Mobile t={t} />
      ) : (
        <Shell active={scene.page}>
          <scene.Scene t={t} />
        </Shell>
      )}
    </div>
  );
}

/**
 * The hero product frame (DESIGN.md section 10.3): four scripted scenes built from the app's
 * own components and tokens. Desktop renders the 1200 px console scaled to the container;
 * below 640 px the phone composition (360 x 760) renders instead, so text stays legible.
 * Loops; pauses on hover and off screen; final state under reduced motion. The frame is
 * decorative, so it is aria-hidden and each scene has a text description.
 */
export function ProductFrame() {
  const [tab, setTab] = useState<SceneId>("categorise");
  const [hovered, setHovered] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const inView = useInView(frameRef, { amount: 0.2 });
  const active = SCENES.find((s) => s.id === tab)!;

  // Composition and scale follow the measured container width. Until measured, the desktop
  // composition renders at scale 1 (exact at the 1200 px container) and is hidden on phones.
  const [measured, setMeasured] = useState<{ narrow: boolean; scale: number } | null>(null);
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const narrow = w < NARROW_BELOW;
      setMeasured({ narrow, scale: Math.min(1, w / (narrow ? MOBILE_WIDTH : FRAME_WIDTH)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = measured?.narrow ?? false;
  const scale = measured?.scale ?? 1;
  const designWidth = narrow ? MOBILE_WIDTH : FRAME_WIDTH;
  const designHeight = narrow ? MOBILE_HEIGHT : FRAME_HEIGHT;

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
                aria-hidden
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                className="mx-auto max-w-[400px] sm:max-w-none sm:origin-top sm:[transform:perspective(2400px)_rotateX(1deg)]"
              >
                <div
                  ref={frameRef}
                  className={cn(
                    "relative w-full overflow-hidden rounded-xl border border-border bg-surface shadow-highlight",
                    "aspect-[360/760] sm:aspect-[1200/660]",
                    measured ? "visible" : "invisible sm:visible"
                  )}
                >
                  <div
                    className="absolute left-0 top-0 origin-top-left"
                    style={{ width: designWidth, height: designHeight, transform: `scale(${scale})` }}
                  >
                    <ScenePlayer key={`${tab}-${narrow}`} scene={active} narrow={narrow} running={inView && !hovered} pinFinal={pinFinal} />
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Reveal>
        <p className="mt-4 font-mono text-xs text-muted-foreground">
          A scripted replay of the real components.<span className="hidden sm:inline"> Hover to pause. Arrow keys switch scenes.</span>
        </p>
      </Container>
    </section>
  );
}
