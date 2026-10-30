import type { Metadata } from "next";

const description =
  "AI Accountant's review loop runs in your browser with no account. Each transaction arrives with a proposed category, written reasoning, a confidence tier and a risk flag, and a person decides.";
const alt =
  "AI Accountant's review screen: a transaction with its proposed category, written reasoning, confidence and risk flag.";

export const metadata: Metadata = {
  metadataBase: new URL("https://agentic-ai-accounting.vercel.app"),
  title: "AI Accountant demo",
  description,
  openGraph: {
    type: "website",
    siteName: "AI Accountant",
    title: "AI Accountant demo",
    description,
    url: "/demo",
    locale: "en_GB",
    images: [{ url: "/og-demo.png", width: 1200, height: 630, alt, type: "image/png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Accountant demo",
    description,
    images: [{ url: "/og-demo.png", alt }],
  },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
