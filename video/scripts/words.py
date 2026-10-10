"""
Word timings for every voice beat, so captions and the kinetic type land on the spoken word.

    py -3.13 video/scripts/words.py            # all beats -> video/src/vo-words.json
    py -3.13 video/scripts/words.py --beat hook

Runs faster-whisper (base.en, CPU, int8; open source, local, free) over `video/public/vo/<beat>.mp3`, then aligns
the recognised words to the script words of the beat (from `public/vo/manifest.json`, cues stripped) with difflib,
so the output keeps the script's spelling ("Xero's") while taking the timing from the audio. Words whisper did not
match get their time interpolated between their matched neighbours. Timings are seconds from the start of the file
at the file's own pace; `src/words.ts` divides by TEMPO and adds the beat start.

Also prints a quality check per beat: the recognised text and a similarity ratio to the script, so a garbled or
dropped word in a generated beat is caught before a render (the cloned voice's "Xero" is often heard as "Zero").
"""
from __future__ import annotations

import argparse
import difflib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VO = ROOT / "public" / "vo"
OUT = ROOT / "src" / "vo-words.json"


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


def align(script_words: list[str], heard: list[tuple[str, float, float]]) -> list[dict]:
    a = [norm(w) for w in script_words]
    b = [norm(w) for w, _, _ in heard]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    times: list[tuple[float, float] | None] = [None] * len(a)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                times[i1 + k] = (heard[j1 + k][1], heard[j1 + k][2])
        elif tag == "replace" and (i2 - i1) == (j2 - j1):
            # Same count, different spelling (Xero -> Zero): take the timing.
            for k in range(i2 - i1):
                times[i1 + k] = (heard[j1 + k][1], heard[j1 + k][2])
    # Interpolate the rest between matched neighbours (or the file bounds).
    first = heard[0][1] if heard else 0.0
    last = heard[-1][2] if heard else 0.0
    out: list[dict] = []
    i = 0
    while i < len(a):
        if times[i] is not None:
            s, e = times[i]
            out.append({"w": script_words[i], "s": round(s, 3), "e": round(e, 3), "m": 1})
            i += 1
            continue
        j = i
        while j < len(a) and times[j] is None:
            j += 1
        s0 = times[i - 1][1] if i > 0 and times[i - 1] else first
        e0 = times[j][0] if j < len(a) and times[j] else last
        n = j - i
        for k in range(n):
            ws = s0 + (e0 - s0) * k / n
            we = s0 + (e0 - s0) * (k + 1) / n
            out.append({"w": script_words[i + k], "s": round(ws, 3), "e": round(we, 3), "m": 0})
        i = j
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--beat")
    args = ap.parse_args()
    manifest = json.loads((VO / "manifest.json").read_text(encoding="utf-8"))
    existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    from faster_whisper import WhisperModel

    model = WhisperModel("base.en", device="cpu", compute_type="int8")
    ids = [args.beat] if args.beat else list(manifest)
    for bid in ids:
        path = VO / f"{bid}.mp3"
        if not path.exists():
            print(f"{bid}: missing", file=sys.stderr)
            continue
        segments, info = model.transcribe(str(path), word_timestamps=True, beam_size=5)
        heard = [(w.word.strip(), float(w.start), float(w.end)) for seg in segments for w in (seg.words or [])]
        script_words = manifest[bid]["text"].split()
        words = align(script_words, heard)
        matched = sum(w["m"] for w in words)
        ratio = difflib.SequenceMatcher(a=[norm(w) for w in script_words], b=[norm(w) for w, _, _ in heard]).ratio()
        existing[bid] = {"words": words, "heard": " ".join(w for w, _, _ in heard), "ratio": round(ratio, 3), "duration": round(info.duration, 3)}
        flag = "" if ratio >= 0.8 else "   <-- CHECK"
        print(f"{bid:12s} {info.duration:6.2f}s  matched {matched:2d}/{len(words):2d}  ratio {ratio:.2f}{flag}")
        print(f"             heard: {existing[bid]['heard']}")
    OUT.write_text(json.dumps(existing, indent=1), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
