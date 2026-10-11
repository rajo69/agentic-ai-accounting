import Link from "next/link";
import { Lockup } from "@/components/brand/logo";

/** Same tokens as the rest of the site. Copy reflects the data flows verified in the 2026-10-10 review. */
const h2 = "mt-10 text-h3 text-foreground";
const p = "mt-3 text-body text-muted-foreground";
const code = "rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-foreground";
const link = "text-foreground underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-12 text-foreground md:py-20">
      <div className="mx-auto max-w-2xl">
        <Link href="/" aria-label="AI Accountant home" className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          <Lockup size={22} />
        </Link>

        <h1 className="mt-12 text-h2 text-foreground">Privacy policy.</h1>
        <p className="mt-2 font-mono text-xs text-muted-foreground">Last updated 11 October 2026</p>

        <h2 className={h2}>Who this is</h2>
        <p className={p}>AI Accountant is a portfolio project run by one developer, Rajarshi Nandi. It is not a registered accountancy service. This page describes what the live app does with data when you connect a Xero organisation. The demo at <code className={code}>/demo</code> uses a synthetic company and runs entirely in your browser: nothing is sent to a server and nothing is written to Xero.</p>

        <h2 className={h2}>What we collect</h2>
        <p className={p}>When you connect Xero, the app reads your chart of accounts, bank transactions, invoices and payments through the Xero API and stores them in a PostgreSQL database hosted on Railway. Transaction descriptions can include the names of the people and businesses you pay or are paid by. The Xero consent screen asks for read-only access; the app never writes anything back to Xero. Connections made before 11 October 2026 were also granted write permissions on bank transactions, invoices and contacts that the app never used; disconnecting the app in Xero&apos;s connected-apps settings removes them.</p>

        <h2 className={h2}>How we use it</h2>
        <p className={p}>To propose a category, the date, amount, description, reference, your chart of accounts and a few of your own previously categorised transactions are sent to Anthropic&apos;s Claude API. Descriptions may include payee and customer names, so personal data can reach Anthropic in that step. To draft a management letter, aggregated figures (totals, top categories, largest transactions) are sent to the same API. Reconciliation runs locally with no AI service. The explainability layer can fit a small interpretable model on your organisation&apos;s own categorised transactions once fifty exist; that model is being retired because Xero&apos;s developer terms forbid training models on API data.</p>

        <h2 className={h2}>Who else processes data</h2>
        <ul className="mt-4 flex flex-col gap-3 border-l border-border pl-5 text-body text-muted-foreground">
          <li><strong className="font-medium text-foreground">Anthropic</strong> (US): transaction details and aggregated figures for categorisation and narrative drafting.</li>
          <li><strong className="font-medium text-foreground">Railway</strong>: hosts the API and the database. The hosting region is being confirmed and is not yet guaranteed to be in the UK or EU.</li>
          <li><strong className="font-medium text-foreground">Vercel</strong>: hosts this website.</li>
          <li><strong className="font-medium text-foreground">Sentry</strong>: receives error reports tagged with your organisation id and name, when error tracking is enabled.</li>
          <li><strong className="font-medium text-foreground">Resend</strong>: sends team invitation emails, which contain the invitee&apos;s name and email, the inviter&apos;s name and the organisation name.</li>
        </ul>

        <h2 className={h2}>Storage and retention</h2>
        <p className={p}>Xero access and refresh tokens are encrypted at rest. Data is kept until you erase it; there is no automatic retention limit yet. Audit records of AI proposals and human decisions are append-only by convention, not enforced at the database level.</p>

        <h2 className={h2}>Your rights under GDPR</h2>
        <ul className="mt-4 flex flex-col gap-4 border-l border-border pl-5 text-body text-muted-foreground">
          <li><strong className="font-medium text-foreground">Access and portability (Art. 15/20).</strong> Export everything held about your organisation as JSON via <code className={code}>GET /api/v1/gdpr/export</code>.</li>
          <li><strong className="font-medium text-foreground">Erasure (Art. 17).</strong> Delete all of your organisation&apos;s data via <code className={code}>DELETE /api/v1/gdpr/erase</code>; your session is invalidated immediately.</li>
          <li><strong className="font-medium text-foreground">Explanation (Art. 22).</strong> Every AI categorisation stores its reasoning, confidence and risk assessment, available via <code className={code}>GET /api/v1/transactions/&#123;id&#125;/explanation</code>.</li>
          <li><strong className="font-medium text-foreground">Disconnect Xero.</strong> Remove this app at any time from your Xero organisation&apos;s settings under Connected apps, then erase your data here.</li>
        </ul>

        <h2 className={h2}>Contact</h2>
        <p className={p}>
          Questions? Email{" "}
          <a href="mailto:rajarshin264@gmail.com" className={link}>
            rajarshin264@gmail.com
          </a>
        </p>

        <div className="mt-12 border-t border-border pt-6">
          <Link href="/" className="font-mono text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
