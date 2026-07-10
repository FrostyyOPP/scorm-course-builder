# Animation & Design System

The visual and motion language for SCORM Studio's animated 16:9 engine. Flat design + glassmorphism, a fixed type scale, broadcast-safe margins, and restrained GSAP motion. Apply consistently across every course.

---

## 1. Design tokens

### Color palette
| Token   | Hex       | Role |
|---------|-----------|------|
| Navy    | `#1E3A8A` | Primary / backgrounds / headings, structural anchor |
| Teal    | `#14B8A6` | Secondary / progress / success accents |
| Coral   | `#F97316` | Primary call-to-action / emphasis / highlights |
| Violet  | `#8B5CF6` | Tertiary accent / data viz / variety |

- Use navy as the structural base, teal/coral/violet as accents. Never rely on color alone to convey meaning (WCAG 1.4.1).
- Verify every text/background pairing against the contrast floors in `data/wcag/wcag-2.2-aa-checklist.md` (4.5:1 body, 3:1 large/UI) — **especially over glass and gradient meshes**, where effective contrast drops.

### Typography — **Inter**
Single family, weight for hierarchy. Fixed type scale (authored at 1920×1080):

| Level | Size | Use |
|-------|------|-----|
| Hero  | 80px | Title slide, big statements |
| H1    | 64px | Slide/section headings |
| Body  | 32px | Default reading/VO support text |
| Floor | 28px | **Minimum** — never go below 28px |

- 28px is a hard floor; smaller text fails legibility on projected/scaled displays.
- Keep generous line-height (≥ 1.5) and let text blocks reflow without clipping (WCAG 1.4.12).

### Surfaces — flat + glassmorphism
- **Flat** base: solid fills, no skeuomorphic gradients on UI chrome, crisp geometry.
- **Glassmorphism** for panels/cards: frosted glass (translucent fill + `backdrop-filter: blur(...)`), thin light border, soft shadow for lift.
- **Gradient-mesh backgrounds**: soft multi-stop meshes built from the palette (navy → violet → teal blends) as the stage backdrop, with frosted-glass panels floating over them.
- Always back text on glass with enough opacity/scrim to hold contrast.

---

## 2. The locked 16:9 stage

- Every slide is authored at **1920×1080 (16:9)**.
- The stage **scales as one unit** — all layout is proportional to this canvas; nothing is laid out for arbitrary viewport sizes. Proportional scaling preserves zoom behavior (WCAG 1.4.4 / 1.4.10).

### Broadcast-safe margins (SMPTE)
Keep content inside safe areas so nothing important is clipped on any display:
- **Title-safe: 10%** inset on all sides → keep titles, key text, and primary CTAs inside this region.
- **Action-safe: 5%** inset → no essential content outside this; backgrounds/meshes may bleed to the edge.
- This directly supports the "never let options overflow / lose safe margins" hard rule for question layouts.

---

## 3. Motion (GSAP) — taste & defaults

Motion should feel smooth, purposeful, and quick. It supports comprehension; it never gates it.

### Easing
- **Entrances / reveals:** `power2.out` or `power3.out` — decelerate into place.
- **Pops / emphasis** (a number landing, an icon arriving): `back.out(1.7)` — slight overshoot for playful punch. Use sparingly.

### Timing & rhythm
- **Reveals ~320ms** — the default duration for an element animating in.
- **Stagger 80ms** — when revealing a series (list items, tiles, options), offset each by ~80ms for a clean cascade.
- Sequence content to match the voiceover beat; don't dump everything at once, don't drag it out.

### Lottie
- **Lottie for button polish** and small affordance micro-interactions (hover/press states, success checks, loading). Keep it subtle and short.

### Hard accessibility constraints on motion
- **Honor `prefers-reduced-motion`**: when set, disable/strip entrance and parallax animation, drop to instant or short cross-fades, and pause Lottie loops.
- Provide a **Pause/Play** control for any animation/auto-updating content > 5s (WCAG 2.2.2).
- **Never flash** more than 3×/second (WCAG 2.3.1) — our smooth eases are already safe; don't add strobing emphasis.
- Animation must never break keyboard operation or focus order (WCAG 2.1.1 / 2.4.3) — animated buttons are still real, operable controls.

---

## 4. Quick design gate (before shipping a slide)

- [ ] Authored at 1920×1080; content inside title-safe (10%) / action-safe (5%).
- [ ] Type from the scale; nothing below the 28px floor; Inter throughout.
- [ ] Palette used correctly (navy base, teal/coral/violet accents); meaning never color-only.
- [ ] Text contrast verified **as composited over glass/mesh** (4.5:1 / 3:1).
- [ ] Glass panels carry a sufficient scrim behind text.
- [ ] Entrances `power2/3.out` ~320ms, pops `back.out(1.7)`, lists stagger 80ms.
- [ ] `prefers-reduced-motion` honored; Pause/Play present for long/looping motion.
- [ ] No flashing > 3/sec; animation doesn't trap or reorder focus.
```
