# SCORM 1.2 Packaging & Run-Time Reference

Authoritative reference for producing a valid, single-SCO SCORM 1.2 package in SCORM Studio. SCORM 1.2 is built on the **IMS Content Packaging 1.1** spec plus the **ADL SCORM 1.2 CAM/RTE** extensions. For our courses (one self-contained animated player), a single SCO is the right shape.

---

## 1. The Content Package (PIF)

A SCORM package is a **PIF** ("Package Interchange File") — a `.zip` archive containing:

- `imsmanifest.xml` — **at the archive root** (not inside a subfolder). This is mandatory and non-negotiable.
- The control schema/DTD files referenced by the manifest (`imscp_rootv1p1p2.xsd`, `imsmd_rootv1p2p1.xsd`, `adlcp_rootv1p2.xsd`).
- All content files (HTML, JS, CSS, media, the engine, etc.), referenced with **relative paths**.

### Packaging rules (get these wrong and the LMS rejects the package)
- **Manifest at root.** `imsmanifest.xml` must be the top-level entry of the zip. A common failure is zipping the *folder* instead of its *contents*, which buries the manifest one level down.
- **Relative paths only.** Every `href` and `<file href>` is relative to the manifest (i.e. the package root). No absolute paths, no `C:\...`, no leading `/`.
- **Forward slashes** in all paths (`shell-v2/player.js`), even when built on Windows. Backslashes break on Linux-hosted LMSs.
- **No path escaping.** Do not reference files outside the package (`../foo`).
- **Case-sensitive.** Match filename casing exactly; many LMSs run on case-sensitive filesystems.
- The launch file (`href` on the SCO `<resource>`) must exist and be reachable from the package root.

---

## 2. imsmanifest.xml structure

### 2.1 Skeleton (single SCO)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="MANIFEST-SCORM-STUDIO-COURSE" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>

  <organizations default="ORG-DEFAULT">
    <organization identifier="ORG-DEFAULT">
      <title>Course Title</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>Course Title</title>
        <adlcp:masteryscore>80</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>

  <resources>
    <resource identifier="RES-1" type="webcontent"
              adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
      <file href="shell-v2/player.js"/>
      <file href="shell-v2/styles.css"/>
      <file href="shell-v2/vendor/gsap.min.js"/>
      <file href="course.json"/>
      <file href="assets/hero.jpg"/>
      <file href="captions/intro.vtt"/>
    </resource>
  </resources>
