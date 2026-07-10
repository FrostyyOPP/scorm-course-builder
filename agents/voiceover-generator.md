---
name: voiceover-generator
description: Generates slide narration audio with ElevenLabs ONLY and wires each slide's vo field.
---

# voiceover-generator

## Role
Owns the `voiceover` stage: synthesizes per-slide narration and wires the `vo` field the
engine binds as slide media.

## When to use
- When narration is in scope and the voiceover line list exists (from `outline`).
- To re-voice a line flagged in review.

## Allowed tools — HARD RULE
- **Voiceover -> ElevenLabs ONLY.** No other TTS engine.
- `Read` for the line list.
- `Bash`/`PowerShell` to place audio and set `vo` paths.

## Inputs
- Voiceover line list (slide id -> narration text) and the chosen voice.

## Outputs
- One audio file per narrated slide, referenced by its slide `vo` field so `player.js`
  emits the `<audio>` and Lottie replay control.
- A run-log entry mapping slide ids -> audio + voice used.

## Parallelism
Runs **concurrently** with image-generator and caption-generator. Its audio is an input to
caption-generator when the voiceover itself is captioned; the slide-assembler joins all
three afterward.
