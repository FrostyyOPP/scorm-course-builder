/*
 * parse-outline-docx.js — read a Starweaver-style course outline (.docx) for TITLES.
 * Extracts course title/subtitle, module titles, lesson titles, and per-video titles
 * (keyed to M<module>L<lesson>V<video>). Structure-from-filenames does the assembly; this
 * supplies nice titles.
 *
 * Tolerant to both authored layouts:
 *   - inline:   "Module 1: Foundations..."  /  "Module 1 - Foundations..."  /  "Lesson 1: ..."
 *   - labelled: "Module 1" + "Title of the Module: ..."  /  "Lesson 1" + "Title of the Lesson: ..."
 *
 * Multi-course program outlines (one .docx covering "Course 1", "Course 2", ... under a bare
 * "Course N" heading in PART 2 - OUTLINE: PROGRAM STRUCTURE) repeat Module 1/Lesson 1/Video 1
 * per course. Pass opts.courseNumber to scope parsing to just that course's section — otherwise
 * every course's Module/Lesson/Video titles collide on the same M1L1V1-style keys.
 */
const mammoth = require('mammoth');

async function parseOutlineDocx(filePath, opts) {
  opts = opts || {};
  const { value } = await mammoth.extractRawText({ path: filePath });
  const allLines = value.split('\n').map((l) => l.trim());

  const sectionMarker = /^Course\s+(\d+)\s*$/i;
  const sections = [];
  allLines.forEach((line, i) => { const mt = sectionMarker.exec(line); if (mt) sections.push({ n: +mt[1], start: i }); });
  let lines = allLines;
  if (opts.courseNumber && sections.length) {
    const idx = sections.findIndex((s) => s.n === opts.courseNumber);
    if (idx >= 0) {
      const start = sections[idx].start;
      const end = idx + 1 < sections.length ? sections[idx + 1].start : allLines.length;
      lines = allLines.slice(start, end);
    }
  }

  const out = { title: 'Course', subtitle: '', moduleTitles: {}, lessonTitles: {}, videoTitles: {} };
  let m = 0, l = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let mt;

    if ((mt = /^Course Title:\s*(.+)$/i.exec(line))) { out.title = mt[1].trim(); continue; }
    if ((mt = /^Title of the Course:\s*(.+)$/i.exec(line))) { if (!out.title || out.title === 'Course') out.title = mt[1].trim(); continue; }
    if ((mt = /^(?:Course )?Subtitle\s*[-–:]\s*(.+)$/i.exec(line))) { if (!out.subtitle) out.subtitle = mt[1].trim(); continue; }

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
      const key = 'M' + m + 'L' + l + 'V' + v;
      if (t && !out.videoTitles[key] && !/^Video\s+\d+/i.test(t) && !/^Lesson\s+\d+/i.test(t) && !/^Module\s+\d+/i.test(t)) out.videoTitles[key] = t;
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
