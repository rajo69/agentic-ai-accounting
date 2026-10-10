import { Architecture } from "@/components/landing/architecture";
import { Backdrop } from "@/components/landing/backdrop";
import { Capabilities } from "@/components/landing/capabilities";
import { Cta } from "@/components/landing/cta";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Nav } from "@/components/landing/nav";
import { ProductFrame } from "@/components/landing/product-frame";
import { ProofStrip } from "@/components/landing/proof-strip";
import { ReviewFlow } from "@/components/landing/review-flow";
import { WhatsReal } from "@/components/landing/whats-real";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
/** Set in S8 once the launch video is public; the hero link stays hidden until then. */
const VIDEO_URL = process.env.NEXT_PUBLIC_VIDEO_URL || "";

/** Landing page: composition only. Sections live in `components/landing/*` (DESIGN.md section 10). */
export default function LandingPage() {
  return (
    <div id="top" className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Backdrop />
      <Nav connectHref={`${API_BASE}/auth/xero/connect`} />
      <Hero connectHref={`${API_BASE}/auth/xero/connect`} videoUrl={VIDEO_URL} />
      <ProductFrame />
      <ReviewFlow />
      <Capabilities />
      <ProofStrip />
      <Architecture />
      <WhatsReal />
      <Cta connectHref={`${API_BASE}/auth/xero/connect`} />
      <Footer />
    </div>
  );
}
