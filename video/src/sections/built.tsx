import { useCurrentFrame } from "remotion";
import { toMs, MARGIN_X } from "../layout";
import { BEATS, ms } from "../timing";
import { enterStyle, seg } from "../timeline";
import { colors, fonts } from "../theme";
import { alpha } from "../kit/primitives";
import { Headline, sectionOpacity } from "./text";

/**
 * "How it is built." The landing's architecture diagram (same nodes and edges) drawn edge by edge
 * as the voice names the parts, then the six verifiable facts.
 */
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
  "34 FastAPI endpoints behind one OpenAPI contract",
  "93 pytest tests run on every push",
  "A fast model first, a stronger one when it is unsure",
  "Instructor outputs validated by Pydantic before they are stored",
  "pgvector precedents, scoped to the organisation",
  "Eight fuzzy risk rules and an audit row for every decision",
];

export function Built() {
  const frame = useCurrentFrame();
  const t = toMs(frame);
  const b1 = ms("built1");
  const b2 = ms("built2");
  const d2 = BEATS.built2.durationMs;
  const out = ms("judgement1") - 350;
  const opacity = sectionOpacity(t, b1 - 300, out);
  const drawFrom = b1 + 1100;
  const factStep = (d2 - 600) / FACTS.length;
  const diagramScale = 1.3;
  return (
    <div style={{ position: "absolute", inset: 0, opacity }}>
      <div style={{ position: "absolute", left: MARGIN_X, top: 120 }}>
        <Headline size={68} p={seg(t, b1 - 200, 700)}>
          How it is built.
        </Headline>
      </div>
      <svg
        viewBox="0 0 880 320"
        width={880 * diagramScale}
        height={320 * diagramScale}
        style={{ position: "absolute", left: MARGIN_X - 26, top: 250 }}
      >
        {EDGES.map((e, i) => (
          <path
            key={e.id}
            d={e.d}
            fill="none"
            stroke={colors.borderStrong}
            strokeWidth={1.5}
            strokeDasharray={e.dashed ? "4 4" : undefined}
            pathLength={1}
            style={{
              strokeDasharray: e.dashed ? undefined : 1,
              strokeDashoffset: e.dashed ? undefined : 1 - seg(t, drawFrom + 250 + i * 160, 900),
              opacity: seg(t, drawFrom + 250 + i * 160, 300),
            }}
          />
        ))}
        {NODES.map((n, i) => {
          const p = seg(t, drawFrom + i * 110, 600);
          return (
            <g key={n.id} style={{ opacity: p, transform: `translateY(${(1 - p) * 8}px)` }}>
              <rect x={n.x} y={n.y} width={W} height={H} rx={8} fill={colors.surface} stroke={colors.border} strokeWidth={1} />
              <rect x={n.x + 1} y={n.y + 1} width={W - 2} height={1} fill={alpha("#ffffff", 0.05)} />
              <text x={n.x + 16} y={n.y + 24} fill={colors.foreground} fontFamily={fonts.sans} fontSize={14} fontWeight={500}>
                {n.label}
              </text>
              <text x={n.x + 16} y={n.y + 42} fill={colors.mutedForeground} fontFamily={fonts.mono} fontSize={10}>
                {n.sub}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", left: 1380, top: 270, width: 360, display: "flex", flexDirection: "column", gap: 22 }}>
        {FACTS.map((f, i) => (
          <div
            key={f}
            style={{
              display: "flex",
              gap: 16,
              alignItems: "baseline",
              fontFamily: fonts.mono,
              fontSize: 18,
              lineHeight: 1.45,
              color: colors.mutedForeground,
              borderTop: `1px solid ${colors.border}`,
              paddingTop: 14,
              ...enterStyle(seg(t, b2 + 100 + i * factStep, 500), 8),
            }}
          >
            <span style={{ color: colors.subtleForeground, fontSize: 13, flexShrink: 0 }}>{String(i + 1).padStart(2, "0")}</span>
            <span style={{ color: colors.foreground }}>{f}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
