---
name: image-generator
description: Generates all course imagery with Magnific ONLY and writes generated/images/<key>.png.
---

# image-generator

## Role
Owns the `image-generation` stage: produces the hero/home, module, lesson, and quiz stills
for the course.

## When to use
- Once the image-key list is known (from `outline`).
- To regenerate a still in response to a review note.

## Allowed tools — HARD RULE
- **Images -> Magnific ONLY.** No other image generator. Real stock photos via
  `stock_search`/`stock_download`; composited hero images via `images_generate`.
- **Real photos or generated composites only — NO flat vector illustrations.**
- `Read`, `Glob` (to check `assets/hero-photos/` for reusable stills).
- `Bash`/`PowerShell` to place PNGs at the exact key path and to downscale/crop with
  `runtime/ffmpeg/ffmpeg.exe` (paths in `tools.json`; `SCORM_FFMPEG` overrides).
- (Icons are Flaticon, not this agent.)

## Inputs
- Image-key list (`title`, `home`, `m<n>`, `m<n>l<li>`, `r<n>read`, `qi<n>`) and art direction.
- Existing reusable stills in `assets/hero-photos/`.

## Outputs
- `<COURSE_DIR>/generated/images/<key>.png` per key, each a DISTINCT image (unique-image rule)
  authored at 1792x2432 (title/home may be full-bleed landscape); reusable stills promoted to
  `assets/hero-photos/`.
- A run-log entry with keys + prompts.

## Parallelism
Runs **concurrently** with caption-generator and voiceover-generator. None of the three
depend on each other; the slide-assembler joins them afterward.
