"use client";

import { ButtonLink } from "./button-link";
import { DEMO_PATH } from "./links";
import { Container, SectionHeader } from "./section";

/** Final call to action: the same two buttons as the hero. */
export function Cta({ connectHref }: { connectHref: string }) {
  return (
    <section className="relative z-10 border-t border-border">
      <Container className="py-24 md:py-32">
        <SectionHeader
          eyebrow="Get started"
          title="Review the next quarter with evidence."
          lead="Connect a Xero organisation, or open the demo with a synthetic company. No account is needed for the demo."
        />
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink href={connectHref} variant="outline" size="lg">
            Connect Xero
          </ButtonLink>
          <ButtonLink href={DEMO_PATH} size="lg">
            Launch demo <span aria-hidden>↗</span>
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
