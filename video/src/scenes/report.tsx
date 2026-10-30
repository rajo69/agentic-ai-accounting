import { colors, fonts } from "../theme";
import { enterStyle, gbp, pressStyle, seg } from "../timeline";
import { Btn, Card, Chip, Eyebrow, JobChip, type JobState } from "../kit/primitives";
import { SceneHeader } from "../kit/shell";
import { EXISTING_DOCUMENTS, LETTER, NEW_DOCUMENT, ORG, type GeneratedDocument } from "./data";

/**
 * Documents: the generate form runs a job (queued, running, completed), the new letter joins the list,
 * and its first page previews with its figures counting up.
 */
export interface ReportEvents {
  enter: number;
  press: number;
  done: number;
  rowAt: number;
  previewAt: number;
}

export const REPORT_LAYOUT = {
  generateButton: { x: 24 + 160, y: 64 + 20 + 16 + 2 * 62 + 18 + 18 },
  previewCentre: { x: 24 + 320 + 24 + (1200 - 24 - 320 - 24 - 24) / 2, y: 64 + 3 * 44 + 20 + 160 },
};

function FauxSelect({ label, value }: { label: string; value: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, color: colors.mutedForeground }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 36, padding: "0 12px", borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.surface2, fontSize: 14, color: colors.foreground }}>
        {value}
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </label>
  );
}

function DocumentRow({ doc, p, last }: { doc: GeneratedDocument; p: number; last: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 44, padding: "0 16px", borderBottom: last ? undefined : `1px solid ${colors.border}`, ...enterStyle(p) }}>
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2h8l5 5v15H6zM14 2v5h5M9 13h6M9 17h6" />
      </svg>
      <Chip tone="muted" dot={false}>
        {doc.template}
      </Chip>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: colors.foreground, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.period}</span>
      <span style={{ flexShrink: 0, fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>{doc.generatedAt}</span>
    </div>
  );
}

function LetterPreview({ t, start }: { t: number; start: number }) {
  const pin = seg(t, start, 500);
  const pfig = seg(t, start + 200, 800);
  return (
    <Card style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, ...enterStyle(pin, 12) }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em", color: colors.foreground }}>{LETTER.title}</div>
          <div style={{ marginTop: 4, fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>{LETTER.subtitle}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {LETTER.figures.map((f) => (
          <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.background }}>
            <Eyebrow color={colors.mutedForeground}>{f.label}</Eyebrow>
            <span style={{ fontFamily: fonts.mono, fontSize: 28, lineHeight: "32px", color: colors.foreground, fontVariantNumeric: "tabular-nums" }}>{gbp(f.value * pfig)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {LETTER.paragraphs.map((p, i) => (
          <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: "20px", color: colors.foreground, opacity: 0.9, ...enterStyle(seg(t, start + 1100 + i * 350, 500)) }}>
            {p}
          </p>
        ))}
      </div>
    </Card>
  );
}

export function ReportScene({ t, ev }: { t: number; ev: ReportEvents }) {
  const queuedAt = ev.press + 150;
  const runningAt = ev.press + 650;
  const job: JobState = t < queuedAt ? "idle" : t < runningAt ? "queued" : t < ev.done ? "running" : "completed";
  const progress = seg(t, runningAt, ev.done - runningAt, (p) => p);
  const docs = t >= ev.rowAt ? [NEW_DOCUMENT, ...EXISTING_DOCUMENTS] : EXISTING_DOCUMENTS;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <SceneHeader title="Documents" meta={`${ORG.name} · ${ORG.period}`}>
        <span style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>{docs.length} generated</span>
      </SceneHeader>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, padding: "0 24px 24px", minHeight: 0, flex: 1 }}>
        <Card style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, alignSelf: "start", ...enterStyle(seg(t, ev.enter + 100, 500), 8) }}>
          <Eyebrow color={colors.mutedForeground}>Generate</Eyebrow>
          <FauxSelect label="Template" value="Management letter" />
          <FauxSelect label="Period" value={ORG.period} />
          <Btn size="default" style={{ marginTop: 4, width: "100%", ...pressStyle(t, ev.press) }}>
            Generate PDF
          </Btn>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${colors.border}`, paddingTop: 16, minHeight: 36 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.mutedForeground }}>Job</span>
              <JobChip t={t} state={job} label={job === "idle" ? "Not started" : job === "queued" ? "Queued" : job === "running" ? "Running" : "Completed"} />
            </div>
            {job !== "idle" && (
              <span style={{ height: 4, borderRadius: 2, background: colors.surface2, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", borderRadius: 2, background: colors.primary, width: `${(job === "completed" ? 1 : progress) * 100}%` }} />
              </span>
            )}
          </div>
        </Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <Card style={{ overflow: "hidden", ...enterStyle(seg(t, ev.enter + 200, 500), 8) }}>
            {docs.map((doc, i) => (
              <DocumentRow key={doc.id} doc={doc} p={doc.id === NEW_DOCUMENT.id ? seg(t, ev.rowAt, 500) : 1} last={i === docs.length - 1} />
            ))}
          </Card>
          {t >= ev.previewAt && <LetterPreview t={t} start={ev.previewAt} />}
        </div>
      </div>
    </div>
  );
}
