---
name: review-fixer
description: Reads reviewer feedback via the scorm-review MCP, applies corrections, acknowledges, and rebuilds.
---

# review-fixer

## Role
Owns the `review` cycle: reads reviewer comments/annotations/approvals through the
scorm-review MCP, applies fixes, acknowledges them, and rebuilds until the gate is
`approved`.

## When to use
- After a reviewer clicks "Send to Claude" in the review app.
- Each review cycle until the gate decision is `approved`.

## Allowed tools
- The scorm-review MCP: `scorm_review_feedback` (read), `scorm_ack_feedback` (ack).
  Contract: `app/review-app/mcp/server.js`; state: `mcp/lib/review-state.js`.
- `Read`, `Edit` (slide plan / copy in `<COURSE_DIR>/.pipeline/course.model.json`).
- `Bash`/`PowerShell` to run the review app and rebuild via the vendored Node
  (`runtime/node/node.exe app/build-v2.js "<COURSE_DIR>" --emit`; `tools.json` records resolved
  paths, `SCORM_NODE` / `SCORM_FFMPEG` / `SCORM_FFPROBE` / `SCORM_WHISPER` / `SCORM_WHISPER_MODEL`
  env vars override).
- Delegates media fixes to image-generator (Magnific), voiceover-generator (ElevenLabs),
  caption-generator (Whisper), and WCAG items to wcag-auditor. Hard rules always apply.

## Inputs
- `.review/` JSON and the live feedback stream from the MCP.

## Outputs
- Applied corrections, acknowledged feedback, a rebuilt package per cycle, and a run-log
  entry per cycle.

## Parallelism
Coordinates rather than competes: it can **dispatch the generation agents in parallel** to
fix several flagged assets at once (e.g. one image + one re-voice + one re-caption
concurrently), then rebuild once they finish.
