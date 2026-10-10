# Launch video (Remotion)

The two-minute product and engineering video for AI Accountant, written as code. Separate from the frontend build and
from CI. Read `RULES.md` before touching a composition; the plan is `.claude/plan/stages/S7-video-a.md` and
`S8-video-b.md`; the locked voice-over script with its beat grid is `script.md`.

```bash
cd video
npm install                                   # once
npm run dev                                   # Remotion Studio, composition "Launch"
npm run lint                                  # eslint + tsc
npx remotion render Launch out/launch.mp4     # full render (h264)
node scripts/stills.mjs --scale 0.5 70 830    # PNG stills of chosen frames -> out/stills/ (critique loop)
```

## How it is put together

- **Timing comes from the voice, never guessed.** `scripts/tts.py` reads `script.md` (one `## beat` per one or two
  sentences), synthesises each beat with the owner's cloned Fish Audio voice into `public/vo/<beat>.mp3` (local only),
  measures the files and writes `src/vo-manifest.json` (committed). `src/timing.ts` turns the manifest into beat start
  frames; every visual event in every section is keyed to the start of the beat whose sentence describes it. The
  composition builds and renders without the audio files; with them present it adds one `<Audio>` per beat
  (`TEMPO` = 1.12, pitch preserved).
- **Product footage is the product's own components.** The landing page's four clock-driven scenes were ported to
  `src/scenes/` with inline styles (`src/kit/primitives.tsx` mirrors `ui/*`), drawn inside the app shell at 1200 x 675
  and scaled into a 1520 px frame. A camera (`src/kit/camera.tsx`) zooms towards each click, Screen-Studio style, and a
  synthetic cursor eases into its targets with a 150 ms press. One frame, no cuts; pages swap behind a 120 ms dip.
- **The aurora is the landing shader** (`src/kit/aurora.tsx`, raw WebGL 2) with `uTime` driven by the frame, so it is
  deterministic. `remotion.config.ts` sets the ANGLE renderer for headless Chrome.
- **Captions** are generated from the script (`src/kit/captions.tsx`): sentence and clause splits, proportional timing
  inside each beat. Word-level timing with whisper is an S8 polish if needed.
- **Fonts**: Geist and Geist Mono from `public/fonts` (the product's own files), Instrument Serif via
  `@remotion/google-fonts`; the render waits for all three.
- **Sections** (`src/sections/`): title, problem, product, built, judgement, honest, close. `src/Launch.tsx` stacks them.

Voice-over, from the repo root (needs `video/.env` with `FISH_API_KEY`, never committed, and
`py -3.13 -m pip install fish-audio-sdk mutagen`):

```bash
py -3.13 video/scripts/tts.py                       # every beat -> public/vo/<beat>.mp3 + manifest (public/vo and src)
py -3.13 video/scripts/tts.py --beat hook           # one beat
py -3.13 video/scripts/tts.py --text "Hello." --out video/public/vo/test.mp3
```

Local-only folders (gitignored): `node_modules/`, `out/`, `public/vo/` (voice), `public/clips/` (unused; see its README).
