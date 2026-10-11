"""
Level pass for the voice beats, run after `tts.py` (owner's decision 2026-10-11, S8 voice swap):

    py -3.13 video/scripts/level.py              # every public/vo/<beat>.mp3
    py -3.13 video/scripts/level.py --beat hook  # one beat

Why: the stock library voice ("Sleepless historian") is about 4 dB quieter than the binned cloned take and peakier
(about 15 dB from peak to loudness against 12.4), so the composition's master trim alone could not land the mix on
-16 LUFS under a -1.5 dBTP true peak, nor keep the bed 16 dB under the voice. This script brings every beat to the
level the cloned take had (TARGET_I, measured as the cloned voice stem before MASTER), so `MASTER` in `src/music.ts`
and the bed stay as they were.

Per beat, deterministic and idempotent:
  1. The untouched TTS file is archived once to `public/vo/raw/<beat>.mp3` and is always the input, so a beat is
     never processed twice. Regenerating a beat with `tts.py` overwrites `public/vo/<beat>.mp3` only: delete its raw
     copy first so the new take becomes the input.
  2. Raw is decoded to stereo 44.1 kHz WAV with Remotion's bundled ffmpeg (the same path as `stems.py`; measuring the
     mono MP3 directly reads its true peak about 3 dB high in ffmpeg's loudnorm, the stereo decode is what the
     render mixes).
  3. Integrated loudness via the loudnorm JSON pass (`loudness.measure`), then one constant gain to TARGET_I
     (corrected from a measurement of the encoded result, at most four passes: limiting costs some loudness and the
     MP3 round trip reads about 0.26 dB low).
  4. Lookahead peak limiter in numpy (the bundled ffmpeg has no alimiter): per sample the gain needed to keep the
     louder channel under CEILING; a running minimum of that over the LOOKAHEAD window ahead of the sample (so the
     gain is already down when the peak arrives); a moving average over the same window (a smooth attack that never
     rises above the needed gain at a peak); a one-pole RELEASE back towards unity. One envelope for both channels.
  5. Encoded to `public/vo/<beat>.mp3` (libmp3lame 192k, stereo), re-measured from its own stereo decode, and its
     `seconds`, `bytes` and a `level` record written into `public/vo/manifest.json` and `src/vo-manifest.json`.
     `seconds` is the decoded sample count / 44100, what the render plays: mutagen reads LAME-encoded files about
     25 ms long (it counts the encoder padding), which would add a frame and a half per beat to the grid.
Fails (exit 1) if a processed beat is above MAX_TP or outside TARGET_I +/- TOLERANCE.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from loudness import measure

ROOT = Path(__file__).resolve().parents[1]
VO = ROOT / "public" / "vo"
RAW = VO / "raw"
MANIFESTS = (VO / "manifest.json", ROOT / "src" / "vo-manifest.json")
FFMPEG = ROOT / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe"
SR = 44100
TARGET_I = -15.4  # LUFS: the cloned take's voice stem before MASTER (0.934 brings it to -16.0)
TOLERANCE = 0.3
CEILING_DB = -3.0  # sample-peak ceiling; true peak lands about half a dB above
MAX_TP = -2.0
LOOKAHEAD_S = 0.005
RELEASE_S = 0.080


def ffmpeg(*args: str) -> None:
    subprocess.run([str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", *args], capture_output=True, check=True)


def decode(src: Path, wav: Path) -> np.ndarray:
    ffmpeg("-i", str(src), "-ac", "2", "-ar", str(SR), str(wav))
    data, sr = sf.read(wav, dtype="float64")
    assert sr == SR and data.ndim == 2, (sr, data.shape)
    return data


def running_min_ahead(x: np.ndarray, n: int) -> np.ndarray:
    """out[i] = min(x[i : i + n]) (the window shrinks at the end)."""
    pad = np.concatenate([x, np.full(n - 1, x[-1])])
    win = np.lib.stride_tricks.sliding_window_view(pad, n)
    return win.min(axis=1)


def limit(x: np.ndarray) -> tuple[np.ndarray, float]:
    ceiling = 10 ** (CEILING_DB / 20)
    n = max(1, round(LOOKAHEAD_S * SR))
    peak = np.max(np.abs(x), axis=1)
    need = np.minimum(1.0, ceiling / np.maximum(peak, 1e-12))
    held = running_min_ahead(need, n)
    # Moving average over the n samples up to i: every value averaged at a peak is <= the gain that peak needs.
    c = np.concatenate([[0.0], np.cumsum(held)])
    idx = np.arange(len(held))
    lo = np.maximum(0, idx - n + 1)
    smooth = (c[idx + 1] - c[lo]) / (idx + 1 - lo)
    r = math.exp(-1.0 / (RELEASE_S * SR))
    env = np.empty_like(smooth)
    g = 1.0
    for i, t in enumerate(smooth):  # instant attack (already smoothed), one-pole release
        g = t if t < g else t + (g - t) * r
        env[i] = g
    return x * env[:, None], 20 * math.log10(float(env.min()))


def process(bid: str, tmp: Path) -> dict:
    src = VO / f"{bid}.mp3"
    raw = RAW / f"{bid}.mp3"
    if not raw.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, raw)
    raw_wav = tmp / f"{bid}-raw.wav"
    x = decode(raw, raw_wav)
    before = measure(raw_wav)
    # Limiting costs some loudness and the MP3 round trip in this ffmpeg build reads about 0.26 dB lower, so the
    # pre-limiter gain is corrected from a measurement of the encoded file, decoded as the render decodes it
    # (stereo, including MP3 overshoot), until it lands on the target (two or three passes).
    gain_db = TARGET_I - before["input_i"]
    out_wav = tmp / f"{bid}-out.wav"
    check = tmp / f"{bid}-check.wav"
    for _ in range(4):
        y, limited_db = limit(x * 10 ** (gain_db / 20))
        sf.write(out_wav, y, SR, subtype="PCM_16")
        ffmpeg("-i", str(out_wav), "-c:a", "libmp3lame", "-b:a", "192k", str(src))
        samples = len(decode(src, check))
        after = measure(check)
        err = TARGET_I - after["input_i"]
        if abs(err) <= 0.05:
            break
        gain_db += err
    rec = {
        "raw_lufs": before["input_i"], "raw_tp": before["input_tp"], "lufs": after["input_i"], "tp": after["input_tp"],
        "gain_db": round(gain_db, 2), "limited_db": round(limited_db, 2), "seconds": samples / SR, "bytes": src.stat().st_size,
    }
    print(f"{bid:12s} {rec['raw_lufs']:6.1f} -> {rec['lufs']:6.1f} LUFS   TP {rec['raw_tp']:5.1f} -> {rec['tp']:5.1f} dBTP   "
          f"gain {gain_db:+5.1f} dB   limited {limited_db:5.1f} dB   {rec['seconds']:.2f} s")
    return rec


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--beat")
    args = ap.parse_args()
    manifests = [json.loads(p.read_text(encoding="utf-8")) for p in MANIFESTS]
    ids = [args.beat] if args.beat else list(manifests[0])
    bad = []
    with tempfile.TemporaryDirectory() as t:
        for bid in ids:
            if not (VO / f"{bid}.mp3").exists():
                sys.exit(f"{bid}: public/vo/{bid}.mp3 missing")
            rec = process(bid, Path(t))
            for m in manifests:
                m.setdefault(bid, {})
                m[bid]["seconds"] = rec["seconds"]
                m[bid]["bytes"] = rec["bytes"]
                m[bid]["level"] = {"lufs": rec["lufs"], "tp": rec["tp"], "gain_db": rec["gain_db"], "limited_db": rec["limited_db"]}
            if rec["tp"] > MAX_TP or abs(rec["lufs"] - TARGET_I) > TOLERANCE:
                bad.append(bid)
    for p, m in zip(MANIFESTS, manifests):
        p.write_text(json.dumps(m, indent=2), encoding="utf-8")
    print(f"manifests updated: {', '.join(str(p.relative_to(ROOT)) for p in MANIFESTS)}")
    if bad:
        print(f"FAILED (above {MAX_TP} dBTP or outside {TARGET_I} +/- {TOLERANCE} LUFS): {', '.join(bad)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
