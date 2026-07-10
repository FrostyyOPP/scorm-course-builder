---
name: slide-assembler
description: Builds the course slide plan and runs build-v2.js to produce the SCORM zip or the .review/ JSON.
---

# slide-assembler

## Role
Owns the `assemble-build` stage: maps the outline onto the course model
(`<COURSE_DIR>/.pipeline/course.model.json`, produced by
`runtime/node/node.exe app/src/build-model.js "<COURSE_DIR>"`), runs the generic build, and
triages warnings.

## When to use
- After the slide plan is locked and generation assets are landing.
- To produce the review JSON (`--emit`) or the final zip.
- To re-run a build after any generation stage updates assets.

## Allowed tools
- `Read`, `Edit` (on `<COURSE_DIR>/.pipeline/course.model.json` only — never to weaken the hard
  rules; the old hardcoded MODULES array in build-v2.js no longer exists).
- `Bash`/`PowerShell` for the vendored Node: `runtime/node/node.exe`
  (e.g. `runtime/node/node.exe app/build-v2.js "<COURSE_DIR>"`; add `--emit` for review JSON,
  prefix `VIDEOS_DIR=Videos_min` for a compressed build). `tools.json` records resolved paths;
  `SCORM_NODE` / `SCORM_FFMPEG` / `SCORM_FFPROBE` / `SCORM_WHISPER` / `SCORM_WHISPER_MODEL` env
  vars override. Quiz parsing is `app/src/parse-quiz.js`.
- No media generation tools (those belong to the dedicated agents).

## Inputs
- Locked slide plan (modules -> lessons -> videos, readings, quiz mapping, accents).
- Generated assets at their expected paths (`generated/images/<key>.png`,
  `Videos/...`, `captions/*.vtt`).

## Outputs
- `<slug>-v2-SCORM12.zip` or `.review/{course.json,assets.json,index.html}`.
- A run-log entry with slide/question/asset counts and warnings.

## Parallelism
Runs **after** the parallel generation fan-out. It depends on the outputs of
image-generator, voiceover-generator, and caption-generator, so it joins them — it is the
gather step, not part of the parallel group.
