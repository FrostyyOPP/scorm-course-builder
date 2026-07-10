# SCORM Studio

SCORM Studio turns a **course folder** (outline + videos + quiz, optional resources) into a
**branded, animated, WCAG 2.2‑minded, accessible SCORM 1.2 package** — with a **review app**
(Next.js + MUI) and a **file‑backed MCP** so a human reviewer stays in the loop at defined gates.

**This folder is self‑contained and portable.** Everything needed to build lives inside it,
including the runtime binaries under `runtime/`. To move it to another Windows machine, copy the
whole `SCORM Studio/` folder. Read this file at the start of every session.

## Golden rules for the operator (you, the LLM)
1. **Never hard‑code a course into the app.** All course specifics live in the course folder
   (`<course>/.pipeline/course.model.json`). The engine (`app/build-v2.js`) is 100% generic.
2. **Always call Node via the vendored runtime:** `runtime/node/node.exe`. Same for ffmpeg/whisper
   (`runtime/ffmpeg/ffmpeg.exe`, `runtime/ffmpeg/ffprobe.exe`, `runtime/whisper/Release/whisper-cli.exe`
   with model `runtime/whisper/ggml-base.en.bin`). `tools.json` (regenerate with
   `runtime/node/node.exe app/src/tools.js --emit`) records the resolved paths; `SCORM_NODE` /
   `SCORM_FFMPEG` / `SCORM_FFPROBE` / `SCORM_WHISPER` / `SCORM_WHISPER_MODEL` env vars override.
3. **Run the pipeline through the gates below.** Pause for the reviewer at each gate; do not skip ahead.
4. **Honor the Hard Rules.** They are enforced/warned by the build and matter for compliance and taste.

## Layout
```
SCORM Studio/
  CLAUDE.md              ← this runbook (read first)
  tools.json             ← resolved runtime tool paths (generated)
  runtime/               ← VENDORED binaries (portable): node/  ffmpeg/  whisper/(+ggml model)
  data/                  ← knowledge base: scorm/  wcag/  best-practices/
  skills/                ← one skill per stage + run-pipeline (the orchestrator)
  agents/                ← parallel-capable stage agents
  logs/                  ← run logs + memory/ (durable notes)
  assets/                ← hero-photos/, wcag-guides/ (reusable, on-brand)
  app/
    build-v2.js          ← GENERIC assembler: course.model.json (+quiz docx +media) → SCORM zip / --emit .review/
    src/
      tools.js           ← resolves vendored runtime (relative), writes tools.json
      build-model.js     ← AUTO-PARSE: Videos/ tree + outline .docx → .pipeline/course.model.json
      course-model.js    ← loads/validates the model; applies VIDEOS_DIR override + defaults
      parse-outline-docx.js ← pulls Course/Module/Lesson/Video titles from the Starweaver outline
      parse-quiz.js      ← parses the graded-quiz .docx (Qn / A–D / Correct Answer / Explanation)
      scorm.js           ← SCORM 1.2 manifest + zip helpers
      shell-v2/          ← the animated 16:9 player engine: player.js, styles.css, vendor/(GSAP,Lottie)
    review-app/          ← Next.js + MUI reviewer + mcp/ (scorm-review MCP; reads COURSE_DIR)
```

