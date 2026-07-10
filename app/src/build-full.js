/*
 * build-full.js — build a complete multi-module SCORM 1.2 course from a course folder
 * that uses a Starweaver .docx outline + code-named media (M<m>Intro, M<m>L<l>V<v>).
 *
 * Structure = derived from the filename codes; titles = from the .docx outline.
 * Order: cover → [Module → intro video → (Lesson → its videos → its reading) ...] → quiz → summary.
 */
const fs = require('fs');
const path = require('path');
const { parseQuiz, parseReading } = require('./parse-docx');
const { parseOutlineDocx } = require('./parse-outline-docx');
const { packageCourse } = require('./build-shell');
const { ACCENTS } = require('./brand');

function norm(s){return String(s).replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().toLowerCase();}
function stripDupTitle(html, title){
  return html.replace(/^\s*<p>\s*(?:<strong>)?(.*?)(?:<\/strong>)?\s*<\/p>/i, (m, inner) => norm(inner) === norm(title) ? '' : m);
}

// ---- folder + file discovery -------------------------------------------------
function listFilesIn(dir, re) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => !f.startsWith('.') && re.test(f)).map((f) => path.join(dir, f));
}
function findSubfolders(root) {
  const dirs = fs.readdirSync(root).map((d) => path.join(root, d)).filter((d) => { try { return fs.statSync(d).isDirectory(); } catch (e) { return false; } });
  const has = (dir, re) => fs.readdirSync(dir).some((f) => re.test(f));
  return {
    videos: dirs.find((d) => has(d, /\.(mp4|webm|m4v)$/i)),
    readings: dirs.find((d) => has(d, /reading.*\.docx$/i) || (has(d, /\.docx$/i) && /reading/i.test(path.basename(d)))),
    quizzes: dirs.find((d) => has(d, /quiz.*\.docx$/i) || /quiz|question/i.test(path.basename(d))),
    captions: dirs.find((d) => has(d, /\.vtt$/i)),
  };
}

