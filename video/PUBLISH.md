# Publishing the launch video (S8)

Everything the owner pastes into YouTube, in one place. The upload itself is the owner's action (STOP in
`.claude/plan/stages/S8-video-b.md`, step 6). Chapter times come from the beat grid (`py -3.13 video/scripts/timing.py`)
and change if a beat is regenerated; YouTube needs the first chapter at 0:00 and every chapter at least ten seconds long,
so short beats are grouped.

## File

`video/out/launch.mp4`: 1920x1080, 60 fps, H.264 (CRF 18, BT.709), AAC stereo, 2:14 (133.65 s), 18.0 MB. Soundtrack
-16.1 LUFS integrated, true peak -3.0 dBTP (`py -3.13 video/scripts/loudness.py`, target -16 +/- 0.5, <= -1.5 dBTP). Thumbnail: `docs/media/video-thumbnail.png` (1280x720,
the close card).

## Title

AI Accountant: the review layer for AI-coded Xero books (2-minute demo)

## Description

AI Accountant is the review layer that sits after Xero's AI and before the sign-off. Every transaction gets a proposed
category with written reasoning, a confidence tier and a plain-language risk flag; the accountant decides; every
decision is recorded in an audit log. The demo in this video runs on a synthetic company, no account needed.

Try the demo: https://agentic-ai-accounting.vercel.app/demo
Code (MIT, README written for hiring managers): https://github.com/rajo69/agentic-ai-accounting
Built by Rajarshi Nandi, open to AI engineering roles: https://www.linkedin.com/in/rajarshi-nandi

Chapters
0:00 Xero's AI codes the books; the errors are still yours
0:19 A quarter's review: categorise
0:37 Explain: reasoning, model, risk rules
0:52 Decide: approve, correct, audit log
1:03 Reconcile and report
1:17 How it is built
1:37 Three things that needed judgement
1:54 What is real, and where to find it

The video is code: a Remotion composition in the repository's `video/` folder, timed to the measured voice-over
(narrated by a stock Fish Audio library voice), with product footage drawn from the product's own landing-page scenes and a
music bed generated in Python. Nothing on screen is a number that cannot be verified in the repository.

## Tags

AI accounting, Xero, Making Tax Digital, MTD, bookkeeping review, LLM, Claude, LangGraph, FastAPI, Next.js, Remotion,
portfolio project, AI engineering

## After the upload (owner)

1. Record the URL here and in the README video section (`docs/media/video-thumbnail.png` links to it).
2. Set `NEXT_PUBLIC_VIDEO_URL` on Vercel (production) to the URL; the hero's "Watch the 2-minute demo" link appears
   on the next deploy.
3. Optional: `video/out/launch-720p.mp4` is a web copy under 15 MB if a self-hosted file is ever wanted on the landing
   page; it is not committed.
