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
// Display face (owner decision 2026-10-10): landing h1/h2 upright, emphasis and the wordmark italic.
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Accountant",
  description: "The review layer for AI-coded Xero books. Built by Rajarshi Nandi.",
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
