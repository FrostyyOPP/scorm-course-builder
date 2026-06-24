/*
 * build-shell.js — build a branded, accessible, slide-by-slide SCORM 1.2 course
 * from a project folder:
 *
 *   <project>/outline/   one Markdown outline = the master structure (order + titles)
 *   <project>/videos/    .mp4 files
 *   <project>/readings/  .docx files
 *   <project>/quizzes/   .docx files
 *   -> writes <project>/<course>-SCORM12.zip
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseQuiz, parseReading } = require('./parse-docx');
const { parseOutline, resolveItemFile } = require('./parse-outline');
const { buildManifest, listFiles, zipDir, slugify } = require('./scorm');
const { ACCENTS } = require('./brand');

const SHELL = path.join(__dirname, 'shell');
function xmlEscape(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function norm(s){return String(s).replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().toLowerCase();}

async function buildScreens(projectDir, course) {
  const screens = [];
  const assets = [];
  const warnings = [];
  const multiModule = course.modules.filter((m) => m.title).length > 1;

  const overview = (multiModule ? course.modules.map((m) => m.title) : course.items.map((it) => it.title || it.file)).filter(Boolean);
  screens.push({ type: 'cover', kicker: 'Course', title: course.title,
    subtitle: course.subtitle || 'Use Next and Back to move through each screen.', items: overview });

  let accentIx = 0;
  for (const mod of course.modules) {
    if (mod.title) screens.push({ type: 'module', title: mod.title });
    for (const item of mod.items) {
      const file = resolveItemFile(projectDir, item);
      if (!file) { warnings.push(`Missing ${item.type} file: ${item.file} (in ${item.type}s/)`); continue; }
      const accent = ACCENTS[accentIx % ACCENTS.length];
      if (item.type === 'video') {
        const safe = path.basename(file).replace(/[^\w.\-]+/g, '_');
        assets.push({ src: file, dest: 'assets/' + safe });
        // optional captions: <project>/captions/<samebasename>.vtt
        const vtt = path.join(projectDir, 'captions', path.basename(file).replace(/\.[^.]+$/, '') + '.vtt');
        let captions = null;
        if (fs.existsSync(vtt)) { assets.push({ src: vtt, dest: 'assets/' + path.basename(vtt) }); captions = 'assets/' + path.basename(vtt); }
        else warnings.push(`No captions for video "${item.file}" (WCAG 1.2.2) — add captions/${path.basename(file).replace(/\.[^.]+$/, '')}.vtt`);
        screens.push({ type: 'video', eyebrow: 'Video', title: item.title || path.basename(file, path.extname(file)), src: 'assets/' + safe, captions });
      } else if (item.type === 'reading') {
        const r = await parseReading(file);
        const ttl = item.title || r.title;
        const html = r.html.replace(/^\s*<p>\s*(?:<strong>)?(.*?)(?:<\/strong>)?\s*<\/p>/i, (m, inner) => norm(inner) === norm(ttl) ? '' : m);
        screens.push({ type: 'reading', accent, title: ttl, html });
      } else if (item.type === 'quiz') {
        const q = await parseQuiz(file);
        screens.push({ type: 'quizIntro', title: item.title || 'Graded Quiz', count: q.questions.length, accent });
        q.questions.forEach((ques, n) => screens.push({
          type: 'question', index: n + 1, total: q.questions.length, question: ques.text,
          options: ques.options.map((o) => ({ text: o.text, correct: !!o.correct, feedback: o.feedback || '' })),
        }));
      }
      accentIx++;
    }
  }
  screens.push({ type: 'summary' });
  return { screens, assets, warnings };
}

function indexHtml(title, courseJson) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${xmlEscape(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="shell.css" />
</head>
<body>
  <a href="#slide" class="skip-link">Skip to content</a>
  <header class="topbar">
    <button class="icon-btn" id="menu-toggle" type="button" aria-label="Toggle menu" aria-expanded="true" aria-controls="sidebar">
      <span class="bars" aria-hidden="true"></span>
    </button>
    <span class="brand-dot" aria-hidden="true"></span>
    <span class="course-title">${xmlEscape(title)}</span>
    <span class="spacer"></span>
    <span class="counter" id="counter" aria-hidden="true"></span>
  </header>
  <div class="progress-rail" id="progress-rail" role="progressbar" aria-label="Course progress" aria-valuemin="1" aria-valuenow="1">
    <div class="progress-fill" id="progress-fill"></div>
  </div>
  <div class="app">
    <nav class="sidebar" id="sidebar" aria-label="Course menu"><div class="menu" id="menu"></div></nav>
    <main class="stage" id="stage" tabindex="-1">
      <section class="slide" id="slide"></section>
    </main>
  </div>
  <aside class="transcript" id="transcript" aria-label="Transcript" hidden>
    <div class="transcript-head"><span>Transcript</span>
      <button class="icon-btn" id="transcript-close" type="button" aria-label="Close transcript">×</button></div>
    <div class="transcript-body" id="transcript-body"></div>
  </aside>
  <footer class="controlbar" aria-label="Course controls">
    <button class="btn btn-soft" id="transcript-toggle" type="button" aria-pressed="false">Transcript</button>
    <span class="spacer"></span>
    <button class="btn btn-ghost" id="back" type="button">Back</button>
    <button class="btn btn-primary" id="next" type="button">Next</button>
  </footer>
  <div id="live" class="sr-only" aria-live="polite" aria-atomic="true"></div>
  <script src="scorm-api.js"></script>
  <script>window.COURSE = ${courseJson};</script>
  <script src="player.js"></script>
</body>
</html>`;
}

// Assemble a SCORM 1.2 package from already-prepared screens + assets.
//   assets: [{ src: <absolute file>, dest: 'assets/<name>' }]
async function packageCourse({ title, screens, assets, outDir, passPercentage }) {
  fs.mkdirSync(outDir, { recursive: true });
  const courseData = { title, passPercentage: passPercentage || 50, screens };
  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-'));
  try {
    fs.mkdirSync(path.join(build, 'assets'), { recursive: true });
    for (const a of assets) fs.copyFileSync(a.src, path.join(build, a.dest));
    fs.copyFileSync(path.join(SHELL, 'styles.css'), path.join(build, 'shell.css'));
    fs.copyFileSync(path.join(SHELL, 'player.js'), path.join(build, 'player.js'));
    fs.copyFileSync(path.join(SHELL, 'scorm-api.js'), path.join(build, 'scorm-api.js'));
    fs.writeFileSync(path.join(build, 'index.html'), indexHtml(title, JSON.stringify(courseData)));

    const allFiles = listFiles(build).filter((f) => f !== 'imsmanifest.xml');
    fs.writeFileSync(path.join(build, 'imsmanifest.xml'), buildManifest(title, allFiles));

    const outFile = path.join(outDir, slugify(title) + '-SCORM12.zip');
    await zipDir(build, outFile);
    return { outFile, screenCount: screens.length };
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
}

async function buildShell(projectDir, opts = {}) {
  const course = parseOutline(projectDir);
  const title = opts.title || course.title || 'Course';
  const { screens, assets, warnings } = await buildScreens(projectDir, course);
  const outDir = opts.out ? path.resolve(opts.out) : projectDir; // default: into the project folder
  const res = await packageCourse({ title, screens, assets, outDir, passPercentage: opts.passPercentage });
  return { ...res, warnings };
}

module.exports = { buildShell, packageCourse };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || '.');
  buildShell(dir)
    .then((r) => {
      if (r.warnings.length) { console.log('\n⚠️  ' + r.warnings.length + ' warning(s):'); r.warnings.forEach((w) => console.log('   - ' + w)); }
      console.log(`\n✅ SCORM 1.2: ${r.outFile}\n   ${r.screenCount} screens\n`);
    })
    .catch((e) => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
}
