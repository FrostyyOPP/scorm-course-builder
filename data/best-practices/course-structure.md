# Canonical Course Structure & Navigation

The reference structure every SCORM Studio course follows, and the hub-and-spoke navigation model the engine implements. Keep this consistent across courses so learners build muscle memory.

---

## 1. The canonical structure

```
Title (course opener)
└─ Course Module Index            ← top-level hub: list of all modules
   └─ Module Index                ← per-module hub: list of lessons in this module
      └─ Lesson Index             ← per-lesson hub: list of videos in this lesson
         └─ Video(s)              ← the actual animated teaching content
      ├─ Reading                  ← supporting reading for the module
      ├─ Quiz Intro               ← sets up the module quiz
      ├─ Questions                ← the graded questions ("1 of 10" …)
      └─ Result                   ← score + pass/fail + feedback
Exit (course close / completion)
```

Read top-to-bottom as the **content order**, and as a **nesting tree**: a course has modules; a module has lessons, a reading, and a quiz; a lesson has one or more videos; a quiz has an intro, questions, and a result.

### Node types
- **Title** — course opener: course name, branding, a single "Start" affordance. Sets `<html lang>`, primes the player.
- **Course Module Index** — the top-level table of contents. One tile/row per module. The learner's home base for the whole course.
- **Module Index** — entered from a module tile. Lists the lessons in that module, plus the module's reading and quiz. Returning here is the "spoke return" after finishing a lesson.
- **Lesson Index** — entered from a lesson tile. Lists the video(s) for that lesson. Returning here is the "spoke return" after finishing a video.
- **Video** — the leaf teaching unit: an animated 16:9 sequence with ElevenLabs voiceover and Whisper captions. Completing it returns to the Lesson Index.
- **Reading** — module-level supporting text (scrollable, accessible).
- **Quiz Intro** — explains the quiz: how many questions, the pass mark, retake rules.
- **Questions** — the graded items, paced **"1 of 10", "2 of 10" …** (see §3). One question per screen.
- **Result** — score (e.g. "8 of 10 — Passed"), pass/fail against the mastery score, per-question feedback, retry/continue.
- **Exit** — course completion screen; commits final SCORM status/score and offers a clean close.

---

## 2. Hub-and-spoke navigation

The course is **not** a linear slideshow. It is a set of nested **hubs** (the indexes) with **spokes** (the content) that always return to their hub.

- **Completing a video returns to its Lesson Index.** The learner never auto-runs into the next video; they land back on the lesson hub, see the just-finished video marked complete, and choose what's next.
- **Completing a lesson (all its videos) effectively returns focus to the Module Index.** Likewise, finishing the module's quiz returns to the Module Index, and finishing a module returns to the Course Module Index.
- The learner can always step **up** the hierarchy (Lesson Index → Module Index → Course Module Index) via consistent, same-position navigation (per WCAG 3.2.3 Consistent Navigation).

```
Course Module Index ⇄ Module Index ⇄ Lesson Index ⇄ Video
                                 └⇄ Reading
                                 └⇄ Quiz (Intro → Questions → Result)
```

The arrows are **two-way**: you descend into a spoke and the spoke returns you to its hub on completion.

---

## 3. Per-module quizzes ("1 of 10")

- Each **module** has its **own quiz** (not one mega-quiz at the end of the course).
- Questions are paced and labeled **"1 of 10", "2 of 10", … "10 of 10"** so the learner always knows position and length.
- **One question per screen**, presented as a proper **radiogroup** (single-answer) or checkbox group (multi-answer) — see `data/wcag/wcag-2.2-aa-checklist.md` §4.1.2.
- The **Quiz Intro** states the pass mark up front; the pass mark maps to the SCORM `adlcp:masteryscore` and is compared against `cmi.core.score.raw` (see `data/scorm/scorm-1.2-packaging.md`).
- The **Result** screen shows the score, pass/fail, and per-question feedback, announced via `aria-live` (WCAG 4.1.3). Offer retry where allowed.

---

## 4. Completion gating & progress greying

The hubs reflect and enforce progress:

- **Completion gating** — content unlocks in sequence where pedagogy requires it. A locked node (e.g. the quiz before its lessons are done, or Module 2 before Module 1) is **not yet activatable**. Gating is enforced **inside the player** (single SCO), not by LMS sequencing.
- **Progress greying** — the index tiles visually encode state:
  - **Available / not started** — full-color, activatable.
  - **Completed** — marked done (check + non-color cue per WCAG 1.4.1).
  - **Locked / gated** — **greyed out** and non-interactive; expose `aria-disabled="true"` so assistive tech announces the locked state, and ensure it is skipped or clearly described in the focus order.
- Progress persists across sessions via SCORM resume: store the bookmark in `cmi.core.lesson_location` and the packed completion state in `cmi.suspend_data` (mind the 4096-char limit). On resume, re-render the greying from that state.
- When the last gate is satisfied (all modules + quizzes passed), the course is **complete** — set the terminal `lesson_status` and route the learner to **Exit**.

---

## 5. Consistency rules (so courses feel the same)

- Same structure and node order in every course; only the depth (number of modules/lessons/videos) varies.
- Nav controls, progress display, and any help affordance stay in the **same position and labeling** on every screen (WCAG 3.2.3 / 3.2.4 / 3.2.6).
- Index tiles use a consistent visual language for available / completed / locked across all hubs.
- Every "return to hub" is explicit and predictable — completing a spoke never silently jumps the learner somewhere unexpected (WCAG 3.2.2 On Input).
```
