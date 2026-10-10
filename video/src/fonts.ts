import { continueRender, delayRender, staticFile } from "remotion";
import { loadFont as loadInstrumentSerif } from "@remotion/google-fonts/InstrumentSerif";

/**
 * Geist and Geist Mono come from `public/fonts` (the same variable woff files as the product),
 * Instrument Serif from Google through @remotion/google-fonts. The render waits for all three so
 * the first frame is set in the right faces.
 */
const faces = [
  { family: "Geist", file: "fonts/GeistVF.woff" },
  { family: "Geist Mono", file: "fonts/GeistMonoVF.woff" },
];

let started = false;

export function ensureFonts() {
  if (started || typeof document === "undefined") return;
  started = true;
  const handle = delayRender("Loading fonts");
  const local = faces.map((f) => {
    const face = new FontFace(f.family, `url(${staticFile(f.file)}) format("woff")`, { weight: "100 900" });
    document.fonts.add(face);
    return face.load();
  });
  const serif = Promise.all([
    loadInstrumentSerif("normal", { weights: ["400"], subsets: ["latin"] }).waitUntilDone(),
    loadInstrumentSerif("italic", { weights: ["400"], subsets: ["latin"] }).waitUntilDone(),
  ]);
  Promise.all([...local, serif])
    .then(() => continueRender(handle))
    .catch((err) => {
      // A missing font must not block the render; the fallback stack is defined in theme.ts.
      console.warn("font load failed", err);
      continueRender(handle);
    });
}
