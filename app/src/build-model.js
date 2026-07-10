/*
 * build-model.js — AUTO-PARSE a course folder into <course>/.pipeline/course.model.json.
 *
 * Strategy (robust): STRUCTURE comes from the video filenames + folder tree; nice TITLES
 * come from the Starweaver outline .docx (Course Title / Title of the Module / Title of the
 * Lesson / per-video). This is tolerant to messy filenames and matches how the engine keys
 * things (M<module>L<lesson>V<video>).
 *
 * Detects: course intro/outro (under "INTRO & OUTRO"), per-module intro ("M# Intro" / "Module
 * Introduction"), and lesson videos (M#L#V# code). Readings URLs are NOT in the outline, so
 * `readings` is left empty for the reviewer to supply at the Scope gate. voiceId / passPercentage /
 * brand are also decided at the Scope gate (not in the outline).
 *
 * Usage: node src/build-model.js "<course folder>"
 *   - writes .pipeline/course.model.json (or .autogen.json if a model already exists)
 *   - prints a summary + warnings to confirm at the Scope gate.
 */
const fs = require('fs');
const path = require('path');
const { parseOutlineDocx } = require('./parse-outline-docx');

function walk(dir, base, out) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    let st; try { st = fs.statSync(abs); } catch (e) { continue; }
    if (st.isDirectory()) walk(abs, base, out);
    else if (/\.mp4$/i.test(name)) out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
}

