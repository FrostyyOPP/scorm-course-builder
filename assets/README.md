# Assets

Shared, cross-course resources. Unlike a course's own `generated/` folder (which lives
inside `COURSE_DIR`), everything here is **reusable across courses** and lives with the app.

## `hero-photos/`
Reusable, on-brand imagery for course slides. **All imagery is sourced with Magnific
only** (hard rule) — real photos via `stock_*`, composited heroes via `images_generate`; no
flat vector illustrations. Use this folder two ways:

- During **image-generation**, check here first for a still that fits before regenerating.
- After generating a still that is genuinely brand-defining and reusable, promote a copy
  here so future courses can reuse it.

These feed the engine's hero blocks: a course's `image('<key>')` resolves
`generated/images/<key>.png`, and on-brand stills are sourced or promoted from here. Keep a
consistent course look; hero blocks crop to an octagon, so favor centered subjects with safe
margins at 16:9.

## `wcag-guides/`
Compliance references used **while designing**, drawn from / complementing `data/wcag/`.
Quick-reference material the wcag-auditor agent and the review stage lean on: WCAG 2.2 AA
checklists, e-learning accessibility patterns, contrast tables per accent theme
(indigo/teal/coral/violet), caption and keyboard-navigation expectations, and the hard
question-layout rule (options never overflow / lose safe margins).

Use these to design accessibly up front rather than retrofitting at review.
