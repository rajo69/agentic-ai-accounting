"""
Generate the voice-over for the launch video with Fish Audio.

Usage (from the repo root, Python 3.13 with fish-audio-sdk installed):
    py -3.13 video/scripts/tts.py                 # every beat in video/script.md -> video/public/vo/<id>.mp3 + manifests
    py -3.13 video/scripts/tts.py --beat hook     # one beat (updates its manifest entry)
    py -3.13 video/scripts/tts.py --text "..." --out video/public/vo/test.mp3
    py -3.13 video/scripts/tts.py --beat hook --voice <fish model id> --out video/out/x.mp3   # preview only
    py -3.13 video/scripts/tts.py --voice eb715e7383264e88ae6973b8da51bbb4 --cues            # the old cloned take

Voice (owner's decision 2026-10-11): the stock Fish library voice "Sleepless historian" (`VOICE_ID`), plain delivery:
the `[bracket]` cues in script.md are stripped before sending, prosody speed 1.0, and temperature/top_p are left at
the SDK defaults (0.7/0.7). A plain run of this script reproduces the committed track. The owner's cloned voice
(`CLONE_VOICE_ID`, take binned locally under `video/bin/vo-fish-clone-2026-10-10/`) stays selectable with `--voice`;
`--cues` restores its emotive path from the S7 voice pass: the Fish S2 bracket cues (`[calm]`, `[emphasis]`, `[break]`
...) are sent to the model, speed 1.08, temperature 0.55, top_p 0.65. `--speed` overrides the pace in either mode.
`--beat` with `--out` writes that one file only and leaves `public/vo/` and both manifests untouched.

After a run, `py -3.13 video/scripts/level.py` levels every beat (archives the raw take to `public/vo/raw/`, brings
it to -15.4 LUFS under a -3 dBFS lookahead limiter, re-encodes, updates both manifests); it is part of the pipeline.
After regenerating one beat, delete its `public/vo/raw/<beat>.mp3` first, then run `level.py --beat <beat>`.

Reads FISH_API_KEY from video/.env (gitignored). Never prints the key. Uses the free S2.1 Pro backend because the
account has no paid credit. Beats come from video/script.md: a line starting with `## <id>` opens a beat and the
following paragraph is its text; lines in parentheses are stage directions and are skipped.

Writes video/public/vo/manifest.json and the committed copy video/src/vo-manifest.json with the duration of each
clip (measured with mutagen if installed, else by ffmpeg from the Playwright cache) so the composition times scenes
from real audio lengths. The manifest text is always cue-free, so captions never show a cue. MP3 192 kbps at
"normal" latency, the higher-quality path.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / ".env"
SCRIPT = ROOT / "script.md"
OUT_DIR = ROOT / "public" / "vo"
VOICE_ID = "beb44e5fac1e4b33a15dfcdcc2a9421d"  # "Sleepless historian", Fish library, British male narrator (2026-10-11)
CLONE_VOICE_ID = "eb715e7383264e88ae6973b8da51bbb4"  # "Rajo", cloned by the owner on fish.audio (2026-10-10), --voice
BACKEND = "s2.1-pro-free"
# Plain delivery (default): the model's own pace and sampling.
SPEED = 1.0
# Emotive delivery (--cues, the S7 path for the clone): cues sent, slightly faster, lowered sampling for an even read.
CUES_SPEED = 1.08
TEMPERATURE = 0.55
TOP_P = 0.65
TAG = re.compile(r"\[[^\]]*\]")


def strip_cues(text: str) -> str:
    """Remove `[bracket]` delivery cues and tidy the spacing: the text the captions show."""
    return re.sub(r"\s+", " ", TAG.sub(" ", text)).replace(" ,", ",").replace(" .", ".").strip()
FFMPEG = Path(os.environ.get("LOCALAPPDATA", "")) / "ms-playwright" / "ffmpeg-1011" / "ffmpeg-win64.exe"


def load_key() -> str:
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if line.startswith("FISH_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("FISH_API_KEY not found in video/.env")


def parse_script(path: Path) -> list[tuple[str, str]]:
    beats: list[tuple[str, list[str]]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^##\s+(\S+)", line)
        if m:
            beats.append((m.group(1), []))
        elif beats and line.strip() and not line.strip().startswith("("):
            beats[-1][1].append(line.strip())
    return [(bid, " ".join(lines)) for bid, lines in beats if lines]


def synthesize(key: str, text: str, out: Path, speed: float = SPEED, voice: str = VOICE_ID, cues: bool = False) -> None:
    from fish_audio_sdk import Prosody, Session, TTSRequest

    out.parent.mkdir(parents=True, exist_ok=True)
    session = Session(key)
    # Plain delivery: no cues, and no sampling overrides (the SDK sends its defaults).
    sampling = {"temperature": TEMPERATURE, "top_p": TOP_P} if cues else {}
    if not cues:
        text = strip_cues(text)
    request = TTSRequest(
        text=text,
        reference_id=voice,
        format="mp3",
        mp3_bitrate=192,
        latency="normal",
        chunk_length=300,
        prosody=Prosody(speed=speed, volume=0),
        **sampling,
    )
    with out.open("wb") as f:
        for chunk in session.tts(request, backend=BACKEND):
            f.write(chunk)


def duration_seconds(path: Path) -> float | None:
    try:
        from mutagen.mp3 import MP3  # type: ignore

        return float(MP3(path).info.length)
    except Exception:
        pass
    if FFMPEG.exists():
        r = subprocess.run([str(FFMPEG), "-i", str(path), "-f", "null", "-"], capture_output=True, text=True)
        m = re.search(r"time=(\d+):(\d+):(\d+\.\d+)", r.stderr)
        if m:
            h, mi, s = m.groups()
            return int(h) * 3600 + int(mi) * 60 + float(s)
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--beat", help="only this beat id from script.md")
    ap.add_argument("--text", help="synthesize this text instead of the script")
    ap.add_argument("--out", help="output path for --text, or for a single --beat preview (skips the manifests)")
    ap.add_argument("--speed", type=float, default=None, help=f"prosody speed (default {SPEED}, or {CUES_SPEED} with --cues)")
    ap.add_argument("--voice", default=VOICE_ID, help=f"Fish model id (default {VOICE_ID}, Sleepless historian; clone {CLONE_VOICE_ID})")
    ap.add_argument("--cues", action="store_true", help="send the [bracket] cues with lowered sampling (the clone's S7 path)")
    ap.add_argument("--plain", action="store_true", help="plain delivery; the default, kept for older commands")
    args = ap.parse_args()
    if args.cues and args.plain:
        sys.exit("--cues and --plain are opposites; pass one")
    speed = args.speed if args.speed is not None else (CUES_SPEED if args.cues else SPEED)
    key = load_key()

    if args.text:
        out = Path(args.out or OUT_DIR / "adhoc.mp3")
        synthesize(key, args.text, out, speed, args.voice, args.cues)
        print(f"wrote {out} ({out.stat().st_size} bytes, {duration_seconds(out)} s)")
        return

    if not SCRIPT.exists():
        sys.exit("video/script.md not found; write the locked script first (S7 step 3)")
    beats = parse_script(SCRIPT)
    if args.beat:
        beats = [b for b in beats if b[0] == args.beat]
        if not beats:
            sys.exit(f"beat {args.beat!r} not in script.md")
        if args.out:
            out = Path(args.out)
            synthesize(key, beats[0][1], out, speed, args.voice, args.cues)
            print(f"{args.beat}: wrote {out} ({duration_seconds(out)} s, {out.stat().st_size} bytes)")
            return
    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for bid, text in beats:
        out = OUT_DIR / f"{bid}.mp3"
        synthesize(key, text, out, speed, args.voice, args.cues)
        manifest[bid] = {"text": strip_cues(text), "cues": text, "voice": args.voice, "seconds": duration_seconds(out), "bytes": out.stat().st_size}
        print(f"{bid}: {manifest[bid]['seconds']} s, {out.stat().st_size} bytes")
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    # Committed copy (durations only matter): the composition builds its timeline from it without the audio.
    (ROOT / "src" / "vo-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"manifest: {manifest_path} (+ src/vo-manifest.json)")


if __name__ == "__main__":
    main()
