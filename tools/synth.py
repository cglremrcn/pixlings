"""Generates every Pixlings sound from scratch: small chiptune synthesis, no samples.

Usage: python tools/synth.py [out_dir]   (default: plugins/pixlings/sounds)

Everything here is original and MIT-licensed with the rest of the project. The hatch tracks
follow the hatch animation's timeline in hooks/lib/canvas.ts (wobbles, cracks at 1.5 s, 2.5 s
and 3.3 s, the flash at 4.0 s, the reveal at 4.3 s).
"""

from __future__ import annotations

import sys
import wave
from pathlib import Path

import numpy as np

SR = 22050
PEAK = 0.5
NOTE_INDEX = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}


def hz(note: str) -> float:
    name, octave = note[:-1], int(note[-1])
    return 440.0 * 2 ** ((NOTE_INDEX[name] + (octave - 4) * 12) / 12)


def silence(dur: float) -> np.ndarray:
    return np.zeros(int(SR * dur))


def envelope(n: int, attack: float, release: float, decay: float | None) -> np.ndarray:
    t = np.arange(n) / SR
    env = np.ones(n)
    a = max(1, int(SR * attack))
    env[:a] = np.linspace(0, 1, a)
    if decay is not None:
        env *= np.exp(-t / decay)
    r = min(n, max(1, int(SR * release)))
    env[-r:] *= np.linspace(1, 0, r)
    return env


def tone(
    freq: float,
    dur: float,
    wave_: str = "square",
    duty: float = 0.5,
    vol: float = 1.0,
    attack: float = 0.004,
    release: float = 0.03,
    decay: float | None = None,
    slide_to: float | None = None,
    vibrato: float = 0.0,
    vibrato_hz: float = 6.0,
) -> np.ndarray:
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = np.full(n, freq) if slide_to is None else freq * (slide_to / freq) ** (t / max(dur, 1e-6))
    if vibrato:
        f = f * (1 + vibrato * np.sin(2 * np.pi * vibrato_hz * t))
    phase = np.cumsum(f) / SR
    frac = phase % 1.0
    if wave_ == "square":
        y = np.where(frac < duty, 1.0, -1.0)
    elif wave_ == "triangle":
        y = 2 * np.abs(2 * frac - 1) - 1
    elif wave_ == "sine":
        y = np.sin(2 * np.pi * phase)
    else:
        y = 2 * frac - 1
    return y * envelope(n, attack, release, decay) * vol