</manifest>
```

### 2.2 Element-by-element

- **`<manifest>`** — root element. `identifier` is a package-unique XML token; `version` is informational. Declares the three namespaces: default `imscp` (content packaging), `adlcp` (ADL extensions — the SCORM-specific bits), and `xsi` for schema locations.

- **`<metadata>`** — top-level (manifest-level) metadata. The two children that **matter for SCORM 1.2 conformance**:
  - `<schema>ADL SCORM</schema>` — literally this string.
  - `<schemaversion>1.2</schemaversion>` — literally `1.2`.
  These two tell the LMS "treat this as SCORM 1.2." (Rich IEEE LOM metadata via `<adlcp:location>` or inline `<lom>` is optional.)

- **`<organizations>`** — container of one or more `<organization>` (the table-of-contents tree). `default` attribute names which organization the LMS launches.

- **`<organization>`** — one learning structure. `identifier` unique. Contains a `<title>` and a tree of `<item>`s. For a single-SCO course there is one `<item>`.

- **`<item>`** — a navigable node in the TOC.
  - `identifier` — unique.
  - `identifierref` — points at a `<resource>` identifier (only leaf items that launch content have this).
  - `isvisible` — show/hide in the LMS menu.
  - `<title>` — display label.
  - **`<adlcp:masteryscore>`** — integer 0–100. The pass threshold the LMS compares against `cmi.core.score.raw`. If `score.raw >= masteryscore`, many LMSs auto-set `lesson_status` to `passed`; otherwise `failed`. (The SCO should still set `lesson_status` itself — do not rely solely on this.)
  - Optional `<adlcp:maxtimeallowed>`, `<adlcp:timelimitaction>`, `<adlcp:datafromlms>`, `<adlcp:prerequisites>`.

- **`<resources>` / `<resource>`** — the physical content.
  - `type="webcontent"` — always, for web content.
  - **`adlcp:scormtype="sco"`** — declares this resource is a **SCO** (a Sharable Content Object that talks to the LMS API). The alternative is `"asset"` (static content with no API calls). **Our launchable player resource MUST be `sco`.**
  - `href` — the launch file, relative to root.
  - `<file href="..."/>` — **one entry per physical file** that belongs to this resource. Best practice: list every file the SCO needs. (`<dependency>` lets resources share a common file set, but for one SCO just list everything.)

> Note on namespaces: the `xsi:schemaLocation` value pairs a namespace URI with a local `.xsd` filename. Those `.xsd`/`.dtd` control files should be present at the package root for strict validators (e.g. the ADL Test Suite), though many production LMSs are lenient.

---

## 3. SCORM 1.2 Run-Time Data Model (CMI)

The SCO reads and writes data-model elements via the API. All values are **strings**. Key elements:

### 3.1 Status & completion
- **`cmi.core.lesson_status`** — the single most important element. Allowed vocabulary (CMIVocabulary, Status):
  - `passed` — completed **and** met mastery.
  - `completed` — finished, no pass/fail concept (or pass not evaluated).
  - `failed` — completed but did not meet mastery.
  - `incomplete` — started, not finished.
  - `browsed` — entered in browse mode.
  - `not attempted` — never meaningfully started (note the space, lowercase).
  - On first launch the LMS typically reports `not attempted`; the SCO should move it to `incomplete` early, then to `passed`/`failed`/`completed` at the end.

### 3.2 Score
- **`cmi.core.score.raw`** — the learner's score, normally **0–100** (LMS expectation in 1.2). Set after grading the quiz.
- **`cmi.core.score.min`** — minimum possible (`0`).
- **`cmi.core.score.max`** — maximum possible (`100`).
- Set `min`/`max` so the LMS can interpret `raw` correctly.

### 3.3 Bookmark & resume
- **`cmi.core.lesson_location`** — a SCO-defined **bookmark** string (≤ 255 chars). Use it to record "where the learner is" (e.g. a slide id) for resume.
- **`cmi.suspend_data`** — free-form SCO state blob for resume. **Hard 4096-character limit** in SCORM 1.2 — budget it carefully (store compact ids / a packed string, not verbose JSON). On resume, read it back in `LMSInitialize`.
- **`cmi.core.entry`** (read-only) — `ab-initio` (fresh start), `resume` (returning after suspend), or empty.

### 3.4 Timing
- **`cmi.core.session_time`** — time spent **this session**, written as a **CMITimespan**: `HHHH:MM:SS.SS`.
  - Hours field is 2–4 digits (up to `9999`), minutes/seconds two digits, optional fractional seconds (2 decimals).
  - Examples: `00:23:17.00`, `0001:30:00.0`.
  - The LMS accumulates this into `cmi.core.total_time` (read-only). Write `session_time` once near the end, before `LMSFinish`.

### 3.5 Exit
- **`cmi.core.exit`** — how the session is ending (write before `LMSFinish`):
  - `suspend` — learner is pausing; LMS preserves `suspend_data`/`lesson_location`, and the next `entry` will be `resume`.
  - `logout` — learner logging out (legacy).
  - `normal` — finished normally; the session ends without a resume expectation.
  - `""` (empty) — time-out / unspecified.

### 3.6 Other commonly-used elements
- `cmi.core.student_id`, `cmi.core.student_name` (read-only) — identity.
- `cmi.core.lesson_mode` (read-only) — `normal` / `browse` / `review`.
- `cmi.core.credit` (read-only) — `credit` / `no-credit`.
- `cmi.interactions.n.*` — per-question interaction records (id, type, result, student_response). Optional but useful for quiz analytics.

---

## 4. API Lifecycle (the LMSxxx functions)

SCORM 1.2 exposes a JavaScript object named **`API`** (note: exactly `API`, not `API_1484_11` — that's SCORM 2004). Method names are prefixed **`LMS`**:

```
LMSInitialize("")        → "true" | "false"   // open the session — call FIRST
LMSGetValue(element)     → string             // read a CMI element
LMSSetValue(element, v)  → "true" | "false"   // stage a value
LMSCommit("")            → "true" | "false"   // persist staged values to the LMS
LMSFinish("")            → "true" | "false"   // close the session — call LAST
LMSGetLastError()        → error code string
LMSGetErrorString(code)  → human-readable
LMSGetDiagnostic(code)   → vendor diagnostic
```

### Typical flow
1. **`LMSInitialize("")`** once on load. Then read `cmi.core.entry`, `cmi.core.lesson_status`, and (if resuming) `cmi.suspend_data` / `cmi.core.lesson_location`.
2. During the course: **`LMSSetValue`** to update status/score/bookmark; call **`LMSCommit("")`** periodically (e.g. on each module complete, on the quiz result, on visibility-change/`pagehide`) so progress survives a crash.
3. At the end: set `score.raw/min/max`, `lesson_status`, `session_time`, and `cmi.core.exit`, then **`LMSCommit("")`**, then **`LMSFinish("")`**.
4. After `LMSFinish`, do not call any other API method.

### Finding the API up the frame tree
The LMS injects `API` somewhere in the window hierarchy. The SCO must search **parents first, then opener**. Canonical ADL algorithm:

```js
function findAPI(win) {
  var tries = 0;
  while (win.API == null && win.parent != null && win.parent != win) {
    tries++;
    if (tries > 500) return null;        // guard against runaway loops
    win = win.parent;
  }
  return win.API;
}

function getAPI() {
  var api = findAPI(window);
  if (api == null && window.opener != null) {       // popup-launched players
    api = findAPI(window.opener);
  }
  return api;                                        // null ⇒ run standalone
}
```

If `getAPI()` returns `null`, the player is not inside an LMS — degrade gracefully (run in preview/standalone mode, skip the LMS calls). This is also how SCORM Studio's `--emit`/review mode behaves.

---

## 5. Common Pitfalls

- **Manifest not at the zip root** (zipped the folder instead of its contents). #1 cause of "invalid package."
- **Wrong `scormtype`** — leaving the launch resource as `asset`, so the LMS never wires up the API.
- **Backslashes or absolute paths** in `href`/`<file>`.
- **Forgetting to set a terminal status.** If you never set `lesson_status` to `passed`/`completed`/`failed`, the SCO stays `incomplete` forever and the course never reports done.
- **Blowing the 4096-char `suspend_data` limit** — values get silently truncated and resume corrupts.
- **Malformed `session_time`** — not in `HHHH:MM:SS.SS`; some LMSs reject or ignore it.
- **Calling API before `LMSInitialize` or after `LMSFinish`** — returns errors and may lose data.
- **Not calling `LMSCommit`** — relying on `LMSFinish` alone risks losing progress if the window closes unexpectedly.
- **Treating values as non-strings** — all get/set values are strings; compare and parse accordingly.
- **`not attempted` typo** — it is lowercase with a space; `notattempted` is invalid.
- **score.raw outside 0–100** without setting `min`/`max` accordingly — confuses the LMS.
```
