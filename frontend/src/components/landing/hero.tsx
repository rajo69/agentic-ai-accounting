"use client";

import GradientText from "@/components/gradient-text";

import { ButtonLink } from "./button-link";
import { AURORA_STOPS, DEMO_PATH } from "./links";
import { Container } from "./section";

/** CSS keyframe stagger (50 ms steps), so the headline paints before hydration. */
const rise = (i: number) => ({ animationDelay: `${i * 50}ms` });

/**
 * Left-aligned hero (DESIGN.md section 10). Four elements: headline, lead, the two CTAs, one
 * line of fact about the demo. The headline is Instrument Serif, the brand's own serif, with
 * "evidence" in italic and the aurora's colours (owner decisions 2026-10-10).
 */
export function Hero({ connectHref, videoUrl }: { connectHref: string; videoUrl?: string }) {
  return (
    <section className="relative z-10">
      <Container className="pb-12 pt-14 md:pb-16 md:pt-20">
        <div className="max-w-[980px]">
          <h1 className="animate-rise font-serif text-display-serif text-foreground" style={rise(0)}>
            Every AI<span className="-mx-[0.07em]">-</span>coded transaction,
            <br className="hidden sm:block" /> reviewed with{" "}
            <GradientText colors={AURORA_STOPS} animationSpeed={14} className="italic">
              evidence
            </GradientText>
            .
          </h1>

          <p className="animate-rise mt-6 max-w-[560px] text-lead text-muted-foreground" style={rise(1)}>
            Xero’s AI codes the books. The errors are still yours to find. Every transaction arrives with written
            reasoning, a confidence tier and a risk flag. You decide.
          </p>

          <div className="animate-rise mt-8 flex flex-wrap items-center gap-3" style={rise(2)}>
            <ButtonLink href={DEMO_PATH} size="lg">
              Launch demo <span aria-hidden>↗</span>
            </ButtonLink>
            <ButtonLink href={connectHref} variant="outline" size="lg">
              Connect Xero
            </ButtonLink>
          </div>

          <p className="animate-rise mt-5 font-mono text-xs text-muted-foreground" style={rise(3)}>
            The demo is a synthetic company. No account needed.
            {videoUrl && (
              <>
                {" "}
                <a
                  href={videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground"
                >
                  Watch the 2-minute demo
                </a>
              </>
            )}
          </p>
        </div>
      </Container>
    </section>
  );
}
