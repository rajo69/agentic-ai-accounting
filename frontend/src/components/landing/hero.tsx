"use client";

import GradientText from "@/components/gradient-text";
import { Eyebrow } from "@/components/ui/eyebrow";

import { ButtonLink } from "./button-link";
import { AURORA_STOPS, DEMO_PATH } from "./links";
import { Container } from "./section";

/** CSS keyframe stagger (50 ms steps), so the headline paints before hydration. */
const rise = (i: number) => ({ animationDelay: `${i * 50}ms` });

/**
 * Left-aligned hero (DESIGN.md section 10). The headline's one accent word borrows the aurora's
 * colours; everything else is type on the canvas.
 */
export function Hero({ connectHref, videoUrl }: { connectHref: string; videoUrl?: string }) {
  return (
    <section className="relative z-10">
      <Container className="pb-14 pt-16 md:pb-20 md:pt-24">
        <div className="max-w-[980px]">
          <div className="animate-rise" style={rise(0)}>
            <Eyebrow className="text-muted-foreground">Review layer for Xero · built with Claude</Eyebrow>
          </div>

          <h1 className="animate-rise mt-6 max-w-[980px] text-display text-foreground" style={rise(1)}>
            Every AI-coded transaction,
            <br className="hidden sm:block" /> reviewed with{" "}
            <GradientText colors={AURORA_STOPS} animationSpeed={14}>
              evidence
            </GradientText>
            .
          </h1>

          <p className="animate-rise mt-6 max-w-[600px] text-lead text-muted-foreground" style={rise(2)}>
            Xero’s AI codes the books. The errors it leaves are still the accountant’s to find. Every transaction
            gets a proposed category with written reasoning, a confidence tier and a risk flag. You decide, and every
            decision is recorded.
          </p>

          <div className="animate-rise mt-8 flex flex-wrap items-center gap-3" style={rise(3)}>
            <ButtonLink href={connectHref} variant="outline" size="lg">
              Connect Xero
            </ButtonLink>
            <ButtonLink href={DEMO_PATH} size="lg">
              Launch demo <span aria-hidden>↗</span>
            </ButtonLink>
          </div>

          <p className="animate-rise mt-5 font-mono text-xs text-muted-foreground" style={rise(4)}>
            Demo uses a synthetic company. No account needed.
            {videoUrl && (
              <>
                {" · "}
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
