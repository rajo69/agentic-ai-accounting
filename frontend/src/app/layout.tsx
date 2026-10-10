import type { Metadata } from "next";
import localFont from "next/font/local";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/app-shell";
import { MotionProvider } from "@/components/motion-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
// Editorial accent (S0 decision): italic only, one or two words in the hero.
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Accountant",
  description: "The review layer for AI-coded Xero books. Portfolio project by Rajarshi Nandi.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${serif.variable}`}>
      <body className="min-h-screen">
        <MotionProvider>
          <AppShell>{children}</AppShell>
          <Toaster position="top-right" />
        </MotionProvider>
      </body>
    </html>
  );
}
