---
name: assemble-build
description: Use to run build-v2.js — assemble the course folder into the animated 16:9 SCORM 1.2 zip, or --emit the .review/course.json for the reviewer app.
---

# Assemble & Build

## Purpose
Run the engine. `app/build-v2.js` reads the course folder, pulls in generated images,
videos, and captions, builds the slide JSON, copies the `shell-v2` engine, writes the
`imsmanifest.xml`, and zips a valid SCORM 1.2 package. This stage owns invoking it and
triaging its warnings.

## Inputs
- A locked slide plan from **outline**, captured in `<COURSE_DIR>/.pipeline/course.model.json`
  (produced by `runtime/node/node.exe app/src/build-model.js "<COURSE_DIR>"`; edit the model, not a
  MODULES array in build-v2.js).
- Generated images under `<COURSE_DIR>/generated/images/<key>.png` (from **image-generation**).
- Videos under `<COURSE_DIR>/Videos/...`.
- Caption `.vtt` files under `<COURSE_DIR>/captions/` (from **captions**) — matched by
  basename to each video.
- Voiceover audio (if in scope) referenced by slide `vo` fields.

## Outputs
- `<COURSE_DIR>/<slug>-v2-SCORM12.zip` (full build), or
- `<COURSE_DIR>/.review/course.json` + `assets.json` + `index.html` (with `--emit`) for the
  review app and the scorm-review MCP.
- A run-log entry listing slide count, question count, asset count, and any warnings.

## Tools
- `Bash` / `PowerShell` to run the vendored Node: `runtime/node/node.exe` (relative to the SCORM
  Studio root). `tools.json` at the repo root records the resolved paths, and the `SCORM_NODE` /
  `SCORM_FFMPEG` / `SCORM_FFPROBE` / `SCORM_WHISPER` / `SCORM_WHISPER_MODEL` env vars override them.
- `Edit` on `<COURSE_DIR>/.pipeline/course.model.json` to correct the data plan (never edit
  `app/build-v2.js` engine behavior in a way that breaks the hard rules; the old hardcoded MODULES
  array no longer exists).

## Steps
1. Build the zip:
   `runtime/node/node.exe app/build-v2.js "<COURSE_DIR>"` (optionally `--out <dir>`). Prefix
   `VIDEOS_DIR=Videos_min` for a compressed build. Emit review JSON instead:
   `runtime/node/node.exe app/build-v2.js "<COURSE_DIR>" --emit`.
2. The assembler resolves assets via `image(key)` (looks for
   `generated/images/<key>.png`), `videoAsset(rel, dest)` (resolves under `Videos/` and
   auto-attaches a sibling `.vtt` from `captions/`), and `app/src/parse-quiz.js` for the quiz.
   Missing videos become warnings, not failures — review them.
3. The package wires the engine: `index.html` loads `vendor/gsap.min.js`,
   `vendor/lottie.min.js`, `scorm-api.js`, then `player.js` with `window.COURSE` set to the
   slide JSON and `passPercentage` (default 70). The stage is fixed 1920x1080 and scaled.
4. Confirm the slide `type`s emitted match what `app/src/shell-v2/player.js` renders
   (`title`, `home`, `moduleIndex`, `lessonIndex`, `video`, `reading`, `quizIntro`,
   `question`, `result`, `exit`). Any new type needs an `R.<type>` renderer first.
5. Resolve warnings (missing videos/images/captions) by re-running the relevant generation
   stage, then rebuild.

## Handoff
- For human review -> use `--emit` and hand the `.review/` folder to **review**.
- When generation assets are missing -> back to **image-generation** / **voiceover** /
  **captions**, then rebuild.
- When the build is clean and approved -> **package-scorm** for the final zip.
