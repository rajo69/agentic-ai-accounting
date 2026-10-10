"use client";

import { Lockup } from "@/components/brand/logo";

import { ButtonLink } from "./button-link";
import { DEMO_PATH, GITHUB_URL } from "./links";
import { Container } from "./section";

const LINKS = [
  { label: "Product", href: "#product" },
  { label: "Engineering", href: "#engineering" },
  { label: "GitHub", href: GITHUB_URL, external: true },
  { label: "Privacy", href: "/privacy" },
];

/** 64 px nav: animated lockup, four links, the two CTAs. */
export function Nav({ connectHref }: { connectHref: string }) {
  return (
    <header className="relative z-10">
      <Container className="flex h-16 items-center justify-between gap-6">
        <a href="#top" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <Lockup animated />
        </a>
        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target={l.external ? "_blank" : undefined}
              rel={l.external ? "noreferrer" : undefined}
              className="rounded-sm text-sm text-muted-foreground outline-none transition-colors duration-150 ease-out-quart hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href={connectHref} variant="ghost" size="sm" className="hidden sm:inline-flex">
            Connect Xero
          </ButtonLink>
          <ButtonLink href={DEMO_PATH} size="sm">
            Launch demo <span aria-hidden>↗</span>
          </ButtonLink>
        </div>
      </Container>
    </header>
  );
}
