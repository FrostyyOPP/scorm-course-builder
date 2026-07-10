# SCORM 2004 — Differences from 1.2 (and when 1.2 is enough)

SCORM 2004 (editions 2nd/3rd/4th) refines the run-time data model and adds **Sequencing & Navigation**. For SCORM Studio's single-SCO animated courses, **SCORM 1.2 is almost always sufficient** — read the last section before reaching for 2004.

---

## 1. Run-time API differences

- The API object is named **`API_1484_11`** (not `API`), and method names **drop the `LMS` prefix**:
  - `Initialize("")`, `GetValue()`, `SetValue()`, `Commit("")`, `Terminate("")`, `GetLastError()`, `GetErrorString()`, `GetDiagnostic()`.
- The frame-tree discovery algorithm is the same idea, just searching for `API_1484_11`.

---

## 2. Status: split into two elements

SCORM 1.2 overloaded a single `cmi.core.lesson_status` for both "did they finish?" and "did they pass?". SCORM 2004 **separates these**:

- **`cmi.completion_status`** — `completed` | `incomplete` | `not attempted` | `unknown`. Whether the learner got through the content.
- **`cmi.success_status`** — `passed` | `failed` | `unknown`. Whether they met the objective.

This is cleaner: a learner can be `completed` + `failed` (finished but didn't pass), which 1.2 could only express awkwardly.

- **`cmi.completion_threshold`** (read-only, set in manifest) — progress measure above which the SCO is considered complete.
- **`cmi.progress_measure`** (0..1) — fraction complete, for finer progress reporting.

---

## 3. Score: normalized `scaled`

- **`cmi.score.scaled`** — a normalized score in the range **−1 to 1** (typically 0..1). This is the canonical pass measure.
- **`cmi.scaled_passing_score`** (read-only, from manifest) — the threshold `scaled` is compared against. The LMS can derive `success_status` from `scaled` vs. `scaled_passing_score`.
- `cmi.score.raw` / `.min` / `.max` still exist for human-readable scores.
- Note the namespace is `cmi.score.*` (no `core.`); `cmi.core.*` is a 1.2-ism.

---

## 4. Bigger, structured state

- **`cmi.suspend_data`** limit raised from 4096 to at least **64,000 characters** (4th edition; earlier editions ~4096 — check target LMS). Much more room for resume state.
- `cmi.location` replaces `cmi.core.lesson_location` (the bookmark).
- `cmi.exit` adds value `suspend`/`normal`/`logout`/`time-out`; plus `cmi.entry` (`ab-initio`/`resume`).
- `session_time` / `total_time` use **ISO 8601 durations** (e.g. `PT1H30M5S`), **not** the `HHHH:MM:SS.SS` CMITimespan of 1.2.
- Richer `cmi.interactions` and `cmi.objectives` models for analytics and shared objectives across SCOs.

---

## 5. Sequencing & Navigation (IMS SS / `imsss`)

The headline 2004 feature. The manifest gains an `imsss` namespace and per-`<item>` `<imsss:sequencing>` blocks that let the **LMS** control flow across multiple SCOs without custom code:

- **Control modes** — `flow`, `choice`, `forwardOnly`; whether the learner may freely jump or must go in order.
- **Sequencing rules** — pre/post/exit condition rules (skip, disabled, hidden-from-choice, exit, retry) based on objective/attempt state.
- **Rollup rules** — how child SCO statuses roll up into a parent's completion/success (e.g. "all children satisfied ⇒ parent satisfied").
- **Objectives** — local and **global shared objectives** that pass state between SCOs.
- **Limit conditions** — max attempts, time limits.
- **Navigation** (`adlnav:presentation`) — which UI nav controls (Continue/Previous/Exit) the LMS shows; `adl.nav.request` lets the SCO request navigation.

This machinery only pays off with **multiple SCOs** that must be sequenced/gated/rolled-up by the LMS. A single-SCO course gets none of the benefit and all of the manifest complexity.

---

## 6. When is SCORM 1.2 sufficient? (Usually.)

**Use SCORM 1.2 (our default) when:**
- The course is a **single SCO** — which is exactly how SCORM Studio ships courses (one animated player owning all internal navigation, gating, and progress greying).
- Internal flow (hub-and-spoke, completion gating, quiz) is handled **inside the player**, not by the LMS. We do not need `imsss` sequencing.
- Resume state fits in **4096 chars** — achievable with compact packed bookmarks/ids rather than verbose JSON.
- You need **maximum LMS compatibility**. SCORM 1.2 is the most universally supported version across legacy and current LMSs.

**Reach for SCORM 2004 when:**
- You genuinely need **multiple SCOs sequenced by the LMS** (LMS-enforced order, gating, rollup, shared objectives).
- You need to report **completion and pass/fail independently** at the LMS level.
- Resume state cannot fit in 4096 chars and you cannot compact it.
- The client's LMS / contract **mandates** SCORM 2004 (or xAPI/cmi5, a separate track).

**Bottom line for SCORM Studio:** ship **SCORM 1.2, single SCO**. Map `passed`/`failed`/`completed` onto `cmi.core.lesson_status`, set `cmi.core.score.raw/min/max`, bookmark via `cmi.core.lesson_location`, keep `cmi.suspend_data` under 4096 chars. Only escalate to 2004 if a course/LMS requirement above is actually triggered.
```
