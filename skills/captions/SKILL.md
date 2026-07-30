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

## Steps — VAD is mandatory, not optional
1. For every video and every **single-take** narration clip, extract 16kHz mono WAV, then run:
   ```
   whisper-cli -m runtime/whisper/ggml-base.en.bin -f <audio.wav> -ml 40 -sow -ovtt \
     --vad --vad-model runtime/whisper/ggml-silero-v5.1.2.bin -of <captions/basename>
   ```
   `-vad`/`--vad-model` (resolved as `tools.json`'s `whisperVadModel`, override via
   `SCORM_WHISPER_VAD_MODEL`) segments the audio on **real detected speech boundaries** before
   decoding, instead of fixed ~30s mel-spectrogram windows. This is a genuinely different
   mechanism from `-ml`/`-sow` (which only reflow *text* inside a window) — VAD changes where
   the *segments themselves* start and end.
2. Save each `.vtt` in `<COURSE_DIR>/captions/` with the **same basename** as its media file.
   The assembler matches `path.basename(media).replace(ext, '') + '.vtt'`; a mismatched name
   means no captions get attached.
3. Run a full-course numeric audit after captioning (count cues >10s, count zero/invalid-duration
   cues, count cues landing on an exact 30s-multiple boundary) across every `.vtt` in the course —
   not just a spot-check. See the audit script pattern in `[[caption-timing-precision-fix]]` memory.
4. The player's `<track kind="captions">` plus the on-stage `cc-overlay` both rely on these
   files; the CC toggle in the control bar switches them on/off.

## Handoff
`.vtt` files land where **assemble-build** auto-attaches them. Runs **in parallel** with
**image-generation** and **voiceover** (after audio exists). Trigger a rebuild afterward.

## Stitched menu clips — never transcribe them, author deterministically
Menu slides are concatenated from separate per-item clips (see `skills/voiceover/SKILL.md`), so the
audio contains short silences at every join. Whisper — even with VAD — is not the right tool here
because you already know the exact text and exact `ffprobe` duration of every part; transcribing
introduces risk (join hallucination was observed pre-VAD: "Mama awesome." invented at an 8.1s-9.4s
join) for zero benefit.

**Do not transcribe stitched menu audio.** Author the `.vtt` deterministically: one cue per part,
`start` = cumulative duration before it, `end` = cumulative duration after it. The cue boundaries
line up exactly with the `Voiceovers/cues.json` card-reveal times, which is what you want anyway.

## Why VAD replaced the old heuristic pipeline (HARD-WON — read before "improving" this further)
Earlier attempts at fixing caption timing WITHOUT VAD (whole-file decode + `-ml 40 -sow`, then
post-hoc `silencedetect`-based trimming of cues landing near a 30s boundary, then a duration-cap
backstop) reduced but never eliminated the problem across three rounds of user-reported failures.
Root-cause investigation (ground-truth: extracted the exact audio slice a shipped PAWEL cue claimed
to cover and re-transcribed just that slice) found the real defect: whisper.cpp's fixed ~30s
mel-window decoding can leave **spoken words entirely uncaptioned** — not just mistimed — when a
phrase spans a window edge and the post-hoc merge/trim heuristics don't catch it (e.g. shipped cue
showed only "using structured if-then logic." while the narrator also said "into concrete detection
patterns" immediately before it, with no cue covering those words at all).

Enabling `--vad --vad-model ggml-silero-v5.1.2.bin` (vendored at
`runtime/whisper/ggml-silero-v5.1.2.bin`, ~885KB, downloaded from
`https://huggingface.co/ggml-org/whisper-vad`) fixes this at the source instead of patching after
the fact: verified on the exact previously-broken PAWEL file (M4L1V1, 482s), VAD produced 261 cues
with 0 over 10s, 0 zero-duration, 0 invalid, and 0 cues landing on an exact 30s boundary (worst case
4.14s) — versus the shipped non-VAD version's 185 cues including a 10.18s cue with the missing
words. **Do not regress to the old silencedetect/window-edge-trim/duration-cap pipeline** — always
pass `--vad --vad-model` on every whisper invocation for videos and single-take narration. If VAD
ever produces an outlier, fix by tuning VAD's own thresholds (`-vt`, `-vsd`, `-vmsd`) first, not by
re-adding post-hoc trimming.
