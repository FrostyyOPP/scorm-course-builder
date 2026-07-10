/*
 * build-v2.js — GENERIC assembler: turn a course folder into the animated, 16:9,
 * flat+glass SCORM 1.2 package (shell-v2 engine). Nothing here is course-specific.
 *
 * Course STRUCTURE comes from  <course>/.pipeline/course.model.json  (see src/course-model.js),
 * produced by src/parse-outline.js and confirmed at the Scope gate.
 * Quiz questions are parsed from the quiz .docx by src/parse-quiz.js.
 * Media is discovered in the course folder:
 *   images     <course>/generated/images/<key>.png
 *   voiceover  <course>/Voiceovers/<slideId>.mp3   (+ Voiceovers/cues.json for reveal sync)
 *   captions   <course>/captions/<video-basename>.vtt
 *   resources  <course>/Resources/<videoId>/*      (enables the per-video Resources tab)
 *
 * Slide structure: Title -> Course Intro -> Home -> [ Module index -> (module intro) ->
 *   (Lesson index -> videos)* -> Reading -> Quiz intro -> N questions -> Result ]* -> Outro -> Exit
 *
 * Usage: node build-v2.js "<course folder>" [--out <dir>] [--emit]
 *        VIDEOS_DIR=Videos_min node build-v2.js "<course folder>"   (build from compressed videos)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildManifest, listFiles, zipDir, slugify } = require('./src/scorm');
const { loadQuestionsByModule } = require('./src/parse-quiz');
const { loadModel } = require('./src/course-model');

const SHELL = path.join(__dirname, 'src', 'shell-v2');

async function assemble(courseDir) {
  const model = loadModel(courseDir);
  const TITLE = model.title;
  const SUB = model.subtitle;
  const ACCENT = model.accents;
  const MODULES = model.modules;
  const COURSE_INTRO = model.courseIntro;
  const OUTRO = model.outro;

  const assets = [];
  const warnings = [];
  const imgDir = path.join(courseDir, 'generated', 'images');
  const capDir = path.join(courseDir, 'captions');
  const voDir = path.join(courseDir, 'Voiceovers');
  let voCuesMap = {};
  try { const cf = path.join(voDir, 'cues.json'); if (fs.existsSync(cf)) voCuesMap = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch (e) {}
  // WCAG 1.1.1: per-image alt text, keyed by image key, from generated/images/alt.json
  let altMap = {};
  try { const af = path.join(imgDir, 'alt.json'); if (fs.existsSync(af)) altMap = JSON.parse(fs.readFileSync(af, 'utf8')); } catch (e) {}
  const seen = {};
  function add(src, dest) { if (!seen[dest]) { assets.push({ src, dest }); seen[dest] = 1; } return 'assets/' + dest; }
  function image(key) { const f = path.join(imgDir, key + '.png'); return fs.existsSync(f) ? add(f, 'img-' + key + '.png') : ''; }
  function voiceover(id) { const f = path.join(voDir, id + '.mp3'); return fs.existsSync(f) ? add(f, 'vo-' + id + '.mp3') : ''; }
  // WCAG 1.2.2: captions for narrated (non-video) slides — captions/vo-<id>.vtt
  function voCaption(id) { const f = path.join(capDir, 'vo-' + id + '.vtt'); return fs.existsSync(f) ? add(f, 'vo-' + id + '.vtt') : ''; }
  const resDir = path.join(courseDir, 'Resources');
  function resources(id) { const d = path.join(resDir, id); if (!fs.existsSync(d)) return null;
    const files = fs.readdirSync(d).filter((f) => { try { return fs.statSync(path.join(d, f)).isFile(); } catch (e) { return false; } });
    return files.length ? files.map((f) => ({ name: f, url: add(path.join(d, f), 'res-' + id + '-' + f) })) : null; }
  function videoAsset(rel, dest) {
    if (!rel) return { src: '', cc: '' };
    const abs = path.join(courseDir, rel.split('/').join(path.sep));
    if (!fs.existsSync(abs)) { warnings.push('Missing video: ' + rel); return { src: '', cc: '' }; }
    const src = add(abs, dest);
    let cc = '';
    const vtt = path.join(capDir, path.basename(abs).replace(/\.[^.]+$/, '') + '.vtt');
    if (fs.existsSync(vtt)) cc = add(vtt, dest.replace(/\.mp4$/, '.vtt'));
    return { src, cc };
  }
  function exists(rel) { return !!rel && fs.existsSync(path.join(courseDir, rel.split('/').join(path.sep))); }

  const quiz = await loadQuestionsByModule(courseDir);

  const slides = [];
  slides.push({ id: 'title', type: 'title', accent: 'indigo', kicker: 'Starweaver Course', title: TITLE, subtitle: SUB, image: image('title') });

  if (COURSE_INTRO) { var ci = videoAsset(COURSE_INTRO, 'course-intro.mp4');
    if (ci.src) slides.push({ id: 'intro', type: 'video', accent: 'indigo', course: TITLE, module: 'Course Introduction', title: 'Course Welcome and Goals', src: ci.src, captions: ci.cc }); }

  slides.push({ id: 'home', type: 'home', accent: 'indigo', kicker: 'Course Modules', title: TITLE, subtitle: 'Select a module to begin, or use Next to move through the course.', image: image('home'),
    modules: MODULES.map((m) => ({ label: 'Module ' + m.n, title: m.title, target: 'm' + m.n, nav: exists(m.intro) ? ('m' + m.n + 'intro') : undefined })) });

  MODULES.forEach((m) => {
    var acc = ACCENT[m.n] || 'indigo';
    slides.push({ id: 'm' + m.n, type: 'moduleIndex', accent: acc, kicker: 'Module ' + m.n, title: m.title,
      image: image('m' + m.n), lessons: m.lessons.map((l, li) => ({ label: 'Lesson ' + (li + 1), title: l.title,
        target: (l.videos && l.videos.length) ? ('m' + m.n + 'l' + (li + 1)) : ('qi' + m.n) })) });

    if (m.intro) { var mi = videoAsset(m.intro, 'm' + m.n + '-intro.mp4'); if (mi.src) slides.push({ id: 'm' + m.n + 'intro', type: 'video', accent: acc, course: TITLE, module: 'Module ' + m.n + ' · Introduction', title: 'Module Introduction', src: mi.src, captions: mi.cc }); }

    m.lessons.forEach((l, li) => {
      if (!(l.videos && l.videos.length)) return;
      slides.push({ id: 'm' + m.n + 'l' + (li + 1), type: 'lessonIndex', accent: acc, kicker: 'Module ' + m.n + ' · Lesson ' + (li + 1), title: l.title,
        image: image('m' + m.n + 'l' + (li + 1)), videos: l.videos.map((v, vi) => ({ label: 'Video ' + (vi + 1), title: v.title, target: 'v' + m.n + '_' + (li + 1) + '_' + (vi + 1) })) });
      l.videos.forEach((v, vi) => {
        var dest = 'v' + m.n + '_' + (li + 1) + '_' + (vi + 1) + '.mp4';
        var va = videoAsset(v.file, dest);
        var vid = 'v' + m.n + '_' + (li + 1) + '_' + (vi + 1);
        slides.push({ id: vid, type: 'video', accent: acc, course: TITLE,
          module: 'Module ' + m.n + ' · Lesson ' + (li + 1) + ' · Video ' + (vi + 1), title: v.title, src: va.src, captions: va.cc,
          resources: resources(vid) || undefined });
      });
    });

    const rs = m.readings || [];
    if (rs.length) {
      slides.push({ id: 'r' + m.n + 'read', type: 'reading', accent: acc, title: 'Recommended Reading',
        readings: rs.map((r) => ({ title: r.title, url: r.url })),
        desc: 'Open each reading in a new tab, then continue the course.', image: image('r' + m.n + 'read') });
    }

    var qs = quiz.byModule[m.n] || [];
    slides.push({ id: 'qi' + m.n, type: 'quizIntro', accent: acc, module: 'Module ' + m.n, title: 'Module ' + m.n + ' Quiz', count: qs.length, image: image('qi' + m.n) });
    qs.forEach((q, qi) => slides.push({ id: 'q' + m.n + '_' + (qi + 1), type: 'question', accent: acc, module: 'Module ' + m.n, moduleKey: 'M' + m.n,
      index: qi + 1, total: qs.length, question: q.text, options: q.options.map((o) => ({ text: o.text, correct: o.correct, feedback: o.feedback })) }));
    slides.push({ id: 'r' + m.n, type: 'result', accent: acc, module: 'Module ' + m.n, moduleKey: 'M' + m.n });
  });

  if (OUTRO) { var ou = videoAsset(OUTRO, 'outro.mp4');
    if (ou.src) slides.push({ id: 'outro', type: 'video', accent: 'indigo', course: TITLE, module: 'Course Wrap-up', title: 'Course Wrap-up', src: ou.src, captions: ou.cc }); }
  slides.push({ id: 'exit', type: 'exit', accent: 'indigo', title: 'Course complete', subtitle: 'You have completed ' + TITLE + '. Select Exit to return to your learning platform.' });

  slides.forEach((s) => { const vo = voiceover(s.id); if (vo) { s.vo = vo; const vc = voCaption(s.id); if (vc && !s.captions) s.captions = vc; } if (voCuesMap[s.id]) s.voCues = voCuesMap[s.id]; if (s.image) { const k = (String(s.image).match(/img-(.+)\.png$/) || [])[1]; if (k && altMap[k]) s.imageAlt = altMap[k]; } });

  // HARD RULE: each slide's image must be unique — warn on any reuse (see CLAUDE.md)
  const imgUse = {};
  slides.forEach((s) => { if (s.image) (imgUse[s.image] = imgUse[s.image] || []).push(s.id); });
  Object.keys(imgUse).forEach((p) => { if (imgUse[p].length > 1) warnings.push('Duplicate image (unique-image rule) ' + p + ' on: ' + imgUse[p].join(', ')); });

  return { title: TITLE, passPercentage: model.passPercentage, slides, assets, warnings, questions: quiz.total, theme: model.theme || null };
}

// Per-course theme override (optional). model.theme = { primary, primary2, primarySoft, accents:{name:hex} }.
// Re-skins the brand (indigo family) + registers extra [data-accent] colors. No theme => default engine look.
function themeCss(theme) {
  if (!theme) return '';
  var t = theme, lines = [];
  var root = [];
  if (t.primary) root.push('--c-indigo:' + t.primary + ';');
  if (t.primary2) root.push('--c-indigo-2:' + t.primary2 + ';');
  if (t.primarySoft) root.push('--c-indigo-soft:' + t.primarySoft + ';');
  var acc = t.accents || {};
  Object.keys(acc).forEach(function (name) { root.push('--c-' + name + ':' + acc[name] + ';'); });
  if (root.length) lines.push(':root{' + root.join('') + '}');
  Object.keys(acc).forEach(function (name) { lines.push('[data-accent="' + name + '"]{--accent:var(--c-' + name + ');}'); });
  if (t.primary) lines.push('.home-bg{background:linear-gradient(135deg,#0b1220 0%,' + t.primary + ' 100%);}');
  return '\n<style id="course-theme">' + lines.join('\n') + '</style>';
}

function indexHtml(title, courseJson, theme) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title.replace(/</g, '&lt;')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="styles.css" />${themeCss(theme)}
</head>
<body>
  <div id="viewport"><div id="stage">
    <div id="topbar"><div class="bar" id="topbar-fill"></div></div>
    <div id="slide-host"></div>
    <button class="navbtn" id="nav-back" aria-label="Back"></button>
    <button class="navbtn" id="nav-next" aria-label="Next"></button>
    <div class="cc-overlay" id="cc-overlay"></div>
    <div id="controlbar"></div>
  </div></div>
  <div id="live" class="sr-only" aria-live="polite" aria-atomic="true"></div>
  <script src="vendor/gsap.min.js"></script>
  <script src="vendor/lottie.min.js"></script>
  <script src="scorm-api.js"></script>
  <script>window.COURSE = ${courseJson};</script>
  <script src="player.js"></script>
</body>
</html>`;
}

async function build(courseDir, opts = {}) {
  const a = await assemble(courseDir);
  const outDir = opts.out ? path.resolve(opts.out) : courseDir;
  fs.mkdirSync(outDir, { recursive: true });
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-'));
  try {
    fs.mkdirSync(path.join(buildDir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(buildDir, 'vendor'), { recursive: true });
    for (const f of ['styles.css', 'player.js']) fs.copyFileSync(path.join(SHELL, f), path.join(buildDir, f));
    for (const f of fs.readdirSync(path.join(SHELL, 'vendor'))) fs.copyFileSync(path.join(SHELL, 'vendor', f), path.join(buildDir, 'vendor', f));
    fs.copyFileSync(path.join(__dirname, 'src', 'shell', 'scorm-api.js'), path.join(buildDir, 'scorm-api.js'));
    for (const as of a.assets) fs.copyFileSync(as.src, path.join(buildDir, 'assets', path.basename(as.dest)));
    const courseData = { title: a.title, passPercentage: a.passPercentage, slides: a.slides };
    fs.writeFileSync(path.join(buildDir, 'index.html'), indexHtml(a.title, JSON.stringify(courseData), a.theme));
    const all = listFiles(buildDir).filter((f) => f !== 'imsmanifest.xml');
    fs.writeFileSync(path.join(buildDir, 'imsmanifest.xml'), buildManifest(a.title, all));
    const outFile = path.join(outDir, slugify(a.title) + '-v2-SCORM12.zip');
    await zipDir(buildDir, outFile);
    return { outFile, slides: a.slides.length, questions: a.questions, assets: a.assets.length, warnings: a.warnings };
  } finally { fs.rmSync(buildDir, { recursive: true, force: true }); }
}

module.exports = { build, assemble, indexHtml };

// Write the assembled course structure (no packaging) to <course>/.review/course.json
// so the review app + scorm-review MCP can read slides without importing this module.
async function emitCourseJson(courseDir) {
  const a = await assemble(courseDir);
  const dir = path.join(courseDir, '.review');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'course.json');
  fs.writeFileSync(out, JSON.stringify({ title: a.title, slides: a.slides, questions: a.questions }, null, 2));
  const assetsMap = {};
  for (const as of a.assets) assetsMap['assets/' + as.dest] = as.src;
  fs.writeFileSync(path.join(dir, 'assets.json'), JSON.stringify(assetsMap, null, 2));
  const courseData = { title: a.title, passPercentage: a.passPercentage, slides: a.slides };
  fs.writeFileSync(path.join(dir, 'index.html'), indexHtml(a.title, JSON.stringify(courseData), a.theme));
  return { out, slides: a.slides.length };
}
module.exports.emitCourseJson = emitCourseJson;

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = path.resolve(args.find((x) => !x.startsWith('--')) || '.');
  const get = (f) => { const k = args.indexOf(f); return k >= 0 ? args[k + 1] : undefined; };
  if (args.includes('--emit')) {
    emitCourseJson(dir).then((r) => console.log('✅ course.json: ' + r.out + ' (' + r.slides + ' slides)'))
      .catch((e) => { console.error('❌ ' + e.stack); process.exit(1); });
    return;
  }
  build(dir, { out: get('--out') }).then((r) => {
    console.log('\n✅ Animated SCORM 1.2 (v2):\n   ' + r.outFile);
    console.log('   ' + r.slides + ' slides · ' + r.questions + ' quiz questions · ' + r.assets + ' assets');
    if (r.warnings.length) { console.log('\n⚠️  ' + r.warnings.length + ' warning(s):'); r.warnings.slice(0, 10).forEach((w) => console.log('   - ' + w)); }
    console.log('');
  }).catch((e) => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
}
