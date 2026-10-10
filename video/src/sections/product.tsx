import { useCurrentFrame } from "remotion";
import { CONSOLE, CONSOLE_H, CONSOLE_W, toMs } from "../layout";
import { ms } from "../timing";
import { seg, swapDip } from "../timeline";
import { colors, radius } from "../theme";
import { Camera, Cursor, type CameraKey, type CursorKey } from "../kit/camera";
import { Shell, type ShellPage } from "../kit/shell";
import { alpha } from "../kit/primitives";
import { DashboardScene } from "../scenes/dashboard";
import { CategoriseScene, ROW_STEP, type CategoriseEvents } from "../scenes/categorise";
import { ReconcileScene, type ReconcileEvents } from "../scenes/reconcile";
import { ReportScene, type ReportEvents } from "../scenes/report";
import { CATEGORISE_ROWS } from "../scenes/data";

/**
 * The product section: one console frame that never cuts. Pages swap behind a 120 ms opacity dip;
 * every state change is keyed to the start of the voice beat that describes it; a Screen-Studio
 * style camera zooms towards each click and an eased cursor makes the clicks.
 */

// Beat starts (absolute ms).
const P = ms("product");
const C1 = ms("categorise1");
const C2 = ms("categorise2");
const E1 = ms("explain1");
const E2 = ms("explain2");
const E3 = ms("explain3");
const D1 = ms("decide1");
const D2 = ms("decide2");
const R1 = ms("reconcile1");
const R2 = ms("reconcile2");
const RP = ms("report");
const B1 = ms("built1");

export const FRAME_IN = P - 500;
export const FRAME_OUT = B1 - 350;
const SWAP_CAT = C1 - 350;
const SWAP_REC = R1 - 350;
const SWAP_REP = RP - 350;

const CAT: CategoriseEvents = {
  enter: SWAP_CAT,
  press: C1 + 900,
  resolveFrom: C1 + 1300,
  select: C2 + 1500,
  drawer: E1 + 700,
  decisionAt: E1 + 1300,
  reasoningAt: E2 + 100,
  riskAt: E3 + 250,
  approvePress: D1 + 700,
  historyAt: D2 + 200,
};

const REC: ReconcileEvents = {
  enter: SWAP_REC,
  press: R1 + 800,
  resolveFrom: R1 + 1100,
  select: R2 + 300,
  candidatesFrom: R2 + 600,
  best: R2 + 1900,
  confirmPress: R2 + 3100,
};

const REP: ReportEvents = {
  enter: SWAP_REP,
  press: RP + 350,
  done: RP + 1500,
  rowAt: RP + 1650,
  previewAt: RP + 1850,
};

// Geometry in the console's 1200 x 675 design space. Content starts right of the 208 px sidebar,
// below the 32 px banner; the page header is 64 px; table header 36 px; rows 44 px.
const SIDEBAR = 208;
const BANNER = 32;
const CONTENT_X = SIDEBAR + 24;
const REVIEWED_INDEX = CATEGORISE_ROWS.findIndex((r) => r.id === "t4");
const rowCentreY = (i: number) => BANNER + 64 + 36 + i * 44 + 22;
const HEADER_Y = BANNER + 32;

const CAMERA: CameraKey[] = [
  { at: 0, scale: 1 },
  // Categorise: the right-hand columns while the confidence counts up.
  { at: CAT.press + 350, scale: 1.25, x: 900, y: rowCentreY(3) },
  // Explain: the drawer.
  { at: CAT.drawer, scale: 1.38, x: 1200 - 240, y: 280 },
  { at: CAT.riskAt - 100, scale: 1.38, x: 1200 - 240, y: 460 },
  // Decide: the footer actions, then history.
  { at: CAT.approvePress - 500, scale: 1.38, x: 1200 - 240, y: 560 },
  { at: SWAP_REC - 300, scale: 1 },
  // Reconcile: the candidates.
  { at: REC.select + 350, scale: 1.3, x: 880, y: BANNER + 64 + 170 },
  { at: SWAP_REP - 300, scale: 1 },
  // Report: the letter preview.
  { at: REP.previewAt + 200, scale: 1.25, x: 880, y: BANNER + 64 + 132 + 20 + 170 },
  { at: FRAME_OUT - 200, scale: 1, ms: 500 },
];

