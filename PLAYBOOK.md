# SCORM Studio — Course-Building Playbook

This is the accumulated, hard-won knowledge from building real courses with SCORM Studio —
not just what the pipeline does, but **why** each rule exists, what broke before the rule
existed, and how to handle situations `CLAUDE.md` doesn't spell out (multi-course batches,
multi-language dubs, mid-build corruption, etc.).

**Read this after `CLAUDE.md`, not instead of it.** `CLAUDE.md` is the operational reference
(paths, commands, the 5-gate checklist). This file is the "here's what actually goes wrong and
why" companion — it exists so a fresh Claude session, on any machine, can build a course to the
same bar without the user re-explaining everything from scratch. Copy this whole `SCORM Studio/`
folder to a new machine and both files travel with it.

---

## 1. The mental model

A course = one folder outside `SCORM Studio/` (e.g. `D:\Claude\<Course Name>\`), containing an
outline `.docx`, a `Videos/` tree, and a `Quiz/` `.docx` (or inline `questions[]` in the model —
see §5 for when that applies). SCORM Studio parses that into `.pipeline/course.model.json`,
generates media against it, and assembles a SCORM 1.2 zip. **The engine is 100% generic** — it
never hard-codes a course. Every course-specific fact (title, voice ID, colors, quiz content)
lives in `course.model.json`. If you're tempted to special-case a course inside `build-v2.js` or
`player.js`, stop — add a field to the model instead (see §6, `titleShort`, for a worked example
of adding a new generic model field the right way).

Attach a course by pointing `COURSE_DIR` at it. Everything downstream reads from there.

## 2. The five gates, and why they exist

`skills/run-pipeline/SKILL.md` has the mechanical checklist. The gates exist because each one
guards against a category of mistake that's expensive to undo later:

1. **Scope & structure** — the outline never has final title, pass mark, brand colors, voice ID,
   or reading links. Guessing these means redoing media generation later. Ask once, up front.
2. **Art & voice direction** — approve the *look* before generating 20+ images or 40+ VO clips.
   Regenerating art after the fact (see §7, image mistakes) costs real time and API credits.
3. **Voiceover script** — approve the *words* before synthesizing audio. A wrong script means
   re-recording, re-captioning, and re-checking sync — all downstream of this one text file.
4. **Built-course review** — the human watches the actual assembled course and leaves comments
   with pixel-coordinate annotations (`.review/state.json`). Do not skip ahead of unresolved
   comments; see §8 for the exact resolve-comment workflow.
5. **Final approval** — only package the deliverable zip after explicit sign-off, and only from
   `Videos_min` (see §6, video compression, for why the uncompressed build produces a 9GB zip).

## 3. Hard rules, with the "why" behind each

These are enforced or warned on by the build, but the reasoning matters more than the rule —
it tells you how to extend the rule to a case it doesn't explicitly cover.

- **Voiceover → ElevenLabs only. Images → Magnific only. Captions → Whisper only.**
  One vendor per media type keeps the pipeline deterministic and keeps voice/art consistent
  within a course. Don't reach for a second tool "just this once."
- **Real photos or generated composites — no flat vector illustrations.** Brand preference,
  and — critically — **`aiGenerated:false` in Magnific's metadata does not prove it's a real
  photo.** Confirmed misses: a clip-art render tagged `aiGenerated:false`, and a toy-prop
  flat-lay passed off as professional. **Always `Read` the actual cropped/graded PNG before
  finalizing** — not a spot-check, every image. This is now written into
  `skills/image-generation/SKILL.md` step 4.
- **Unique image per slide.** Every image-bearing slide needs a *distinct* image at 1792×2432.
  The build warns on duplicates — don't suppress the warning, fix the duplicate.
- **Menu voiceover format is a fixed template, not a paraphrase:**
  `"In this {course|module|lesson}, we will cover. First, <title>. Second, <title>. Third,
  <title>[. Fourth, <title>]. Click on each tab to know more about it."`
  No "Module/Lesson N" prefix, no item count, ordinals only, and always end with the exact
  "Click on each tab..." line. This is load-bearing for the next rule.
- **Menu card-reveal timing must be exact, never estimated — this took several failed attempts
  to get right, so don't re-derive it from scratch:**
  - ❌ Whisper word-level timestamps (`-ml 1`/`-oj`) on one stitched clip: looks fine for the
    first ordinal, then silently collapses/plateaus for the rest of a longer clip.
  - ❌ Any other single-shot-audio-plus-estimation approach: same failure mode in different
    clothes.
  - ✅ **Synthesize the menu as separate clips** — intro line, one clip per ordinal item, shared
    outro line — concatenate with ffmpeg (convert to matching PCM, concat demuxer, re-encode),
    and derive `cues[]` from the **real `ffprobe` duration at each clip boundary**. Deterministic,
    zero ASR guesswork. Intro/outro clips are identical across every menu of the same kind in a
    course (and reusable across courses **only if they share the same voice ID**) — synthesize
    once, reuse.
- **Title-slide voiceover is a fixed template:**
  `"Welcome to the e-learning course of <Course Title>. Click Start to begin the course."`
- **Captions are mandatory, whisper-only, and require `--vad` — this is the single biggest
  lesson from this project, worth reading in full even if you skim the rest of this file.**
  See §4 — it's big enough to deserve its own section.
- **Index card titles are Title Case** (moduleIndex/lessonIndex lists), preserving acronyms/brand
  terms as-is (GenAI, SQL, ChatGPT, LLM, EDA, CRISP-DM).
- **Alt text is real, not generic.** Author `<course>/generated/images/alt.json` (keyed by image
  key) with a genuine, specific description — not "image of...". This is a WCAG 1.1.1 gap if
  skipped; the player falls back to a generic label with no alt.json.
- **No em/en dashes in authored copy.**

## 4. Captions: the full story (read this before touching Whisper)

Three separate rounds of "captions don't match the audio" complaints on one course taught this
the hard way. The arc matters because each failed fix looked reasonable at the time:

1. **Bare `-ovtt`** → one ~30s cue per mel-spectrogram window. Reads as a wall of text. Fixed by
   adding `-ml 40 -sow` (short cues, word-boundary-safe splits).
2. That fixed cue *length* but not cue *timing* — a cue landing near a 30-second window boundary
   still stretched its end-timestamp to the exact boundary, regardless of `-ml`. Patched with a
   heuristic: `ffmpeg silencedetect` to find real silence, trim cues that land near a 30s
   boundary to the nearest real silence, merge cues with no nearby silence.
3. That reduced the problem but a full numeric audit (count cues >10s, count zero-duration
   cues across the *whole* course, not one file) found sparse survivors — 1-4 word cues
   stretched to 27-32s at *later* window boundaries. Patched again with a duration cap
   (`max(2.0, text.length*0.28+1.5)` seconds) plus zero-duration-cue merging.
4. **Even after three patch rounds, the user reported the same complaint a third time.**
   Ground-truth investigation (extract the exact audio slice a shipped cue claims to cover,
   re-transcribe *just that slice*, compare) found the real defect: whisper's fixed-window
   decoding can leave **spoken words with no caption at all**, not just a mistimed one — a
   shipped cue read "using structured if-then logic." while the narrator also said "into
   concrete detection patterns" immediately before it, with zero cue covering those words.
   No amount of post-hoc boundary-trimming can fix a *missing* cue, because it only ever edits
   boundaries of cues that already exist.

**The actual fix: enable Whisper's built-in VAD.** The vendored `whisper-cli.exe` already
supports it — it just wasn't being used. `--vad --vad-model runtime/whisper/ggml-silero-v5.1.2.bin`
(vendored, ~885KB, from `https://huggingface.co/ggml-org/whisper-vad`) segments audio on **real
detected speech boundaries** before decoding, instead of fixed 30-second windows. This is a
different mechanism from `-ml`/`-sow` (which only reflow text *within* a window) — it fixes
where segments start and end, at the source, instead of patching cue boundaries after the fact.

Verified on the exact previously-broken file: 0 cues over 10s, 0 zero-duration, 0 cues landing
on a 30s boundary, across the whole course — versus one 10.18s cue that silently dropped words.
**Do not regress to the silencedetect/duration-cap heuristic pipeline.** Always caption with:

```
whisper-cli -m runtime/whisper/ggml-base.en.bin -f <audio.wav> -ml 40 -sow -ovtt \
  --vad --vad-model runtime/whisper/ggml-silero-v5.1.2.bin -of <captions/basename>
```

Model size doesn't matter here — VAD's speech-boundary segmentation is what fixes it, not a
bigger model. Tested `small.en` against `base.en`+VAD on the same slice: no meaningful
difference. Don't burn the extra decode time on a bigger English model.

**Stitched menu clips are the one exception** — never transcribe them with Whisper (VAD or not).
You already know their exact text and exact `ffprobe` duration; author the `.vtt`
deterministically (one cue per part, boundaries from cumulative duration) so it lines up exactly
with the card-reveal `cues[]` from §3. Whisper on a stitched clip has been observed to
**hallucinate invented text at the silent joins** (a real join transcribed as "Mama awesome.").

**Always run a full-course numeric audit after captioning, not a spot-check** — count cues >10s,
zero-duration cues, and (as a sanity check that VAD is actually engaged) cues landing exactly on
a 30s-multiple boundary, across every `.vtt` in `captions/`. The failures this whole section
documents were sparse (a handful of cues out of thousands) and invisible without auditing the
whole set.

**Non-English captioning (dubbed/translated courses):** swap `ggml-base.en.bin` for a
multilingual model (`ggml-small.bin` — note: no `.en` suffix — tested good) and add `-l fr` (or
the target language code). VAD still applies the same way. Never add `-nt`/`--no-timestamps` —
its help text implies it only suppresses console output, but it actually corrupts the `.vtt`
cue boundaries (segments collapse to near-zero-duration, overlapping). `-np`/`--no-prints` is
the safe way to quiet the console. You can also add `-tr` for a second pass that translates the
same audio straight to English text at matching timestamps — a fast way to get synced dual-
language captions from one audio file with no separate alignment step.

**Even with VAD, spot-check for hallucinated brand-name substitutions on unusual words.** Caught
once: a French "Cliquez sur *Quitter* pour terminer" (click *Exit*) transcribed as "*Twitter*"
— a genuine mis-hearing, not a content issue. Cross-check any caption that names a brand/product
against the actual narration script; grep the whole caption set for common false-hallucination
targets (`twitter|facebook|instagram|youtube|tiktok|snapchat`) as a cheap first pass.

## 5. Quiz content: format and the "empty incorrect explanation" trap

Two authoring paths exist:
- **Docx-parsed** (`parse-quiz.js`) — the standard path, reads `Quiz/<name>.docx`. Multiple
  format variants are supported (see `parse-quiz.js`'s `parseAuto()` dispatcher); a new quiz
  layout with inline `✓` correct-answer markers and `[CORRECT]`/`[INCORRECT]` explanation tags
  ("Format D") was added when an existing course used it and the parser returned zero questions.
- **Inline model** (`module.questions[]` in `course.model.json`) — used when quiz content is
  hand-authored or translated directly (e.g. a French dub of an English course), skipping a
  docx round-trip.

**Every option needs BOTH a correct answer flag and real feedback text — check this explicitly,
don't assume it.** A real gap found in production: 69 of 160 quiz option `feedback` fields
across one course were **literally empty placeholders** (`" ()"`), for both the *original
English* content and its French translation — only the correct answer ever had an explanation
written; the three distractors never did. A naive "does this already have an English bracket"
check (regex `/\([^)]*\)\s*$/`) **matched the empty `()` and silently skipped it**, looking done
when it wasn't. When adding/translating quiz feedback, explicitly check `feedback.trim().length`
per option, not just "does it look bracketed" — and when writing a *new* incorrect-answer
explanation, tie it to why that specific distractor is wrong relative to the course's actual
taught method, one concise sentence, matching the voice of the correct-answer explanations that
already exist in the same course.

## 6. Multi-course and multi-run gotchas

**Doing several courses back-to-back with the same rules:** once gate 1–5 conventions are
settled on course 1, later courses in the same batch ("same rules as course 1") inherit them —
but still walk every gate; don't silently skip approval because a sibling course already set
the pattern.

**Shared source outline documents cross-contaminate parsed titles.** If one outline `.docx`
covers multiple courses ("Course 1", "Course 2", ...), naive parsing lets a later course's
titles overwrite an earlier one's in the shared lookup dict — this bit both video titles (fixed
by a "first occurrence wins" guard) and module/lesson titles (fixed generically via a
`courseNumber` parameter that section-scopes parsing to lines between matching `Course N`
markers). `build-model.js` auto-detects the course number from the folder name
(`/Course\s*(\d+)/i` on `path.basename(courseDir)`) and passes it through — verify this still
triggers correctly if a course folder is renamed.

**Non-breaking-space filenames.** Video files exported from some tools use U+00A0 (or U+202F,
narrow no-break space) instead of a regular space in the filename. This silently breaks path
matching against `course.model.json` (which has a normal space). Symptom: a video that visibly
exists still shows as missing. Fix by reconciling model paths against `fs.readdirSync` results
and normalizing whitespace. **Whisper can also *change* which invisible space it writes:** on a
source file containing U+202F, whisper-cli emitted the `.vtt` with U+00A0 instead, so the
existsSync check for the expected name failed and the caption looked un-generated even though the
content was fine. When a caption "fails" on a file whose name contains an odd space, list the
directory with `cat -A` (or compare code points) before regenerating — usually the file is there
under a near-identical name and only needs renaming to the exact video basename.

**`ffmpeg` picks its muxer from the output file extension.** Writing to a `.part` temp name to
guard against truncated output (a good instinct, per the mid-write race above) makes *every*
encode fail instantly with "Unable to find a suitable output format". Use `.part.mp4` (keep the
real extension) and rename on success, or pass `-f mp4` explicitly.

**Video compression (`Videos_min`) must be verified complete, not just present.** The final
build defaults to full-resolution `Videos/` unless you pass `VIDEOS_DIR=Videos_min` — forgetting
this once produced a **9GB** zip instead of ~150-600MB. Separately: if a compression job is
still running (including one you didn't start — see next paragraph) when you build, `fs.existsSync`
on a `Videos_min` file returns true the instant ffmpeg creates the output, **while it's still
mid-write** — a build at that exact moment silently ships a truncated video. After any
`Videos_min` build, verify: `comm -23` the full vs. compressed file-name lists (nothing should
be missing), then `ffprobe` every compressed file and check none error out. Compare the total
zip size against a sibling course's zip as a sanity check — a course that's a fraction of a
same-shaped sibling's size is a red flag, not a win.

**Watch for concurrent sessions on the same course.** More than one Claude Code session can be
attached to the same course folder at once (e.g. one doing caption fixes while another runs a
dubbing pipeline). Before starting a long batch job, check file mtimes for recent unexpected
activity — a caption count that keeps dropping between two checks a minute apart means someone
else is already working on it; don't duplicate the work, monitor and pick up after it instead.

## 7. Multi-language dubbing (the full pattern, e.g. `<Course>-FR`)

This is a distinct workflow from the standard English build — worth its own playbook if you're
starting a dub from scratch:

1. **Folder convention:** `<CourseName>-<LANGCODE>` (e.g. `PAWEL-FR`) as a sibling to the
   English source course. Copy the English `Videos/` tree structure.
2. **Generate dubbed narration audio** per video/VO clip in the target language (ElevenLabs,
   same voice-cloning or a native-language voice ID), written to `audio-fr/video/<key>.mp3` and
   `audio-fr/vo/<key>.mp3`, keyed the same way as the model's slide ids (lowercase, no spaces —
   e.g. `m2l1v1`, not the display filename).
3. **Mux the dubbed audio onto the original video, keeping video frames untouched:**
   `-map 0:v:0 -map [1:a-with-atempo] -c:v copy -c:a aac ... -t <original-duration> -shortest`.
   If the dubbed audio doesn't match the original run-time (very common — translations run
   longer or shorter), apply `atempo` (clamped, e.g. 0.9–1.25) to nudge it to length rather than
   letting audio and video drift out of sync; pad/hard-cut to the *original* video's exact
   duration so timing stays anchored to the untouched video frames.
