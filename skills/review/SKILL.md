---
name: review
description: Use to run the reviewer app, read reviewer comments/annotations/approvals through the scorm-review MCP, apply corrections, acknowledge feedback, and rebuild until the gate is approved.
---

# Review

## Purpose
Close the human-in-the-loop. Reviewers open the Next.js + MUI app, comment/annotate/approve
on the live course, then "Send to Claude". This stage reads that feedback via the
file-backed scorm-review MCP, applies fixes, acknowledges them, and rebuilds until the gate
decision is `approved`.

## Inputs
- `<COURSE_DIR>/.review/` (from `build-v2.js --emit`): `course.json`, `assets.json`,
  `index.html`. The review app serves the live course same-origin under `/course/`.
- Reviewer feedback (comments, annotations, approvals) via the MCP.
- `data/wcag/` and `data/best-practices/` for adjudicating subjective notes.

## Outputs
- Applied corrections to the slide plan / generation assets.
- Acknowledged feedback and a rebuilt package per review cycle.
- A run-log entry per cycle (feedback items, fixes, ack, rebuild result).

## Tools
- `Bash`/`PowerShell` to run the review app (`app/review-app`, `next dev`) and vendored-Node
  builds (`runtime/node/node.exe`; `tools.json` records resolved paths, `SCORM_NODE` /
  `SCORM_FFMPEG` / `SCORM_FFPROBE` / `SCORM_WHISPER` / `SCORM_WHISPER_MODEL` env vars override).
- The scorm-review MCP: `scorm_review_feedback` (read) and `scorm_ack_feedback` (ack).
  Contract in `app/review-app/mcp/server.js`; shared state in `mcp/lib/review-state.js`.
- Whichever generation stage a fix requires (image -> Magnific, VO -> ElevenLabs,
  captions -> Whisper) — hard rules still apply.
- The review app can deep-link a slide (`?s=<slideId>`) and drive the player via
  `postMessage({ gotoSlide })`, both handled in `player.js` boot.

## Steps
1. Emit and serve: `runtime/node/node.exe app/build-v2.js "<COURSE_DIR>" --emit`, then run the
   review app.
2. Read feedback with `scorm_review_feedback`. Group items by slide id and by the stage that
   owns the fix (copy/structure, image, VO, captions, accessibility).
3. Apply corrections — edit the slide plan in `<COURSE_DIR>/.pipeline/course.model.json` for
   structure/copy, or re-run the owning generation stage for media. Route WCAG items to the
   **wcag-auditor** agent.
4. Acknowledge with `scorm_ack_feedback`, then rebuild and re-emit for the next cycle.
5. Repeat until the gate decision is `approved`.

## Handoff
When approved -> **package-scorm** for the final zip and log it as finalized. When fixes need
generation -> the relevant stage, then return here.
