/*
 * parse-outline-docx.js — read a Starweaver-style course outline (.docx) for TITLES.
 * Extracts: course title/subtitle, module titles, lesson titles, and per-video titles,
 * keyed to the M<module>L<lesson>V<video> filename codes used in the video folder.
 *
 * Structure-from-filenames does the assembly; this just supplies nice titles.
 */
const mammoth = require('mammoth');

async function parseOutlineDocx(filePath) {
  const { value } = await mammoth.extractRawText({ path: filePath });
  const lines = value.split('\n').map((l) => l.trim());

  const out = {
    title: 'Course', subtitle: '',
    moduleTitles: {}, lessonTitles: {}, videoTitles: {},
  };
  let m = 0, l = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let mt;

    if ((mt = /^Course Title:\s*(.+)$/i.exec(line))) { out.title = mt[1].trim(); continue; }
    if ((mt = /^Course Subtitle:\s*(.+)$/i.exec(line))) { out.subtitle = mt[1].trim(); continue; }

    if ((mt = /^Module\s+(\d+)\s*$/i.exec(line))) { m = +mt[1]; l = 0; continue; }
    if ((mt = /^Title of the Module:\s*(.+)$/i.exec(line))) { if (m) out.moduleTitles[m] = mt[1].trim(); continue; }

    if ((mt = /^Lesson\s+(\d+)\s*$/i.exec(line))) { l = +mt[1]; continue; }
    if ((mt = /^Title of the Lesson:\s*(.+)$/i.exec(line))) { if (m && l) out.lessonTitles[m + '.' + l] = mt[1].trim(); continue; }

    // "Video N" → the next non-empty line is its title
    if ((mt = /^Video\s+(\d+)\s*$/i.exec(line)) && m && l) {
      const v = +mt[1];
      const titleLine = (lines.slice(i + 1).find((x) => x.length > 0) || '').trim();
      if (titleLine) out.videoTitles['M' + m + 'L' + l + 'V' + v] = titleLine;
      continue;
    }
  }
  return out;
}

module.exports = { parseOutlineDocx };

if (require.main === module) {
  parseOutlineDocx(process.argv[2]).then((o) => {
    console.log('Title   :', o.title);
    console.log('Subtitle:', o.subtitle);
    console.log('\nModules:'); Object.entries(o.moduleTitles).forEach(([k, v]) => console.log('  M' + k + ':', v));
    console.log('\nLessons:'); Object.entries(o.lessonTitles).forEach(([k, v]) => console.log('  ' + k + ':', v));
    console.log('\nVideos:'); Object.entries(o.videoTitles).forEach(([k, v]) => console.log('  ' + k + ':', v));
  });
}
