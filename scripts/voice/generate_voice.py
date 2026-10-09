"""Speaks the workout voice cues into trimmed mp3 clips for the app.

Writes 1.mp3-100.mp3, and-rest.mp3, great-work.mp3 and the lead-in countdowns
countdown-5.mp3 ("5, 4, 3, 2, 1, go") and countdown-3.mp3 ("3, 2, 1, go").
lib/workout-sound.ts plays them; rerun this after changing any phrase there.

Setup (from scripts/voice/):
  python -m venv .venv
  .venv/Scripts/python -m pip install -r requirements.txt
  .venv/Scripts/python -m piper.download_voices --download-dir voices en_US-lessac-medium

Usage: .venv/Scripts/python generate_voice.py [voice.onnx] [out_dir]
Defaults to voices/en_US-lessac-medium.onnx and the app's public/audio/voice/.
"""

import sys
import time
from pathlib import Path

import lameenc
import numpy as np
from piper import PiperVoice, SynthesisConfig

# Samples quieter than this (out of 32767) count as silence when trimming.
SILENCE_THRESHOLD = 300
# Keep a few ms either side so the word's attack and tail aren't clipped.
PAD_MS = 15
# Plenty for a single voice; keeps the whole set around half a megabyte.
MP3_KBPS = 48

HERE = Path(__file__).parent
DEFAULT_VOICE = HERE / "voices" / "en_US-lessac-medium.onnx"
DEFAULT_OUT = HERE.parent.parent / "public" / "audio" / "voice"

# Every phrase cueWords() in lib/workout-sound.ts can say: rep counts up to
# MAX_REPS (short counts reuse 1-9), and the set-end cues.
WORDS = {str(n): str(n) for n in range(1, 101)}
WORDS["and-rest"] = "And rest."
WORDS["great-work"] = "Great work!"
# Only used inside the countdowns, not saved as its own clip.
GO = "Go!"

# Matches LEAD_IN_BEAT_MS in lib/workout.ts: each countdown word starts on its
# own beat, and "go" on the beat after "1", so the file lines up with the
# on-screen countdown when played from the start of the lead-in.
LEAD_IN_BEAT_MS = 2_000
COUNTDOWNS = (5, 3)


def trim(samples: np.ndarray, sample_rate: int) -> np.ndarray:
    loud = np.flatnonzero(np.abs(samples) > SILENCE_THRESHOLD)
    if loud.size == 0:
        return samples
    pad = sample_rate * PAD_MS // 1000
    return samples[max(0, loud[0] - pad) : loud[-1] + pad]


def write_mp3(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    encoder = lameenc.Encoder()
    encoder.set_bit_rate(MP3_KBPS)
    encoder.set_in_sample_rate(sample_rate)
    encoder.set_channels(1)
    encoder.set_quality(2)  # 2 is high quality, 7 is fastest
    path.write_bytes(encoder.encode(samples.tobytes()) + encoder.flush())


def speak(voice: PiperVoice, text: str, config: SynthesisConfig):
    """Returns the untrimmed samples and their sample rate."""
    chunks = list(voice.synthesize(text, syn_config=config))
    samples = np.concatenate([c.audio_int16_array for c in chunks])
    return samples, chunks[0].sample_rate


def countdown(
    clips: dict[str, np.ndarray], go: np.ndarray, beats: int, sample_rate: int
) -> np.ndarray:
    """beats..1 then "go", each word starting exactly on its beat."""
    words = [clips[str(n)] for n in range(beats, 0, -1)] + [go]
    beat = sample_rate * LEAD_IN_BEAT_MS // 1000
    out = np.zeros(beat * beats + len(words[-1]), dtype=np.int16)
    for i, word in enumerate(words):
        # A word longer than a beat is cut off by the next, as it would be live.
        word = word[:beat] if i < beats else word
        out[i * beat : i * beat + len(word)] = word
    return out


def main(voice_path: str, out_dir: str) -> None:
    voice = PiperVoice.load(voice_path)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    # length_scale < 1 speaks faster; 1.0 is the voice's natural pace.
    config = SynthesisConfig(length_scale=1.0)

    clips: dict[str, np.ndarray] = {}
    rate = 0
    for name, text in WORDS.items():
        start = time.perf_counter()
        samples, rate = speak(voice, text, config)
        clip = clips[name] = trim(samples, rate)

        path = out / f"{name}.mp3"
        write_mp3(path, clip, rate)
        took = (time.perf_counter() - start) * 1000
        print(
            f"{path.name:>15}  {len(samples) / rate * 1000:5.0f} ms raw"
            f" -> {len(clip) / rate * 1000:4.0f} ms trimmed"
            f"  ({path.stat().st_size / 1024:4.1f} KB, made in {took:.0f} ms)"
        )

    go = trim(*speak(voice, GO, config))
    for beats in COUNTDOWNS:
        samples = countdown(clips, go, beats, rate)
        path = out / f"countdown-{beats}.mp3"
        write_mp3(path, samples, rate)
        print(
            f"{path.name:>15}  {len(samples) / rate * 1000:5.0f} ms"
            f"  ({path.stat().st_size / 1024:4.1f} KB)"
        )


if __name__ == "__main__":
    args = sys.argv[1:3]
    main(
        args[0] if len(args) > 0 else str(DEFAULT_VOICE),
        args[1] if len(args) > 1 else str(DEFAULT_OUT),
    )
