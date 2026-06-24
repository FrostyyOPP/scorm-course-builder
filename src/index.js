#!/usr/bin/env node
/*
 * course-builder — build a branded, accessible SCORM 1.2 course from a project folder.
 *
 *   course-folder/
 *     outline/     one Markdown outline = the master structure (order + titles)
 *     videos/      .mp4 files
 *     readings/    .docx files
 *     quizzes/     .docx files
 *     captions/    (optional) .vtt files matching video names — for WCAG captions
 *
 * Usage:  node src/index.js <course-folder> [--out <dir>] [--pass <percent>]
 * Output: <course-folder>/<course>-SCORM12.zip
 */
const fs = require('fs');
const path = require('path');
const { buildShell } = require('./build-shell');
const { buildFull } = require('./build-full');
const { findOutlineFile, TYPE_FOLDER } = require('./parse-outline');

// A "full" course folder has a .docx outline at its root (Starweaver format + code-named media).
function findDocxOutline(dir) {
  const f = fs.readdirSync(dir).find((n) => /\.docx$/i.test(n) && /outline/i.test(n)) ||
            fs.readdirSync(dir).find((n) => /\.docx$/i.test(n));
  return f && /outline/i.test(f) ? path.join(dir, f) : (f ? path.join(dir, f) : null);
}

function main() {
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => !a.startsWith('--'));
  const get = (flag) => { const k = args.indexOf(flag); return k >= 0 ? args[k + 1] : undefined; };
  if (!dirArg) {
    console.error('Usage: node src/index.js <course-folder> [--out <dir>] [--pass <percent>]');
    process.exit(1);
  }
  const dir = path.resolve(dirArg);
  if (!fs.existsSync(dir)) { console.error('Folder not found: ' + dir); process.exit(1); }

  // MODE A: full Starweaver course — a .docx outline at the folder root + code-named media.
  if (!findOutlineFile(dir) && findDocxOutline(dir)) {
    console.log('📚 Full course (Starweaver .docx outline) from: ' + dir);
    buildFull(dir, { out: get('--out'), passPercentage: get('--pass') ? Number(get('--pass')) : undefined })
      .then((r) => {
        if (r.warnings.length) { console.log('\n⚠️  ' + r.warnings.length + ' warning(s) (e.g. captions):'); r.warnings.slice(0, 5).forEach((w) => console.log('   - ' + w)); if (r.warnings.length > 5) console.log('   …and ' + (r.warnings.length - 5) + ' more'); }
        console.log('\n✅ SCORM 1.2 package:\n   ' + r.outFile);
        console.log('   ' + r.modules + ' modules · ' + r.videos + ' videos · ' + r.readings + ' readings · ' + r.screenCount + ' screens\n');
      })
      .catch((e) => { console.error('\n❌ ' + e.message + '\n'); process.exit(1); });
    return;
  }

  // MODE B: simple project — Markdown outline + named folders.
  const problems = [];
  if (!findOutlineFile(dir)) problems.push('Missing outline — add a Markdown outline in: ' + path.join(dir, 'outline') + '/');
  for (const folder of Object.values(TYPE_FOLDER)) {
    if (!fs.existsSync(path.join(dir, folder))) problems.push('Missing folder: ' + folder + '/  (create it, even if empty)');
  }
  if (problems.length) {
    console.error('\n❌ Project structure issues:');
    problems.forEach((p) => console.error('   - ' + p));
    console.error('\nExpected layout:\n   <course-folder>/outline/  videos/  readings/  quizzes/  (captions/ optional)\n');
    process.exit(1);
  }

  console.log('📚 Building course from: ' + dir);
  buildShell(dir, { out: get('--out'), passPercentage: get('--pass') ? Number(get('--pass')) : undefined })
    .then((r) => {
      if (r.warnings.length) {
        console.log('\n⚠️  ' + r.warnings.length + ' warning(s):');
        r.warnings.forEach((w) => console.log('   - ' + w));
      }
      console.log('\n✅ Done — SCORM 1.2 package:\n   ' + r.outFile);
      console.log('   ' + r.screenCount + ' screens. Upload the .zip to your LMS as SCORM 1.2.\n');
    })
    .catch((e) => { console.error('\n❌ ' + e.message + '\n'); process.exit(1); });
}

main();
