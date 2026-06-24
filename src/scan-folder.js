/*
 * scan-folder.js — generate a draft course.yml from a content folder.
 * Infers item order: intro video(s) → lesson video(s) → reading(s) → quiz.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { parseQuiz, parseReading } = require('./parse-docx');

function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function scanFolder(dir) {
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile());
  const videos = files.filter((f) => /\.(mp4|webm|m4v)$/i.test(f)).sort(naturalSort);
  const docx = files.filter((f) => /\.docx$/i.test(f));
  const quizFiles = docx.filter((f) => /quiz/i.test(f));
  const readingFiles = docx.filter((f) => !/quiz/i.test(f)).sort(naturalSort);

  // derive a course title: prefer the quiz's "Course Name", else folder name
  let title = path.basename(dir);
  if (quizFiles[0]) {
    try { const q = await parseQuiz(path.join(dir, quizFiles[0])); if (q.courseName) title = q.courseName; } catch (e) {}
  }

  const items = [];
  // intro videos first (filename hints), then the rest, in natural order
  const intro = videos.filter((f) => /intro/i.test(f));
  const restVideos = videos.filter((f) => !/intro/i.test(f));
  for (const v of intro) items.push({ type: 'video', file: v, title: 'Introduction' });
  for (const v of restVideos) items.push({ type: 'video', file: v, title: path.basename(v, path.extname(v)) });
  for (const r of readingFiles) {
    let t = path.basename(r, '.docx');
    try { const rd = await parseReading(path.join(dir, r)); if (rd.title) t = rd.title; } catch (e) {}
    items.push({ type: 'reading', file: r, title: t });
  }
  for (const q of quizFiles) items.push({ type: 'quiz', file: q, title: 'Graded Quiz' });

  return { title, items };
}

function toYaml(course) {
  const header = '# course.yml — edit order/titles, then run:  node src/index.js <folder>\n' +
                 '# item types: video | reading | quiz   (file = name inside this folder)\n\n';
  return header + yaml.dump(course, { lineWidth: 120 });
}

module.exports = { scanFolder, toYaml };

// CLI: node src/scan-folder.js <folder>   (writes <folder>/course.yml)
if (require.main === module) {
  const dir = path.resolve(process.argv[2] || '.');
  (async () => {
    const course = await scanFolder(dir);
    const out = path.join(dir, 'course.yml');
    fs.writeFileSync(out, toYaml(course));
    console.log('📝 Wrote draft manifest: ' + out + '\n');
    console.log(toYaml(course));
  })().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
}
