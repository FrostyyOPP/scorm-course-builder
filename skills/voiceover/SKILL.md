---
name: voiceover
description: Use to generate slide narration audio with ElevenLabs ONLY, saved per-slide so the engine can attach it as the slide vo and drive the Lottie replay control.
---

# Voiceover

## Purpose
Generate narration audio for slides that carry a `vo` field. The engine in
`app/src/shell-v2/player.js` treats per-slide audio as the active media: it binds the
control bar to the `<audio>` element, renders captions over the stage, and drives the
Lottie "replay narration" button via `slidePlay()` / `audio()`.

## Inputs
- The voiceover line list from **outline** (slide id -> narration text).
- Voice/tone decision from **research**.
- Any pre-existing audio in `<COURSE_DIR>/Voiceovers/`.

## Outputs
- One audio file per narrated slide, referenced by the slide's `vo` field so
  `audio(s)` emits `<audio preload="auto" src="...">` and `slidePlay(s)` mounts the Lottie.
- A run-log entry mapping slide ids to audio files and the voice used.

## Tools — HARD RULE
- **Voiceover -> ElevenLabs ONLY.** Do not use any other TTS engine.
- `Bash`/`PowerShell` to place audio files and wire `vo` paths.

## Menu-slide narration — HARD RULE (home / moduleIndex / lessonIndex)
Every course menu that lists items uses this exact shape:
`"In this {course|module|lesson}, we will cover. First, <title>. Second, <title>. Third, <title>[. Fourth, <title>]. Click on each tab to know more about it."`
- Ordinals + item title ONLY. Never "Module/Lesson/Video one", never a count ("three videos").
- Always end with **"Click on each tab to know more about it."**
- **Card-reveal `cues[]` must be exact, not estimated — HARD RULE.** The card for each ordinal must
  appear the instant the voice speaks it. Whisper word-level timestamps (`-ml 1 -oj`) are NOT reliable
  for this on a single stitched clip — they silently collapse/plateau partway through longer clips (seen
  repeatedly: correct for the first ordinal, garbage for the rest). Do not rely on them for cues.
  Instead, **synthesize each menu slide as separate clips** — intro (`"In this course/module/lesson, we
  will cover."`), one clip per ordinal item (`"First, <title>."` / `"Second, <title>."` / ...), and the
  shared outro (`"Click on each tab to know more about it."`) — then concatenate with ffmpeg
  (convert each to matching-format PCM first, concat demuxer, re-encode to mp3) into the slide's final
  `Voiceovers/<slideId>.mp3`. Cues are the exact cumulative `ffprobe` duration at each item boundary
  (deterministic, no ASR guesswork). The intro and outro clips are identical across every course/module/
  lesson menu respectively — generate each ONCE and reuse across all matching slides to save credits.
- Index card titles render in **Title Case** (preserve acronyms/brands: GenAI, SQL, ChatGPT, LLM, EDA, CRISP-DM).

## Steps
1. For each narrated slide, synthesize the line with ElevenLabs using one consistent voice
   across the course.
2. Save the audio and set the slide's `vo` to its asset path so the assembler ships it and
   the player binds it. Note: the current `build-v2.js` skips VO by default — add `vo` fields
   to the slide objects (or extend `assemble()`) when narration is in scope.
3. Keep each line's audio aligned to its on-screen content so **captions** can transcribe it
   cleanly with Whisper.

## Handoff
- Narration audio -> **captions** (Whisper transcribes it to `.vtt`).
- `vo`-wired slides -> **assemble-build** for the rebuild.
This stage runs **in parallel** with **image-generation**; captions follow once audio exists.
