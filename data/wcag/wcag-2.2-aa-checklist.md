# WCAG 2.2 Level AA Checklist — Animated E-Learning Slides

Practical, engine-specific checklist for SCORM Studio's animated 16:9 player. Target conformance: **WCAG 2.2, Level AA** (which includes all A and AA criteria). Organized by **POUR**: Perceivable, Operable, Understandable, Robust.

Each entry: **SC number — Name (Level)** → what it means for our slides → how to satisfy it in the engine.

> **New in WCAG 2.2** (do not miss these): 2.4.11 Focus Not Obscured (Minimum, AA), 2.5.8 Target Size (Minimum, AA), 3.2.6 Consistent Help (A), 3.3.7 Redundant Entry (A), 3.3.8 Accessible Authentication (Minimum, AA). (WCAG 2.2 also **removed** 4.1.1 Parsing — do not chase it.)

---

## Perceivable

### 1.1.1 Non-text Content (A)
All meaningful images/icons/illustrations have a text alternative.
- Every hero image and Flaticon icon that conveys meaning gets a meaningful `alt`. Purely decorative visuals (background gradient mesh, ornamental shapes) get `alt=""` or `aria-hidden="true"` so screen readers skip them.
- Charts/diagrams: provide a short `alt` plus a longer description (caption or visually-available text) of the data/relationship.

### 1.2.2 Captions (Prerecorded) (A)
All voiceover/video has synchronized captions.
- Ship **WebVTT (`.vtt`)** captions (produced via Whisper per the tool rules) for every ElevenLabs voiceover and video. Wire them with `<track kind="captions" srclang="en" label="English" src="captions/xxx.vtt">`.
- Captions cover speech **and** meaningful non-speech audio (sound cues) where relevant.

### 1.2.1 Audio-only / Video-only (Prerecorded) (A)
Provide a transcript for audio-only, and audio description or transcript for silent video.
- For narration-only segments, provide a text transcript. For purely visual animated sequences with no narration that convey info, ensure the on-screen text or a description carries the same meaning.

### 1.3.1 Info and Relationships (A)
Structure conveyed visually is also in the markup.
- Use real headings (`<h1>`/`<h2>`), lists (`<ul>/<ol>`), and `<button>`/`<a>` elements. The quiz options are a **radiogroup** (see 4.1.2), not styled `<div>`s. Reading order in the DOM matches the visual order.

### 1.4.1 Use of Color (A)
Color is never the only means of conveying information.
- Correct/incorrect quiz feedback uses an **icon + text** ("Correct ✓", "Incorrect ✗"), not green/red alone. Required state, selected state, links — all carry a non-color cue (text, icon, underline, border weight).

### 1.4.3 Contrast (Minimum) (AA)
Text contrast ≥ **4.5:1** (≥ **3:1** for large text: ≥ 24px regular or ≥ 18.66px/14pt bold).
- Verify body copy (32px), captions, and labels against the navy/teal/coral/violet palette over gradient-mesh + frosted-glass backgrounds. Glassmorphism is the danger zone: a translucent panel can drop effective contrast — test the **actual composited** color, and back text with a sufficiently opaque scrim where needed. Hero text (80px) and H1 (64px) are "large" so the 3:1 floor applies, but aim higher.

### 1.4.11 Non-text Contrast (AA)
UI components and meaningful graphics ≥ **3:1** against adjacent colors.
- Button boundaries, the **focus indicator**, form/control borders, toggle states, icon glyphs that convey meaning, and chart segments all meet 3:1 against their surroundings. Don't rely on a faint 1px hairline that fails against a busy mesh background.

### 1.4.12 Text Spacing (AA)
No loss of content when the learner overrides spacing: line-height 1.5×, paragraph spacing 2×, letter-spacing 0.12em, word-spacing 0.16em.
- Use flexible containers (no fixed-height text boxes that clip). Because the stage is a locked 1920×1080 unit, ensure text blocks can grow without overlapping or being cut — leave headroom in panels and avoid `overflow:hidden` on text.

### 1.4.4 Resize Text (AA) / 1.4.10 Reflow (AA)
Text can scale to 200% / content reflows without 2-D scrolling at narrow widths.
- The whole 16:9 stage **scales as one unit**, so proportional zoom is preserved. Ensure the scaling honors browser/OS zoom and that nothing critical is cut at the title-safe/action-safe margins.

---

## Operable

