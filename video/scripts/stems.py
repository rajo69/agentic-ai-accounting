"""
Export the soundtrack as separate stems, so the voice and the music can be judged and re-levelled apart:

    py -3.13 video/scripts/stems.py        -> video/out/stems/voice.wav, music.wav, mix.wav (+ levels printed)

voice.wav: every beat MP3 placed at its composition start, time-stretched by TEMPO with ffmpeg's atempo (pitch
preserved, the same filter Remotion uses). music.wav: `public/music/bed.wav` through the composition's gain curve
(`scripts/timing.py` mirrors `src/music.ts`). mix.wav: the two summed, which is what the render carries. The levels
printed at the end (voice RMS over the spoken parts, music RMS under the voice and in the gaps) are the check for
RULES.md section 5: the bed sits about 16 dB under the voice.
"""
from __future__ import annotations

import math
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from timing import FPS, beats, music_gain, tempo

ROOT = Path(__file__).resolve().parents[1]
VO = ROOT / "public" / "vo"
BED = ROOT / "public" / "music" / "bed.wav"
OUT = ROOT / "out" / "stems"
FFMPEG = ROOT / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe"
SR = 44100


def decode(path: Path, rate: float) -> np.ndarray:
    """MP3 -> stereo float at SR, stretched by `rate` (atempo keeps the pitch). Remotion's ffmpeg build has no raw
    muxer, so it goes through a temporary WAV."""
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "clip.wav"
        cmd = [str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y", "-i", str(path), "-filter:a", f"atempo={rate}", "-ac", "2", "-ar", str(SR), str(wav)]
        subprocess.run(cmd, capture_output=True, check=True)
        data, sr = sf.read(wav)
    assert sr == SR, sr
    return data if data.ndim == 2 else np.stack([data, data], axis=1)


def db(x: np.ndarray) -> float:
    return 20 * math.log10(math.sqrt(float(np.mean(x**2))) + 1e-12)


def main() -> None:
    b, total = beats()
    rate = tempo()
    n = int(total / FPS * SR)
    voice = np.zeros((n, 2))
    spoken = np.zeros(n, dtype=bool)
    for bid, v in b.items():
        path = VO / f"{bid}.mp3"
        if not path.exists():
            print(f"{bid}: missing")
            continue
        clip = decode(path, rate)
        start = int(v["start"] / FPS * SR)
        end = min(start + len(clip), n)
        voice[start:end] += clip[: end - start]
        spoken[start:end] = True
    bed, bsr = sf.read(BED)
    assert bsr == SR, bsr
    if bed.ndim == 1:
        bed = np.stack([bed, bed], axis=1)
    music = np.zeros((n, 2))
    m = min(len(bed), n)
    frames = np.arange(m) / SR * FPS
    gain = np.array([music_gain(f, b, total) for f in frames[:: SR // 100]])  # one value per 10 ms
    gain = np.interp(np.arange(m), np.arange(len(gain)) * (SR // 100), gain)
    music[:m] = bed[:m] * gain[:, None]
    mix = voice + music
    peak = float(np.max(np.abs(mix)))
    if peak > 0.98:
        print(f"mix peak {20 * math.log10(peak):.1f} dBFS: scaled down")
        mix *= 0.98 / peak
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in (("voice", voice), ("music", music), ("mix", mix)):
        sf.write(OUT / f"{name}.wav", data, SR, subtype="PCM_16")
    print(f"voice RMS (spoken parts)   {db(voice[spoken]):6.1f} dBFS")
    print(f"music RMS under the voice  {db(music[spoken]):6.1f} dBFS")
    print(f"music RMS in the gaps      {db(music[~spoken]):6.1f} dBFS")
    print(f"mix RMS                    {db(mix):6.1f} dBFS   peak {20 * math.log10(float(np.max(np.abs(mix)))):6.1f} dBFS")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
