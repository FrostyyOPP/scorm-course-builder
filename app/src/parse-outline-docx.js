/*
 * parse-outline-docx.js — read a Starweaver-style course outline (.docx) for TITLES.
 * Extracts course title/subtitle, module titles, lesson titles, and per-video titles
 * (keyed to M<module>L<lesson>V<video>). Structure-from-filenames does the assembly; this
 * supplies nice titles.
 *
 * Tolerant to both authored layouts:
 *   - inline:   "Module 1: Foundations..."  /  "Module 1 - Foundations..."  /  "Lesson 1: ..."
 *   - labelled: "Module 1" + "Title of the Module: ..."  /  "Lesson 1" + "Title of the Lesson: ..."
 */
const mammoth = require('mammoth');

async function parseOutlineDocx(filePath) {
  const { value } = await mammoth.extractRawText({ path: filePath });
  const lines = value.split('\n').map((l) => l.trim());

  const out = { title: 'Course', subtitle: '', moduleTitles: {}, lessonTitles: {}, videoTitles: {} };
  let m = 0, l = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let mt;

    if ((mt = /^Course Title:\s*(.+)$/i.exec(line))) { out.title = mt[1].trim(); continue; }
    if ((mt = /^(?:Course )?Subtitle:\s*(.+)$/i.exec(line))) { if (!out.subtitle) out.subtitle = mt[1].trim(); continue; }

    // "Module N: Title" / "Module N - Title" / "Module N – Title"  (inline title)
    if ((mt = /^Module\s+(\d+)\s*[-–:]\s*(.+)$/i.exec(line))) { const n = +mt[1]; m = n; l = 0; if (!out.moduleTitles[n]) out.moduleTitles[n] = mt[2].trim(); continue; }
    // bare "Module N"
    if ((mt = /^Module\s+(\d+)\s*$/i.exec(line))) { m = +mt[1]; l = 0; continue; }
    if ((mt = /^Title of the Module:\s*(.+)$/i.exec(line))) { if (m && !out.moduleTitles[m]) out.moduleTitles[m] = mt[1].trim(); continue; }

    // "Lesson N: Title" / "Lesson N - Title"  (inline title)
    if ((mt = /^Lesson\s+(\d+)\s*[-–:]\s*(.+)$/i.exec(line))) { if (m) { l = +mt[1]; if (!out.lessonTitles[m + '.' + l]) out.lessonTitles[m + '.' + l] = mt[2].trim(); } continue; }
    // bare "Lesson N"
    if ((mt = /^Lesson\s+(\d+)\s*$/i.exec(line))) { l = +mt[1]; continue; }
    if ((mt = /^Title of the Lesson:\s*(.+)$/i.exec(line))) { if (m && l && !out.lessonTitles[m + '.' + l]) out.lessonTitles[m + '.' + l] = mt[1].trim(); continue; }

    // "Video N" → the next non-empty, non-"Video" line is its title
    if ((mt = /^Video\s+(\d+)\s*$/i.exec(line)) && m && l) {
      const v = +mt[1];
      const t = (lines.slice(i + 1).find((x) => x.length > 0) || '').trim();
      if (t && !/^Video\s+\d+/i.test(t) && !/^Lesson\s+\d+/i.test(t) && !/^Module\s+\d+/i.test(t)) out.videoTitles['M' + m + 'L' + l + 'V' + v] = t;
      continue;
    }
  }
  return out;
}

module.exports = { parseOutlineDocx };

if (require.main === module) {
  parseOutlineDocx(process.argv[2]).then((o) => {
    console.log('Title   :', o.title);
    console.log('Subtitle:', o.subtitle || '(none)');
    console.log('\nModules:'); Object.entries(o.moduleTitles).forEach(([k, v]) => console.log('  M' + k + ':', v));
    console.log('\nLessons:'); Object.entries(o.lessonTitles).forEach(([k, v]) => console.log('  ' + k + ':', v));
    console.log('\nVideos:'); Object.entries(o.videoTitles).forEach(([k, v]) => console.log('  ' + k + ':', v));
  });
}
