# Workout voice clips

`generate_voice.py` records the spoken workout cues (counts, countdowns, "And
rest", "Great work") as mp3 files in [`public/audio/voice/`](../../public/audio/voice/),
using [Piper](https://github.com/OHF-Voice/piper1-gpl), a text-to-speech engine
that runs locally. The app plays these files in **Count** mode
(see `lib/workout-sound.ts`).

The generated mp3s are committed, so you only need this when changing the voice,
its speed, or the phrases.

## One-time setup

Needs Python 3.10+. Run these from this folder (`scripts/voice/`).

**Windows (PowerShell)**

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m piper.download_voices --download-dir voices en_US-lessac-medium
```

**macOS / Linux**

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m piper.download_voices --download-dir voices en_US-lessac-medium
```

This creates `.venv/` (the Python packages) and `voices/` (the ~60 MB voice
model). Both are gitignored.

## Generate the clips

```powershell
.venv\Scripts\python generate_voice.py      # Windows
.venv/bin/python generate_voice.py          # macOS / Linux
```

It overwrites the files in `public/audio/voice/` and prints each clip's length
and size. Listen to a few, then commit the changed mp3s.

Optional arguments: `generate_voice.py [voice.onnx] [out_dir]`, for example to
try another voice in a scratch folder without touching the app's files:

```powershell
.venv\Scripts\python -m piper.download_voices --download-dir voices en_US-amy-medium
.venv\Scripts\python generate_voice.py voices\en_US-amy-medium.onnx try-amy
```

Browse voices at <https://rhasspy.github.io/piper-samples/>, and check a
voice's license before shipping its clips.

## What to change

All in `generate_voice.py`:

| Setting | What it does |
| --- | --- |
| `length_scale` in `main()` | Speech speed. `1.0` is natural; lower is faster, higher is slower. |
| `WORDS` | The phrases and their file names. Keep in step with `voiceClip()` in `lib/workout-sound.ts`. |
| `LEAD_IN_BEAT_MS`, `COUNTDOWNS` | Countdown beat and lengths. Must match `LEAD_IN_BEAT_MS`, `FIRST_LEAD_IN_BEATS` and `LEAD_IN_BEATS` in `lib/workout.ts`, or the countdown drifts off the screen. |
| `MP3_KBPS` | mp3 quality vs. size. |

Piper adds slight randomness, so every run produces slightly different audio
even with no changes.
