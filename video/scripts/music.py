"""
Synthesise the launch video's music bed in code: `py -3.13 video/scripts/music.py` -> video/public/music/bed.wav.

Why generated: no licence to clear, nothing downloaded, fully reproducible from this file (the reference tutorial's
route 7), and the arrangement follows the composition's own beat grid (`scripts/timing.py`), so the drums enter with
the product and leave for the engineering record without any manual edit.

Design (quiet, precise, forward; nothing that competes with the voice):
  92 BPM, D minor loop of four chords (Dm9, Bbmaj9, Fmaj9, Am9), two bars each. Layers: a detuned-saw pad through a
  slowly opening low-pass; a sine sub on the chord root; a triangle pluck on the chord tones with a ping-pong delay;
  a soft kick on beats one and three; an off-beat filtered-noise tick; a short synthetic reverb on the pad and pluck.
  Sections (from the beat grid): intro = pad + sub; product = everything; engineering = pad + pluck + sub pulses;
  "What is real" = pad only; close = pad + sub swell. Master soft-clipped and normalised to -18 dBFS RMS; the
  composition's gain curve (`src/music.ts`) ducks it under the voice and fades the end.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

from timing import FPS, beats

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "music" / "bed.wav"
SR = 44100
BPM = 92
BEAT = 60 / BPM
BAR = 4 * BEAT
SEED = 7

# Chords as MIDI notes (pad voicing); the sub plays the first note an octave down.
CHORDS = [
    [50, 53, 57, 60, 64],  # Dm9
    [46, 50, 53, 57, 60],  # Bbmaj9
    [53, 57, 60, 64, 67],  # Fmaj9
    [45, 48, 52, 55, 59],  # Am9
]
CHORD_BARS = 2


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def ramp(n: int, a: float, b: float) -> np.ndarray:
    return np.linspace(a, b, n, endpoint=False)


def env(n: int, attack: float, release: float, hold: float | None = None) -> np.ndarray:
    """Attack, hold, release in seconds; `hold` defaults to the rest of the buffer."""
    t = np.arange(n) / SR
    total = n / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    rel_start = (total - release) if hold is None else min(hold, total - release)
    r = np.clip((total - t) / max(release, 1e-4), 0, 1) if hold is None else np.clip(1 - (t - rel_start) / max(release, 1e-4), 0, 1)
    return a * r


def lowpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = butter(order, min(cutoff, SR / 2 - 100), "low", fs=SR, output="sos")
    return sosfilt(sos, x)


def highpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = butter(order, cutoff, "high", fs=SR, output="sos")
    return sosfilt(sos, x)


def saw(freq: float, n: int, phase: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR
    ph = t * freq + phase
    return 2 * (ph - np.floor(ph + 0.5))


def tri(freq: float, n: int) -> np.ndarray:
    t = np.arange(n) / SR
    return 2 * np.abs(2 * (t * freq - np.floor(t * freq + 0.5))) - 1


def sine(freq: float, n: int) -> np.ndarray:
    return np.sin(2 * np.pi * freq * np.arange(n) / SR)


def reverb(x: np.ndarray, seconds: float = 1.6, wet: float = 0.22) -> np.ndarray:
    rng = np.random.default_rng(SEED)
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * seconds / 4))
    ir = lowpass(ir, 4000)
    ir /= np.sqrt(np.sum(ir**2))
    tail = fftconvolve(x, ir)[: len(x)]
    return x + wet * tail


def section_gains(total_s: float) -> dict[str, np.ndarray]:
    """Per-layer gain envelopes over the whole bed, from the composition's beat grid; 2 s linear ramps."""
    b, _ = beats()
    s = {k: v["startSec"] for k, v in b.items()}
    n = int(total_s * SR)
    t = np.arange(n) / SR

    def between(a: float, z: float, ramp_s: float = 2.0) -> np.ndarray:
        up = np.clip((t - (a - ramp_s / 2)) / ramp_s, 0, 1)
        down = np.clip(((z + ramp_s / 2) - t) / ramp_s, 0, 1)
        return up * down

    product = between(s["product"] - 0.5, s["built1"] - 1.0)
    engineering = between(s["built1"] - 1.0, s["honest"] - 1.0)
    honest = between(s["honest"] - 1.0, s["close"] - 0.5)
    close = between(s["close"] - 0.5, total_s + 5)
    intro = between(-5, s["product"] - 0.5)
    return {
        "pad": 0.72 * intro + 0.85 * product + 0.9 * engineering + 0.8 * honest + 1.0 * close,
        "sub": 0.5 * intro + 0.8 * product + 0.55 * engineering + 0.0 * honest + 0.7 * close,
        "pluck": 0.0 * intro + 0.55 * product + 0.4 * engineering,
        "kick": 0.6 * product,
        "tick": 0.5 * product,
        "pulse": 1.0 * engineering,  # the sub pulses instead of holding
        "open": np.clip((t - 2) / 16, 0, 1) * 0.6 + 0.4 * product + 0.3 * close,  # filter opening
    }