4. **`course.model.json` gets `lang` and `captionLangs`:**
   `"lang": "fr"`, `"captionLangs": [{"code":"fr","label":"Français","default":true},
   {"code":"en","label":"English"}]`. `build-v2.js` already reads `captionLangs` generically and
   emits multi-track `captionsTracks` per slide — this feature exists in the shared engine, it
   just needs the model to opt in.
5. **Caption every dubbed video/VO clip in BOTH languages** — `<basename>.fr.vtt` (Whisper +
   VAD + multilingual model + `-l fr`, transcribing the *actual dubbed audio*, not a translation
   of the English captions) and `<basename>.en.vtt` (usually already exists from the original
   English build — copy it over). §4's whole caption methodology applies unchanged.
6. **Bilingual UI text convention** (this is a taste decision, not a technical constraint — pin
   it down explicitly with whoever's reviewing before doing 40+ edits): content the learner reads
   closely (title, subtitle, module/lesson titles, quiz question/option text, quiz feedback) gets
   `"<translated text> (<original English text>)"` — but persistent chrome shown on *every* slide
   (nav-bar Prev/Next/Menu/Transcript, the sticky course-title banner) stays short and in
   whichever single language reads cleanest, not doubled up on every slide. For the sticky
   banner specifically: add an optional `titleShort` field to the model (falls back to `title`
   if absent — fully backward-compatible for existing courses) and have `player.js`'s coursebar
   render `C.titleShort||C.title` instead of always the full bilingual string; this is a small,
   generic, reusable engine change, not a one-off hack.
7. **Some UI screens may need to flip the language relationship entirely** — e.g. "exit/results
   screen on-screen text in English, but its voiceover audio stays in the dub language" is a
   real, reasonable ask. Handle this per-`ui.*` string in the model; the audio/caption files for
   that slide are untouched (the caption still transcribes whatever language the audio actually
   is — WCAG requires captions to match the *actual* audio, not the on-screen text).
8. **Translated quiz content needs the same "is every option's feedback populated" check as
   §5** — a dub inherits any gaps in the source course's quiz content, and gains a translation
   step where mismatches (option order, correct-flag alignment) can silently creep in. Before
   translating, positionally verify `correct` flags align between languages (script it — don't
   eyeball 40 questions) and only apply translated text once verified.
9. **Build a `Videos_min` for the dub separately** — same §6 verification rules apply, and dub
   videos are typically a fresh encode (re-muxed audio), so nothing carries over from the
   English course's `Videos_min`.

## 8. The review cycle (comment → fix → resolve → rebuild)

The review app (`app/review-app`, Next.js) reads/writes `<course>/.review/state.json` — per-slide
comments with pixel-coordinate annotations, a `resolved` boolean, and per-slide `status`.
Workflow, every time:

1. Start/restart the dev server pointed at the right course. **`COURSE_DIR` is resolved once at
   module load** (`mcp/lib/paths.js` reads `.active-course` or the `COURSE_DIR` env var at
   startup) — a running server will NOT pick up a course switch; kill and restart it. Check
   `netstat`/`find PID | grep 3100` for an orphaned server from a previous session before
   assuming the port is free.
2. Read `.review/state.json`, collect every comment where `resolved` is falsy, across every
   slide — don't stop at the first one found.
3. For each: understand what's actually being asked before editing. Comments can reference UI
   elements by pixel-rect annotation only — cross-reference the rect's approximate position
   (top-of-slide vs. bottom-control-bar vs. side-menu-panel) against what's rendered there to
   figure out which specific string/field it's pointing at, rather than guessing from the text
   alone. When in doubt, load the actual built page and inspect it (`read_page`, `get_page_text`,
   or fetch the served asset directly) rather than trusting the model.json content alone — the
   `.review/` build can be stale relative to the source model if files changed after the last
   `--emit`.
4. Make the fix in `course.model.json` (or, if it needs a new generic capability, in
   `build-v2.js`/`player.js` — see §6's `titleShort` example for how to do that without
   hard-coding a course).
5. Re-run `--emit`, verify the fix live (don't just trust the JSON — actually load the page),
   then mark the comment(s) `resolved: true` in `state.json`.
6. Rebuild the final zip (`VIDEOS_DIR=Videos_min`) and log the change under `logs/`.

**A later round of user feedback can reference something already "fixed" — re-verify against
the live build, don't assume a past fix still holds**, especially after model edits by a
different session/agent in between (see §6's concurrency note).

## 9. Where things live (quick index)

- `CLAUDE.md` — operational reference: paths, commands, the gate checklist, hard-rule summary.
- `skills/<stage>/SKILL.md` — one per pipeline stage, each with its own hard rules and steps.
- `logs/runs.log` — append-only history of every build (what changed, why, outcome).
- `runtime/` — vendored node/ffmpeg/whisper binaries + models (self-contained, portable).
- `tools.json` — resolved runtime paths (regenerate with `node app/src/tools.js --emit` after
  adding a new vendored tool; e.g. the VAD model's path was added here as `whisperVadModel`).
- This file (`PLAYBOOK.md`) — the narrative "why," reusable across machines and courses.
