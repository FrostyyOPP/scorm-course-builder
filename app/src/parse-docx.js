/*
 * parse-docx.js — Phase B, step 1
 * Reads the Starweaver-style course Word docs into clean structured data.
 *
 *  parseQuiz(path)    -> { title, courseName, module, questions: [ {n, sourceVideo, module, text, options:[{letter,text,correct,feedback}]} ] }
 *  parseReading(path) -> { title, html, text }
 *
 * Quiz docx layout (one block per question):
 *   Module 1 - <module title>          (section header, applies to following questions)
 *   Source video: <code> - <title>
 *   Q<n>
 *   <question text>
 *   A
 *   <option text>
 *   Feedback
 *   (Correct) or (Incorrect) <feedback text>
 *   ...B, C, D...
 */
const mammoth = require('mammoth');

function cleanFeedback(s) {
  // strip a leading "(Correct)" / "(Incorrect)" marker, return {correct, text}
  const m = /^\s*\((correct|incorrect)\)\s*(.*)$/i.exec(s);
  if (m) return { correct: m[1].toLowerCase() === 'correct', text: m[2].trim() };
  return { correct: false, text: s.trim() };
}

async function parseQuiz(path) {
  const { value } = await mammoth.extractRawText({ path });
  const lines = value.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  let title = 'Quiz';
  let courseName = '';
  let currentModule = '';
  let currentVideo = '';
  const questions = [];

  const isOptLetter = (l) => /^[A-Z]$/.test(l);
  const isQ = (l) => /^Q\d+$/.test(l);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i === 0 && !isQ(line)) { title = line; continue; }
    if (/^Course Name:/i.test(line)) { courseName = line.replace(/^Course Name:\s*/i, '').trim(); continue; }
    if (/^Module\b/i.test(line)) { currentModule = line; continue; }
    if (/^Source video:/i.test(line)) { currentVideo = line.replace(/^Source video:\s*/i, '').trim(); continue; }

    if (isQ(line)) {
      const q = {
        n: parseInt(line.slice(1), 10),
        sourceVideo: currentVideo,
        module: currentModule,
        text: '',
        options: [],
      };
      // question text = following lines until first single-letter option marker
      let j = i + 1;
      const textParts = [];
      while (j < lines.length && !isOptLetter(lines[j]) && !isQ(lines[j])) {
        if (/^Source video:/i.test(lines[j])) { currentVideo = lines[j].replace(/^Source video:\s*/i, '').trim(); j++; continue; }
        if (/^Module\b/i.test(lines[j])) { currentModule = lines[j]; j++; continue; }
        textParts.push(lines[j]); j++;
      }
      q.text = textParts.join(' ').trim();

      // options: letter / text / "Feedback" / feedback-line
      while (j < lines.length && isOptLetter(lines[j])) {
        const letter = lines[j]; j++;
        const optTextParts = [];
        while (j < lines.length && !/^Feedback$/i.test(lines[j]) && !isOptLetter(lines[j]) && !isQ(lines[j])) {
          optTextParts.push(lines[j]); j++;
        }
        let correct = false, feedback = '';
        if (j < lines.length && /^Feedback$/i.test(lines[j])) {
          j++; // skip "Feedback"
          const fbParts = [];
          while (j < lines.length && !isOptLetter(lines[j]) && !isQ(lines[j]) && !/^Source video:/i.test(lines[j]) && !/^Module\b/i.test(lines[j])) {
            fbParts.push(lines[j]); j++;
          }
          const parsed = cleanFeedback(fbParts.join(' '));
          correct = parsed.correct; feedback = parsed.text;
        }
        q.options.push({ letter, text: optTextParts.join(' ').trim(), correct, feedback });
      }
      questions.push(q);
      i = j - 1;
    }
  }

  if (courseName) title = courseName;
  return { title, courseName, questions };
}

async function parseReading(path) {
  const html = (await mammoth.convertToHtml({ path })).value;
  const text = (await mammoth.extractRawText({ path })).value.trim();
  // title = first non-empty line of raw text
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || 'Reading';
  return { title: firstLine, html, text };
}

module.exports = { parseQuiz, parseReading };

// CLI smoke test:  node src/parse-docx.js quiz <file>   |   node src/parse-docx.js reading <file>
if (require.main === module) {
  const [kind, file] = process.argv.slice(2);
  (async () => {
    if (kind === 'quiz') {
      const q = await parseQuiz(file);
      console.log(JSON.stringify(q, null, 2));
      console.error(`\nParsed ${q.questions.length} questions. Each with ${q.questions[0]?.options.length} options.`);
      const bad = q.questions.filter((x) => x.options.filter((o) => o.correct).length !== 1);
      console.error(bad.length ? `⚠️  ${bad.length} questions without exactly one correct answer: ${bad.map((b) => 'Q' + b.n).join(', ')}` : '✅ Every question has exactly one correct answer.');
    } else if (kind === 'reading') {
      const r = await parseReading(file);
      console.log(JSON.stringify({ title: r.title, html: r.html }, null, 2));
    } else {
      console.error('Usage: node src/parse-docx.js <quiz|reading> <file.docx>');
    }
  })();
}
