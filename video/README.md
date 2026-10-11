# Launch video (Remotion)

The two-minute product and engineering video for AI Accountant, written as code. Separate from the frontend build and
from CI. Read `RULES.md` before touching a composition; the plan is `.claude/plan/stages/S7-video-a.md` and
`S8-video-b.md`; the locked voice-over script with its beat grid is `script.md`.

```bash
cd video
npm install                                   # once
npm run dev                                   # Remotion Studio, composition "Launch"
npm run lint                                  # eslint + tsc
npx remotion render Launch out/launch.mp4 --codec h264 --crf 18 --image-format png --color-space bt709   # final (about 12 min)
npx remotion still Launch ../docs/media/video-thumbnail.png --frame 8012 --scale 0.6666667               # thumbnail 1280x720 (TOTAL_FRAMES - 6)
node scripts/stills.mjs --scale 0.5 70 830    # PNG stills of chosen frames -> out/stills/ (critique loop)
```

## How it is put together

- **Timing comes from the voice, never guessed.** `scripts/tts.py` reads `script.md` (one `## beat` per one or two
  sentences), synthesises each beat with a stock Fish Audio library voice ("Sleepless historian", free S2.1 Pro
  backend, plain delivery) into `public/vo/<beat>.mp3` (local only); `scripts/level.py` then levels each beat, and the
  measured lengths go into `src/vo-manifest.json` (committed). `src/timing.ts` turns the manifest into beat start
  frames; every visual event in every section is keyed to the start of the beat whose sentence describes it. The
  composition builds and renders without the audio files; with them present it adds one `<Audio>` per beat
  (`TEMPO` = 1.0: the voice plays at its own pace, nothing is stretched). Word timings (`scripts/words.py`, faster-whisper, committed as `src/vo-words.json`)
  place the kinetic type and the captions on the spoken word.
- **Product footage is the product's own components.** The landing page's four clock-driven scenes were ported to
  `src/scenes/` with inline styles (`src/kit/primitives.tsx` mirrors `ui/*`), drawn inside the app shell at 1200 x 675
  and scaled into a 1520 px frame. A camera (`src/kit/camera.tsx`) zooms towards each click, Screen-Studio style, and a
  synthetic cursor eases into its targets with a 150 ms press. One frame, no cuts; pages swap behind a 120 ms dip.
- **The aurora is the landing shader** (`src/kit/aurora.tsx`, raw WebGL 2) with `uTime` driven by the frame, so it is
  deterministic. `remotion.config.ts` sets the ANGLE renderer for headless Chrome.
- **Captions** are generated from the script (`src/kit/captions.tsx`): sentence and clause splits, each line starting on
  its first spoken word and ending on its last.
- **Sound is two layers that never share a file.** The voice is one MP3 per beat; the music is a bed generated in code
  (`scripts/music.py`, 92 BPM D minor, arranged on the beat grid) on its own `<Audio>` layer, ducked under the voice by
  the gain curve in `src/music.ts`. `scripts/level.py` brings every voice beat to -15.4 LUFS under a -3 dBFS lookahead
  limiter written in numpy (the raw takes stay in `public/vo/raw/`), so the voice sits where the bed's ratio expects. A master trim (`MASTER`, measured in S8) puts the mix at -16 LUFS integrated inside
  the composition, so the render is on level without a post-processing pass. `scripts/stems.py` exports voice, music and
  mix as WAVs; `scripts/loudness.py` measures them and the render in LUFS and true peak (ffmpeg's EBU R128 analysis).
- **The clock is milliseconds, the render is 60 fps.** Every event is an ms offset from a beat or a word, so the frame
  rate (`fps` in `src/theme.ts`, 30 for the rough cuts, 60 for the final) only sets how finely motion is sampled; the few
  constants kept in frames scale through `F()` and are mirrored in `scripts/timing.py`.
- **Fonts**: Geist and Geist Mono from `public/fonts` (the product's own files), Instrument Serif via
  `@remotion/google-fonts`; the render waits for all three.
- **Sections** (`src/sections/`): title, problem, product, built, judgement, honest, close. `src/Launch.tsx` stacks them.

Voice-over, from the repo root (needs `video/.env` with `FISH_API_KEY`, never committed, and
`py -3.13 -m pip install fish-audio-sdk mutagen`):

```bash
py -3.13 video/scripts/tts.py                       # every beat -> public/vo/<beat>.mp3 + manifest (public/vo and src)
py -3.13 video/scripts/level.py                     # level every beat (raw kept in public/vo/raw/), update both manifests
py -3.13 video/scripts/words.py                     # word timings -> src/vo-words.json (+ a per-beat whisper check)
py -3.13 video/scripts/tts.py --beat hook           # one beat
py -3.13 video/scripts/tts.py --text "Hello." --out video/public/vo/test.mp3
```

Local-only folders (gitignored): `node_modules/`, `out/` (renders, stems, stills), `public/vo/` (voice), `public/music/`
(the generated bed, 13 s to rebuild), `public/clips/` (unused; see its README). What goes to YouTube (title, description,
chapters, tags) is in `PUBLISH.md`.

## How the video was made

The whole film is a Remotion composition, so every frame is reproducible from this folder plus the voice files. The
script was locked first (`script.md`, 21 beats, about 315 words) and synthesised beat by beat with a stock Fish Audio
library voice ("Sleepless historian", Fish's free backend, plain delivery; the owner's cloned take was replaced for
quality on 2026-10-11 and is kept locally under `video/bin/`), then levelled beat by beat; whisper then measured where each word falls, and the composition keys every visual event to those word times,
so picture, voice and caption stay in sync without hand-tuning. The opening borrows the grammar of a music-only SaaS
ad the owner chose as a reference (`STYLE-REF.md`: kinetic words, a tilted ledger, a count-up); the product section
is the landing page's own scene components driven by frame inside one console frame with a Screen-Studio-style camera
and an eased cursor; the engineering half is quiet type on the dark canvas (`RULES.md`). The music is synthesised in
Python on the beat grid rather than licensed, the aurora is the landing shader run frame by frame in WebGL, and the
soundtrack is trimmed to -16 LUFS inside the composition. Final render: 1920x1080, 60 fps, H.264 CRF 18, BT.709,
133.6 s (2:14).
