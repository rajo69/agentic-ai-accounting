import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Kit from "./kit";

export const metadata: Metadata = {
  title: "Kit · AI Accountant",
  robots: { index: false, follow: false },
};

/** Development-only sheet of every token and primitive. 404 in production. */
export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Kit />;
}
