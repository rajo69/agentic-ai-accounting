export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 py-16 px-6">
      <div className="max-w-2xl mx-auto prose prose-invert prose-sm">
        <h1 className="text-2xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-slate-500 text-xs mb-8">Last updated: March 2026</p>

        <h2 className="text-base font-semibold text-white mt-6 mb-2">What data we collect</h2>
        <p>We access your Xero accounting data via the Xero API, including bank transactions, chart of accounts, and bank statements. We store this data in a secure PostgreSQL database hosted on Railway (EU region).</p>

        <h2 className="text-base font-semibold text-white mt-6 mb-2">How we use your data</h2>
        <p>Transaction descriptions and amounts are sent to the Anthropic Claude API for AI categorisation and management letter generation. No personal contact data is sent to third-party AI services.</p>

        <h2 className="text-base font-semibold text-white mt-6 mb-2">Data storage</h2>
        <p>Your data is stored on Railway infrastructure in the EU. Xero OAuth tokens are stored encrypted in our database. We do not sell or share your data with third parties beyond what is necessary to operate the service.</p>

        <h2 className="text-base font-semibold text-white mt-6 mb-2">Your rights</h2>
        <p>You can disconnect your Xero account at any time from the Xero developer portal. To request deletion of all your data, contact us at the email below.</p>

        <h2 className="text-base font-semibold text-white mt-6 mb-2">Contact</h2>
        <p>
          Questions? Email us at{" "}
          <a href="mailto:hello@aiaccountant.app" className="text-indigo-400 hover:underline">
            hello@aiaccountant.app
          </a>
        </p>

        <div className="mt-10">
          <a href="/" className="text-sm text-indigo-400 hover:underline">← Back to home</a>
        </div>
      </div>
    </div>
  );
}
