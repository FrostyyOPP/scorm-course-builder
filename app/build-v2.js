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

// Bilingual/localization defaults for the fixed UI chrome that build-v2 (not the model's own
// title/subtitle fields) generates. A course overrides any subset via model.ui — see
// course-model.js. Client-facing chrome (button labels etc.) is a separate table embedded
// in courseData.ui and read by player.js; this one covers server-assembled slide copy.
const UI_DEFAULTS = {
  starweaverKicker: 'Starweaver Course',
  courseWelcome: 'Course Welcome and Goals',
  courseIntroModule: 'Course Introduction',
  homeKicker: 'Course',
  homeSubtitle: 'Select a module to begin, or use Next to move through the course.',
  moduleLabelTpl: 'Module {n}',
  lessonLabelTpl: 'Lesson {n}',
  videoLabelTpl: 'Video {n}',
  partLabelTpl: 'Part {n}',
  assessmentLabel: 'Assessment',
  moduleIntroTitle: 'Module Introduction',
  moduleIntroBreadcrumbTpl: 'Module {n} · Introduction',
  lessonKickerTpl: 'Module {m} · Lesson {l}',
  readingTitle: 'Recommended Reading',
  readingDesc: 'Open each reading in a new tab, then continue the course.',
  quizTitleTpl: 'Module {n} Quiz',
  courseWrapup: 'Course Wrap-up',
  exitTitle: 'Course complete',
  exitSubtitleTpl: 'You have completed {title}. Select Exit to return to your learning platform.',
  // ---- client-side chrome (read by player.js at runtime via window.COURSE.ui) ----
  startCourseBtn: 'Start course',
  startQuizBtn: 'Start quiz',
  quizLeadTpl: '{count} questions. Select an answer, submit it to see feedback, then continue. Your score appears at the end.',
  questionsPillTpl: '{count} Questions',
  submitBtn: 'Submit',
  previousBtn: 'Previous',
  nextQuestionBtn: 'Next question',
  seeScoreBtn: 'See score',
  correctLabel: 'Correct',
  notQuiteLabel: 'Not quite',
  notGradedLabel: 'Not graded',
  checkAnswerBtn: 'Check answer',
  continueBtn: 'Continue',
  resetBtn: 'Reset',
  wellDoneTitle: 'Well done!',
  keepGoingTitle: 'Keep going',
  reviewQuizBtn: 'Review Quiz',
  retakeQuizBtn: 'Retake Quiz',
  yourScoreLabel: 'Your Score',
  passedDetailTpl: 'You met the {pct}% pass mark.',
  failedDetailTpl: 'You need {pct}% to pass. Review the quiz and try again.',
  answeredDetailTpl: 'You answered {correct} of {total} questions correctly.',
  answeredWithActivitiesTpl: 'You answered {correct} of {total} questions correctly, and scored {actPts} of {actMax} on the drag-and-drop activities.',
  startOverBtn: 'Start Over',
  exitCourseBtn: 'Exit Course',
  courseCompletePill: 'Course Complete',
  prevSlideBtn: 'Prev',
  nextSlideBtn: 'Next',
  questionCounterTpl: 'Question {index} of {total}',
  hereAreAnswersLabel: 'Here are the correct answers',
  attemptsLeftTpl: ' You have {n} attempt{s} left.',
  placedCounterTpl: '{used} of {total} placed',
  transcriptTab: 'Transcript',
  menuTab: 'Menu',
  resourcesTitle: 'Downloadable Resources',
  noResourcesMsg: 'No downloadable resources for this video.',
  transcriptLoadingMsg: 'Transcript is loading, or not available for this video.',
  playNarrationLabel: 'Play or replay narration',
  nextBtn: 'Next',
  readingMaterialLabel: 'Reading Material',
  menuTitleLabel: 'Title',
  menuHomeLabel: 'Home',
  menuOverviewLabel: 'Overview',
  menuResultsLabel: 'Results',
  resultKickerLabel: 'Result',        // breadcrumb on the quiz result slide ("Module 1 · Result")
  questionMenuLabelTpl: 'Question {n}',
  gettingStartedLabel: 'Getting Started',
  wrapUpLabel: 'Wrap Up',
  menuPanelTitle: 'Menu',
  transcriptPanelTitle: 'Transcript',
};
function tpl(str, vars) { return String(str == null ? '' : str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : '')); }