### 2.1.1 Keyboard (A)
All functionality operable from the keyboard.
- Every interactive element (nav buttons, lesson/module tiles, quiz options, play/pause, captions toggle) is reachable and operable with Tab/Shift+Tab/Enter/Space/Arrow keys. Custom GSAP/Lottie buttons must be real `<button>`s or have proper key handlers — animation polish must not break keyboard operation.

### 2.1.2 No Keyboard Trap (A)
Focus can always move away with the keyboard.
- No modal or media control traps focus. If a dialog (e.g. quiz result, exit confirm) opens, focus is managed in and can leave (Esc closes, focus returns to trigger). Verify the video/Lottie controls don't swallow Tab.

### 2.1.4 Character Key Shortcuts (A)
Single-character shortcuts can be turned off/remapped or are active only on focus.
- If we add single-key shortcuts (e.g. "n" for next), only fire them when the player/relevant control has focus, or provide a way to disable.

### 2.2.2 Pause, Stop, Hide (A) — **critical for animated slides**
Any moving/auto-updating content lasting > 5s that runs alongside other content must be pausable/stoppable/hideable.
- Provide a visible **Pause/Play** control for slide animations and auto-advancing media. Auto-playing audio > 3s must be pausable (see 1.4.2).
- **Honor `prefers-reduced-motion`**: when set, disable or sharply reduce GSAP entrances/parallax/loops, drop to instant or short cross-fades, and pause Lottie loops. This is the single most important accessibility behavior for our animation-heavy engine.

### 2.2.1 Timing Adjustable (A)
No essential time limits, or the learner can extend/turn them off.
- Slides do **not** auto-advance on a hard timer that can't be paused. Quiz has no countdown unless explicitly required, and if required it is adjustable. Animation timing never gates comprehension.

### 2.3.1 Three Flashes or Below Threshold (A)
Nothing flashes more than 3 times per second.
- No strobing transitions. Keep GSAP/Lottie effects below the flash threshold — our taste (smooth eases, ~320ms reveals) is already safe; just never add rapid flashing emphasis.

### 2.4.3 Focus Order (A)
Tab order follows a logical, meaningful sequence.
- DOM order matches the intended reading/interaction order on each slide (heading → content → primary action → nav). When a slide's content animates in, focusable elements appear in logical order, not visual-z order.