## The course folder (input contract)
A course is a folder OUTSIDE this app (e.g. `D:\Claude\<Course Name>\`). Attach one per session by
setting `COURSE_DIR`. Expected contents:
```
<course>/
  Outline/  <course>.docx     ← standard Starweaver outline (Course Title:, Module N + Title of the Module:,
                                Lesson N + Title of the Lesson:, Video N + title, per-module readings)
  Videos/                     ← the video tree; filenames carry codes M<m>L<l>V<v>-<title>.mp4
      INTRO & OUTRO/          ← course Intro / Outro videos
      Module <m>/Lesson <l>/  ← "M<m> Intro ... .mp4" (module intro) + M<m>L<l>V<v>-*.mp4 (lesson videos)
  Quiz/     <quiz>.docx        ← graded quiz (10 questions per module; parse-quiz.js format)
  Resources/<videoId>/*        ← OPTIONAL downloadable files; enables that video's Resources tab
  (generated during the run:)
  .pipeline/course.model.json  ← the parsed + confirmed structure (source of truth for the build)
  generated/images/<key>.png   ← slide images   Voiceovers/<slideId>.mp3 (+cues.json)   captions/<basename>.vtt
  Videos_min/                  ← OPTIONAL compressed video tree (for a smaller final zip)
  .review/                     ← course.json + review state (for the review app + MCP)
```

## The pipeline (run in order; pause at each GATE)
Set `COURSE_DIR` to the attached course. `NODE="runtime/node/node.exe"`.

**0 · Research / attach.** Read this file, `data/`, and the course folder. (skill: `research`)

**1 · Auto‑parse structure.**
`%NODE% app/src/build-model.js "%COURSE_DIR%"` → writes `.pipeline/course.model.json`
(structure from the `Videos/` tree, titles from the outline). (skill: `outline`)

> **GATE 1 — Scope & structure.** Show the parsed modules/lessons/videos and warnings. Ask the
> reviewer for what the outline can't provide: **final course title/subtitle, pass mark, brand
> colors/accent, ElevenLabs voice ID, and per‑module readings (title + URL)**. Write those into
> `course.model.json`. Do not build until confirmed.

**2 · Art & voice direction.** Decide the image look and the voice + narration tone. (skills: `image-generation`, `voiceover`)

> **GATE 2 — Art & voice direction.** Approve the image theme (see Hard Rules: real photos, no
> illustrations, unique per slide, 1792×2432) and the chosen voice + script tone before mass media.

**3 · Generate media (parallel).**
- **Images → Magnific MCP** (`stock_*` for real photos; `images_generate` for composited heroes).
  Save to `<course>/generated/images/<key>.png`. Keys: `title`, `home`, `m<n>`, `m<n>l<li>`,
  `r<n>read`, `qi<n>`. Downscale/crop with ffmpeg to **1792×2432** (title/home may be full‑bleed landscape).
- **Voiceover → ElevenLabs MCP.** First write the per‑slide narration script.

> **GATE 3 — Voiceover script.** Approve the narration script text (per slide) BEFORE generating audio.

  Then generate audio to `<course>/Voiceovers/<slideId>.mp3` (per‑item clips + `cues.json` for
  card‑reveal sync where used).
- **Captions → Whisper.** `%NODE%`-driven or `runtime/whisper/Release/whisper-cli.exe`; write
  `<course>/captions/<video-basename>.vtt` (auto‑attached by the build). (skill: `captions`)

**4 · Assemble + review.**
`%NODE% app/build-v2.js "%COURSE_DIR%" --emit` → writes `.review/`. Run the review app
(`app/review-app`, `next dev`); reviewer comments/annotates/approves; read feedback via the
**scorm-review MCP** (`scorm_review_feedback`), apply fixes, `scorm_ack_feedback`, re‑emit. (skills: `assemble-build`, `review`)

> **GATE 4 — Built‑course review.** Iterate until `scorm_gate_decision` is `approved`.

**5 · Finalize.**
`%NODE% app/build-v2.js "%COURSE_DIR%"` (add `VIDEOS_DIR=Videos_min` to build from the compressed
tree for a smaller zip). Validate the manifest + run‑time wiring. (skill: `package-scorm`)

> **GATE 5 — Final approval.** Only produce the final zip after explicit approval. Log it under `logs/`.

## Hard rules (do not deviate)
- **Voiceover → ElevenLabs only. Images → Magnific only** (real stock photos via `stock_*`, or
  generated composites via `images_generate`). **Captions → Whisper only. Animation → GSAP + Lottie.**
- **Real photos / generated composites — NO flat vector illustrations** (brand preference).
- **Unique image per slide (hard rule):** every image‑bearing slide uses a *distinct* image, authored
  at **1792×2432**. `build-v2.js` warns on any duplicate. (Exception only when the reviewer explicitly
  asks two slides to share one image, e.g. title = module index.)
- Every slide is authored at **1920×1080 (16:9)**; the stage scales as one unit.
- Honor the **question‑layout rule** (options never overflow / lose safe margins; shrink fonts to fit).
- Prefer **spoken** hints in voiceover over on‑screen text where the design calls for it; no em/en dashes in copy.
- **Menu voiceover format (home / moduleIndex / lessonIndex) — HARD RULE.** The narration must be:
  `"In this {course|module|lesson}, we will cover. First, <title>. Second, <title>. Third, <title>[. Fourth, <title>]. Click on each tab to know more about it."`
  Do **not** prefix items with the word "Module/Lesson/Video N" and do **not** announce a count
  ("three videos"). Use ordinals (First, Second, Third, Fourth) followed by the item title only, and
  always end with **"Click on each tab to know more about it."** — never "Select a … to begin / use next…".
  Card‑reveal `cues[]` = the spoken onset of each ordinal (derive via Whisper `-ml 1` word timestamps).
- **Index card titles are Title Case** on moduleIndex/lessonIndex lists (acronyms/brands like GenAI, SQL,
  ChatGPT, LLM, EDA, CRISP‑DM preserved as‑is).
- **WCAG 1.2.2 (captions):** every narrated slide (home/moduleIndex/lessonIndex/quizIntro/reading/title/exit)
  ships a `captions/vo-<id>.vtt` (Whisper from the VO mp3); every video ships `captions/<basename>.vtt`.
  The build attaches both automatically; the player shows captions by default (`ccOn`) with a CC toggle.
- **WCAG 1.1.1 (alt text):** author a real, specific `alt` for each slide image in
  `<course>/generated/images/alt.json` (keyed by image key). The build sets `s.imageAlt` and the player
  renders it on every `<img>`; without it, images fall back to a generic label (a compliance gap — always
  provide alt.json). Describe the photo concisely; do not start with "image of".

## Review MCP contract
`app/review-app/mcp/server.js` (stdio) reads **`COURSE_DIR`** from the environment and works against
`<course>/.review/` (`course.json`, `state.json`, `feedback_pending.json`, `approved.json`, `history/`).
Tools: `scorm_review_status`, `scorm_review_feedback`, `scorm_slide_get`, `scorm_ack_feedback`,
`scorm_gate_decision`, `scorm_chat_inbox`, `scorm_chat_reply`. Shared state: `mcp/lib/review-state.js`.

## Pointers
- Orchestration: `skills/run-pipeline/SKILL.md` (the gated checklist). Stage skills: `skills/<stage>/SKILL.md`.
- Engine + slide types: `app/src/shell-v2/player.js`. Assembler: `app/build-v2.js`. Model + parser: `app/src/course-model.js`, `app/src/build-model.js`.
- Media tools are **MCP connectors** (ElevenLabs, Magnific, Whisper, Preview) — they must be connected in the session; they are not bundled in the folder.
- Log every run (success/failure) under `logs/`; keep durable notes under `logs/memory/`.
