import Link from "next/link";
import { Lockup } from "@/components/brand/logo";

/** Same tokens as the rest of the site; copy edits come in S6. */
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
        <p className="mt-2 font-mono text-xs text-muted-foreground">Last updated March 2026</p>

        <h2 className={h2}>What data we collect</h2>
        <p className={p}>We access your Xero accounting data via the Xero API, including bank transactions, chart of accounts, and bank statements. We store this data in a secure PostgreSQL database hosted on Railway (EU region).</p>

        <h2 className={h2}>How we use your data</h2>
        <p className={p}>Transaction descriptions and amounts are sent to the Anthropic Claude API for AI categorisation and management letter generation. No personal contact data is sent to third-party AI services.</p>

        <h2 className={h2}>Data storage</h2>
        <p className={p}>Your data is stored on Railway infrastructure in the EU. Xero OAuth tokens are stored in our database. Token encryption is planned before handling regulated client data. We do not sell or share your data with third parties beyond what is necessary to operate the service.</p>

        <h2 className={h2}>Your rights under GDPR</h2>
        <p className={p}>As a data subject, you have the following rights, each of which is implemented in the service:</p>
        <ul className="mt-4 flex flex-col gap-4 border-l border-border pl-5 text-body text-muted-foreground">
          <li><strong className="font-medium text-foreground">Right of access and portability (Art. 15/20).</strong> Request a full export of all data held about your organisation via <code className={code}>GET /api/v1/gdpr/export</code>. Returns structured JSON suitable for import into another system.</li>
          <li><strong className="font-medium text-foreground">Right to erasure (Art. 17).</strong> Request deletion of all your data via <code className={code}>DELETE /api/v1/gdpr/erase</code>. All organisation rows are deleted in FK-safe order and your session is invalidated immediately.</li>
          <li><strong className="font-medium text-foreground">Right to explanation (Art. 22).</strong> Every AI categorisation decision stores its full reasoning, feature importances, and risk score in an immutable audit log, accessible via <code className={code}>GET /api/v1/transactions/&#123;id&#125;/explanation</code>.</li>
          <li><strong className="font-medium text-foreground">Disconnect Xero.</strong> You can revoke access at any time from the Xero developer portal (<a href="https://developer.xero.com/myapps" className={link} target="_blank" rel="noreferrer">developer.xero.com/myapps</a>).</li>
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
