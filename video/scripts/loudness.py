"""
Measure the soundtrack's loudness the way a platform does (EBU R128 via ffmpeg's loudnorm analysis pass):

    py -3.13 video/scripts/loudness.py                  # out/stems/voice.wav, music.wav, mix.wav and out/launch.mp4
    py -3.13 video/scripts/loudness.py out/final.mp4    # one file

Prints integrated loudness (LUFS), loudness range (LU) and true peak (dBTP) and checks the delivery target from
RULES.md section 5: -16 LUFS integrated (plus or minus 0.5 LU) and a true peak at or below -1.5 dBTP. The voice
stem is reported against the same target; the music stem is informational. The trim that lands the mix on target
is `MASTER` in `src/music.ts` (mirrored in `scripts/timing.py`), applied inside the composition, so the render
itself is on level and no post-processing pass touches the file. Needs no extra Python packages.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe"
TARGET_I = -16.0
TOLERANCE = 0.5
MAX_TP = -1.5


def measure(path: Path) -> dict[str, float]:
    cmd = [str(FFMPEG), "-hide_banner", "-nostats", "-i", str(path), "-vn", "-af", f"loudnorm=I={TARGET_I}:TP={MAX_TP}:LRA=11:print_format=json", "-f", "null", "-"]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True).stderr
    block = re.search(r"\{.*\}", out, re.S)
    if not block:
        raise RuntimeError(f"no loudnorm output for {path}")
    data = json.loads(block.group(0))
    return {k: float(data[k]) for k in ("input_i", "input_tp", "input_lra", "input_thresh")}


def main() -> int:
    files = [Path(a) for a in sys.argv[1:]] or [ROOT / "out" / "stems" / n for n in ("voice.wav", "music.wav", "mix.wav")] + [ROOT / "out" / "launch.mp4"]
    ok = True
    for f in files:
        if not f.is_absolute():
            f = ROOT / f
        if not f.exists():
            print(f"{f.name:12s} missing")
            continue
        m = measure(f)
        judged = f.name != "music.wav"
        within = abs(m["input_i"] - TARGET_I) <= TOLERANCE and m["input_tp"] <= MAX_TP
        verdict = ("ok" if within else "OUT OF RANGE") if judged else "info"
        ok = ok and (within or not judged)
        print(f"{f.name:12s} {m['input_i']:6.1f} LUFS   LRA {m['input_lra']:4.1f} LU   true peak {m['input_tp']:5.1f} dBTP   {verdict}")
    print(f"target {TARGET_I} LUFS (+/- {TOLERANCE}), true peak <= {MAX_TP} dBTP")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
