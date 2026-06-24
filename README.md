# scorm-course-builder

Turn a folder of course content into a **branded, accessible SCORM 1.2 course** — no manual
authoring tool. An **outline** drives the structure; videos, readings, and quizzes come from
their own folders; the finished SCORM 1.2 `.zip` is written straight into the course folder.

---

## Install (new machine)

Requires **Node.js 18+** and **git**.

```bash
git clone https://github.com/FrostyyOPP/scorm-course-builder.git
cd scorm-course-builder
npm install
```

That's the whole setup — no build step, no extra downloads. Then point it at a course folder
(below) and run `node src/index.js <folder>`.

---

## Steps

### 1. Make a course folder with this layout

```
my-course/
  outline/      ← ONE Markdown outline = the master structure (order + titles)
  videos/       ← .mp4 files
  readings/     ← .docx files
  quizzes/      ← .docx files
  captions/     ← (optional) .vtt caption files, named to match each video
```

### 2. Write the outline (`outline/outline.md`)

The outline is the single source of truth for **what goes where, in what order**:

```markdown
# Course Title
> One-line subtitle (optional)

## Module 1 — Module title
- video: M1Intro.mp4 | Introduction
- video: M1L1V1.mp4 | The Strategist vs the Technician
- reading: Lesson 1 Reading.docx | Judgment in the AI Era
- quiz: Graded Quiz.docx | Graded Quiz

## Module 2 — Module title
- video: M2L1V1.mp4 | ...
```

- Each `##` starts a **module** (becomes a section divider screen).
- Each `- type: filename | title` is one screen, in order.
  - `type` = `video` | `reading` | `quiz`
  - `filename` = the file’s name inside `videos/`, `readings/`, or `quizzes/`
  - `title` (after `|`) is optional on-screen text.

### 3. Drop your files into `videos/`, `readings/`, `quizzes/`

Quiz `.docx` uses the Starweaver format (`Q1` / question / `A`–`D` / `Feedback` /
`(Correct)`|`(Incorrect)`). Readings are plain `.docx`.

### 4. Build

```bash
node src/index.js /path/to/my-course
```

→ writes `my-course/<course-title>-SCORM12.zip`. Upload that to your LMS as **SCORM 1.2**.

Options: `--out <dir>` (write elsewhere) · `--pass <percent>` (pass mark, default 50).

---

## Full Starweaver course folder (auto-detected)

If your folder instead contains a **`.docx` outline at the root** plus subfolders of
**code-named media** (`M1Intro.mp4`, `M1L1V1.mp4`, …, `M1 L1 Reading.docx`, a quiz `.docx`),
the same command auto-detects it — no Markdown rewrite needed:

```
Critical Course Full/
  Course Outline.docx            ← Starweaver outline (titles + structure)
  08 = FINAL VIDEO/   M1Intro.mp4, M1L1V1.mp4, …   (codes: M<module>L<lesson>V<video>)
  00 = Readings/      …M1 L1 Reading.docx, …
  01 = Graded Questions/  …Graded Quiz.docx
```

```bash
node src/index.js "/path/to/Critical Course Full"
```

Structure comes from the filename codes; titles come from the outline. Output:
`cover → [Module → intro → (Lesson → 3 videos → reading) × lessons] × modules → quiz → summary`.

> Large courses make large zips (e.g. 20 videos ≈ 737 MB). If your LMS caps upload size,
> compress the videos first or host them externally.

## What you get

A slide-by-slide course: **cover → module dividers → video → reading → quiz-start →
one question per screen → score summary.** Styled to the Course Visual Style Guide
(navy/teal/Inter, pill badges, accent rules, cards).

### SCORM 1.2 — proper LMS behavior
- Score + pass/fail (`cmi.core.score.*`, `cmi.core.lesson_status`)
- **Resume** where the learner left off (`cmi.core.lesson_location` + `cmi.suspend_data`)
- Session time (`cmi.core.session_time`); correct init/commit/finish + exit handling
- `imsmanifest.xml` at the package root, single SCO

### Accessibility (WCAG 2.1 AA-minded)
- Full **keyboard** operation; options are a proper `radiogroup` (arrow keys + Space)
- Focus management + `aria-live` announcements on every screen and answer
- Landmarks (`main`, `nav`), `progressbar`, skip link, visible focus, `lang`
- Color contrast (navy pills, contrast scrim on the cover); not color-alone for right/wrong
- `prefers-reduced-motion` respected
- **Captions:** add `captions/<videoname>.vtt` to satisfy WCAG 1.2.2 — the builder warns when missing

---

## Project layout

| Path | Purpose |
|---|---|
| `src/index.js` | CLI — course folder → SCORM 1.2 zip (auto-routes Markdown vs `.docx` outline) |
| `src/parse-outline.js` | Markdown outline → structure + file resolution |
| `src/parse-outline-docx.js` | Starweaver `.docx` outline → titles |
| `src/parse-docx.js` | Word docs → quiz/reading data (`mammoth`) |
| `src/build-shell.js` | assemble + package the accessible SCORM course |
| `src/build-full.js` | full multi-module course from a Starweaver folder |
| `src/scorm.js` | SCORM 1.2 manifest + zip helpers |
| `src/shell/player.js` · `styles.css` · `scorm-api.js` | the course runtime (player, brand CSS, SCORM) |
| `src/brand.js` | design tokens from the style guide |
| `example-project/` | folder-layout template |

---

## Known gaps / next
- Caption `.vtt` files must be supplied (or auto-generated) for full WCAG video compliance.
- Large media → large zips; add a video-compression step if your LMS caps upload size.
- Quiz type is single-choice; multiple-answer / other types are additive.
