"use client";

import { CapabilityRow } from "./capability-row";
import { ScaledFrame } from "./scaled-frame";
import { CATEGORISE_DURATION, CategoriseTable } from "./scenes/categorise";
import { SCAFFOLD_EXPLANATION } from "./scenes/data";
import { MobileCandidateCard, MobileCategoriseList } from "./scenes/mobile";
import { ExplanationSections } from "./scenes/parts";
import { CandidatesTable, RECONCILE_DURATION } from "./scenes/reconcile";
import { finalT } from "./scenes/timeline";
import { Container } from "./section";

const panel = "rounded-lg border border-border bg-surface shadow-highlight";

/**
 * Three capability rows (DESIGN.md section 10.5). Each visual is a scene block at its final
 * state: a scaled desktop crop above `sm`, the phone composition at natural size below it.
 */
export function Capabilities() {
  return (
    <section id="capabilities" className="relative z-10 scroll-mt-6">
      <Container className="flex flex-col gap-24 py-24 md:gap-32 md:py-32">
        <CapabilityRow
          title="Categorise with evidence."
          body="Every uncategorised transaction gets a proposed account code, a confidence score and written reasoning. The firm’s own categorised transactions are retrieved as precedents, so proposals follow how this practice codes, not a generic chart."
          fact="Precedents come from pgvector, scoped to the organisation"
          mobile={
            <div className={`${panel} overflow-hidden`}>
              <MobileCategoriseList />
            </div>
          }
        >
          <ScaledFrame designWidth={680} designHeight={372} className={`${panel} max-w-[680px]`}>
            <div className="px-3 pt-1">
              <CategoriseTable t={finalT(CATEGORISE_DURATION)} compact />
            </div>
          </ScaledFrame>
        </CapabilityRow>

        <CapabilityRow
          title="Every decision, explained."
          body="The reasoning, which model made the call (Haiku 4.5, escalated to Sonnet 4.6 when uncertain) and a risk flag from eight plain-language rules: unusual amount, unseen vendor, odd timing. Approve, correct or reject; corrections become future precedents."
          fact="Eight risk rules and one audit row for every decision"
          flip
          mobile={
            <div className={`${panel} p-4`}>
              <ExplanationSections t={finalT(CATEGORISE_DURATION)} start={0} data={SCAFFOLD_EXPLANATION} />
            </div>
          }
        >
          <ScaledFrame designWidth={480} designHeight={500} className={`${panel} max-w-[480px] md:ml-auto`}>
            <div className="p-6">
              <ExplanationSections t={finalT(CATEGORISE_DURATION)} start={0} data={SCAFFOLD_EXPLANATION} />
            </div>
          </ScaledFrame>
        </CapabilityRow>

        <CapabilityRow
          title="Reconcile, then draft the letter."
          body="Unreconciled bank transactions are matched to invoice and payment records on amount, date and description, with scored candidates; ambiguous matches go to review. A management letter is drafted from the actual figures, with period summaries labelled indicative."
          fact="Three scores per candidate, letter figures taken from the ledger"
          mobile={<MobileCandidateCard />}
        >
          <ScaledFrame designWidth={640} designHeight={196} className={`${panel} max-w-[640px]`}>
            <div className="px-2 pt-1">
              <CandidatesTable t={finalT(RECONCILE_DURATION)} />
            </div>
          </ScaledFrame>
        </CapabilityRow>
      </Container>
    </section>
  );
}
