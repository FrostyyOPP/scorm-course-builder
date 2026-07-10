# Logs

One log file per run. Log **every** run — successes and failures — so the pipeline has an
auditable history and recurring problems become visible.

## Run-log format
One markdown or JSON file per run. Name files
`YYYY-MM-DDTHH-MM-SS_<course-slug>_<stage>.{md,json}`.

Each entry records:

| Field       | Meaning                                                            |
|-------------|--------------------------------------------------------------------|
| `timestamp` | ISO 8601 start time of the run.                                    |
| `course`    | Course folder / title (the `COURSE_DIR`).                          |
| `stage`     | Pipeline stage: research, outline, assemble-build, image-generation, voiceover, captions, package-scorm, review. |
| `status`    | `success` or `failure`.                                            |
| `details`   | What happened — counts (slides, questions, assets), warnings, errors, decisions, tools used (honoring the hard rules). |
| `artifacts` | Paths produced — the zip, `.review/` JSON, image keys, `.vtt` files, audio files. |

### JSON example
```json
{
  "timestamp": "2026-06-25T16:40:00Z",
  "course": "AI and Digital Transformation in Clinical Practice",
  "stage": "assemble-build",
  "status": "success",
  "details": "node app/build-v2.js — 84 slides, 40 questions, 31 assets, 2 warnings (missing M3 videos).",
  "artifacts": ["<COURSE_DIR>/ai-and-digital-transformation-...-v2-SCORM12.zip"]
}
```

### Markdown example
```md
# 2026-06-25 16:40 · assemble-build · success
- course: AI and Digital Transformation in Clinical Practice
- details: 84 slides · 40 questions · 31 assets · 2 warnings (missing M3 videos)
- artifacts: .../ai-and-digital-...-v2-SCORM12.zip
```

## `memory/`
Durable, categorized notes that persist across runs and sessions — see
[`memory/README.md`](memory/README.md). Logs are the per-run record; `memory/` is the
distilled, reusable knowledge.