async function assemble(courseDir) {
  const model = loadModel(courseDir);
  const TITLE = model.title;
  const SUB = model.subtitle;
  const ACCENT = model.accents;
  const MODULES = model.modules;
  const COURSE_INTRO = model.courseIntro;
  const OUTRO = model.outro;
  const UI = Object.assign({}, UI_DEFAULTS, model.ui || {});
  const CAPTION_LANGS = model.captionLangs || [];

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
  // Slide art may be .png (graphics/composites) or .jpg (photographs — far smaller in the zip).
  function image(key) {
    for (const ext of ['.png', '.jpg', '.jpeg']) {
      const f = path.join(imgDir, key + ext);
      if (fs.existsSync(f)) return add(f, 'img-' + key + ext);
    }
    return '';
  }
  function voiceover(id) { const f = path.join(voDir, id + '.mp3'); return fs.existsSync(f) ? add(f, 'vo-' + id + '.mp3') : ''; }
  // WCAG 1.2.2: captions for narrated (non-video) slides — captions/vo-<id>.vtt (legacy single-track)
  function voCaption(id) { const f = path.join(capDir, 'vo-' + id + '.vtt'); return fs.existsSync(f) ? add(f, 'vo-' + id + '.vtt') : ''; }
  // Multi-language captions: captions/<baseNoExt>.<code>.vtt per model.captionLangs entry.
  // destBaseNoExt is the in-package asset name (without extension) to copy each track to.
  function captionTracksFor(baseNoExt, destBaseNoExt) {
    if (!CAPTION_LANGS.length) return null;
    const tracks = [];
    CAPTION_LANGS.forEach((L) => {
      const f = path.join(capDir, baseNoExt + '.' + L.code + '.vtt');
      if (fs.existsSync(f)) tracks.push({ lang: L.code, label: L.label || L.code.toUpperCase(), default: !!L.default, src: add(f, destBaseNoExt + '.' + L.code + '.vtt') });
    });
    return tracks.length ? tracks : null;
  }
  function voCaptionTracks(id) { return captionTracksFor('vo-' + id, 'vo-' + id); }
  const resDir = path.join(courseDir, 'Resources');
  function resources(id) { const d = path.join(resDir, id); if (!fs.existsSync(d)) return null;
    const files = fs.readdirSync(d).filter((f) => { try { return fs.statSync(path.join(d, f)).isFile(); } catch (e) { return false; } });
    return files.length ? files.map((f) => ({ name: f, url: add(path.join(d, f), 'res-' + id + '-' + f) })) : null; }
  function videoAsset(rel, dest) {
    if (!rel) return { src: '', cc: '', ccTracks: null };
    const abs = path.join(courseDir, rel.split('/').join(path.sep));
    if (!fs.existsSync(abs)) { warnings.push('Missing video: ' + rel); return { src: '', cc: '', ccTracks: null }; }
    const src = add(abs, dest);
    const baseNoExt = path.basename(abs).replace(/\.[^.]+$/, '');
    const destNoExt = dest.replace(/\.mp4$/, '');
    let cc = '', ccTracks = captionTracksFor(baseNoExt, destNoExt);
    if (ccTracks) { cc = (ccTracks.find((t) => t.default) || ccTracks[0]).src; }
    else { const vtt = path.join(capDir, baseNoExt + '.vtt'); if (fs.existsSync(vtt)) cc = add(vtt, destNoExt + '.vtt'); }
    return { src, cc, ccTracks };
  }
  function exists(rel) { return !!rel && fs.existsSync(path.join(courseDir, rel.split('/').join(path.sep))); }

  // Questions may be authored directly in the model instead of a quiz .docx; only require the
  // .docx when at least one module actually depends on it.
  const needsQuizDoc = MODULES.some((m) => !(m.questions || []).length && !(m.screens || []).length);
  const quiz = needsQuizDoc ? await loadQuestionsByModule(courseDir) : { byModule: {}, total: 0 };

  // Map an authored <screen> (see course-model.js) onto a player slide. Generic: no course specifics.
  function screenSlide(sc, acc, kicker) {
    const base = { id: sc.id, accent: acc, kicker: sc.kicker || kicker, title: sc.title };
    if (sc.type === 'knowledgeCheck') {
      return Object.assign(base, { type: 'knowledgeCheck', question: sc.question,
        options: (sc.options || []).map((o) => ({ text: o.text, correct: !!o.correct, feedback: o.feedback })) });
    }
    if (sc.type === 'dragdrop') {
      return Object.assign(base, { type: 'dragdrop', mode: sc.mode || 'match', graded: sc.graded !== false,
        prompt: sc.prompt, attempts: (typeof sc.attempts === 'number') ? sc.attempts : 2,
        targets: sc.targets, slots: sc.slots, bins: sc.bins, items: sc.items,
        feedbackCorrect: sc.feedbackCorrect, feedbackIncorrect: sc.feedbackIncorrect });
    }
    return Object.assign(base, { type: 'content', layout: sc.layout || 'split', imageSide: sc.imageSide || 'right',
      subtitle: sc.subtitle, callout: sc.callout, points: sc.points, cards: sc.cards, image: sc.image ? image(sc.image) : '' });
  }

  const slides = [];
  slides.push({ id: 'title', type: 'title', accent: 'indigo', kicker: UI.starweaverKicker, title: TITLE, subtitle: SUB, image: image('title'), disclaimer: model.disclaimer || '' });

  if (COURSE_INTRO) { var ci = videoAsset(COURSE_INTRO, 'course-intro.mp4');
    if (ci.src) slides.push({ id: 'intro', type: 'video', accent: 'indigo', course: TITLE, module: UI.courseIntroModule, title: UI.courseWelcome, src: ci.src, captions: ci.cc, captionsTracks: ci.ccTracks || undefined }); }

  (model.introScreens || []).forEach((sc) => slides.push(screenSlide(sc, 'indigo', 'Getting Started')));

  slides.push({ id: 'home', type: 'home', accent: 'indigo', kicker: UI.homeKicker, title: TITLE, subtitle: UI.homeSubtitle, image: image('home'),
    modules: MODULES.map((m) => ({ label: tpl(UI.moduleLabelTpl, { n: m.n }), title: m.title, target: 'm' + m.n, nav: exists(m.intro) ? ('m' + m.n + 'intro') : undefined })) });

  MODULES.forEach((m) => {
    var acc = ACCENT[m.n] || 'indigo';
    var hasScreens = (m.screens || []).length > 0;
    var authored = (m.questions || []).length > 0;   // questions authored in the model rather than the quiz .docx
    var moduleLabel = tpl(UI.moduleLabelTpl, { n: m.n });

    // A screens module indexes its own screens; a video module indexes its lessons (unchanged).
    var indexItems = hasScreens
      ? m.screens.map((sc, si) => ({ label: tpl(UI.partLabelTpl, { n: si + 1 }), title: sc.title, target: sc.id }))
      : m.lessons.map((l, li) => ({ label: tpl(UI.lessonLabelTpl, { n: li + 1 }), title: l.title,
          target: (l.videos && l.videos.length) ? ('m' + m.n + 'l' + (li + 1)) : ('qi' + m.n) }));
    if (m.assessment && !hasScreens) indexItems = [{ label: UI.assessmentLabel, title: m.title, target: 'qi' + m.n }];

    slides.push(Object.assign({ id: 'm' + m.n, type: 'moduleIndex', accent: acc, kicker: moduleLabel, title: m.title,
      image: image('m' + m.n) }, hasScreens ? { screens: indexItems } : { lessons: indexItems }));

    if (hasScreens) m.screens.forEach((sc) => slides.push(screenSlide(sc, acc, moduleLabel)));

    if (m.intro) { var mi = videoAsset(m.intro, 'm' + m.n + '-intro.mp4'); if (mi.src) slides.push({ id: 'm' + m.n + 'intro', type: 'video', accent: acc, course: TITLE, module: tpl(UI.moduleIntroBreadcrumbTpl, { n: m.n }), title: UI.moduleIntroTitle, src: mi.src, captions: mi.cc, captionsTracks: mi.ccTracks || undefined }); }

    m.lessons.forEach((l, li) => {
      if (!(l.videos && l.videos.length)) return;
      var lessonKicker = tpl(UI.lessonKickerTpl, { m: m.n, l: li + 1 });
      slides.push({ id: 'm' + m.n + 'l' + (li + 1), type: 'lessonIndex', accent: acc, kicker: lessonKicker, title: l.title,
        image: image('m' + m.n + 'l' + (li + 1)), videos: l.videos.map((v, vi) => ({ label: tpl(UI.videoLabelTpl, { n: vi + 1 }), title: v.title, target: 'v' + m.n + '_' + (li + 1) + '_' + (vi + 1) })) });
      l.videos.forEach((v, vi) => {
        var dest = 'v' + m.n + '_' + (li + 1) + '_' + (vi + 1) + '.mp4';
        var va = videoAsset(v.file, dest);
        var vid = 'v' + m.n + '_' + (li + 1) + '_' + (vi + 1);
        slides.push({ id: vid, type: 'video', accent: acc, course: TITLE,
          module: lessonKicker + ' · ' + tpl(UI.videoLabelTpl, { n: vi + 1 }), title: v.title, src: va.src, captions: va.cc, captionsTracks: va.ccTracks || undefined,
          resources: resources(vid) || undefined });
      });
    });

    const rs = m.readings || [];
    if (rs.length) {
      slides.push({ id: 'r' + m.n + 'read', type: 'reading', accent: acc, title: UI.readingTitle,
        readings: rs.map((r) => ({ title: r.title, url: r.url })),
        desc: UI.readingDesc, image: image('r' + m.n + 'read') });
    }

    // Questions come from the model when authored there, else from the quiz .docx (unchanged path).
    var qs = authored ? m.questions : (quiz.byModule[m.n] || []);
    // Video modules always carry a quiz block (legacy behaviour). Screens modules only get one when
    // they actually have questions, so a pure-content module doesn't emit an empty quiz.
    if (qs.length || !hasScreens) {
      slides.push({ id: 'qi' + m.n, type: 'quizIntro', accent: acc, module: moduleLabel,
        title: m.assessment ? m.title : tpl(UI.quizTitleTpl, { n: m.n }), count: qs.length,
        image: image(m.quizImage || ('qi' + m.n)), passPercentage: model.passPercentage });
      qs.forEach((q, qi) => slides.push({ id: 'q' + m.n + '_' + (qi + 1), type: 'question', accent: acc, module: moduleLabel, moduleKey: 'M' + m.n,
        index: qi + 1, total: qs.length, question: q.text, options: q.options.map((o) => ({ text: o.text, correct: o.correct, feedback: o.feedback })) }));
      slides.push({ id: 'r' + m.n, type: 'result', accent: acc, module: moduleLabel, moduleKey: 'M' + m.n });
    }
  });

  if (OUTRO) { var ou = videoAsset(OUTRO, 'outro.mp4');
    if (ou.src) slides.push({ id: 'outro', type: 'video', accent: 'indigo', course: TITLE, module: UI.courseWrapup, title: UI.courseWrapup, src: ou.src, captions: ou.cc, captionsTracks: ou.ccTracks || undefined }); }
  slides.push({ id: 'exit', type: 'exit', accent: 'indigo', title: UI.exitTitle, subtitle: tpl(UI.exitSubtitleTpl, { title: TITLE }) });

  slides.forEach((s) => { const vo = voiceover(s.id); if (vo) { s.vo = vo; const vcTracks = voCaptionTracks(s.id); if (vcTracks) { s.captionsTracks = vcTracks; s.captions = (vcTracks.find((t) => t.default) || vcTracks[0]).src; } else { const vc = voCaption(s.id); if (vc && !s.captions) s.captions = vc; } } if (voCuesMap[s.id]) s.voCues = voCuesMap[s.id]; if (s.image) { const k = (String(s.image).match(/img-(.+)\.(?:png|jpe?g)$/) || [])[1]; if (k && altMap[k]) s.imageAlt = altMap[k]; } });

  // HARD RULE: each slide's image must be unique — warn on any reuse (see CLAUDE.md)
  const imgUse = {};
  slides.forEach((s) => { if (s.image) (imgUse[s.image] = imgUse[s.image] || []).push(s.id); });
  Object.keys(imgUse).forEach((p) => { if (imgUse[p].length > 1) warnings.push('Duplicate image (unique-image rule) ' + p + ' on: ' + imgUse[p].join(', ')); });

  const authoredQ = MODULES.reduce((a, m) => a + (m.questions || []).length, 0);
  return { title: TITLE, titleShort: model.titleShort || null, passPercentage: model.passPercentage, slides, assets, warnings,
    questions: quiz.total + authoredQ, theme: model.theme || null, skin: model.skin || null,
    scoring: model.scoring || null, flow: model.flow || null, ui: UI, lang: model.lang || 'en' };
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

function indexHtml(title, courseJson, theme, skin, lang) {
  const skinLink = skin ? `\n<link rel="stylesheet" href="skin-${skin}.css" />` : '';
  return `<!DOCTYPE html>
<html lang="${(lang || 'en').replace(/[^a-zA-Z-]/g, '')}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title.replace(/</g, '&lt;')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="styles.css" />${skinLink}${themeCss(theme)}
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
  // --dir leaves the unpacked course on disk (servable) instead of zipping it — for local preview.
  const buildDir = opts.dir ? path.resolve(opts.dir) : fs.mkdtempSync(path.join(os.tmpdir(), 'v2-'));
  if (opts.dir) { fs.rmSync(buildDir, { recursive: true, force: true }); fs.mkdirSync(buildDir, { recursive: true }); }
  try {
    fs.mkdirSync(path.join(buildDir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(buildDir, 'vendor'), { recursive: true });
    for (const f of ['styles.css', 'player.js']) fs.copyFileSync(path.join(SHELL, f), path.join(buildDir, f));
    if (a.skin) {
      const skinFile = path.join(SHELL, 'skins', a.skin + '.css');
      if (!fs.existsSync(skinFile)) throw new Error('Unknown skin "' + a.skin + '" (expected ' + skinFile + ')');
      fs.copyFileSync(skinFile, path.join(buildDir, 'skin-' + a.skin + '.css'));
    }
    for (const f of fs.readdirSync(path.join(SHELL, 'vendor'))) fs.copyFileSync(path.join(SHELL, 'vendor', f), path.join(buildDir, 'vendor', f));
    fs.copyFileSync(path.join(__dirname, 'src', 'shell', 'scorm-api.js'), path.join(buildDir, 'scorm-api.js'));
    for (const as of a.assets) fs.copyFileSync(as.src, path.join(buildDir, 'assets', path.basename(as.dest)));
    const courseData = { title: a.title, titleShort: a.titleShort, passPercentage: a.passPercentage, scoring: a.scoring, flow: a.flow, slides: a.slides, ui: a.ui, lang: a.lang };
    fs.writeFileSync(path.join(buildDir, 'index.html'), indexHtml(a.title, JSON.stringify(courseData), a.theme, a.skin, a.lang));
    const all = listFiles(buildDir).filter((f) => f !== 'imsmanifest.xml');
    fs.writeFileSync(path.join(buildDir, 'imsmanifest.xml'), buildManifest(a.title, all, a.passPercentage));
    if (opts.dir) return { outFile: buildDir, slides: a.slides.length, questions: a.questions, assets: a.assets.length, warnings: a.warnings };
    const outFile = path.join(outDir, slugify(a.title) + '-v2-SCORM12.zip');
    await zipDir(buildDir, outFile);
    return { outFile, slides: a.slides.length, questions: a.questions, assets: a.assets.length, warnings: a.warnings };
  } finally { if (!opts.dir) fs.rmSync(buildDir, { recursive: true, force: true }); }
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
  const courseData = { title: a.title, titleShort: a.titleShort, passPercentage: a.passPercentage, scoring: a.scoring, flow: a.flow, slides: a.slides, ui: a.ui, lang: a.lang };
  fs.writeFileSync(path.join(dir, 'index.html'), indexHtml(a.title, JSON.stringify(courseData), a.theme, a.skin, a.lang));
  if (a.skin) {
    const skinFile = path.join(SHELL, 'skins', a.skin + '.css');
    if (!fs.existsSync(skinFile)) throw new Error('Unknown skin "' + a.skin + '" (expected ' + skinFile + ')');
    fs.copyFileSync(skinFile, path.join(dir, 'skin-' + a.skin + '.css'));
  }
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
  build(dir, { out: get('--out'), dir: get('--dir') }).then((r) => {
    console.log('\n✅ Animated SCORM 1.2 (v2):\n   ' + r.outFile);
    console.log('   ' + r.slides + ' slides · ' + r.questions + ' quiz questions · ' + r.assets + ' assets');
    if (r.warnings.length) { console.log('\n⚠️  ' + r.warnings.length + ' warning(s):'); r.warnings.slice(0, 10).forEach((w) => console.log('   - ' + w)); }
    console.log('');
  }).catch((e) => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
}
