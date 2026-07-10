---
name: captions
description: Use to transcribe every video and voiceover track into WebVTT with Whisper ONLY, named to match each media file so the assembler auto-attaches them.
---

# Captions

## Purpose
Produce accurate WebVTT captions for accessibility (WCAG 2.2). The engine parses VTT and
renders cues over the stage for both video and audio, so captions work everywhere media
plays.

## Inputs
- Course videos under `<COURSE_DIR>/Videos/...`.
- Voiceover audio from the **voiceover** stage (if narration is in scope).
- `data/wcag/` for caption-quality expectations.

## Outputs
- One `.vtt` per media file in `<COURSE_DIR>/captions/`, named to match the media file's
  basename (e.g. `M1L1V1-....mp4` -> `M1L1V1-....vtt`). This is exactly what
  `videoAsset()` in `build-v2.js` looks for when auto-attaching captions.
- A run-log entry listing transcribed files.

## Tools — HARD RULE
- **Captions -> Whisper ONLY.** Do not hand-author or use another transcription engine.
- `Bash`/`PowerShell` to run Whisper and place `.vtt` files.

## Steps
1. Run Whisper over each video (and each voiceover audio file) to produce WebVTT.
2. Save each `.vtt` in `<COURSE_DIR>/captions/` with the **same basename** as its media file.
   The assembler matches `path.basename(media).replace(ext, '') + '.vtt'`; a mismatched name
   means no captions get attached.
3. Review timing and spelling against the audio. The player's `parseVtt`/`renderCue` show one
   cue at a time, so keep cues short and well-timed.
4. The player's `<track kind="captions">` plus the on-stage `cc-overlay` both rely on these
   files; the CC toggle in the control bar switches them on/off.

## Handoff
`.vtt` files land where **assemble-build** auto-attaches them. Runs **in parallel** with
**image-generation** and **voiceover** (after audio exists). Trigger a rebuild afterward.
