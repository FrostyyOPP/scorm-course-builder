---
name: package-scorm
description: Use to produce and validate the final SCORM 1.2 zip once the course is approved — correct manifest, run-time API wiring, and aggregate scoring.
---

# Package SCORM

## Purpose
Produce the final, valid SCORM 1.2 package once review has approved the course. The build
already emits a zip; this stage owns the final, validated artifact and confirms the SCORM
run-time contract (manifest, scoring, completion, bookmarking).

## Inputs
- An approved course (review gate decision `approved`).
- The locked slide plan and all generation assets (images, videos, captions, VO).
- `data/scorm/` (SCORM 1.2 manifest + run-time API rules).

## Outputs
- `<COURSE_DIR>/<slug>-v2-SCORM12.zip` — the final deliverable.
- A run-log entry recording the artifact path, slide/question/asset counts, and the
  approving review decision.

## Tools
- `Bash`/`PowerShell` for the vendored Node: `runtime/node/node.exe`. `tools.json` at the repo
  root records the resolved paths, and `SCORM_NODE` / `SCORM_FFMPEG` / `SCORM_FFPROBE` /
  `SCORM_WHISPER` / `SCORM_WHISPER_MODEL` env vars override them.
- No media tools (hard rules already satisfied upstream).

## Steps
1. Build the final zip: `runtime/node/node.exe app/build-v2.js "<COURSE_DIR>"` (prefix
   `VIDEOS_DIR=Videos_min` to build from the compressed video tree for a smaller zip).
   The assembler copies `shell-v2` (`styles.css`, `player.js`, `vendor/`), reuses the v1
   `scorm-api.js`, writes `imsmanifest.xml` via `buildManifest`, and zips with `zipDir`.
2. Confirm the SCORM run-time wiring in `player.js`: `reportScore()` aggregates correct
   answers across all `question` slides, calls `SCORM.setScore(pct,0,100)`, and
   `SCORM.setComplete(pct >= passPercentage)` (default 70). Bookmark + suspend state persist
   via `encodeState`/`restoreState`; `doExit` calls `setComplete`/`finish`.
3. Validate against `data/scorm/`: manifest is well-formed, `index.html` is the entry
   resource, all referenced assets are present in the zip.
4. Verify counts in the build output (slides, quiz questions, assets) match the plan and that
   there are zero unresolved warnings.

## Handoff
Deliver the zip. Pass the validated package to **review** only if a final QA pass is
requested; otherwise log it as finalized.
