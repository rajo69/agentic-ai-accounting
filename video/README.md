# Launch video (Remotion)

The two-minute product and engineering video for AI Accountant. Separate from the frontend build and from CI.
Read `RULES.md` before touching a composition; the plan is `.claude/plan/stages/S7-video-a.md` and `S8-video-b.md`.

```bash
cd video
npm install                     # once
npm run dev                     # Remotion Studio, composition "Launch"
npm run lint                    # eslint + tsc
npx remotion render Launch out/launch.mp4
```

Voice-over, from the repo root (needs `video/.env` with `FISH_API_KEY`, never committed, and `py -3.13 -m pip install fish-audio-sdk`):

```bash
py -3.13 video/scripts/tts.py                       # every beat in video/script.md -> public/vo/<beat>.mp3 + manifest.json
py -3.13 video/scripts/tts.py --beat hook           # one beat
py -3.13 video/scripts/tts.py --text "Hello." --out video/public/vo/test.mp3
```

Local-only folders (gitignored): `node_modules/`, `out/`, `public/vo/` (voice), `public/clips/` (screen recordings of the
demo; see `public/clips/README.md` for how to re-record them).

`src/theme.ts` holds the design tokens copied from the product; `public/fonts/` holds Geist and Geist Mono; Instrument
Serif comes from `@remotion/google-fonts` (add it in S7).
