# Reference style guide: "Best SaaS Product Launch Ad Video | LangEase" (Zelios, 2025)

Owner's reference for the launch video's business half (2026-10-10): https://www.youtube.com/watch?v=SgmuplXU2iY.
Extracted the way the first reference tutorial prescribes: downloaded with yt-dlp (open source), frames sampled every
0.5 s (and every 0.1 s for the first eight seconds) with ffmpeg, contact sheets reviewed, audio transcribed with
faster-whisper. Grammar only is taken from it; none of its content, logo, colours or characters.

## What it is
33 s, 1280x720, 30 fps, **music only, no voice-over** (a bass-forward electronic track; every visual change sits on
a hit; a hard silence at 27.5 s before the tagline; the music ends at 31.5 s and the logo holds in silence).
Light canvas (near-white with a blue cast), one accent blue (flat and as a two-stop gradient), a geometric sans
(SF Pro / Inter class), medium weight, the studio's mark small at top-left throughout, the product's logo only at
the end with its URL beneath.

## Shot grammar (what we take)
1. **Kinetic typography carries the message.** One to four words on screen at a time, centred. Each word pops in
   on the beat: a quick scale from about 1.2 to 1 with a short focus pull (blur to sharp) over ~250 ms; the group
   re-centres as words are added (the earlier words slide to make room). A phrase leaves by scaling down slightly
   with a blur and fade over ~200 ms, and the next phrase pops in larger before settling. Two-tone colour: the key
   word in the accent, the rest in black.
2. **Product UI in perspective.** Screens are shown as tilted 3D mock-ups (rotateX and rotateY of 10 to 25
   degrees, slight scale, soft shadow), flown past the camera or settling into place; a cursor clicks inside them.
3. **Isolated UI elements as hero objects.** A single row, button or card is pulled out of the interface, enlarged
   to a third of the frame, and acted on (the cursor presses "Distribute to YouTube"; the button changes state).
4. **Count-up numerals.** A large score (79/100 to 100/100) counts up with a gradient bar filling beneath it, then
   a "Done" check with a particle burst.
5. **Depth transitions.** A liquid blob wipe once; otherwise depth of field (blur) and scale carry the cuts. Shots
   last 1.5 to 3 s; words 0.4 to 0.6 s.
6. **Ending.** Tagline in three words with full stops ("Translate. Dub. Distribute."), each on a hit, then the logo
   and URL, held.

## How it maps to our brand (DESIGN.md stays the law for colour and type)
| Reference | Ours |
|---|---|
| Light canvas, blue accent | Dark canvas `#09090c`; accent words in `#a594ff` (the aurora's middle stop lifted), a recorded exception to "colour never touches type" |
| Geometric sans | Geist 500 for kinetic words; Instrument Serif italic for the accent words (the brand's emphasis face) |
| Music-cut words | Voice-cut words: each word pops on its own spoken onset (word timings from faster-whisper, `scripts/words.py`) |
| Tilted phone mock-ups | The console frame enters tilted and settles flat; the AI-coded ledger in beat two stands tilted |
| Score count-up | "90%" to "99%" numerals in Geist Mono with the bar (problem beat two) |
| Pulled-out UI elements | The drawer and candidates zooms of the product section already do this with the camera |
| Hard silence before the tagline | Not used: the voice carries the close; the bed ducks and fades instead |
| Particle burst, blob wipe | Not used (DESIGN.md bans decorative effects) |

Applied to: `src/sections/title.tsx`, `problem.tsx`, the entrance in `product.tsx`; primitives in `src/kit/kinetic.tsx`
and `src/kit/depth.tsx`. The engineering half keeps the quieter grammar of RULES.md.