// ---- assemble ----------------------------------------------------------------
async function assembleFull(courseDir) {
  const outlineFile = listFilesIn(courseDir, /outline.*\.docx$/i)[0] || listFilesIn(courseDir, /\.docx$/i)[0];
  if (!outlineFile) throw new Error('No outline .docx found in the course folder.');
  const ol = await parseOutlineDocx(outlineFile);

  const folders = findSubfolders(courseDir);
  if (!folders.videos) throw new Error('No video folder found (a subfolder containing .mp4 files).');

  const warnings = [];
  const assets = [];
  const screens = [];

  // index videos by code
  const videoFiles = listFilesIn(folders.videos, /\.(mp4|webm|m4v)$/i);
  const intros = {};   // m -> file
  const vids = {};     // "m.l.v" -> file
  const modulesSet = new Set();
  const lessonsByModule = {}; // m -> Set(l)
  for (const f of videoFiles) {
    const b = path.basename(f);
    let mt;
    if ((mt = /^M(\d+)Intro/i.exec(b))) { intros[+mt[1]] = f; modulesSet.add(+mt[1]); }
    else if ((mt = /^M(\d+)L(\d+)V(\d+)/i.exec(b))) {
      const m = +mt[1], l = +mt[2], v = +mt[3];
      vids[m + '.' + l + '.' + v] = f; modulesSet.add(m);
      (lessonsByModule[m] = lessonsByModule[m] || new Set()).add(l);
    } else warnings.push('Unrecognized video filename (skipped): ' + b);
  }

  // index readings by "m.l"
  const readingFiles = folders.readings ? listFilesIn(folders.readings, /\.docx$/i) : [];
  const readings = {};
  for (const f of readingFiles) {
    const b = path.basename(f);
    const mt = /M\s*(\d+)\s*L\s*(\d+)/i.exec(b);
    if (mt) readings[+mt[1] + '.' + +mt[2]] = f; else warnings.push('Reading without M#L# code (skipped): ' + b);
  }

  const captionFor = (file) => {
    if (!folders.captions) return null;
    const vtt = path.join(folders.captions, path.basename(file).replace(/\.[^.]+$/, '') + '.vtt');
    return fs.existsSync(vtt) ? vtt : null;
  };
  const addVideo = (file, eyebrow, title) => {
    const safe = path.basename(file).replace(/[^\w.\-]+/g, '_');
    assets.push({ src: file, dest: 'assets/' + safe });
    const cap = captionFor(file);
    let captions = null;
    if (cap) { assets.push({ src: cap, dest: 'assets/' + path.basename(cap) }); captions = 'assets/' + path.basename(cap); }
    else warnings.push('No captions for "' + path.basename(file) + '" (WCAG 1.2.2)');
    screens.push({ type: 'video', eyebrow, title, src: 'assets/' + safe, captions });
  };

  const modules = [...modulesSet].sort((a, b) => a - b);

  // cover
  screens.push({ type: 'cover', kicker: 'Course', title: ol.title,
    subtitle: ol.subtitle, items: modules.map((m) => ol.moduleTitles[m] || ('Module ' + m)) });

  let accentIx = 0;
  for (const m of modules) {
    screens.push({ type: 'module', title: ol.moduleTitles[m] || ('Module ' + m) });
    if (intros[m]) addVideo(intros[m], 'Introduction', m === modules[0] ? 'Course Introduction' : 'Module ' + m + ' Introduction');

    const lessons = [...(lessonsByModule[m] || new Set())].sort((a, b) => a - b);
    for (const l of lessons) {
      const accent = ACCENTS[accentIx++ % ACCENTS.length];
      screens.push({ type: 'lesson', eyebrow: 'Module ' + m + ' · Lesson ' + l, title: ol.lessonTitles[m + '.' + l] || ('Lesson ' + l) });
      // videos V1..n in order
      const vNums = Object.keys(vids).filter((k) => k.startsWith(m + '.' + l + '.')).map((k) => +k.split('.')[2]).sort((a, b) => a - b);
      for (const v of vNums) {
        const code = 'M' + m + 'L' + l + 'V' + v;
        addVideo(vids[m + '.' + l + '.' + v], 'Video ' + v, ol.videoTitles[code] || code);
      }
      // lesson reading
      const rf = readings[m + '.' + l];
      if (rf) {
        const r = await parseReading(rf);
        screens.push({ type: 'reading', accent, title: r.title, html: stripDupTitle(r.html, r.title) });
      }
    }
  }

  // quiz
  const quizFile = folders.quizzes ? listFilesIn(folders.quizzes, /\.docx$/i)[0] : null;
  if (quizFile) {
    const q = await parseQuiz(quizFile);
    screens.push({ type: 'quizIntro', title: 'Graded Quiz', count: q.questions.length, accent: ACCENTS[0] });
    q.questions.forEach((ques, n) => screens.push({
      type: 'question', index: n + 1, total: q.questions.length, question: ques.text,
      options: ques.options.map((o) => ({ text: o.text, correct: !!o.correct, feedback: o.feedback || '' })),
    }));
  } else warnings.push('No quiz .docx found.');

  screens.push({ type: 'summary' });

  return { title: ol.title, screens, assets, warnings, modules: modules.length, videos: videoFiles.length, readings: readingFiles.length };
}

async function buildFull(courseDir, opts = {}) {
  const a = await assembleFull(courseDir);
  const outDir = opts.out ? path.resolve(opts.out) : courseDir;
  const res = await packageCourse({ title: a.title, screens: a.screens, assets: a.assets, outDir, passPercentage: opts.passPercentage });
  return { ...res, warnings: a.warnings, modules: a.modules, videos: a.videos, readings: a.readings };
}

module.exports = { buildFull, assembleFull };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || '.');
  buildFull(dir).then((r) => {
    if (r.warnings.length) { console.log('\n⚠️  ' + r.warnings.length + ' warning(s):'); r.warnings.slice(0, 8).forEach((w) => console.log('   - ' + w)); if (r.warnings.length > 8) console.log('   …and ' + (r.warnings.length - 8) + ' more'); }
    console.log('\n✅ SCORM 1.2: ' + r.outFile);
    console.log('   ' + r.modules + ' modules, ' + r.videos + ' videos, ' + r.readings + ' readings, ' + r.screenCount + ' screens\n');
  }).catch((e) => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
}
