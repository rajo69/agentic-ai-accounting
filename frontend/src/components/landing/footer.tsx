import { Lockup } from "@/components/brand/logo";

import { GITHUB_URL, LINKEDIN_URL, README_URL } from "./links";
import { Container } from "./section";

const LINKS = [
  { label: "GitHub", href: GITHUB_URL, external: true },
  { label: "README", href: README_URL, external: true },
  { label: "Privacy", href: "/privacy", external: false },
  { label: "LinkedIn", href: LINKEDIN_URL, external: true },
];

/** Two rows of mono links (DESIGN.md section 5). No mailto. */
export function Footer() {
  return (
    <footer className="relative z-10 border-t border-border">
      <Container className="flex flex-col gap-6 py-10 font-mono text-xs text-muted-foreground">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Lockup />
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  target={l.external ? "_blank" : undefined}
                  rel={l.external ? "noreferrer" : undefined}
                  className="transition-colors duration-150 hover:text-foreground"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>Built by Rajarshi Nandi · portfolio project, open source</span>
          <span>© 2026 · demo data is synthetic</span>
        </div>
      </Container>
    </footer>
  );
}