function cleanTitle(basename) {
  return basename
    .replace(/\.[^.]+$/, '')
    .replace(/^M\d+\s*L\d+\s*V\d+/i, '')     // strip lesson-video code
    .replace(/^M\d+\s*Intro/i, '')
    .replace(/^[\s\-–:_]+/, '')
    .replace(/[\s\-–_]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function findOutlineDocx(courseDir) {
  for (const sub of ['Outline', 'outline', '.']) {
    const dir = path.join(courseDir, sub);
    if (!fs.existsSync(dir)) continue;
    const f = fs.readdirSync(dir).find((n) => /\.docx$/i.test(n) && !/^~\$/.test(n));
    if (f) return path.join(dir, f);
  }
  return null;
}

async function buildModel(courseDir) {
  const warnings = [];
  const videosRoot = path.join(courseDir, 'Videos');
  if (!fs.existsSync(videosRoot)) throw new Error('No Videos/ folder in ' + courseDir);
  const files = [];
  walk(videosRoot, courseDir, files);            // rel paths like "Videos/Module 1/Lesson 1/M1L1V1-....mp4"

  // outline titles (best-effort)
  let ol = { title: path.basename(courseDir), subtitle: '', moduleTitles: {}, lessonTitles: {}, videoTitles: {} };
  const odoc = findOutlineDocx(courseDir);
  if (odoc) { try { ol = await parseOutlineDocx(odoc); } catch (e) { warnings.push('Outline parse failed: ' + e.message); } }
  else warnings.push('No outline .docx found (titles will come from filenames).');
  if (!ol.title || ol.title === 'Course') {
    ol.title = odoc ? path.basename(odoc).replace(/\.docx$/i, '').replace(/\s*outline\s*$/i, '').trim() : path.basename(courseDir);
  }

  let courseIntro = '', outro = '';
  const mods = {};                               // n -> { lessons: { l -> {v -> {file,title}} }, intro }

  for (const rel of files) {
    const bn = path.basename(rel);
    const isIntroOutro = /intro\s*&\s*outro/i.test(rel);
    const code = /M(\d+)\s*L(\d+)\s*V(\d+)/i.exec(bn);
    const modFolder = /(?:^|\/)(?:Module\s*|M)(\d+)(?:\/|$)/i.exec(rel);

    if (isIntroOutro || (!code && !modFolder)) {
      if (/outro|wrap/i.test(bn)) outro = rel;
      else if (/intro|welcome/i.test(bn)) courseIntro = rel;
      else warnings.push('Unclassified top-level video: ' + rel);
      continue;
    }
    const m = code ? +code[1] : (modFolder ? +modFolder[1] : 0);
    if (!m) { warnings.push('Could not determine module for: ' + rel); continue; }
    mods[m] = mods[m] || { lessons: {}, intro: '' };

    if (!code) {                                 // no V code inside a Module folder => module intro
      if (/intro|module introduction/i.test(bn)) mods[m].intro = rel;
      else warnings.push('Unclassified module video (no code): ' + rel);
      continue;
    }
    const l = +code[2], v = +code[3];
    mods[m].lessons[l] = mods[m].lessons[l] || {};
    const title = ol.videoTitles['M' + m + 'L' + l + 'V' + v] || cleanTitle(bn);
    mods[m].lessons[l][v] = { file: rel, title };
  }

  const modules = Object.keys(mods).map(Number).sort((a, b) => a - b).map((n) => {
    const md = mods[n];
    const lessons = Object.keys(md.lessons).map(Number).sort((a, b) => a - b).map((l) => ({
      title: ol.lessonTitles[n + '.' + l] || ('Lesson ' + l),
      videos: Object.keys(md.lessons[l]).map(Number).sort((a, b) => a - b).map((v) => md.lessons[l][v]),
    }));
    return { n, title: ol.moduleTitles[n] || ('Module ' + n), intro: md.intro || undefined, lessons, readings: [] };
  });

  const model = {
    title: ol.title, subtitle: ol.subtitle || '', passPercentage: 70, videosDir: 'Videos',
    accents: {}, courseIntro: courseIntro || undefined, outro: outro || undefined, modules,
  };
  const palette = ['indigo', 'teal', 'coral', 'violet'];
  modules.forEach((m, i) => { model.accents[m.n] = palette[i % palette.length]; });

  // integrity warnings for the Scope gate
  modules.forEach((m) => {
    if (!m.intro) warnings.push('Module ' + m.n + ': no intro video detected.');
    m.lessons.forEach((l, li) => { if (!l.videos.length) warnings.push('Module ' + m.n + ' Lesson ' + (li + 1) + ': no videos.'); });
    if (ol.moduleTitles[m.n] == null) warnings.push('Module ' + m.n + ': title not found in outline (using placeholder).');
  });
  if (!courseIntro) warnings.push('No course intro video detected.');
  if (!outro) warnings.push('No course outro video detected.');
  warnings.push('Readings URLs are not in the outline — add per-module readings at the Scope/Research gate.');

  return { model, warnings };
}

module.exports = { buildModel, cleanTitle };

if (require.main === module) {
  const courseDir = path.resolve(process.argv[2] || '.');
  buildModel(courseDir).then(({ model, warnings }) => {
    const dir = path.join(courseDir, '.pipeline');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'course.model.json');
    const dest = fs.existsSync(target) ? path.join(dir, 'course.model.autogen.json') : target;
    fs.writeFileSync(dest, JSON.stringify(model, null, 2));
    console.log('\n📋 Parsed course model → ' + dest);
    console.log('   Title: ' + model.title);
    console.log('   Modules: ' + model.modules.length + '  ·  Lessons: ' + model.modules.reduce((a, m) => a + m.lessons.length, 0) +
      '  ·  Videos: ' + model.modules.reduce((a, m) => a + m.lessons.reduce((b, l) => b + l.videos.length, 0), 0));
    model.modules.forEach((m) => {
      console.log('   M' + m.n + ' ' + m.title + (m.intro ? ' [intro]' : ''));
      m.lessons.forEach((l, li) => console.log('      L' + (li + 1) + ' ' + l.title + '  (' + l.videos.length + ' videos)'));
    });
    if (dest !== target) console.log('\n(!) An existing course.model.json was kept; wrote parsed result to ' + path.basename(dest) + ' for diff/confirm.');
    if (warnings.length) { console.log('\n⚠️  ' + warnings.length + ' note(s) for the Scope gate:'); warnings.forEach((w) => console.log('   - ' + w)); }
    console.log('');
  }).catch((e) => { console.error('❌ ' + e.stack); process.exit(1); });
}
