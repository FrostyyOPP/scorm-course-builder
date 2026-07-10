---
name: image-generation
description: Use to create every course image — hero/home, module, lesson, and quiz art — with Magnific ONLY, written to generated/images/<key>.png for the assembler.
---

# Image Generation

## Purpose
Produce the on-brand still imagery the engine renders behind title/home slides and inside
the octagon hero blocks on module, lesson, reading, and quiz-intro slides.

## Inputs
- The image-key list from **outline**: `title`, `home`, `m<n>`, `m<n>l<li>`, `r<n>read`, `qi<n>`.
  Keys map 1:1 to the `image('<key>')` calls and the `img:` fields the build resolves.
- Art-direction decisions from **research** (palette, subject, tone).
- Reusable on-brand stills in `assets/hero-photos/` — check here first to avoid regenerating.

## Outputs
- `<COURSE_DIR>/generated/images/<key>.png`, one PNG per image key.
- Genuinely reusable, brand-defining stills also copied to `assets/hero-photos/`.
- A run-log entry listing the keys generated and their prompts.

## Tools — HARD RULE
- **Images -> Magnific ONLY.** Do not use any other image generator. Use Magnific
  `stock_search`/`stock_download` for real stock photos, and `images_generate` for composited
  hero images.
- **Real photos or generated composites only — NO flat vector illustrations.**
- Icons are out of scope here — **icons come from Flaticon** (the engine ships its own inline
  SVG control icons in `player.js`; decorative iconography uses Flaticon).
- `Bash`/`PowerShell` to place PNGs at the exact path/key. Downscale/crop with
  `runtime/ffmpeg/ffmpeg.exe` (paths recorded in `tools.json`; `SCORM_FFMPEG` overrides).

## Steps
1. For each image key, check `assets/hero-photos/` for a suitable existing still first.
2. Generate missing stills with Magnific using consistent art direction (single course look):
   real photos via `stock_search`/`stock_download`, or composited heroes via `images_generate`.
   Author at **1792x2432** (title/home may be full-bleed landscape). Hero blocks crop to an
   octagon, so keep the subject centered with safe margins.
3. Save each as `<COURSE_DIR>/generated/images/<key>.png`. Every image-bearing slide gets a
   DISTINCT image (unique-image rule); the build warns on duplicates. The assembler's `image(key)`
   only includes a file that exists at that exact path; a missing key renders an empty hero
   block (the engine's `imgBlock` handles an empty src gracefully).
4. Promote any reusable, brand-defining stills into `assets/hero-photos/`.

## Handoff
PNGs land where **assemble-build** expects them. This stage runs **in parallel** with
**voiceover** and **captions**. After it completes, trigger a rebuild.
