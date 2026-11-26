#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_audio.py -- procedural audio generator for Roadside Story.

ALL AUDIO PRODUCED BY THIS SCRIPT IS ORIGINAL PROCEDURAL SYNTHESIS.
No samples, recordings or third-party material are used: every sound is
computed from oscillators, envelopes and seeded noise below, and every melody
/ chord sequence was written for this project. The output is license-free
(use, modify and ship without attribution).

This is 1st-pass placeholder-grade audio intended to be replaceable: file
names, formats and loop lengths are the contract; swap any file for a better
one at any time.

Usage:   python3 tools/gen_audio.py            (from anywhere)
Needs:   Python 3, numpy, ffmpeg (for OGG Vorbis encoding)
Output:  assets/audio/sfx/*.wav   22050 Hz mono 16-bit, one-shots
         assets/audio/bgm/*.ogg   32000 Hz mono Vorbis q3, seamless loops
         assets/audio/amb/*.ogg   32000 Hz mono Vorbis q3, seamless loops
Deterministic: fixed seed, bit-exact ffmpeg flags.

Seamless loops: every loop is composed into a buffer that is a whole number
of bars long; note tails, echoes and filters wrap around (circular mixing /
FFT-domain filtering), so the end of the buffer flows into its start.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import wave
import zlib

import numpy as np

SEED = 20261126
SR_SFX = 22050
SR_LOOP = 32000
FFMPEG = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(ROOT, "assets", "audio")
DIR_SFX = os.path.join(OUT, "sfx")
DIR_BGM = os.path.join(OUT, "bgm")
DIR_AMB = os.path.join(OUT, "amb")

PEAK_SFX_DB = -6.0
PEAK_BGM_DB = -9.0
PEAK_AMB_DB = -18.0
SIZE_BUDGET = 5 * 1024 * 1024


# --------------------------------------------------------------------------
# small utilities
# --------------------------------------------------------------------------
def rng_for(name):
    """Independent, reproducible random stream per asset."""
    return np.random.default_rng([SEED, zlib.crc32(name.encode("utf-8"))])


def db(x):
    return 20.0 * np.log10(max(float(x), 1e-12))


def from_db(d):
    return 10.0 ** (d / 20.0)


def mtof(m):
    """MIDI note number -> Hz."""
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=np.float64) - 69.0) / 12.0)


def normalize(x, peak_db):
    p = np.max(np.abs(x))
    return x if p <= 0 else x * (from_db(peak_db) / p)


def fft_filter(x, sr, lo=None, hi=None, order=2):
    """Zero-phase Butterworth-shaped filter applied in the FFT domain.
    Being circular, it keeps a looping buffer seamless."""
    n = len(x)
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1.0 / sr)
    h = np.ones_like(f)
    if hi is not None:
        h /= np.sqrt(1.0 + (f / hi) ** (2 * order))
    if lo is not None:
        h /= np.sqrt(1.0 + (lo / np.maximum(f, 1e-6)) ** (2 * order))
    return np.fft.irfft(spec * h, n)


def noise(rng, n, sr, lo=None, hi=None, order=2):
    """Band-limited white noise, unit peak-ish (periodic over n samples)."""
    x = fft_filter(rng.standard_normal(n), sr, lo, hi, order)
    return x / (np.max(np.abs(x)) + 1e-12)


def soft_limit(x, drive=0.6):
    """Very mild memoryless saturation to tame stray peaks (loop-safe)."""
    p = np.percentile(np.abs(x), 99.9)
    return x if p <= 0 else np.tanh(x / p * drive)


# --------------------------------------------------------------------------
# core synthesis helpers: osc, env, note, mix
# --------------------------------------------------------------------------
# Band-limited additive oscillators: (harmonic number, amplitude, use_cos)
_HARM = {
    "sine": [(1, 1.0)],
    # triangle: odd harmonics, 1/k^2, alternating sign
    "tri": [(k, (8 / np.pi ** 2) * (-1) ** ((k - 1) // 2) / k ** 2) for k in (1, 3, 5, 7, 9)],
    # soft square: odd harmonics with a steeper roll-off than a real square
    "square": [(k, 1.0 / k ** 1.6) for k in (1, 3, 5, 7)],
    # filtered 25 % pulse: a little nasal, rolled off
    "pulse": [(k, (2 / (k * np.pi)) * np.sin(k * np.pi * 0.25) / (1 + (k / 6.0) ** 2))
              for k in range(1, 9)],
    # warm organ-ish tone for pads
    "warm": [(1, 1.0), (2, 0.28), (3, 0.10), (4, 0.04)],
}


def osc(kind, freq, n, sr, phase=0.0):
    """Band-limited oscillator. freq may be a scalar or a per-sample array."""
    if np.isscalar(freq):
        ph = 2 * np.pi * freq * np.arange(n) / sr + phase
        fmax = float(freq)
    else:
        freq = np.asarray(freq, dtype=np.float64)[:n]
        ph = 2 * np.pi * np.cumsum(freq) / sr + phase
        fmax = float(np.max(freq)) if n else 0.0
    out = np.zeros(n)
    for k, amp in _HARM[kind]:
        if k * fmax < 0.45 * sr:          # never alias
            out += amp * np.sin(k * ph)
    return out


def env(n, sr, a=0.005, d=0.06, s=0.7, r=0.08, tau=None):
    """ADSR envelope of n samples (release occupies the last r seconds).
    Optional extra exponential decay `tau` (seconds) for plucked/bell tones."""
    t = np.arange(n) / sr
    na = max(1, int(a * sr))
    nr = max(1, min(int(r * sr), n))
    e = np.where(t < a, 0.5 - 0.5 * np.cos(np.pi * np.minimum(t / max(a, 1e-6), 1.0)),
                 s + (1.0 - s) * np.exp(-np.maximum(t - a, 0) / max(d, 1e-6) * 3.0))
    e[:na] = np.minimum(e[:na], 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na))
    rel = 0.5 + 0.5 * np.cos(np.pi * np.arange(nr) / nr)
    e[n - nr:] *= rel
    if tau is not None:
        e *= np.exp(-t / tau)
    return e


def note(freq, dur, sr, kind="tri", a=0.005, d=0.06, s=0.7, r=0.08, tau=None,
         slide=None, f_end=None, vib=None, trem=None):
    """One enveloped tone of `dur` seconds (+ release tail r).
    slide=(ratio, time): start at freq*ratio and glide to freq within `time`.
    f_end: glide geometrically from freq to f_end across the whole note.
    vib=(rate_hz, depth_semitones, delay_s); trem=(rate_hz, depth 0..1)."""
    n = max(8, int((dur + r) * sr))
    t = np.arange(n) / sr
    f = np.full(n, float(freq))
    if f_end is not None:
        f = freq * (f_end / freq) ** np.minimum(t / max(dur, 1e-6), 1.0)
    if slide is not None:
        ratio, st = slide
        f = f * ratio ** np.exp(-t / max(st, 1e-6) * 4.0)
    if vib is not None:
        rate, depth, delay = vib
        fade = np.clip((t - delay) / 0.25, 0.0, 1.0)
        f = f * 2.0 ** (depth * fade * np.sin(2 * np.pi * rate * t) / 12.0)
    x = osc(kind, f, n, sr) * env(n, sr, a, d, s, r, tau)
    if trem is not None:
        rate, depth = trem
        x *= 1.0 - depth * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t))
    return x


def mix(buf, sig, start, gain=1.0, wrap=False):
    """Add sig into buf at sample offset start. With wrap=True anything past
    the end of buf folds back to its start (seamless loop tails)."""
    n = len(buf)
    start = int(round(start))
    if not wrap:
        if start < 0:
            sig, start = sig[-start:], 0
        m = min(len(sig), n - start)
        if m > 0:
            buf[start:start + m] += sig[:m] * gain
        return buf
    pos, i = start % n, 0
    while i < len(sig):
        m = min(len(sig) - i, n - pos)
        buf[pos:pos + m] += sig[i:i + m] * gain
        i += m
        pos = 0
    return buf


def layer(*sigs):
    """Sum signals of different lengths (all starting at t=0)."""
    out = np.zeros(max(len(x) for x in sigs))
    for x in sigs:
        out[:len(x)] += x
    return out


def bell(freq, dur, sr, tau=0.5, bright=0.25):
    """Soft bell / music-box tone: sine + quickly dying upper partials."""
    x = note(freq, dur, sr, "sine", a=0.003, d=0.05, s=1.0, r=0.06, tau=tau)
    x += bright * note(freq * 3.0, dur, sr, "sine", a=0.002, d=0.05, s=1.0, r=0.06, tau=tau * 0.25)
    x += 0.5 * bright * note(freq * 2.0, dur, sr, "sine", a=0.003, d=0.05, s=1.0, r=0.06, tau=tau * 0.5)
    return x


def echo_wrap(x, delay, gain, repeats=2):
    """Circular feed-forward echo (loop-safe)."""
    y = np.zeros_like(x)
    for i in range(1, repeats + 1):
        y += np.roll(x, int(round(delay * i))) * gain ** i
    return y


# --------------------------------------------------------------------------
# file output: write_wav, encode_ogg
# --------------------------------------------------------------------------
def to_int16(x):
    return np.clip(np.round(x * 32767.0), -32768, 32767).astype("<i2")


def write_wav(path, x, sr):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(to_int16(x).tobytes())
    return path


_ENCODER = {"name": None}


def encode_ogg(path_noext, x, sr):
    """Encode mono float buffer to OGG Vorbis (q3). Tries libvorbis, then the
    native ffmpeg vorbis encoder, and finally falls back to a 22050 Hz WAV.
    Returns (path written, encoder label)."""
    os.makedirs(os.path.dirname(path_noext), exist_ok=True)
    out = path_noext + ".ogg"
    with tempfile.TemporaryDirectory() as td:
        tmp = write_wav(os.path.join(td, "in.wav"), x, sr)
        base = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", tmp,
                "-ac", "1", "-ar", str(sr), "-map_metadata", "-1",
                "-fflags", "+bitexact", "-flags:a", "+bitexact"]
        tries = [("libvorbis", ["-c:a", "libvorbis", "-q:a", "3"]),
                 ("vorbis (native)", ["-c:a", "vorbis", "-strict", "-2", "-q:a", "3"])]
        if _ENCODER["name"] == "vorbis (native)":
            tries = tries[1:]
        for label, args in tries:
            try:
                r = subprocess.run(base + args + [out], capture_output=True)
            except OSError:
                break
            if r.returncode == 0 and os.path.getsize(out) > 0:
                _ENCODER["name"] = label
                return out, label
    # last resort: plain WAV at 22050 Hz (resampled in the FFT domain)
    if os.path.exists(out):
        os.remove(out)
    m = int(round(len(x) * SR_SFX / sr))
    spec = np.fft.rfft(x)[: m // 2 + 1]
    y = np.fft.irfft(spec, m) * (m / len(x))
    _ENCODER["name"] = "WAV fallback"
    return write_wav(path_noext + ".wav", y, SR_SFX), "WAV fallback (no vorbis encoder)"


def decode_audio(path):
    """Decode any file back to float mono via ffmpeg (used for verification)."""
    if path.endswith(".wav"):
        with wave.open(path, "rb") as w:
            sr = w.getframerate()
            data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2")
        return data.astype(np.float64) / 32768.0, sr
    r = subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-i", path,
                        "-f", "s16le", "-ac", "1", "-ar", str(SR_LOOP), "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype="<i2").astype(np.float64) / 32768.0, SR_LOOP


# --------------------------------------------------------------------------
# A) SFX
# --------------------------------------------------------------------------
def trim(x, sr, head_db=-54.0, tail_db=-50.0):
    """Trim leading/trailing near-silence and add tiny safety fades."""
    p = np.max(np.abs(x))
    idx = np.nonzero(np.abs(x) > p * from_db(head_db))[0]
    idt = np.nonzero(np.abs(x) > p * from_db(tail_db))[0]
    x = x[idx[0]: idt[-1] + 1].copy()
    nf = min(len(x) // 2, int(0.001 * sr))
    nt = min(len(x) // 2, int(0.006 * sr))
    x[:nf] *= np.linspace(0, 1, nf)
    x[-nt:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, nt))
    return x


def seq(sr, total, events):
    """Lay out (time_s, signal, gain) events on a buffer of `total` seconds."""
    buf = np.zeros(int(total * sr))
    for t, sig, g in events:
        mix(buf, sig, t * sr, g)
    return buf


def sfx_click(sr, rng):
    return (note(1150, 0.012, sr, "sine", a=0.001, r=0.02, tau=0.012, slide=(1.35, 0.01))
            + 0.4 * note(575, 0.012, sr, "tri", a=0.001, r=0.02, tau=0.010))


def sfx_path(sr, rng):
    return note(820, 0.010, sr, "tri", a=0.001, r=0.018, tau=0.009, slide=(1.2, 0.006))


def sfx_error(sr, rng):
    def blip(f):
        return (note(f, 0.085, sr, "square", a=0.006, d=0.05, s=0.6, r=0.05, slide=(1.04, 0.03))
                + 0.6 * note(f, 0.085, sr, "sine", a=0.006, r=0.05))
    return seq(sr, 0.5, [(0.0, blip(mtof(58)), 1.0), (0.15, blip(mtof(55)), 0.9)])


def sfx_build(sr, rng):
    n = int(0.05 * sr)
    knock = noise(rng, n, sr, 150, 1400) * np.exp(-np.arange(n) / sr / 0.010)
    thunk = note(170, 0.09, sr, "sine", a=0.002, r=0.05, tau=0.045, f_end=72)
    wood = note(410, 0.03, sr, "tri", a=0.001, r=0.03, tau=0.018)
    blip = note(mtof(79), 0.13, sr, "tri", a=0.006, d=0.08, s=0.5, r=0.12, slide=(0.67, 0.07))
    return seq(sr, 0.6, [(0, thunk, 1.0), (0, knock, 0.35), (0, wood, 0.3), (0.11, blip, 0.55)])


def sfx_demolish(sr, rng):
    ev = []
    for i, m in enumerate([67, 62, 58, 53, 48, 43]):
        g = 0.75 * 0.82 ** i
        ev.append((0.065 * i + rng.uniform(0, 0.01),
                   note(mtof(m), 0.04, sr, "tri", a=0.003, r=0.05, tau=0.04, slide=(1.25, 0.03)), g))
    n = int(0.5 * sr)
    t = np.arange(n) / sr
    grains = (rng.random(n) < 0.012).astype(float) * rng.uniform(0.3, 1.0, n)
    crumble = fft_filter(np.convolve(grains, np.exp(-np.arange(200) / 40.0), "same")
                         * rng.standard_normal(n), sr, 180, 1800)
    crumble = crumble / np.max(np.abs(crumble)) * np.exp(-t / 0.16) * (1 - np.exp(-t / 0.01))
    ev.append((0.0, crumble, 0.45))
    return seq(sr, 0.6, ev)


def _arp(sr, midis, step, last, kind="tri", gain_sine=0.5, r=0.12):
    ev = []
    for i, m in enumerate(midis):
        d = last if i == len(midis) - 1 else step
        tone = (note(mtof(m), d, sr, kind, a=0.004, d=0.1, s=0.55, r=r)
                + gain_sine * note(mtof(m), d, sr, "sine", a=0.004, d=0.1, s=0.6, r=r))
        ev.append((i * step, tone, 0.8 + 0.2 * i / max(1, len(midis) - 1)))
    return seq(sr, step * len(midis) + last + r + 0.1, ev)


def sfx_upgrade(sr, rng):
    return _arp(sr, [72, 76, 79], 0.105, 0.18)


def sfx_staff_up(sr, rng):
    ev = [(0.055 * i, note(mtof(m), 0.05, sr, "square", a=0.003, d=0.05, s=0.5, r=0.04,
                           slide=(0.94, 0.02)), 0.7) for i, m in enumerate([65, 69, 72])]
    top = (note(mtof(77), 0.2, sr, "square", a=0.004, d=0.12, s=0.45, r=0.14, vib=(7, 0.12, 0.05))
           + 0.7 * note(mtof(77), 0.2, sr, "sine", a=0.004, r=0.14)
           + 0.25 * note(mtof(84), 0.2, sr, "sine", a=0.01, r=0.14, tau=0.15))
    ev.append((0.165, top, 0.9))
    return seq(sr, 0.6, ev)


def sfx_sale(sr, rng):
    a = note(mtof(83), 0.03, sr, "sine", a=0.003, r=0.03, tau=0.03)
    b = bell(mtof(88), 0.07, sr, tau=0.05, bright=0.08)
    return seq(sr, 0.3, [(0, a, 0.6), (0.04, b, 1.0)])


def sfx_money(sr, rng):
    a = layer(bell(mtof(83), 0.06, sr, tau=0.06, bright=0.3), 0.2 * note(mtof(83), 0.05, sr, "square", r=0.03, tau=0.03))
    b = layer(bell(mtof(88), 0.22, sr, tau=0.11, bright=0.3), 0.2 * note(mtof(88), 0.06, sr, "square", r=0.03, tau=0.04))
    return seq(sr, 0.5, [(0, a, 0.8), (0.085, b, 1.0), (0.17, bell(mtof(95), 0.12, sr, tau=0.06, bright=0.0), 0.12)])


def sfx_research_done(sr, rng):
    ev = []
    for t, m, d in [(0.0, 67, 0.10), (0.12, 72, 0.10), (0.24, 76, 0.10), (0.40, 79, 0.26)]:
        tone = (note(mtof(m), d, sr, "pulse", a=0.004, d=0.1, s=0.55, r=0.13)
                + 0.9 * note(mtof(m), d, sr, "tri", a=0.004, d=0.1, s=0.6, r=0.13))
        ev.append((t, tone, 0.9))
    ev.append((0.40, note(mtof(72), 0.26, sr, "tri", a=0.01, s=0.6, r=0.13), 0.45))
    ev.append((0.40, note(mtof(48), 0.26, sr, "sine", a=0.01, s=0.8, r=0.13), 0.4))
    return seq(sr, 0.9, ev)


def sfx_discovery(sr, rng):
    ev = []
    run = [72, 76, 79, 83, 86, 88, 91]
    for i, m in enumerate(run):
        tone = layer(bell(mtof(m), 0.10, sr, tau=0.16, bright=0.18), 0.25 * note(mtof(m), 0.06, sr, "tri", r=0.05))
        ev.append((0.068 * i, tone, 0.6 + 0.05 * i))
        ev.append((0.068 * i + 0.20, tone, 0.16))            # soft echo
    t0 = 0.068 * len(run)
    for m, g, rate in [(84, 0.42, 9.0), (88, 0.42, 11.0), (91, 0.36, 13.0), (96, 0.18, 15.0)]:
        sh = note(mtof(m), 0.45, sr, "sine", a=0.02, d=0.3, s=0.6, r=0.22, tau=0.38, trem=(rate, 0.7))
        ev.append((t0, sh, g))
    for k in range(5):                                        # twinkles
        m = [91, 96, 88, 95, 91][k]
        ev.append((t0 + 0.07 + 0.085 * k, bell(mtof(m), 0.05, sr, tau=0.07, bright=0.05), 0.20 - 0.025 * k))
    ev.append((t0, note(mtof(60), 0.45, sr, "tri", a=0.02, s=0.6, r=0.22, tau=0.5), 0.3))
    return seq(sr, 1.35, ev)


def sfx_rank_up(sr, rng):
    ev = []

    def lead(m, d, r=0.12):
        return (note(mtof(m), d, sr, "pulse", a=0.012, d=0.12, s=0.6, r=r, vib=(5.5, 0.10, 0.18))
                + 1.1 * note(mtof(m), d, sr, "tri", a=0.012, d=0.12, s=0.7, r=r))

    def pad(ms, d, r=0.25):
        return sum(note(mtof(m), d, sr, "warm", a=0.03, d=0.2, s=0.75, r=r) for m in ms)

    mel = [(0.00, 67, 0.13), (0.15, 72, 0.13), (0.30, 76, 0.13), (0.45, 79, 0.40),
           (0.90, 77, 0.17), (1.10, 81, 0.17), (1.30, 79, 0.12), (1.45, 83, 0.12), (1.60, 84, 0.42)]
    for t, m, d in mel:
        ev.append((t, lead(m, d, 0.30 if t >= 1.6 else 0.12), 0.55))
    for t, d, ms, bass in [(0.0, 0.88, [60, 64, 67], 48), (0.9, 0.38, [60, 65, 69], 41),
                           (1.3, 0.28, [62, 67, 71], 43), (1.6, 0.42, [64, 67, 72], 48)]:
        r = 0.32 if t >= 1.6 else 0.1
        ev.append((t, pad(ms, d, r), 0.16))
        ev.append((t, note(mtof(bass), d, sr, "tri", a=0.01, s=0.8, r=r)
                   + note(mtof(bass), d, sr, "sine", a=0.01, s=0.9, r=r), 0.3))
    for i, m in enumerate([84, 88, 91, 96]):                  # closing sparkle
        ev.append((1.66 + 0.06 * i, bell(mtof(m), 0.1, sr, tau=0.14, bright=0.05), 0.13))
    return seq(sr, 2.45, ev)


def sfx_perk(sr, rng):
    ev = []
    for i, m in enumerate([64, 71, 76, 80, 83, 90]):          # Eadd9, rolled
        tone = note(mtof(m), 0.35, sr, "sine", a=0.008, d=0.3, s=0.5, r=0.3, tau=0.45, trem=(6.0, 0.35))
        tone = layer(tone, 0.25 * note(mtof(m), 0.2, sr, "tri", a=0.005, r=0.2, tau=0.15))
        ev.append((0.022 * i, tone, 0.5 if i else 0.6))
    gl = note(mtof(88), 0.16, sr, "sine", a=0.01, r=0.08, tau=0.12, f_end=mtof(100))
    ev.append((0.02, gl, 0.12))
    return seq(sr, 0.95, ev)


def sfx_codex(sr, rng):
    n = int(0.26 * sr)
    t = np.arange(n) / sr
    x = t / t[-1]
    lo_band = noise(rng, n, sr, 500, 1800)
    hi_band = noise(rng, n, sr, 1800, 5200)
    flip = (lo_band * (1 - x) ** 1.5 + hi_band * x ** 1.2 * 0.8)
    flip *= np.sin(np.pi * x ** 0.7) ** 2 * (1 + 0.35 * np.sin(2 * np.pi * 31 * t))
    return seq(sr, 0.65, [(0.0, flip, 0.5), (0.2, bell(mtof(81), 0.2, sr, tau=0.13, bright=0.15), 0.8),
                          (0.2, bell(mtof(88), 0.15, sr, tau=0.09, bright=0.0), 0.2)])


def sfx_car(sr, rng):
    n = int(0.62 * sr)
    t = np.arange(n) / sr
    x = t / t[-1]
    swell = np.sin(np.pi * x ** 0.8) ** 2.2
    whoosh = noise(rng, n, sr, 90, 650) * swell
    air = noise(rng, n, sr, 500, 1500) * swell ** 2 * 0.25
    f = 82.0 * (0.80 / 1.0) ** x * (1 + 0.02 * np.sin(2 * np.pi * 23 * t))   # doppler-ish drop
    eng = (osc("tri", f, n, sr) + 0.5 * osc("sine", f * 2, n, sr)) * swell * 0.55
    return whoosh + air + eng


def sfx_toast(sr, rng):
    return layer(note(660, 0.045, sr, "sine", a=0.004, r=0.05, tau=0.035, slide=(0.45, 0.03)),
                 0.25 * note(1320, 0.03, sr, "sine", a=0.004, r=0.03, tau=0.02, slide=(0.5, 0.03)))


def sfx_goal(sr, rng):
    a = layer(bell(mtof(76), 0.14, sr, tau=0.16, bright=0.2), 0.3 * note(mtof(76), 0.1, sr, "tri", r=0.08, tau=0.1))
    b = layer(bell(mtof(81), 0.28, sr, tau=0.16, bright=0.2), 0.3 * note(mtof(81), 0.12, sr, "tri", r=0.08, tau=0.1))
    return seq(sr, 0.62, [(0, a, 0.85), (0.15, b, 1.0), (0.15, bell(mtof(69), 0.28, sr, tau=0.18, bright=0.0), 0.3)])


def sfx_jingle(sr, rng):
    ev = []

    def lead(m, d, r=0.12):
        return (note(mtof(m), d, sr, "square", a=0.006, d=0.12, s=0.5, r=r, vib=(6, 0.10, 0.2))
                + 1.2 * note(mtof(m), d, sr, "tri", a=0.006, d=0.12, s=0.65, r=r))

    mel = [(0.0, 76, 0.16), (0.2, 79, 0.16), (0.4, 84, 0.34), (0.8, 81, 0.16), (1.0, 84, 0.16),
           (1.2, 86, 0.34), (1.6, 83, 0.16), (1.8, 86, 0.16), (2.0, 84, 0.62)]
    for t, m, d in mel:
        ev.append((t, lead(m, d, 0.4 if t >= 2.0 else 0.1), 0.5))
        ev.append((t, lead(m - (8 if m in (76, 81, 84) and t < 2 else 9 if t < 2 else 5), d,
                        0.4 if t >= 2.0 else 0.1), 0.2))    # lower harmony line
    for t, d, ms, bass in [(0.0, 0.78, [60, 64, 67], 48), (0.8, 0.78, [60, 65, 69], 53),
                           (1.6, 0.38, [62, 67, 71], 55), (2.0, 0.62, [60, 64, 67, 72], 48)]:
        r = 0.4 if t >= 2.0 else 0.08
        for m in ms:
            ev.append((t, note(mtof(m), d, sr, "warm", a=0.02, d=0.2, s=0.75, r=r), 0.11))
        for k in range(int(round(d / 0.2)) if t < 2.0 else 1):   # bouncing bass
            bd = 0.16 if t < 2.0 else d
            ev.append((t + 0.2 * k, note(mtof(bass + (12 if k % 2 else 0)), bd, sr, "tri", a=0.006, s=0.7,
                                         r=r if t >= 2 else 0.05), 0.3))
    for i, m in enumerate([84, 88, 91, 96, 91, 96]):
        ev.append((2.08 + 0.075 * i, bell(mtof(m), 0.1, sr, tau=0.16, bright=0.05), 0.14 - 0.012 * i))
    return seq(sr, 3.2, ev)


# name -> (builder, target peak dBFS). A few sounds that fire constantly or
# should sit in the background are deliberately a little under -6 dBFS.
SFX = {
    "click": (sfx_click, -8.0),
    "error": (sfx_error, -6.0),
    "build": (sfx_build, -6.0),
    "demolish": (sfx_demolish, -6.0),
    "path": (sfx_path, -10.0),
    "upgrade": (sfx_upgrade, -6.0),
    "sale": (sfx_sale, -10.0),
    "money": (sfx_money, -6.0),
    "research_done": (sfx_research_done, -6.0),
    "discovery": (sfx_discovery, -6.0),
    "staff_up": (sfx_staff_up, -6.0),
    "rank_up": (sfx_rank_up, -6.0),
    "perk": (sfx_perk, -6.0),
    "codex": (sfx_codex, -6.0),
    "car": (sfx_car, -12.0),
    "toast": (sfx_toast, -7.0),
    "goal": (sfx_goal, -6.0),
    "jingle": (sfx_jingle, -6.0),
}


# --------------------------------------------------------------------------
# B) BGM
# --------------------------------------------------------------------------
_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_QUAL = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11],
         "m7": [0, 3, 7, 10], "7sus": [0, 5, 7, 10], "6": [0, 4, 7, 9], "add9": [0, 4, 7, 14]}
PENT = [0, 2, 4, 7, 9]


def _pc(s):
    pc = _PC[s[0]]
    rest = s[1:]
    if rest[:1] == "#":
        pc, rest = pc + 1, rest[1:]
    elif rest[:1] == "b":
        pc, rest = pc - 1, rest[1:]
    return pc % 12, rest


def chord(name, lo=55, bass_lo=38):
    """'Am7', 'G/B', 'Bbmaj7' ... -> (bass midi, sorted voicing in [lo, lo+12))."""
    main, _, slash = name.partition("/")
    root, qual = _pc(main)
    bass_pc = _pc(slash)[0] if slash else root
    tones = sorted(lo + ((root + iv - lo) % 12) for iv in _QUAL[qual])
    return bass_lo + ((bass_pc - bass_lo) % 12), tones


def pent_note(tonic, idx):
    """Major-pentatonic degree idx (may be negative / above 4) over tonic midi."""
    return tonic + 12 * (idx // 5) + PENT[idx % 5]


def segments(prog, bpb):
    """['G', 'Am7 D7', ...] -> list of (start_beat, dur_beats, bass, tones)."""
    segs = []
    for bar, entry in enumerate(prog):
        parts = entry.split()
        d = bpb / len(parts)
        for i, name in enumerate(parts):
            b, tones = chord(name)
            segs.append((bar * bpb + i * d, d, b, tones))
    return segs


def seg_at(segs, beat):
    for s in segs:
        if s[0] <= beat < s[0] + s[1] - 1e-9:
            return s
    return segs[-1]


def finish_bgm(dry, wet, sr, spb, echo_beats=0.75, echo_gain=0.3, hi=6500.0):
    """Bus processing shared by the three tracks (everything circular)."""
    wet_lp = fft_filter(wet, sr, lo=250, hi=3200, order=1)
    x = dry + wet + echo_wrap(wet_lp, echo_beats * spb, echo_gain, repeats=3)
    x = fft_filter(x, sr, lo=30, hi=hi, order=2)           # no rumble, no shrill highs
    x -= np.mean(x)
    return normalize(soft_limit(x), PEAK_BGM_DB)


def bgm_day(sr, rng):
    """G major, 93 bpm, 24 bars of 4/4 (A8 B8 A'8), light swing, soft drums."""
    bpm, bars, bpb, swing = 93.0, 24, 4, 0.07
    spb = 60.0 / bpm * sr
    n = int(round(bars * bpb * spb))
    dry, wet = np.zeros(n), np.zeros(n)
    sec = spb / sr                                           # seconds per beat

    def at(beat):                                            # swung beat -> sample
        return (beat + (swing if abs(beat % 1.0 - 0.5) < 1e-6 else 0.0)) * spb

    prog = ["G", "Em7", "Cmaj7", "D", "G", "Em7", "Am7", "D7",
            "Cmaj7", "G/B", "Am7", "D", "Cmaj7", "Bm7", "Am7", "D7",
            "G", "Em7", "Cmaj7", "D", "Em7", "Cmaj7", "G/D", "D7"]
    segs = segments(prog, bpb)

    for bar in range(bars):
        b0 = bar * bpb
        sect = bar // 8                                      # 0 = A, 1 = B, 2 = A'
        _, _, bass, tones = seg_at(segs, b0)
        # bass: root, root, (fifth pickup every other bar)
        hits = [(0.0, 1.3, bass), (2.0, 0.9, bass)]
        if bar % 2 == 1:
            hits.append((3.5, 0.4, bass + 7 if bass + 7 <= 50 else bass - 5))
        if sect == 1:
            hits = [(0.0, 2.6, bass), (3.0, 0.8, bass)]
        for b, d, m in hits:
            tone = (note(mtof(m), d * sec, sr, "tri", a=0.012, d=0.25, s=0.6, r=0.14)
                    + 0.5 * note(mtof(m), d * sec, sr, "sine", a=0.012, d=0.25, s=0.8, r=0.14)
                    + 0.25 * note(mtof(m + 12), d * sec, sr, "sine", a=0.012, d=0.2, s=0.5, r=0.14))
            mix(dry, tone, at(b0 + b), 0.115, wrap=True)
        # pad: whole-bar chord, slow attack
        for m in tones:
            mix(dry, note(mtof(m), bpb * sec, sr, "warm", a=0.30, d=0.5, s=0.8, r=0.7),
                at(b0), 0.05, wrap=True)
        # arpeggio: swung eighths over an extended voicing
        ext = tones + [t + 12 for t in tones]
        pat = [0, 2, 1, 3, 2, 4, 3, 1] if sect != 1 else [0, 1, 2, 3, 4, 3, 2, 1]
        for e in range(8):
            if sect == 1 and e % 2 == 1 and bar % 2 == 0:
                continue                                     # B section breathes
            m = ext[pat[e] % len(ext)]
            g = (0.085 if e % 2 == 0 else 0.065) * rng.uniform(0.9, 1.1)
            mix(wet, note(mtof(m), 0.3 * sec, sr, "tri", a=0.005, d=0.2, s=0.3, r=0.2, tau=0.3),
                at(b0 + e * 0.5), g, wrap=True)
        # soft percussion
        kicks = [0.0, 2.0] if sect != 1 else [0.0]
        for b in kicks:
            k = note(105, 0.10, sr, "sine", a=0.003, r=0.10, tau=0.07, f_end=46)
            mix(dry, k, at(b0 + b), 0.15, wrap=True)
        for e in range(8):
            nh = int(0.07 * sr)
            off = e % 2 == 1
            h = noise(rng, nh, sr, 4200, 8000) * np.exp(-np.arange(nh) / sr / (0.016 if off else 0.009))
            mix(dry, h, at(b0 + e * 0.5), (0.045 if off else 0.020) * rng.uniform(0.8, 1.1), wrap=True)
        for b in (1.0, 3.0):                                 # brushed back-beat
            ns = int(0.12 * sr)
            s = noise(rng, ns, sr, 900, 3600) * np.exp(-np.arange(ns) / sr / 0.03) \
                * (1 - np.exp(-np.arange(ns) / sr / 0.004))
            mix(dry, s, at(b0 + b), 0.035, wrap=True)

    # lead melody: (beat, dur, pentatonic degree) per bar; degree 0 = G4
    p1 = [[(0, 1, 2), (1, .5, 3), (1.5, 1.5, 4), (3, 1, 3)], [(0, 1.5, 2), (1.5, .5, 1), (2, 2, 0)]]
    p2 = [[(0, 1, 4), (1, .5, 3), (1.5, 1.5, 2), (3, 1, 1)], [(0, 2, 1), (2.5, .5, 0), (3, 1, 1)]]
    p3 = [[(0, 1, 2), (1, .5, 3), (1.5, 1.5, 4), (3, 1, 5)], [(0, 1.5, 4), (1.5, .5, 3), (2, 2, 2)]]
    p4 = [[(0, 1, 1), (1, 1, 2), (2, 1.5, 0), (3.5, .5, -1)], [(0, 3, 1)]]
    pb = [[(0, 2, 4), (2, 1, 3), (3, 1, 2)], [(0, 3, 3)], [(.5, .5, 0), (1, 1, 1), (2, 2, 2)], [(0, 3, 1)],
          [(0, 2, 4), (2, 1, 5), (3, 1, 4)], [(0, 2, 3), (2.5, .5, 2), (3, 1, 1)],
          [(0, 1, 0), (1, 1, 1), (2, 2, 2)], [(0, 3, 3)]]
    p5 = [[(0, 1, 4), (1, .5, 5), (1.5, 1.5, 4), (3, 1, 3)], [(0, 1.5, 2), (1.5, .5, 1), (2, 2, 2)]]
    p6 = [[(0, 1, 1), (1, 1, 0), (2, 2, -1)], [(0, 2, 1), (2, 1.5, 3)]]
    melody = p1 + p2 + p3 + p4 + pb + p1 + p2 + p5 + p6
    for bar, notes_ in enumerate(melody):
        for b, d, deg in notes_:
            m = pent_note(67, deg)
            dur = d * sec * 0.92
            tone = (note(mtof(m), dur, sr, "tri", a=0.02, d=0.2, s=0.7, r=0.22, vib=(5.2, 0.10, 0.25))
                    + 0.6 * note(mtof(m), dur, sr, "sine", a=0.02, d=0.2, s=0.8, r=0.22))
            mix(wet, tone, at(bar * bpb + b), 0.21, wrap=True)
            if bar >= 16 and d >= 1:                         # A': glassy octave doubling
                mix(wet, bell(mtof(m + 12), dur, sr, tau=0.35, bright=0.05), at(bar * bpb + b), 0.035, wrap=True)
    return finish_bgm(dry, wet, sr, spb)


def bgm_evening(sr, rng):
    """F major, 78 bpm, 20 bars of 4/4. Electric-piano comping, mellow lead."""
    bpm, bars, bpb = 78.0, 20, 4
    spb = 60.0 / bpm * sr
    n = int(round(bars * bpb * spb))
    dry, wet = np.zeros(n), np.zeros(n)
    sec = spb / sr

    prog = ["Fmaj7", "Dm7", "Bbmaj7", "C7", "Am7", "Dm7", "Gm7", "C7",
            "Bbmaj7", "Am7", "Gm7", "C7", "Fmaj7", "Dm7", "Bbmaj7", "C7sus",
            "Am7", "Dm7", "Gm7", "C7"]
    segs = segments(prog, bpb)

    def epiano(m, dur, tau=0.9):
        f = mtof(m)
        return layer(note(f, dur, sr, "sine", a=0.006, d=0.3, s=0.7, r=0.3, tau=tau, trem=(4.2, 0.18)),
                     0.22 * note(f * 2, dur, sr, "sine", a=0.004, d=0.1, s=0.6, r=0.2, tau=tau * 0.35),
                     0.07 * note(f * 3, dur, sr, "sine", a=0.003, d=0.05, s=0.5, r=0.1, tau=tau * 0.15))

    for bar in range(bars):
        b0 = bar * bpb
        _, _, bass, tones = seg_at(segs, b0)
        sparse = 8 <= bar < 12
        # bass: long root, short pickup into the next bar
        hits = [(0.0, 2.3, bass)] + ([] if sparse else [(2.5, 1.2, bass)])
        if bar % 4 == 3:
            hits.append((3.75, 0.25, bass + 2 if bass + 2 <= 50 else bass))
        for b, d, m in hits:
            tone = (note(mtof(m), d * sec, sr, "sine", a=0.02, d=0.4, s=0.75, r=0.2)
                    + 0.6 * note(mtof(m), d * sec, sr, "tri", a=0.02, d=0.3, s=0.5, r=0.2)
                    + 0.25 * note(mtof(m + 12), d * sec, sr, "sine", a=0.02, d=0.3, s=0.5, r=0.2))
            mix(dry, tone, (b0 + b) * spb, 0.115, wrap=True)
        # pad
        for m in tones:
            mix(dry, note(mtof(m), bpb * sec, sr, "warm", a=0.5, d=0.6, s=0.8, r=0.9),
                b0 * spb, 0.045, wrap=True)
        # e-piano: rolled chord on 1, upper dyad on the "and" of 2, two fill notes
        for i, m in enumerate(tones):
            mix(wet, epiano(m, 2.2 * sec), (b0 + 0.0) * spb + i * 0.022 * sr, 0.085, wrap=True)
        if not sparse:
            for i, m in enumerate(tones[-2:]):
                mix(wet, epiano(m, 1.2 * sec, 0.6), (b0 + 2.5) * spb + i * 0.02 * sr, 0.06, wrap=True)
        ext = tones + [t + 12 for t in tones]
        for b, k in ([(1.5, 2), (3.5, 4)] if bar % 2 == 0 else [(1.5, 3), (3.0, 5), (3.5, 2)]):
            mix(wet, epiano(ext[k % len(ext)], 0.6 * sec, 0.45), (b0 + b) * spb,
                0.05 * rng.uniform(0.85, 1.1), wrap=True)

    # lead: degree 0 = F4
    mel = [
        [(0, 1.5, 2), (1.5, .5, 3), (2, 2, 4)], [(0, 1, 3), (1, 1, 2), (2, 2, 2)],
        [(0, 1.5, 4), (1.5, .5, 3), (2, 2, 2)], [(0, 3, 1)],
        [(1, 1, 2), (2, 1, 3), (3, 1, 4)], [(0, 2, 5), (2, 2, 4)],
        [(0, 1, 1), (1, 1, 2), (2, 2, 4)], [(0, 3, 3)],
        [(0, 2, 5), (2, 1, 4), (3, 1, 3)], [(0, 3, 2)],
        [(0, 2, 4), (2, 1, 3), (3, 1, 1)], [(0, 2.5, 1), (3, 1, 2)],
        [(0, 1.5, 2), (1.5, .5, 3), (2, 2, 4)], [(0, 1, 3), (1, 1, 2), (2, 1, 0), (3, 1, 2)],
        [(0, 1.5, 4), (1.5, .5, 5), (2, 2, 4)], [(0, 3, 3)],
        [(0, 2, 2), (2, 2, 3)], [(0, 2, 4), (2, 2, 2)],
        [(0, 1, 1), (1, 1, 2), (2, 2, 1)], [(0, 2, 3), (2.5, 1.5, 1)],
    ]
    for bar, notes_ in enumerate(mel):
        for b, d, deg in notes_:
            m = pent_note(65, deg)
            dur = d * sec * 0.95
            tone = (note(mtof(m), dur, sr, "sine", a=0.04, d=0.3, s=0.8, r=0.3, vib=(4.6, 0.12, 0.3))
                    + 0.35 * note(mtof(m), dur, sr, "tri", a=0.04, d=0.3, s=0.6, r=0.3)
                    + 0.10 * note(mtof(m), dur, sr, "pulse", a=0.06, d=0.3, s=0.5, r=0.3))
            mix(wet, tone, (bar * bpb + b) * spb, 0.23, wrap=True)
    return finish_bgm(dry, wet, sr, spb, echo_beats=1.0, echo_gain=0.32, hi=5500.0)


def bgm_night(sr, rng):
    """C major, 66 bpm, 24 bars of 3/4 (slow lullaby waltz). Sparse music box."""
    bpm, bars, bpb = 66.0, 24, 3
    spb = 60.0 / bpm * sr
    n = int(round(bars * bpb * spb))
    dry, wet = np.zeros(n), np.zeros(n)
    sec = spb / sr

    two_bar = ["Cmaj7", "Am7", "Fmaj7", "G", "Em7", "Am7", "Dm7", "G7",
               "Cmaj7", "Am7", "Fmaj7", "G7sus"]
    prog = [c for c in two_bar for _ in range(2)]
    segs = segments(prog, bpb)

    for bar in range(bars):
        b0 = bar * bpb
        _, _, bass, tones = seg_at(segs, b0)
        if bar % 2 == 0:                                     # bass + pad span 2 bars
            d = 2 * bpb * sec
            tone = (note(mtof(bass), d * 0.9, sr, "sine", a=0.05, d=1.0, s=0.6, r=0.6)
                    + 0.4 * note(mtof(bass), d * 0.9, sr, "tri", a=0.05, d=0.6, s=0.4, r=0.6)
                    + 0.3 * note(mtof(bass + 12), d * 0.9, sr, "sine", a=0.05, d=0.8, s=0.4, r=0.6))
            mix(dry, tone, b0 * spb, 0.095, wrap=True)
            for m in tones:
                mix(dry, note(mtof(m), d, sr, "warm", a=0.9, d=1.0, s=0.8, r=1.4),
                    b0 * spb, 0.05, wrap=True)
        # waltz "2-3": soft chord tones answering the bass
        ext = tones + [t + 12 for t in tones]
        picks = [(1.0, 1), (2.0, 2)] if bar % 2 == 0 else [(1.0, 2), (2.0, 3)]
        if bar % 8 == 7:
            picks = [(1.0, 1)]
        for b, k in picks:
            m = ext[k % len(ext)]
            tone = layer(note(mtof(m), 0.9 * sec, sr, "sine", a=0.02, d=0.5, s=0.5, r=0.5, tau=0.9),
                         0.12 * note(mtof(m) * 2, 0.5 * sec, sr, "sine", a=0.01, r=0.3, tau=0.25))
            mix(wet, tone, (b0 + b) * spb, 0.085 * rng.uniform(0.85, 1.05), wrap=True)

    # music-box lead: degree 0 = C5
    mel = [
        [(0, 2, 2), (2, 1, 3)], [(0, 3, 4)], [(0, 2, 3), (2, 1, 2)], [(0, 3, 0)],
        [(0, 2, 4), (2, 1, 3)], [(0, 3, 2)], [(0, 3, 1)], [],
        [(0, 1, 2), (1, 1, 3), (2, 1, 4)], [(0, 3, 3)], [(0, 2, 5), (2, 1, 4)], [(0, 3, 2)],
        [(0, 2, 1), (2, 1, 4)], [(0, 3, 3)], [(0, 3, 1)], [(2, 1, 3)],
        [(0, 2, 4), (2, 1, 3)], [(0, 3, 2)], [(0, 2, 0), (2, 1, 2)], [(0, 3, 3)],
        [(0, 2, 4), (2, 1, 5)], [(0, 3, 4)], [(0, 3, 3)], [(2, 1, 1)],
    ]
    for bar, notes_ in enumerate(mel):
        for b, d, deg in notes_:
            m = pent_note(72, deg)
            mix(wet, bell(mtof(m), d * sec, sr, tau=0.55 + 0.25 * d, bright=0.12),
                (bar * bpb + b) * spb, 0.17, wrap=True)
    return finish_bgm(dry, wet, sr, spb, echo_beats=1.0, echo_gain=0.38, hi=5000.0)


BGM = {"day": bgm_day, "evening": bgm_evening, "night": bgm_night}


# --------------------------------------------------------------------------
# C) Ambient loops
# --------------------------------------------------------------------------
def wind(rng, n, sr, tilt=320.0):
    """Faint periodic wind bed: dark noise with slow gusts (whole cycles/loop)."""
    t = np.arange(n) / n
    low = noise(rng, n, sr, 60, tilt, order=1)
    mid = noise(rng, n, sr, 300, 1100, order=1)
    g1 = 0.65 + 0.25 * np.sin(2 * np.pi * (1 * t + rng.random())) + 0.10 * np.sin(2 * np.pi * (3 * t + rng.random()))
    g2 = 0.50 + 0.35 * np.sin(2 * np.pi * (2 * t + rng.random())) + 0.15 * np.sin(2 * np.pi * (5 * t + rng.random()))
    return low * g1 + 0.18 * mid * g2


def chirp(sr, f0, f1, dur, harm=0.12):
    n = int(dur * sr)
    x = np.arange(n) / n
    f = f0 * (f1 / f0) ** x
    return (osc("sine", f, n, sr) + harm * osc("sine", 2 * f, n, sr)) * np.sin(np.pi * x) ** 1.5


def amb_birds(sr, rng):
    n = int(20.0 * sr)
    buf = np.zeros(n)
    slots = 9
    for i in range(slots):
        if i in (3, 7):
            continue                                         # leave some quiet gaps
        t0 = (i + rng.uniform(0.1, 0.7)) * 20.0 / slots
        g = rng.uniform(0.35, 1.0)
        kind = ["tweet", "trill", "peep", "tweet", "warble"][int(rng.integers(0, 5))]
        base = rng.uniform(2500, 3300)
        t = t0
        if kind == "tweet":
            for _ in range(int(rng.integers(2, 4))):
                mix(buf, chirp(sr, base, base * rng.uniform(1.25, 1.45), 0.07), t * sr, g, wrap=True)
                t += rng.uniform(0.11, 0.16)
        elif kind == "trill":
            for k in range(int(rng.integers(5, 9))):
                f = base * (1.12 if k % 2 else 1.0)
                mix(buf, chirp(sr, f, f * 1.06, 0.032), t * sr, g * 0.8, wrap=True)
                t += 0.052
        elif kind == "peep":
            for k in range(2):
                mix(buf, chirp(sr, base * 1.35, base * 0.95, 0.14), t * sr, g * (1.0 - 0.3 * k), wrap=True)
                t += rng.uniform(0.25, 0.35)
        else:  # warble: up-down-up phrase
            for f0, f1, d in [(1.0, 1.3, 0.08), (1.3, 1.05, 0.06), (1.1, 1.4, 0.09), (1.4, 1.2, 0.12)]:
                mix(buf, chirp(sr, base * f0, base * f1, d), t * sr, g, wrap=True)
                t += d + 0.03
    buf = buf + 0.3 * np.roll(fft_filter(buf, sr, hi=2600, order=1), int(0.11 * sr))  # distance smear
    buf = buf / np.max(np.abs(buf))
    w = wind(rng, n, sr)
    return normalize(fft_filter(buf + 0.16 * w / np.max(np.abs(w)), sr, lo=50, hi=7000), PEAK_AMB_DB)


def amb_night(sr, rng):
    n = int(20.0 * sr)
    t = np.arange(n) / sr
    tn = t / 20.0
    buf = np.zeros(n)
    # each cricket: carrier gated by short pulse-train chirps; whole number of
    # chirps per loop keeps it periodic.
    for carrier, chirps, pulses, rate, g, cyc in [(3650.0, 32, 3, 31.0, 1.0, 1), (4120.0, 27, 4, 36.0, 0.55, 2),
                                                  (3380.0, 23, 2, 27.0, 0.35, 3), (4480.0, 37, 3, 40.0, 0.22, 1)]:
        period = 20.0 / chirps
        ph = (t + rng.uniform(0, period)) % period
        k = np.floor(ph * rate)
        frac = ph * rate - k
        gate = np.where(k < pulses, np.sin(np.pi * frac) ** 2, 0.0)
        carrier_hz = round(carrier * 20.0) / 20.0             # whole cycles per loop
        tone = np.sin(2 * np.pi * carrier_hz * t) + 0.15 * np.sin(2 * np.pi * 2 * carrier_hz * t)
        level = 0.7 + 0.3 * np.sin(2 * np.pi * (cyc * tn + rng.random()))
        buf += g * gate * tone * level
    buf = buf / np.max(np.abs(buf))
    w = wind(rng, n, sr, tilt=260.0)
    return normalize(fft_filter(buf * 0.8 + 0.2 * w / np.max(np.abs(w)), sr, lo=50, hi=7000), PEAK_AMB_DB)


def amb_road(sr, rng):
    length = 16.0
    n = int(length * sr)
    t = np.arange(n) / sr
    tn = t / length
    hum = noise(rng, n, sr, 45, 190) * (0.8 + 0.2 * np.sin(2 * np.pi * (2 * tn + rng.random())))
    far = noise(rng, n, sr, 150, 600, order=1) * (0.7 + 0.3 * np.sin(2 * np.pi * (1 * tn + rng.random())))
    buf = 0.36 * hum + 0.30 * far
    for t0, w, g in [(2.6, 1.1, 0.75), (8.4, 0.8, 1.0), (13.2, 1.5, 0.55)]:
        dist = (t - t0 + length / 2) % length - length / 2    # circular time distance
        e = 1.0 / (1.0 + (dist / w) ** 2) ** 1.6
        e -= e.min()
        tyre = noise(rng, n, sr, 250, 1300, order=1)
        body = noise(rng, n, sr, 70, 300)
        buf += g * (0.55 * tyre * e ** 1.3 + 0.6 * body * e)
    return normalize(fft_filter(buf, sr, lo=40, hi=4500), PEAK_AMB_DB)


AMB = {"birds": amb_birds, "night": amb_night, "road": amb_road}


# --------------------------------------------------------------------------
# verification + report
# --------------------------------------------------------------------------
def loop_metrics(x):
    """How audible is the wrap-around? Both ratios should be around <= 1.
    step : |x[0]-x[-1]| relative to the 99.9th percentile sample-to-sample step
    curve: largest 2nd difference within +-16 samples of the seam relative to
           the 99.9th percentile 2nd difference of the whole (circular) file."""
    d1 = np.abs(np.diff(x))
    step = abs(x[0] - x[-1]) / (np.percentile(d1, 99.9) + 1e-12)
    d2 = np.abs(np.roll(x, -1) - 2 * x + np.roll(x, 1))
    seam = max(np.max(d2[:16]), np.max(d2[-16:]))
    return step, seam / (np.percentile(d2, 99.9) + 1e-12)


def measure(path, src=None, loop=False):
    x, sr = decode_audio(path)
    info = {"file": os.path.relpath(path, ROOT), "dur": len(x) / sr, "peak": db(np.max(np.abs(x))),
            "rms": db(np.sqrt(np.mean(x ** 2))), "size": os.path.getsize(path),
            "clip": bool(np.max(np.abs(x)) >= 32766 / 32768.0), "loop": None, "len_ok": True, "edge": None}
    if loop:
        info["loop"] = loop_metrics(x)
        if src is not None and sr == SR_LOOP:
            info["len_ok"] = len(x) == len(src)
            if info["len_ok"]:                               # codec error at the edges vs overall
                err = x - src
                k = int(0.02 * sr)
                edge = np.sqrt(np.mean(np.concatenate([err[:k], err[-k:]]) ** 2))
                info["edge"] = db(edge) - db(np.sqrt(np.mean(err ** 2)))
    return info


def main():
    for d in (DIR_SFX, DIR_BGM, DIR_AMB):
        os.makedirs(d, exist_ok=True)
    rows, problems = [], []

    for name, (fn, peak_db) in SFX.items():
        x = normalize(trim(fn(SR_SFX, rng_for("sfx/" + name)), SR_SFX), peak_db)
        rows.append(measure(write_wav(os.path.join(DIR_SFX, name + ".wav"), x, SR_SFX)))

    for group, table, outdir in (("bgm", BGM, DIR_BGM), ("amb", AMB, DIR_AMB)):
        for name, fn in table.items():
            x = fn(SR_LOOP, rng_for(group + "/" + name))
            src_q = to_int16(x).astype(np.float64) / 32768.0
            pre = loop_metrics(src_q)
            for stale in (".ogg", ".wav"):                   # never leave a stale variant behind
                p = os.path.join(outdir, name + stale)
                if os.path.exists(p):
                    os.remove(p)
            path, _ = encode_ogg(os.path.join(outdir, name), x, SR_LOOP)
            info = measure(path, src_q, loop=True)
            info["pre"] = pre
            rows.append(info)

    # ---- report ----------------------------------------------------------
    print()
    print(f"{'file':38s} {'dur s':>7s} {'peak dBFS':>9s} {'rms dBFS':>8s} {'size kB':>8s}  loop seam (step, curve) src -> decoded")
    print("-" * 118)
    total = 0
    for r in rows:
        total += r["size"]
        extra = ""
        if r["loop"]:
            extra = (f"  {r['pre'][0]:.2f},{r['pre'][1]:.2f} -> {r['loop'][0]:.2f},{r['loop'][1]:.2f}"
                     + ("" if r["edge"] is None else f"  edge-err {r['edge']:+.1f} dB")
                     + ("" if r["len_ok"] else "  LENGTH CHANGED"))
            if not r["len_ok"]:
                problems.append(f"{r['file']}: decoded length differs from source (loop may gap)")
            if max(r["loop"]) > 3.0:
                problems.append(f"{r['file']}: loop seam discontinuity looks large {r['loop']}")
        if r["clip"]:
            problems.append(f"{r['file']}: CLIPPING")
        print(f"{r['file']:38s} {r['dur']:7.2f} {r['peak']:9.2f} {r['rms']:8.2f} {r['size'] / 1024:8.1f}{extra}")
    print("-" * 118)
    print(f"{len(rows)} files, total {total / 1024:.1f} kB ({total / 1048576:.2f} MB), "
          f"loop encoder: {_ENCODER['name']}")
    if total > SIZE_BUDGET:
        problems.append(f"total size {total} exceeds budget {SIZE_BUDGET}")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  - " + p)
        return 1
    print("OK: no clipping, loop seams within tolerance, size under budget.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