### 2.4.7 Focus Visible (AA)
Keyboard focus indicator is always visible.
- Provide a clear, high-contrast focus ring (meets 1.4.11's 3:1) on every focusable element. Never `outline:none` without a strong replacement. Test against frosted-glass and dark navy backgrounds.

### 2.4.11 Focus Not Obscured (Minimum) (AA) — **new in 2.2**
When an element receives focus, it is not **entirely** hidden by other (author-created) content.
- Sticky headers/footers, the nav bar, toasts, or a captions overlay must not fully cover the focused control. Ensure focused quiz options and nav buttons remain at least partially visible — scroll/offset focus into view; keep overlays clear of the focusable region.

### 2.5.8 Target Size (Minimum) (AA) — **new in 2.2**
Interactive targets are at least **24×24 CSS pixels**, or have ≥ 24px spacing between them (exceptions: inline links, user-agent defaults, essential).
- Quiz option hit-areas, nav arrows, play/pause, captions toggle, and module/lesson tiles are ≥ 24×24px (we target comfortably larger, ~44px). Where icons are small, expand the clickable padding and/or keep 24px clearance between adjacent targets so they don't crowd.

### 2.5.1 Pointer Gestures (A) / 2.5.2 Pointer Cancellation (A) / 2.5.3 Label in Name (A) / 2.5.4 Motion Actuation (A)
- 2.5.1: No essential multi-point/path-based gestures — all actions work with a single tap/click.
- 2.5.2: Actions fire on **up-event** (so a press can be aborted by dragging off).
- 2.5.3: The **visible label** text is contained in the accessible name (so speech-input "click Next" works). Don't let `aria-label` diverge from the visible text.
- 2.5.4: No function requires device motion (shake/tilt).

---

## Understandable

### 3.1.1 Language of Page (A)
The page's primary language is set.
- `<html lang="en">` (or the course's language). For dubbed/translated courses, set the correct `lang`, and mark inline foreign-language phrases with `lang` (3.1.2, AA).

### 3.2.3 Consistent Navigation (AA) / 3.2.4 Consistent Identification (AA)
Repeated nav and components are consistent across slides.
- The hub-and-spoke nav, progress display, and controls keep the same position, order, and labeling on every slide. Same-function icons/buttons are labeled identically throughout.

### 3.2.6 Consistent Help (A) — **new in 2.2**
If a help mechanism is available, it appears in a **consistent location** across the course.
- If the player offers help (a "?" button, instructions, contact/support link, captions/transcript access), keep it in the **same place and order** on every slide/screen. Don't move the help affordance between the intro, lessons, and quiz.

### 3.3.7 Redundant Entry (A) — **new in 2.2**
Don't make the learner re-enter information they already provided in the same session.
- If we collect anything (e.g. a name, an earlier quiz answer needed later), auto-populate it or let them select it rather than retyping. For our courses this mostly means: don't ask for the same input twice; persist it via `suspend_data` within the session.

### 3.3.8 Accessible Authentication (Minimum) (AA) — **new in 2.2**
No cognitive function test (remembering/transcribing a password, solving a puzzle/CAPTCHA) for any authentication step, unless an alternative or assistance exists.
- Our player typically does **not** authenticate (the LMS handles login). If a course ever adds a gate/code/CAPTCHA, allow paste, password managers, and copy from email — never force manual transcription or a puzzle with no alternative.

### 3.3.1 Error Identification (A) / 3.3.2 Labels or Instructions (A) / 3.3.3 Error Suggestion (AA)
- 3.3.1: Quiz validation errors ("Select an answer before continuing") are described in text, programmatically associated, and announced.
- 3.3.2: Every input/control has a clear visible label or instruction.
- 3.3.3: When an answer/input is wrong and a correction is known, suggest it (e.g. quiz feedback explaining the right answer).

### 3.2.1 On Focus (A) / 3.2.2 On Input (A)
- No surprise context change just from focusing an element or from changing a setting; advancing requires an explicit action (clicking Next/Submit).

---

## Robust

### 4.1.2 Name, Role, Value (A) — **the quiz radiogroup**
Every UI component exposes a correct name, role, and state to assistive tech.
- **Quiz question = a radio group.** Use native `<input type="radio">` in a `<fieldset>` with a `<legend>` (the question), or ARIA: a container with `role="radiogroup"` and `aria-labelledby` (question), options with `role="radio"` + `aria-checked`, arrow-key selection, single tab stop. Multi-select questions use checkboxes / `role="checkbox"`.
- Custom buttons/toggles built for animation must still expose role and state (`aria-pressed`, `aria-expanded`, `aria-disabled` for greyed/locked tiles). Greyed-out (gated) tiles get `aria-disabled="true"`.

### 4.1.3 Status Messages (AA) — **aria-live**
Status messages that don't move focus are announced by AT.
- Use `aria-live` regions for: quiz score/result ("8 of 10 correct"), "Saved/Progress updated", "Loading", per-question correctness feedback, and module-complete confirmations. Use `aria-live="polite"` for routine updates, `assertive` only for urgent ones. The region must exist in the DOM before the message is injected.

---

## Engine checklist (quick gate before shipping a slide)

- [ ] All meaningful images/icons have `alt`; decorative ones are hidden (1.1.1).
- [ ] Voiceover/video has a `.vtt` caption track (1.2.2).
- [ ] Text ≥ 4.5:1 (3:1 large) **as composited over glass/mesh** (1.4.3).
- [ ] Focus ring, control borders, meaningful graphics ≥ 3:1 (1.4.11).
- [ ] Text survives 1.5 line-height / spacing overrides without clipping (1.4.12).
- [ ] Fully keyboard operable; no traps (2.1.1, 2.1.2).
- [ ] Visible **Pause/Play** for animation/media; `prefers-reduced-motion` honored (2.2.2).
- [ ] Logical focus order; focus never fully obscured by overlays/nav (2.4.3, 2.4.11).
- [ ] Visible focus indicator everywhere (2.4.7).
- [ ] Interactive targets ≥ 24×24px or 24px-spaced (2.5.8).
- [ ] `<html lang>` set (3.1.1).
- [ ] Help (if any) in a consistent location (3.2.6).
- [ ] No redundant re-entry of session data (3.3.7); no cognitive-test auth (3.3.8).
- [ ] Quiz is a proper radiogroup with name/role/value; gated tiles `aria-disabled` (4.1.2).
- [ ] Score/feedback/save announced via `aria-live` (4.1.3).
```
