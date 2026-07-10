---
name: research
description: Use at the very start of a course session to read CLAUDE.md, the data/ knowledge base, and the attached course folder, then capture scope decisions before any building.
---

# Research

## Purpose
Establish ground truth for the session before anything is built. The research stage
loads the project rules, the knowledge base, and the attached course, then resolves the
open questions (scope, voice, art direction, pass mark) so every later stage has a single
source of truth to build against.

## Inputs
- `D:\Claude\SCORM Studio\CLAUDE.md` (project rules + hard tool rules).
- `data/scorm/` (SCORM 1.2 / 2004 packaging rules, manifest, run-time API).
- `data/wcag/` (WCAG 2.2 AA checklist + e-learning accessibility patterns).
- `data/best-practices/` (course structure, instructional design, animation taste).
- The attached course folder (`COURSE_DIR`): outline (`.docx`/`.md`), `Videos/`,
  quiz `.docx`, optional `captions/`, `Voiceovers/`.

## Outputs
- A short research note written to `logs/memory/` (course-specific decisions) capturing:
  modules present vs. outline, video filenames/codes, quiz question count, pass mark,
  voice/art-direction choices, and any gaps (missing videos, missing quiz items).
- A run-log entry under `logs/` recording the stage outcome.

## Tools
- `Read` for `CLAUDE.md`, `data/`, the outline and quiz.
- `Glob` / `Grep` to enumerate `Videos/`, `captions/`, `Voiceovers/`.
- Web research only when the outline requires fact-checking; cite sources in the note.
- No media tools run here. (Hard rules still apply downstream: Images -> Magnific,
  Voiceover -> ElevenLabs, Icons -> Flaticon, Animation -> GSAP + Lottie, Captions -> Whisper.)

## Steps
1. Read `CLAUDE.md`, then `data/scorm/`, `data/wcag/`, `data/best-practices/`.
2. Enumerate `COURSE_DIR`: outline, video files (capture exact codes such as
   `M1L1V1`), quiz `.docx`, any existing `captions/` or `Voiceovers/`.
3. Compare the outline structure to what the build expects: the course structure comes from
   `<COURSE_DIR>/.pipeline/course.model.json` (produced by
   `runtime/node/node.exe app/src/build-model.js "<COURSE_DIR>"`, which auto-parses the outline
   .docx + `Videos/` tree), plus per-module readings and a quiz parsed via `app/src/parse-quiz.js`.
   Note which modules carry real videos vs. index-only.
4. Ask the user the clarifying questions before building: scope, voice, art direction,
   pass mark (default 70 `passPercentage`), modules present vs. outline.
5. Write the decisions to `logs/memory/` and log the run.

## Handoff
Pass the structured research note (modules, lessons, video codes, quiz count, decisions)
to **outline**, which turns it into the concrete slide plan.