def noise(dur: float, vol: float = 1.0, decay: float = 0.03, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    return rng.uniform(-1, 1, n) * envelope(n, 0.001, 0.01, decay) * vol


def lowpass(y: np.ndarray, cutoff: float) -> np.ndarray:
    alpha = 1 - np.exp(-2 * np.pi * cutoff / SR)
    out = np.empty_like(y)
    acc = 0.0
    for i, v in enumerate(y):
        acc += alpha * (v - acc)
        out[i] = acc
    return out


def soft(y: np.ndarray, cutoff: float = 5200) -> np.ndarray:
    """Takes the fizz off raw square waves."""
    return lowpass(y, cutoff)


def over(*parts: np.ndarray) -> np.ndarray:
    """Sums parts of different lengths, padding the shorter ones with silence."""
    n = max(len(p) for p in parts)
    return np.sum([np.pad(p, (0, n - len(p))) for p in parts], axis=0)


def seq(*parts: np.ndarray) -> np.ndarray:
    return np.concatenate(parts)


def mix(base: np.ndarray, part: np.ndarray, at: float) -> np.ndarray:
    start = int(SR * at)
    end = start + len(part)
    if end > len(base):
        base = np.concatenate([base, np.zeros(end - len(base))])
    base = base.copy()
    base[start:end] += part
    return base


def chip(note: str, dur: float, duty: float = 0.25, vol: float = 1.0, decay: float | None = None) -> np.ndarray:
    f = hz(note)
    sq = tone(f, dur, "square", duty=duty, vol=0.55 * vol, decay=decay)
    tri = tone(f / 2, dur, "triangle", vol=0.45 * vol, decay=decay)
    return soft(sq + tri)


def arp(notes: list[str], step: float, duty: float = 0.25, vol: float = 1.0) -> np.ndarray:
    return seq(*[chip(n, step, duty, vol) for n in notes])


def bell(note: str, dur: float, vol: float = 1.0) -> np.ndarray:
    f = hz(note)
    return (
        tone(f, dur, "sine", vol=0.7 * vol, decay=dur / 3)
        + tone(f * 2, dur, "sine", vol=0.2 * vol, decay=dur / 5)
        + tone(f * 3.01, dur, "sine", vol=0.08 * vol, decay=dur / 8)
    )


# Sounds -------------------------------------------------------------------------------------


def s_done() -> np.ndarray:
    return seq(bell("C6", 0.11), bell("G6", 0.42))


def s_attention() -> np.ndarray:
    knock = lambda seed: tone(170, 0.07, "sine", decay=0.02) + noise(0.07, 0.25, 0.008, seed)  # noqa: E731
    y = seq(knock(1), silence(0.07), knock(2), silence(0.12))
    return seq(y, bell("A6", 0.38), bell("E7", 0.32, 0.6))


def s_pass() -> np.ndarray:
    return seq(arp(["C5", "E5", "G5", "C6"], 0.055), chip("E6", 0.22, decay=0.12))


def s_fail() -> np.ndarray:
    def wah(note: str, dur: float, vib: float = 0.0) -> np.ndarray:
        f = hz(note)
        return soft(
            tone(f, dur, "square", duty=0.5, vol=0.4, slide_to=f * 0.97, vibrato=vib, release=0.06)
            + tone(f, dur, "triangle", vol=0.5, slide_to=f * 0.97, vibrato=vib, release=0.06),
            2600,
        )

    return seq(wah("G4", 0.2), silence(0.03), wah("F#4", 0.2), silence(0.03), wah("F4", 0.2), silence(0.03), wah("E4", 0.75, 0.025))


def s_squash() -> np.ndarray:
    crunch = noise(0.09, 0.9, 0.025, 7)
    return seq(crunch, arp(["C5", "G5", "C6", "E6", "G6"], 0.05), chip("C7", 0.3, 0.125, decay=0.15))


def s_commit() -> np.ndarray:
    return seq(chip("G5", 0.07, 0.5), chip("D6", 0.3, 0.5, decay=0.12))


def s_push() -> np.ndarray:
    sweep = tone(220, 0.38, "square", duty=0.125, vol=0.4, slide_to=1760, release=0.08)
    whoosh = lowpass(noise(0.38, 0.5, 0.2, 3), 2400)
    return soft(sweep + whoosh)


def s_alarm() -> np.ndarray:
    parts = []
    for _ in range(3):
        parts += [chip("A5", 0.1, 0.5), chip("E5", 0.1, 0.5)]
    return seq(*parts)


def s_spicy() -> np.ndarray:
    return seq(chip("E5", 0.12, 0.5), silence(0.04), chip("C5", 0.28, 0.5, decay=0.15))


def s_sleep() -> np.ndarray:
    return seq(*[tone(hz(n), 0.32, "triangle", vol=0.8, release=0.2, decay=0.25) for n in ["E5", "C5", "A4"]])


def s_wake() -> np.ndarray:
    beeps = []
    for _ in range(3):
        beeps += [tone(hz("A6"), 0.06, "square", duty=0.5, vol=0.5), silence(0.05)]
    return seq(soft(seq(*beeps)), arp(["C6", "E6", "G6"], 0.07), chip("C7", 0.28, decay=0.14))


def s_levelup() -> np.ndarray:
    run = arp(["C5", "E5", "G5", "C6", "E6", "G6"], 0.045)
    chord = chip("C6", 0.45, decay=0.2) + chip("E6", 0.45, decay=0.2) * 0.8 + chip("G6", 0.45, decay=0.2) * 0.7
    return seq(run, chord)


def s_pet() -> np.ndarray:
    return tone(600, 0.13, "sine", slide_to=950, release=0.05) + tone(1200, 0.13, "sine", vol=0.15, slide_to=1900)


def s_error() -> np.ndarray:
    return tone(420, 0.45, "sine", slide_to=140, vibrato=0.12, vibrato_hz=14, release=0.1)


def hatch(tier: int) -> np.ndarray:
    """4.6 s plus the fanfare, timed to renderHatch: wobble taps, three cracks, flash, reveal."""
    y = silence(4.3)
    tap = lambda seed: tone(260, 0.05, "triangle", vol=0.35, decay=0.015) + noise(0.05, 0.08, 0.01, seed)  # noqa: E731
    t = 0.0
    while t < 4.0:
        urgency = 0.4 if t < 1.5 else 0.24 if t < 3.0 else 0.11
        y = mix(y, tap(int(t * 100)), t)
        t += urgency
    for i, at in enumerate([1.5, 2.5, 3.3]):
        crack = over(noise(0.08, 0.9, 0.02, 40 + i), tone(900 - i * 120, 0.06, "square", duty=0.5, vol=0.2, decay=0.02))
        y = mix(y, crack, at)
    shimmer = tone(400, 0.7, "sine", vol=0.35, slide_to=2400, attack=0.2, release=0.1)
    y = mix(y, shimmer, 3.3)
    burst = lowpass(noise(0.35, 0.7, 0.15, 99), 3000)
    y = mix(y, burst, 4.0)
    fanfares = {
        1: seq(arp(["C5", "E5", "G5"], 0.07), chip("C6", 0.4, decay=0.2)),
        2: seq(arp(["C5", "E5", "G5", "C6", "E6"], 0.06), chip("G6", 0.25), chip("C7", 0.5, decay=0.25)),
        3: seq(
            arp(["G4", "C5", "E5", "G5", "C6", "E6", "G6"], 0.055),
            chip("C7", 0.18),
            silence(0.04),
            chip("G6", 0.12),
            chip("C7", 0.7, 0.125, decay=0.4) + chip("E6", 0.7, decay=0.4) * 0.6 + chip("G6", 0.7, decay=0.4) * 0.5,
        ),
    }
    return mix(y, fanfares[tier], 4.3)


def s_clock() -> np.ndarray:
    """Tick-tock, tick-tock, then a soft chime: the prompt cache is about to cool."""
    tick = lambda f, seed: tone(f, 0.035, "sine", decay=0.012) + lowpass(noise(0.035, 0.35, 0.006, seed), 5000)  # noqa: E731
    y = seq(tick(1900, 1), silence(0.2), tick(1400, 2), silence(0.2), tick(1900, 3), silence(0.2), tick(1400, 4), silence(0.12))
    return seq(y, bell("E6", 0.3, 0.7))


def s_freeze() -> np.ndarray:
    """A crystalline shimmer falling away: the cache went cold."""
    notes = ["E7", "B6", "G#6", "E6", "B5"]
    sparkle = seq(*[bell(n, 0.09, 0.8) for n in notes])
    wind = lowpass(noise(len(sparkle) / SR + 0.25, 0.25, 0.3, 11), 1800)
    return over(sparkle, wind)


def s_eyeroll() -> np.ndarray:
    """A slow sliding whistle up and back down: "sure, absolutely right"."""
    up = tone(520, 0.22, "triangle", vol=0.8, slide_to=880, release=0.04)
    down = tone(880, 0.32, "triangle", vol=0.8, slide_to=330, release=0.12, vibrato=0.015)
    huff = lowpass(noise(0.12, 0.35, 0.05, 5), 1200)
    return seq(soft(seq(up, down), 3600), huff)


def s_badge() -> np.ndarray:
    """A short fanfare with a sparkle on top."""
    lead = seq(chip("G5", 0.09, 0.5), chip("G5", 0.06, 0.5), chip("C6", 0.1, 0.5), chip("E6", 0.42, 0.5, decay=0.22))
    harmony = seq(silence(0.25), chip("G5", 0.42, 0.25, 0.6, decay=0.22))
    return over(lead, harmony, seq(silence(0.3), bell("C7", 0.4, 0.5)))


def s_shutter() -> np.ndarray:
    """A camera shutter and a little print-out whir: the trading card is saved."""
    click = lambda seed: lowpass(noise(0.025, 1.0, 0.006, seed), 6000)  # noqa: E731
    whir = soft(tone(330, 0.35, "square", duty=0.125, vol=0.25, slide_to=380, vibrato=0.04, vibrato_hz=40), 2000)
    return seq(click(21), silence(0.06), click(22), silence(0.08), whir, bell("C7", 0.25, 0.5))


def write(path: Path, y: np.ndarray) -> None:
    peak = float(np.max(np.abs(y))) or 1.0
    y = np.concatenate([y / peak * PEAK, silence(0.03)])
    data = (np.clip(y, -1, 1) * 32767).astype("<i2").tobytes()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "plugins" / "pixlings" / "sounds"
    out.mkdir(parents=True, exist_ok=True)
    sounds = {
        "done": s_done(),
        "attention": s_attention(),
        "pass": s_pass(),
        "fail": s_fail(),
        "squash": s_squash(),
        "commit": s_commit(),
        "push": s_push(),
        "alarm": s_alarm(),
        "spicy": s_spicy(),
        "sleep": s_sleep(),
        "wake": s_wake(),
        "levelup": s_levelup(),
        "pet": s_pet(),
        "error": s_error(),
        "clock": s_clock(),
        "freeze": s_freeze(),
        "eyeroll": s_eyeroll(),
        "badge": s_badge(),
        "shutter": s_shutter(),
        "hatch-1": hatch(1),
        "hatch-2": hatch(2),
        "hatch-3": hatch(3),
    }
    for name, y in sounds.items():
        write(out / f"{name}.wav", y)
    total = sum((out / f"{n}.wav").stat().st_size for n in sounds)
    print(f"wrote {len(sounds)} sounds to {out} ({total // 1024} KiB)")


if __name__ == "__main__":
    main()