const CURSOR: CursorKey[] = [
  { at: CAT.press - 700, x: 1040, y: 420, ms: 1 },
  { at: CAT.press, x: 1200 - 24 - 46, y: HEADER_Y, click: true, ms: 650 },
  { at: E1 + 600, x: CONTENT_X + 200, y: rowCentreY(REVIEWED_INDEX), click: true, ms: 700 },
  { at: E1 + 1600, x: 700, y: 520, ms: 500 },
  { at: CAT.approvePress, x: 1200 - 480 + 24 + 36, y: 675 - 32, click: true, ms: 700 },
  { at: SWAP_REC - 100, x: 1000, y: 560, ms: 400 },
  { at: REC.press, x: 1200 - 24 - 42, y: HEADER_Y, click: true, ms: 650 },
  { at: REC.select, x: CONTENT_X + 150, y: BANNER + 64 + 28, click: true, ms: 700 },
  { at: REC.confirmPress, x: 1200 - 24 - 58, y: BANNER + 64 + 34, click: true, ms: 800 },
  { at: SWAP_REP - 100, x: 700, y: 560, ms: 400 },
  { at: REP.press, x: CONTENT_X + 160, y: BANNER + 64 + 20 + 16 + 16 + 56 + 16 + 56 + 16 + 4 + 18, click: true, ms: 700 },
  { at: REP.press + 700, x: CONTENT_X + 160, y: 600, ms: 500 },
];

function page(t: number): ShellPage {
  if (t < SWAP_CAT) return "dashboard";
  if (t < SWAP_REC) return "transactions";
  if (t < SWAP_REP) return "reconciliation";
  return "documents";
}

export function Product() {
  const frame = useCurrentFrame();
  const t = toMs(frame);
  if (t < FRAME_IN - 100 || t > FRAME_OUT + 700) return null;
  const pin = seg(t, FRAME_IN, 700);
  const pout = seg(t, FRAME_OUT, 500);
  const scale = 0.96 + 0.04 * pin - 0.02 * pout;
  const opacity = Math.min(pin, 1 - pout);
  const dip = Math.min(swapDip(t, SWAP_CAT), swapDip(t, SWAP_REC), swapDip(t, SWAP_REP));
  const current = page(t);
  return (
    <div
      style={{
        position: "absolute",
        left: CONSOLE.left,
        top: CONSOLE.top,
        width: CONSOLE_W,
        height: CONSOLE_H,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: "50% 60%",
        borderRadius: radius.frame,
        overflow: "hidden",
        boxShadow: `0 0 0 1px ${colors.border}, inset 0 1px 0 0 ${alpha("#ffffff", 0.05)}, 0 40px 120px -40px rgba(0,0,0,0.8)`,
        background: colors.background,
      }}
    >
      <div style={{ width: CONSOLE.designW, height: CONSOLE.designH, transform: `scale(${CONSOLE.scale})`, transformOrigin: "0 0" }}>
        <Camera keys={CAMERA} t={t} width={CONSOLE.designW} height={CONSOLE.designH}>
          <div style={{ opacity: dip }}>
            <Shell active={current}>
              {current === "dashboard" && <DashboardScene t={t} enter={P - 250} />}
              {current === "transactions" && <CategoriseScene t={t} ev={CAT} />}
              {current === "reconciliation" && <ReconcileScene t={t} ev={REC} />}
              {current === "documents" && <ReportScene t={t} ev={REP} />}
            </Shell>
          </div>
          <Cursor keys={CURSOR} t={t} hideAt={FRAME_OUT} />
        </Camera>
      </div>
    </div>
  );
}

/** Exported for the studio overlay / debugging: when each row resolves. */
export const CATEGORISE_ROW_RESOLVE = (i: number) => CAT.resolveFrom + i * ROW_STEP;
