"""
Beat timing and the music gain curve, mirrored from `src/timing.ts` and `src/music.ts` so the Python audio
scripts (`music.py`, `stems.py`) agree with the composition to the frame. Keep the constants in step with the
TypeScript (FPS, LEAD, DEFAULT_GAP, TEMPO, TAIL, MUSIC, MASTER). Frame constants are written at the 30 fps design
rate and converted with `F()`, as in `src/theme.ts`.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FPS = 60


def F(frames_at_30: float) -> int:
    return round(frames_at_30 * FPS / 30)


TAIL = 60
DEFAULT_GAP = 5
LEAD = {
    "hook": 36,
    "problem1": 12,
    "product": 14,
    "categorise1": 8,
    "explain1": 6,
    "decide1": 6,
    "reconcile1": 8,
    "report": 6,
    "built1": 70,
    "judgement1": 12,
    "honest": 10,
    "close": 14,
}
MUSIC = {"bed": 0.42, "duck": 0.16, "intro": 0.55, "fadeFrames": F(60), "rampIn": F(10), "rampOut": F(16)}
MASTER = 0.934


def tempo() -> float:
    src = (ROOT / "src" / "timing.ts").read_text(encoding="utf-8")
    return float(re.search(r"export const TEMPO = ([0-9.]+);", src).group(1))


def beat_order() -> list[str]:
    src = (ROOT / "src" / "timing.ts").read_text(encoding="utf-8")
    block = re.search(r"export const BEAT_ORDER = \[(.*?)\] as const;", src, re.S).group(1)
    return re.findall(r'"([a-z0-9]+)"', block)


def beats() -> tuple[dict[str, dict], int]:
    manifest = json.loads((ROOT / "src" / "vo-manifest.json").read_text(encoding="utf-8"))
    t = tempo()
    cursor = 0
    out: dict[str, dict] = {}
    for bid in beat_order():
        seconds = (manifest.get(bid, {}).get("seconds") or 0) / t
        cursor += F(LEAD.get(bid, DEFAULT_GAP))
        duration = round(seconds * FPS)
        out[bid] = {"start": cursor, "duration": duration, "startSec": cursor / FPS, "seconds": seconds}
        cursor += duration
    return out, cursor + F(TAIL)


def clamp01(v: float) -> float:
    return min(1.0, max(0.0, v))


def music_gain(frame: float, b: dict[str, dict], total: int) -> float:
    voice = 0.0
    for v in b.values():
        a = clamp01((frame - (v["start"] - MUSIC["rampIn"])) / MUSIC["rampIn"])
        z = clamp01((v["start"] + v["duration"] + MUSIC["rampOut"] - frame) / MUSIC["rampOut"])
        voice = max(voice, min(a, z))
    first = next(iter(b.values()))["start"]
    rest = MUSIC["intro"] if frame < first - MUSIC["rampIn"] else MUSIC["bed"]
    g = rest + (MUSIC["duck"] - rest) * voice
    return g * clamp01((total - frame) / MUSIC["fadeFrames"])


if __name__ == "__main__":
    b, total = beats()
    for bid, v in b.items():
        print(f"{bid:12s} start {v['start']:5d}  ({v['startSec']:6.2f} s)  dur {v['duration']:4d}")
    print(f"total {total} frames = {total / FPS:.1f} s")
