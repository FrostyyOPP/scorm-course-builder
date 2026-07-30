---
name: localize
description: Use to build a localized (e.g. French) course from an English source when the client supplies ONLY English videos, an outline, and a quiz document. Encodes the hard rules that prevent the specific failures seen on real deliveries.
---

# Localize a course into another language

## Setup on a new machine (once per machine, not per course)

Cloning `scorm-course-builder` from GitHub gets the code only. Two things are gitignored (too
large / machine-specific) and must be added once per machine before the pipeline runs:

1. **`runtime/`** — vendored `node`, `ffmpeg`, `whisper` (+ the `ggml-small.bin` multilingual and
   `ggml-silero-v5.1.2.bin` VAD models). Copy this folder in from another machine that has it (it's
   ~925MB, over GitHub's 100MB file limit, hence gitignored). Without it `localize.js` falls back to
   whatever `node`/`ffmpeg` are on PATH, if any.
2. **`app/node_modules`** — run `app/runtime/node/node.exe` … actually: from the repo root,
   `runtime/node/npm.cmd --prefix app install` (or `cd app && ../runtime/node/npm.cmd install`).
   `app/package.json` declares `archiver`, `js-yaml`, `mammoth`; without them `build-v2.js` fails at
   the package stage with `Cannot find module 'archiver'`. The review app has its own dependencies
   under `app/review-app/` — only needed if you're running the visual reviewer, not for the CLI
   pipeline — install the same way if you use it.

Verified 2026-07-30: a fresh `git clone` + these two steps ran a synthetic course through every
stage (`tts → menuvo → dub → caption → compress → package`) to a valid, French-verified SCORM zip.

## Input contract — HARD RULE L0

The client supplies exactly three things. Do not ask for more, and do not assume more exists.

```
<course>/Videos_en/**.mp4     English source videos, in "Module N/Lesson N" folders
<course>/Outline/*.docx       module / lesson / video titles + per-module readings
<course>/Quizzes/*.docx       graded assessment
```

Everything else is **derived**. In particular:

- **There is no narration script.** The client will not provide one. Recover it by transcribing
  the English videos with Whisper, then translate that. Budget for it: it is a real stage.
- **There are no images.** Source them (see the image hard rules below).
- **There is no voiceover for the menu/index slides.** Author those scripts from the outline.

Ask the reviewer for only what genuinely cannot be derived: **target language, pass mark, and the
bilingual convention** (below). Then proceed without further check-ins.

### The ElevenLabs voice id is a supplied input — HARD RULE L0b

**The client provides a specific voice id for each course.** It is not derivable, not a default,
and not carried over.

- **Never reuse another course's voice id**, even a sibling localization of the same client's
  catalogue. Each course gets its own.
- **Never pick a voice yourself** from the catalogue.
- If it has not arrived, **stop and ask** — do not start TTS on a guess. `localize.js` refuses to
  run the `tts` and `menuvo` stages without an explicit `voiceId` in `.localize.json` (or an
  `.eleven-voice` file), so a missing voice fails fast instead of silently producing a full
  course in the wrong voice.

This rule exists because it was broken once: the id did not come through in chat, a previous
course's voice was substituted to avoid stalling, and ~3.8 hours of narration was generated
before that could be confirmed. Regenerating is affordable but the API spend is not free, and a
wrong-voice delivery is worse than a late one. **Wait for the id.**

## Configuration

`<course>/.localize.json`:

```json
{
  "lang": "fr",
  "langLabel": "Français",
  "voiceId": "<elevenlabs voice id>",
  "ttsSpeed": 1.2,
  "tempoClampHi": 1.32,
  "menuTemplates": {
    "intro": {
      "course":  "Dans ce cours, nous aborderons les sujets suivants.",
      "module":  "Dans ce module, nous aborderons les sujets suivants.",
      "lesson":  "Dans cette leçon, nous aborderons les sujets suivants."
    },
    "ordinals": ["Premièrement","Deuxièmement","Troisièmement","Quatrièmement","Cinquièmement"],
    "outro": "Cliquez sur chaque onglet pour en savoir plus."
  }
}
```

Credential: `<course>/.eleven-key`. **Never commit it.**

## Run it

```
node app/localize.js "<courseDir>"                 # all stages, resumable
node app/localize.js "<courseDir>" --from dub      # resume partway
node app/localize.js "<courseDir>" --check         # is translation done?
```

Stages: `transcribe → tts → menuvo → dub → caption → compress → package`

`translate` is deliberately **not** a stage — it needs a language model. The pipeline hard-stops
before `tts` until `narration-<lang>/` is fully populated.

---

# The hard rules

Each exists because of a specific failure on a real delivery. Do not relax one without
understanding what it cost.

### L1 — Build a terminology glossary before translating a single video
Write `_src/glossary-<lang>.md` first: every domain term, framework name and recurring phrase
with its binding target-language rendering, plus house style (formal register, no em/en dashes,
sentences short enough for TTS pacing, numbers preserved with locale decimals). Every translator
— human or agent — must read it first. Without this, the same concept renders three different
ways across 54 videos and the course reads as machine output.

### L2 — Fix ASR artefacts during translation, never translate them literally
Whisper reliably mangles product names and domain terms. Real examples from one course:
`"outside" → outsight`, `"ASIC updates" → async`, `"fax feelings identity" → Facts/Feelings/Identity`,
`"chat to BT" → ChatGPT`, `"Grammar League" → Grammarly`. Translated literally these become
nonsense in the target language. Instruct translators explicitly to repair them, and to fix
narration that announces the wrong video title (also seen — twice in one course).

### L3 — Quiz answer keys must survive translation position-for-position
Verify programmatically, never by eye, that every question still has exactly one correct option
and that the `correct` flags align index-for-index with the source. Run the check after **every**
pass that touches quiz files. A translator reordering options silently breaks scoring.

Prefer an authored quiz `.docx` over a published Storyline quiz when both exist: the doc carries
explanations and per-option feedback, and has proven more correct. On one course the published
version had a question with **no correct answer at all** — unpassable — which the doc fixed.

### L4 — Generate narration at faster TTS delivery; never rely on post-hoc speed-up
Translated narration runs longer than the English picture (French ≈ 1.4x once the synthetic voice's
pacing is included). Time-stretching audio after the fact either sounds rushed or silently truncates
the tail.

Set `ttsSpeed: 1.2` (the engine maximum) so the audio is *spoken* faster, then let the dub stage
apply only gentle time-fitting.

**Truncation is a build failure.** `localize.js` throws if any clip would be cut. On one course this
rule was missing and **~21 minutes of narration was silently lost** across 20+ videos, up to 62
seconds on a single clip, with sentences stopping mid-flow. If it throws: raise `ttsSpeed`, then
`tempoClampHi`, delete `audio-<lang>/video` and `Videos`, re-run from `tts`.

### L5 — Menu/index slide narration: fixed shape, measured cues
Narration is: intro sentence, then *ordinal + item title* per card, then a fixed outro. No item
counts, no "Module N" prefixes. Synthesize the intro, each item and the outro as **separate clips**,
concatenate them, and take card-reveal cue times from **real audio durations**. Word-level ASR
timestamps are unreliable here and collapse partway through longer clips.

When a title is bilingual `Target (English)`, the spoken text uses the **target half only** — never
read a bracketed gloss aloud.

### L6 — Never transcribe narration you authored
Any voiceover synthesized from text you already have (title, exit, quiz intros, readings, and the
stitched menu clips) gets its captions **authored from that text**, not transcribed. ASR can only
add error. Observed twice: a French `"Cliquez sur Quitter"` came back as `"Cliquez sur Twitter"`,
and stitched clips induce hallucinated words at the silent joins. `localize.js` authors these
automatically; only the dubbed *videos* are transcribed.

### L7 — Assert the model points at the localized compressed tree before packaging
`model.videosDir` must be `Videos_min` (the compressed **dubbed** tree). If it still points at
`Videos_en` — easy to leave behind after an early dry-run — the zip ships the **English** videos
and looks superficially fine. This happened: a 2.2 GB "French" package containing English audio.
`localize.js` now refuses to package unless the check passes.

Verify the built zip too: manifest present, and expected counts of video, caption and audio assets.

### L8 — Prove the output language; don't infer it from file sizes
Extract a video from the finished zip and run language detection on its audio. Anything less is a
guess. (`whisper-cli -l auto` reports the detected language and a confidence.)

### L9 — Captions in both languages, VAD always on
Target-language captions transcribed from the **actual dubbed audio**; English captions reused from
the source transcription (dubbing preserves each video's exact length, so they stay valid). Set
`captionLangs` in the model so the engine emits both tracks. Never omit `--vad --vad-model` — without
it whisper.cpp's fixed ~30s decode window can leave spoken words **entirely uncaptioned**, not
merely mistimed.

### L10 — Images: real photographs, unique, and actually looked at
Real stock photography only — no vector illustrations, clip-art or renders. One image per
image-bearing slide, no reuse, authored at 1792x2432. Specific alt text per image in the target
language.

**Look at every final image before accepting it.** Stock metadata claiming "not AI generated" does
not guarantee a photograph; a clip-art render shipped once because this check was skipped.

### L11 — Pin the bilingual convention before doing 40+ edits
This is a taste decision, not a technical one. Agree it explicitly, then apply it consistently. The
convention settled on across two courses:

| Element | Treatment |
|---|---|
| Course title, module titles, lesson titles, video titles | `Target (English)` |
| Quiz question stems and answer options | `Target (English)` |
| Quiz feedback / explanations | `Target (English)` |
| Result and completion slide text | `Target (English)` |
| Navigation and action buttons (Previous / Next / Submit) | **English only** |
| Voiceover, everywhere | **Target language only** — never speak the gloss |

Beware: "keep this slide in English" from a reviewer usually means *add the English gloss*, not
*switch the slide to English*. Confirm which before rewriting a slide.

### L12 — Use a course-specific skin for per-course styling
Never edit a shared skin to satisfy one course's review comment — it silently restyles every other
course built on it, including already-approved deliveries. Copy it to `skins/<name>-<variant>.css`
and point that course's model at the copy.

Note for long bilingual question stems: the engine clamps `.q-question` to 3 lines then shrinks the
font to fit, so bilingual text ends up small. Raising the font alone does nothing. Raise the
line-clamp **and** the base size together.

### L13 — Readings go in the outline, and they render after each module
The outline carries a recommended reading per module. Add them as `module.readings[]` so the engine
renders a reading slide after that module's lessons and before its quiz. They need their own image
and their own voiceover clip.

---

## Performance expectations — be honest about these

Measured on a 54-video, 3.8-hour course (20 cores):

| Stage | Time | Notes |
|---|---|---|
| Transcribe source | ~3 min | 10-way; **skipped entirely if the source ships caption files** |
| Translate | ~10 min | parallel agents; the only non-compute stage |
| TTS | ~4 min | 6-way; was 24 min when run serially |
| Dub | ~1 min | 6-way |
| **Caption target** | **~30 min** | 10-way and still the floor; scales with total video minutes |
| Compress | ~4 min | 8-way |

**A 20–25 minute end-to-end target is realistic for a 1–2 hour course. A ~4-hour course lands
nearer 45 minutes, dominated by captioning.** Do not promise faster than that without changing
the captioning approach — the remaining wins are GPU Whisper, or a source that already ships
captions.

## Handoff

Background and rationale for the shared engine behaviour: `PLAYBOOK.md` §7 (multi-language
dubbing) and §4 (caption methodology). Review cycle: `PLAYBOOK.md` §8 and `skills/review/SKILL.md`.
