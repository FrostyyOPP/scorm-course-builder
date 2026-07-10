---
name: outline
description: Use after research to turn the course structure into the concrete slide plan that build-v2.js consumes — the MODULES/lessons/videos tree, readings, quiz mapping, and per-module accents.
---

# Outline

## Purpose
Translate the approved research note into the exact data shape the engine assembles. The
engine in `app/build-v2.js` is data-driven: it walks a `MODULES` array and emits the slide
sequence. This stage produces and verifies that plan so `assemble-build` is mechanical.

## Inputs
- The research note from the **research** stage (modules, lessons, video codes, quiz count).
- The course outline (`.docx`/`.md`) and quiz `.docx` in `COURSE_DIR`.
- `data/best-practices/` for course-structure and instructional-design taste.

## Outputs
- A confirmed slide plan: the `MODULES` tree (module -> lessons -> videos with exact file
  paths under `Videos/`), per-module `READINGS` links, per-module accent colors, and the
  quiz-to-module mapping (10 questions per module, keyed `M1..M4`).
- An image-key list (`home`, `quiz`, `m1`, `m1l1`, ...) for **image-generation** to fill.
- A voiceover line list (if narration is in scope) for **voiceover**.
- A run-log entry.

## Tools
- `Read` for the outline and quiz; `Edit` on `app/build-v2.js` if module/lesson/video data
  must be updated to match the real course.
- No media tools here (hard rules apply downstream only).

## Steps
1. Map the outline onto the engine's expected shape (see `MODULES`, `READINGS`,
   `COURSE_INTRO`, `OUTRO` in `app/build-v2.js`).
2. For each video, record the exact relative path under `Videos/` so
   `videoAsset()` resolves it; flag any file the assembler would warn about as missing.
3. Confirm the slide sequence the engine will emit (per `assemble()`):
   `title -> home -> course intro -> [moduleIndex -> (module intro) ->
   (lessonIndex -> videos) -> readings -> quizIntro -> questions -> result] -> outro -> exit`.
   These slide `type`s are exactly what `app/src/shell-v2/player.js` knows how to render.
4. Assign accents per module (`ACCENT` map: indigo/teal/coral/violet).
5. Enumerate the image keys and (if in scope) the voiceover lines.

## Handoff
- Image key list -> **image-generation**.
- Voiceover line list -> **voiceover**.
- Confirmed `MODULES`/quiz plan -> **assemble-build**.
These three can run in parallel once the plan is locked.
