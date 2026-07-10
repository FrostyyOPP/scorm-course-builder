# Memory

Durable, categorized notes that outlive a single run. Where `logs/` is the raw per-run
record, `memory/` is the distilled knowledge the pipeline reuses across courses and
sessions. Read it during the **research** stage; write to it whenever a decision or fix is
worth remembering.

## Organization
Group notes by **topic**, and within each note flag **priority** (`P1` critical / `P2`
important / `P3` nice-to-know). Suggested files:

- `tooling.md` — durable facts about the toolchain and the hard rules.
  - **HARD RULES (P1):** Voiceover -> ElevenLabs only · Images -> Magnific only ·
    Icons -> Flaticon · Animation -> GSAP + Lottie · Captions -> Whisper.
  - Node + ffmpeg + Whisper are vendored under `runtime/` (self-contained); call `runtime/node/node.exe`.
  - Build commands: `node app/build-v2.js "<COURSE_DIR>"` (zip) / `--emit` (review JSON).
- `course-decisions.md` — per-course choices: scope, voice, art direction, pass mark,
  module/quiz mapping, which modules carry real videos vs. index-only.
- `recurring-fixes.md` — fixes that keep coming up: caption filename-must-match-media,
  missing-image-key renders an empty hero, question-layout overflow at long option text,
  contrast tweaks per accent theme, SCORM completion threshold (`passPercentage` 70).

## Entry format
```md
## [P1] Captions must match media basename
Stage: captions / assemble-build
`videoAsset()` only attaches `captions/<basename>.vtt`. A mismatched name silently drops
captions. Verify names before building.
```

Keep entries short, dated, and de-duplicated; promote anything that recurs in `logs/` into a
note here.
