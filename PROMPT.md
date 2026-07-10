# SCORM Studio — Master Build Prompt (portable)

Use this to build a branded, animated, accessible SCORM 1.2 course on ANY PC that has the
`SCORM Studio` folder. Two parts: **A) one‑time setup on a new PC**, then **B) the prompt you
paste per course**.

---

## A. One‑time setup on a new PC

1. **Copy the whole `SCORM Studio` folder** to the new PC (it is self‑contained: it vendors its own
   Node, ffmpeg, and Whisper under `runtime/`, so no installs are needed).
2. Put each **course folder** somewhere on the same machine (e.g. `D:\Courses\<Course Name>\`).
3. In your Claude Code session, make sure these **MCP connectors are connected**:
   - **ElevenLabs** (voiceover) — you'll need your voice ID.
   - **Magnific / Freepik stock** (images).
   - (Whisper for captions is local/vendored — nothing to connect.)
4. Optional: to auto‑start the review app at `localhost:3100`, update the `SessionStart` hook path in
   your Claude settings and the `.active-course` file to match the new PC's drive/paths.

**Input contract — each course folder must contain:**
```
<Course Name>/
  Outline/  <course>.docx          ← Starweaver outline (module/lesson/video titles)
  Videos/                          ← M<m>L<l>V<v> named .mp4 files
      INTRO & OUTRO/ (or IO/)      ← course Intro + Outro
      Module <m>/Lesson <l>/       ← "M<m> Intro..." + M<m>L<l>V<v>-*.mp4
  Quiz/  (or Graded Quiz/)  *.docx ← graded quiz (any of the supported formats)
```

---

## B. The prompt to paste (fill in the ‹brackets›)

> **Build a SCORM course with SCORM Studio.**
>
> Course folder: `‹D:\Courses\Your Course Name›`
> SCORM Studio folder: `‹D:\Claude\SCORM Studio›`
>
> First read `SCORM Studio/CLAUDE.md` and follow its gated pipeline. Always call the vendored
> runtime (`runtime/node/node.exe`, `runtime/ffmpeg/*`, `runtime/whisper/*`). Work through these
> stages and PAUSE at the **Scope gate** for my answers.
>
> **1. Parse structure.** Run `runtime/node/node.exe app/src/build-model.js "‹course›"`. If any
> lesson's video is split into `P1`/`P2` (or "Part 1/2"), **concatenate the parts into one .mp4**
> (ffmpeg, `-nostdin`), move the source parts aside, and re‑parse so every video is a single file.
> Show me the parsed modules/lessons/videos and the quiz question count per module (must be balanced,
> exactly one correct option each — the parser supports `Qn.`, `Option/Feedback`, and
> `Graded Quiz N (Scenario)` + bulleted `· A. · B.` formats; grouping is by the MODULE section header).
>
> **2. SCOPE GATE — ask me and wait:**
>    - Final **course title** and subtitle
>    - **Pass mark** (%)
>    - **Theme** — pick a palette; write it into the model as `theme: { primary, primary2,
>      primarySoft, accents:{name:hex} }` and set `accents` per module to those names (the build
>      injects a per‑course `<style>`, so other courses are untouched)
>    - **ElevenLabs voice ID**
>    - **Readings** — how many per module and whether to auto‑source authoritative links (verify each
>      URL returns HTTP 200 before wiring)
>
>    Write all of this into `‹course›/.pipeline/course.model.json`.
>
> **3. Titles.** Apply **Title Case** to every module/lesson/video title, preserving acronyms/brands
> (GenAI, SQL, MFA, SSO, SIEM, VLAN, OS, IP, Nmap, OpenSCAP, CRISP‑DM, etc.). Fix any title that
> disagrees with the actual video filename (the filename is ground truth).
>
> **4. Images (Magnific/Freepik ONLY — real photos, no illustrations).** One **unique, professional**
> photo per image slide (`title, home, m<n>, m<n>l<li>, r<n>read, qi<n>`). Prefer real people in
> professional settings; avoid text‑heavy screens and clichés. Download the free render, then
> ffmpeg **cover‑crop to fill** (no blur margins): side images **1792×2432** portrait, and
> `title`/`home` as **1920×1080** landscape heroes. Save to `‹course›/generated/images/<key>.png`.
> Write a real, specific **alt text** for each into `generated/images/alt.json` (WCAG 1.1.1).
>
> **5. Voiceover (ElevenLabs ONLY, my voice ID).** Generate one clip per narrated slide, then derive
> card‑reveal cues from Whisper word timestamps (`-ml 1`) at each ordinal → `Voiceovers/cues.json`.
> Scripts (HARD RULES):
>    - **Home / module / lesson menus:** `"In this {course|module|lesson}, we will cover. First,
>      ‹title›. Second, ‹title›. Third, ‹title›[. Fourth, ‹title›]. Click on each tab to know more
>      about it."` — ordinals + titles ONLY, no "Module/Lesson/Video one", no counts.
>    - **Title slide:** `"Welcome to the e-learning course of ‹Course Title›. Click Start to begin."`
>    - **Reading slides:** `"Click on the tab to explore the reading material and then continue the
>      course."`
>    - **Quiz intro / exit:** short, professional lines.
>    Save to `Voiceovers/<slideId>.mp3` (44.1kHz mono).
>
> **6. Captions (Whisper ONLY).** Generate `captions/<video-basename>.vtt` for **every video**
> (required — WCAG 1.2.2). For the narrated slides, also generate `captions/vo-<slideId>.vtt` UNLESS
> I ask to keep captions off the slides (then don't create/keep those files).
>
> **7. Transcode + package.** Mirror `Videos/` into `Videos_min/` at 720p (`libx264 -crf 28
> -preset veryfast`, `-nostdin`, audio AAC 96k) so the final zip stays well under 4.5 GB. Emit the
> review build (`app/build-v2.js "‹course›" --emit`), then build the final zip from the compressed
> tree: `VIDEOS_DIR=Videos_min runtime/node/node.exe app/build-v2.js "‹course›"`.
>
> **8. Verify** the zip: `imsmanifest.xml` present, all videos + captions included, images + VO
> present, size under limit. Report the file path.
>
> Run long steps (transcode, video captioning) in the background. Point `.active-course` at this
> course and (re)start the review app so I can review at **localhost:3100**. Pause for my review
> comments before the final build.

---

## Quick command reference (vendored runtime)
```
NODE="runtime/node/node.exe"
%NODE% app/src/build-model.js "<course>"        # parse structure → .pipeline/course.model.json
%NODE% app/build-v2.js "<course>" --emit         # write .review/ (for localhost:3100)
VIDEOS_DIR=Videos_min %NODE% app/build-v2.js "<course>"   # final zip (compressed videos)
%NODE% app/src/parse-quiz.js "<course>"          # test quiz parsing
```

## Model fields (`<course>/.pipeline/course.model.json`)
`title, subtitle, passPercentage, videosDir, voiceId, accents{n:name}, theme{primary,primary2,primarySoft,accents{name:hex}}, courseIntro, outro, modules[].{n,title,intro,lessons[].{title,videos[].{title,file}},readings[].{title,url}}`

## Hard rules
- Voiceover → **ElevenLabs**. Images → **Magnific/Freepik real photos** (no illustrations). Captions → **Whisper**. Animation → GSAP+Lottie.
- Unique image per slide, authored 1792×2432 (heroes 1920×1080), cover‑filled (no blur bars), professional.
- Menu VO = ordinal format ending "Click on each tab to know more about it." Title/reading VO as above.
- Title Case all titles (preserve acronyms). Filename is ground truth for a title.
- Every video captioned (1.2.2); descriptive alt for every image (1.1.1).
- Concatenate split P1/P2 videos. Confirm scope (title, pass mark, theme, voice, readings) before building.