def render(total_s: float) -> np.ndarray:
    n = int(total_s * SR)
    gains = section_gains(total_s)
    left = np.zeros(n)
    right = np.zeros(n)
    chord_len = int(CHORD_BARS * BAR * SR)
    n_chords = math.ceil(n / chord_len) + 1

    # Pad: two detuned saws per note, slow attack, overlapped chord changes, low-passed per chord.
    pad_l = np.zeros(n + chord_len)
    pad_r = np.zeros(n + chord_len)
    for ci in range(n_chords):
        chord = CHORDS[ci % len(CHORDS)]
        start = ci * chord_len
        seg_n = chord_len + int(2.5 * SR)  # overlap into the next chord
        e = env(seg_n, attack=1.4, release=2.4, hold=chord_len / SR)
        buf_l = np.zeros(seg_n)
        buf_r = np.zeros(seg_n)
        for k, note in enumerate(chord):
            f = hz(note)
            a = saw(f * (1 - 0.0035), seg_n, phase=0.13 * k)
            b2 = saw(f * (1 + 0.0035), seg_n, phase=0.41 * k)
            pan = (k - 2) / 2 * 0.35
            buf_l += (a + b2) * (0.5 - pan / 2)
            buf_r += (a + b2) * (0.5 + pan / 2)
        cutoff = 520 + 380 * ((ci % 4) / 3)
        buf_l = lowpass(buf_l, cutoff) * e
        buf_r = lowpass(buf_r, cutoff * 1.05) * e
        end = min(start + seg_n, n + chord_len)
        pad_l[start:end] += buf_l[: end - start]
        pad_r[start:end] += buf_r[: end - start]
    pad_l = pad_l[:n]
    pad_r = pad_r[:n]
    # Filter opening over time: blend a brighter copy in.
    bright_l = highpass(pad_l, 700) * 0.5
    bright_r = highpass(pad_r, 700) * 0.5
    open_g = gains["open"]
    pad_l = pad_l + bright_l * open_g
    pad_r = pad_r + bright_r * open_g
    pad_l = reverb(pad_l, 1.8, 0.25)
    pad_r = reverb(pad_r * 0.98, 1.8, 0.25)
    g = gains["pad"] * 0.11
    left += pad_l * g
    right += pad_r * g

    # Sub: sine on the chord root an octave down; held in the intro and product, pulsing on beats 1 and 3 elsewhere.
    sub = np.zeros(n)
    for ci in range(n_chords):
        chord = CHORDS[ci % len(CHORDS)]
        start = ci * chord_len
        seg_n = min(chord_len, n - start)
        if seg_n <= 0:
            break
        sub[start : start + seg_n] += sine(hz(chord[0] - 12), seg_n) * env(seg_n, 0.08, 0.25)
    t = np.arange(n) / SR
    beat_phase = (t / BEAT) % 2
    pulse = np.exp(-beat_phase / 0.45)
    sub_env = (1 - gains["pulse"]) * 1.0 + gains["pulse"] * pulse
    sub_sig = sub * sub_env * gains["sub"] * 0.22
    left += sub_sig
    right += sub_sig

    # Pluck: eighth-note chord tones (up an octave), triangle with a fast decay, ping-pong delay at a dotted eighth.
    pluck = np.zeros(n)
    step = BEAT / 2
    note_n = int(0.45 * SR)
    decay = np.exp(-np.arange(note_n) / (SR * 0.14))
    i = 0
    while i * step < total_s:
        ci = int((i * step) // (CHORD_BARS * BAR))
        chord = CHORDS[ci % len(CHORDS)]
        pattern = [0, 2, 4, 2, 1, 3, 4, 3]
        note = chord[pattern[i % 8]] + 12
        start = int(i * step * SR)
        end = min(start + note_n, n)
        if end > start:
            vel = 0.9 if i % 4 == 0 else 0.6
            pluck[start:end] += tri(hz(note), end - start) * decay[: end - start] * vel
        i += 1
    pluck = lowpass(pluck, 2600)
    d = int(BEAT * 0.75 * SR)
    pl = pluck.copy()
    pr = pluck.copy() * 0.85
    pl[d:] += 0.35 * pluck[:-d]
    pr[2 * d :] += 0.22 * pluck[: -2 * d]
    pl = reverb(pl, 1.2, 0.18)
    pr = reverb(pr, 1.2, 0.18)
    g = gains["pluck"] * 0.09
    left += pl * g
    right += pr * g

    # Kick: beats one and three, pitch falling 90 -> 42 Hz, soft.
    kick = np.zeros(n)
    kn = int(0.32 * SR)
    kt = np.arange(kn) / SR
    kfreq = 42 + 48 * np.exp(-kt / 0.045)
    kphase = np.cumsum(2 * np.pi * kfreq / SR)
    kick_one = np.sin(kphase) * np.exp(-kt / 0.11)
    i = 0
    while i * 2 * BEAT < total_s:
        start = int(i * 2 * BEAT * SR)
        end = min(start + kn, n)
        kick[start:end] += kick_one[: end - start]
        i += 1
    ks = kick * gains["kick"] * 0.3
    left += ks
    right += ks

    # Tick: filtered-noise burst on the off-beats, very low.
    rng = np.random.default_rng(SEED + 1)
    tick = np.zeros(n)
    tn = int(0.03 * SR)
    burst = rng.standard_normal(tn) * np.exp(-np.arange(tn) / (SR * 0.006))
    burst = highpass(burst, 7000, 4)
    i = 0
    while (i + 0.5) * BEAT < total_s:
        start = int((i + 0.5) * BEAT * SR)
        end = min(start + tn, n)
        tick[start:end] += burst[: end - start]
        i += 1
    ts = tick * gains["tick"] * 0.12
    left += ts * 0.9
    right += ts * 1.1

    stereo = np.stack([left, right], axis=1)
    stereo = np.tanh(stereo * 1.4) / 1.4
    rms = np.sqrt(np.mean(stereo**2))
    target = 10 ** (-18 / 20)
    stereo *= target / max(rms, 1e-9)
    stereo = np.clip(stereo, -0.98, 0.98)
    return stereo


def main() -> None:
    _, total_frames = beats()
    total_s = total_frames / FPS + 3
    audio = render(total_s)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    sf.write(OUT, audio, SR, subtype="PCM_16")
    rms = 20 * math.log10(math.sqrt(float(np.mean(audio**2))))
    print(f"wrote {OUT}: {total_s:.1f} s, RMS {rms:.1f} dBFS, peak {20 * math.log10(float(np.max(np.abs(audio)))):.1f} dBFS")


if __name__ == "__main__":
    main()
