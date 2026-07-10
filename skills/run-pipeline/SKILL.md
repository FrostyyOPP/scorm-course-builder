---
name: run-pipeline
description: Orchestrate the full SCORM Studio pipeline for an attached course folder — auto-parse the outline into a course model, then run media generation, assembly, review, and final packaging, pausing at the five reviewer gates. Use this at the start of a course session, when the user says "build the course", "run the pipeline", "make the SCORM package", or attaches a course folder and asks to proceed.
---

# Run the SCORM Studio pipeline

You are the orchestrator. Read `CLAUDE.md` first. The engine and tools are self-contained in this
folder; call Node as `runtime/node/node.exe`. Course specifics live only in the course folder.

## Preconditions
- `COURSE_DIR` is set to the attached course folder (contains `Outline/*.docx`, `Videos/`, `Quiz/*.docx`).
- Media MCP connectors are available in the session: **ElevenLabs** (voiceover), **Magnific** (images),
  **Whisper** (captions), **Claude Preview** (review app). If any is missing, tell the user before that stage.

## Stages & gates (pause at every GATE; never skip ahead)

1. **Parse** — `runtime/node/node.exe app/src/build-model.js "$COURSE_DIR"` → `.pipeline/course.model.json`.
   Present the parsed modules/lessons/videos + warnings.
   → **GATE 1 · Scope & structure:** ask for final title/subtitle, **pass mark**, **brand/accent**,
     **ElevenLabs voice ID**, and **per-module readings (title + URL)** — the outline lacks these.
     Write them into `course.model.json`. (skills: `research`, `outline`)

2. **Direction** — propose the image look + the voice/tone.
   → **GATE 2 · Art & voice direction:** approve before mass generation. (skills: `image-generation`, `voiceover`)

3. **Media (parallel)** —
   - Images via **Magnific** → `generated/images/<key>.png`, cropped to **1792×2432**
     (keys: `title`, `home`, `m<n>`, `m<n>l<li>`, `r<n>read`, `qi<n>`). Real photos / composites, **no illustrations**, unique per slide.
   - Voiceover: write the narration script first →
     **GATE 3 · Voiceover script:** approve the script text →
     then generate audio via **ElevenLabs** → `Voiceovers/<slideId>.mp3` (+ `cues.json`).
   - Captions via **Whisper** → `captions/<basename>.vtt`. (skill: `captions`)

4. **Assemble + review** — `runtime/node/node.exe app/build-v2.js "$COURSE_DIR" --emit`; run the
   review app; read feedback via the **scorm-review MCP**, apply fixes, `scorm_ack_feedback`, re-emit.
   → **GATE 4 · Built-course review:** iterate until `scorm_gate_decision` is `approved`. (skills: `assemble-build`, `review`)

5. **Finalize** — `runtime/node/node.exe app/build-v2.js "$COURSE_DIR"` (prefix `VIDEOS_DIR=Videos_min`
   to build from a compressed video tree for a smaller zip). Validate + log under `logs/`.
   → **GATE 5 · Final approval:** produce the final zip only after explicit approval. (skill: `package-scorm`)

## Notes
- Re-running stage 1 never clobbers a confirmed model: `build-model.js` writes `course.model.autogen.json`
  when `course.model.json` already exists — diff, then promote.
- Honor all Hard Rules in `CLAUDE.md` (unique 1792×2432 images, 16:9, question-layout, no illustrations, no em/en dashes).
- Parallelize media stages with the stage agents in `agents/` when useful; keep the human at the gates.
