/*
 * build-localized-model.js — assembles <course>/.pipeline/course.model.json for a localized course.
 *
 * The localize pipeline needs a model but nothing generic produced one from translated inputs,
 * so each course was hand-rolling a builder. This closes that gap.
 *
 * Reads:  <course>/.localize.json                 lang, skin, videosDir default, captionLangs
 *         <course>/_src/structure-<lang>.json      translated titles, ui labels, readings
 *         <course>/_src/quiz-<lang>.json           translated questions (optional)
 * Writes: <course>/.pipeline/course.model.json
 *
 * Videos are matched to the structure by BASENAME, taken from the tree named by --videos
 * (default `Videos_min`, per HARD RULE L7: the final zip is built from the localized compressed
 * tree). Any video that fails to place, or any structure entry with no video, is reported — a
 * silent mismatch would drop content from the course.
 *
 * Usage: node app/build-localized-model.js <courseDir> [--videos Videos_min|Videos|<dir>]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const argv = process.argv.slice(3);
const VIDEOS_DIR = argv.includes('--videos') ? argv[argv.indexOf('--videos') + 1] : 'Videos_min';

const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, '.localize.json'), 'utf-8'));
const LANG = CFG.lang || 'fr';
const SP = path.join(ROOT, '_src', `structure-${LANG}.json`);
if (!fs.existsSync(SP)) { console.error('missing ' + SP); process.exit(1); }
const S = JSON.parse(fs.readFileSync(SP, 'utf-8'));

// ---- videos present on disk -------------------------------------------------
function walk(d, base) {
  let o = [];
  if (!fs.existsSync(d)) return o;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) o = o.concat(walk(p, base));
    else if (e.name.endsWith('.mp4')) o.push({ base: path.basename(e.name, '.mp4'), rel: path.relative(base, p).replace(/\\/g, '/') });
  }
  return o;
}
const vids = walk(path.join(ROOT, VIDEOS_DIR), ROOT);
if (!vids.length) { console.error(`no videos under ${path.join(ROOT, VIDEOS_DIR)}`); process.exit(1); }
const byBase = new Map(vids.map(v => [v.base, v.rel]));
const used = new Set();
const warn = [];

// Structure entries reference the SOURCE path (e.g. "Videos/Module 1/....mp4"); resolve by
// basename so the same structure works against Videos, Videos_min or an external source tree.
function resolveVideo(srcPath, label) {
  if (!srcPath) return null;
  const b = path.basename(String(srcPath), '.mp4');
  const rel = byBase.get(b);
  if (!rel) { warn.push(`${label}: no video found for "${b}" in ${VIDEOS_DIR}`); return null; }
  used.add(b);
  return rel;
}

// ---- quiz ------------------------------------------------------------------
let quiz = {};
const qp = path.join(ROOT, '_src', `quiz-${LANG}.json`);
if (fs.existsSync(qp)) quiz = JSON.parse(fs.readFileSync(qp, 'utf-8'));
else warn.push(`no quiz-${LANG}.json - course will build with no questions`);

// ---- assemble --------------------------------------------------------------
const model = {
  title: S.title,
  subtitle: S.subtitle || '',
  passPercentage: S.passPercentage || CFG.passPercentage || 70,
  videosDir: VIDEOS_DIR,
  lang: LANG,
  captionLangs: CFG.captionLangs || [
    { code: LANG, label: CFG.langLabel || LANG, default: true },
    { code: 'en', label: 'English' },
  ],
  skin: CFG.skin || 'compact-lg',
  ui: S.ui || {},
  modules: [],
};
const ci = resolveVideo(S.courseIntro, 'courseIntro'); if (ci) model.courseIntro = ci;
const oo = resolveVideo(S.outro, 'outro'); if (oo) model.outro = oo;

for (const m of S.modules) {
  const mod = { n: m.n, title: m.title, lessons: [] };
  const mi = resolveVideo(m.intro, `M${m.n} intro`); if (mi) mod.intro = mi;

  const qs = quiz[String(m.n)] || [];
  mod.questions = qs.map(q => ({
    text: q.text,
    options: (q.options || []).map(o => ({ text: o.text, correct: !!o.correct, feedback: o.feedback || '' })),
  }));
  if (!mod.questions.length) warn.push(`M${m.n}: no quiz questions`);
  const badQ = mod.questions.filter(q => q.options.filter(o => o.correct).length !== 1);
  if (badQ.length) warn.push(`M${m.n}: ${badQ.length} question(s) without exactly one correct option`);

  if ((m.readings || []).length) mod.readings = m.readings.map(r => ({ title: r.title, url: r.url }));
  else warn.push(`M${m.n}: no readings`);

  (m.lessons || []).forEach((l, li) => {
    const videos = [];
    for (const v of (l.videos || [])) {
      const rel = resolveVideo(v.file, `M${m.n}L${li + 1}`);
      if (rel) videos.push({ file: rel, title: v.title });
    }
    if (!videos.length) warn.push(`M${m.n}L${li + 1} "${l.title}": no videos placed`);
    mod.lessons.push({ title: l.title, videos });
  });
  model.modules.push(mod);
}

const orphan = vids.filter(v => !used.has(v.base));
orphan.forEach(v => warn.push(`video not referenced by the structure: "${v.base}"`));

const outDir = path.join(ROOT, '.pipeline');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'course.model.json'), JSON.stringify(model, null, 2));

const placed = used.size;
const totQ = model.modules.reduce((a, m) => a + m.questions.length, 0);
console.log(`videosDir: ${VIDEOS_DIR} | skin: ${model.skin} | lang: ${model.lang}`);
console.log(`title: ${model.title}`);
model.modules.forEach(m => console.log(`  M${m.n} lessons=${m.lessons.length} videos=${m.lessons.reduce((b, l) => b + l.videos.length, 0)}${m.intro ? ' +intro' : ''} readings=${(m.readings || []).length} questions=${m.questions.length}`));
console.log(`videos placed: ${placed}/${vids.length}`);
console.log(`quiz questions: ${totQ}`);
console.log(`ui labels: ${Object.keys(model.ui).length}`);
console.log(`warnings: ${warn.length}`);
warn.forEach(w => console.log('   !', w));
console.log(`\nwrote ${path.join(outDir, 'course.model.json')}`);
