/*
 * parse-quiz.js — tolerant quiz .docx parser for SCORM Studio. Handles two authored formats
 * and both single-file and one-file-per-module layouts, returning questions grouped by module.
 *
 * Format A (Starweaver "Correct Answer"):
 *   Qn. <heading> / <body> / A. .. B. .. C. .. D. .. / Correct Answer: X / Explanation for option X (Correct): ..
 * Format B (Starweaver "Option/Feedback"):
 *   Q<n> (M#L#V#)? / <question> / Option A / <text> / Feedback / <fb> / Option B / ...  (correct = feedback starts "Correct")
 *
 * Quiz files are discovered under <course>/{Graded Quiz, Quiz, .}. If several files each carry a
 * "Module N" in the name, they are treated as per-module quizzes; otherwise a single combined file
 * is split by an embedded (M#..) code or, failing that, by 10 questions per module.
 *
 * Main API: loadQuestionsByModule(courseDir) -> { byModule:{1:[{n,text,options:[{text,correct,feedback}]}]}, total, bad, files }
 */
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

async function rawLines(file) {
  const { value } = await mammoth.extractRawText({ path: file });
  return value.split('\n').map((l) => l.replace(/ /g, ' ').trim());
}

// ---- Format A ---------------------------------------------------------------
function parseFormatA(lines) {
  const blocks = []; let cur = null;
  const qStart = /^Q(\d+)[.)]\s*(.*)$/;
  for (const line of lines) {
    const m = qStart.exec(line);
    if (m) { cur = { n: +m[1], heading: m[2].trim(), lines: [] }; blocks.push(cur); }
    else if (cur) cur.lines.push(line);
  }
  const isOpt = (l) => /^([A-D])[.)]\s+(.+)$/.exec(l);
  return blocks.map((b) => {
    const firstOptIx = b.lines.findIndex((l) => isOpt(l));
    const bodyLines = (firstOptIx < 0 ? b.lines : b.lines.slice(0, firstOptIx)).filter(Boolean);
    const text = bodyLines.join(' ').trim() || b.heading;
    const opts = {};
    for (const l of b.lines) { const m = isOpt(l); if (m && !opts[m[1]]) opts[m[1]] = m[2].trim(); }
    let correct = '';
    for (const l of b.lines) { const m = /Correct Answer:\s*([A-D])/i.exec(l); if (m) { correct = m[1].toUpperCase(); break; } }
    const fb = {};
    for (const l of b.lines) {
      const mc = /Explanation for option\s*([A-D])\s*\(Correct\)\s*:?\s*(.*)$/i.exec(l);
      if (mc) { fb[mc[1].toUpperCase()] = mc[2].trim(); continue; }
      const mo = /^([A-D](?:\s*,\s*[A-D])*)\s*:\s*(.+)$/.exec(l);
      if (mo) { mo[1].split(',').map((s) => s.trim().toUpperCase()).forEach((ltr) => { if (!fb[ltr]) fb[ltr] = mo[2].trim(); }); }
    }
    let mod = null; for (const l of b.lines) { const mm = /\bM(\d+)L\d+V\d+/i.exec(l) || /Mapped to:\s*M(\d+)/i.exec(l); if (mm) { mod = +mm[1]; break; } }
    const order = ['A', 'B', 'C', 'D'].filter((ltr) => opts[ltr] != null);
    const options = order.map((ltr) => ({ text: opts[ltr], correct: ltr === correct, feedback: fb[ltr] || '' }));
    return { n: b.n, mod, text, options };
  });
}

// ---- Format B ---------------------------------------------------------------
function parseFormatB(lines) {
  const blocks = []; let cur = null;
  const qStart = /^Q\s*(\d+)\b\s*(?:\(\s*M(\d+)[^)]*\))?\s*(.*)$/i;
  const codeOnly = /^M\d+\s*L\d+\s*V\d+\s*$/i;               // stray "M4L3V1" mapping lines
  for (const raw of lines) {
    const line = raw.trim(); if (!line) continue;
    if (codeOnly.test(line)) continue;
    const m = qStart.exec(line);
    if (m) {
      const n = +m[1]; const rest = (m[3] || '').trim();
      if (cur && cur.n === n) { if (rest) cur.lines.push(rest); continue; }   // "Q31" then "Q31. <text>" restatement
      cur = { n, mod: m[2] ? +m[2] : null, lines: [] }; if (rest) cur.lines.push(rest); blocks.push(cur); continue;
    }
    if (cur) cur.lines.push(line);
  }
  return blocks.map((b) => {
    const qparts = []; const opts = []; let curOpt = null; let sub = null;
    for (const l of b.lines) {
      let om = /^Option\s+([A-E])\b[.:)\s]*(.*)$/i.exec(l);        // "Option A ..."
      if (!om) { const lone = /^([A-E])[.:)]?\s*$/.exec(l); if (lone) om = [l, lone[1], '']; }  // bare "A"
      if (om) { curOpt = { letter: om[1].toUpperCase(), text: om[2] ? [om[2]] : [], fb: [] }; opts.push(curOpt); sub = 'opt'; continue; }
      const fm = /^Feedback\b[:.]?\s*(.*)$/i.exec(l);
      if (fm && curOpt) { sub = 'fb'; if (fm[1]) curOpt.fb.push(fm[1]); continue; }
      if (!curOpt) { qparts.push(l); continue; }
      (sub === 'fb' ? curOpt.fb : curOpt.text).push(l);
    }
    const options = opts.map((o) => {
      const feedback = o.fb.join(' ').replace(/\s{2,}/g, ' ').trim();
      return { text: o.text.join(' ').replace(/\s{2,}/g, ' ').trim(), feedback, correct: /^correct\b|^correct[!:.]/i.test(feedback) };
    });
    return { n: b.n, mod: b.mod, text: qparts.join(' ').replace(/\s{2,}/g, ' ').trim(), options };
  });
}

// ---- Format C (bulleted single-line options) --------------------------------
//   MODULE N / [ Qn. <q>  |  Graded Quiz n (Scenario) / <scenario> / <q?> ]
//   "· A. .. · B. .. · C. .. · D. .." on ONE line / "Correct Answer: XMapped to: M#L#V#"
//   "Explanation for Option X (Correct): .." + "Explanation for Other Options:" / "· A: .. · C: .."
function optsFromBulletLine(line) {
  const opts = {};
  line.split('·').forEach((seg) => { const m = /^\s*([A-D])[.)]\s*(.+?)\s*$/.exec(seg.trim()); if (m) opts[m[1].toUpperCase()] = m[2].trim(); });
  return opts;
}
function isBulletOptLine(l) { return Object.keys(optsFromBulletLine(l)).length >= 2; }
function parseFormatC(lines) {
  const marker = /^(?:Q\s*(\d+)[.)]|Graded Quiz\s*(\d+))/i;
  const isMod = /^module\s*(\d+)/i;
  const chunks = []; let cur = null; let curMod = null;
  for (const raw of lines) {
    const l = (raw || '').trim(); if (!l) continue;
    const mh = isMod.exec(l);
    if (mh && !marker.test(l)) { curMod = +mh[1]; continue; }        // MODULE N header — questions belong to this section
    const mk = marker.exec(l);
    if (mk) { cur = { n: +(mk[1] || mk[2]), sectionMod: curMod, lines: [l] }; chunks.push(cur); continue; }
    if (cur) cur.lines.push(l);
  }
  return chunks.map((b) => {
    const optIx = b.lines.findIndex(isBulletOptLine);
    const opts = optIx >= 0 ? optsFromBulletLine(b.lines[optIx]) : {};
    // stem = everything before the options line, minus the marker label + module headers
    const stem = (optIx < 0 ? b.lines : b.lines.slice(0, optIx))
      .map((l) => l.replace(/^Q\s*\d+[.)]\s*/i, '').replace(/^Graded Quiz\s*\d+\s*(?:\(Scenario\))?\s*/i, '').trim())
      .filter((l) => l && !isMod.test(l));
    const text = stem.join(' ').replace(/\s{2,}/g, ' ').trim();
    let correct = '', mappedMod = null;
    for (const l of b.lines) {
      const c = /Correct Answer:\s*([A-D])/i.exec(l); if (c && !correct) correct = c[1].toUpperCase();
      const mm = /Mapped to:\s*M(\d+)/i.exec(l) || /\bM(\d+)L\d+V\d+/i.exec(l); if (mm && !mappedMod) mappedMod = +mm[1];
    }
    const mod = b.sectionMod || mappedMod;   // group by the MODULE section header (authoritative), not the per-question mapping
    const fb = {};
    for (let i = 0; i < b.lines.length; i++) {
      const l = b.lines[i];
      const me = /Explanation for Option\s*([A-D])\s*(?:\(Correct\))?\s*:\s*(.*)$/i.exec(l);
      if (me) { fb[me[1].toUpperCase()] = me[2].trim(); continue; }
      if (/Explanation for Other Options:/i.test(l)) {                // combined "· A: .. · C: .." (may be same or next line)
        const tail = l.split(/Explanation for Other Options:/i)[1] || '';
        const src = (tail.trim() ? tail : (b.lines[i + 1] || ''));
        src.split('·').forEach((seg) => { const m = /^\s*([A-D])\s*:\s*(.+?)\s*$/.exec(seg.trim()); if (m && !fb[m[1].toUpperCase()]) fb[m[1].toUpperCase()] = m[2].trim(); });
      }
    }
    const order = ['A', 'B', 'C', 'D'].filter((ltr) => opts[ltr] != null);
    const options = order.map((ltr) => ({ text: opts[ltr], correct: ltr === correct, feedback: fb[ltr] || '' }));
    return { n: b.n, mod, text, options };
  });
}

// ---- Format D (inline module tag + checkmark + [CORRECT]/[INCORRECT] rationale) ---------------
//   Qn  Module M: <title> | Lesson L: <title> | Video V: <title>
//   <question text>
//   A) <text>  [✓ on the correct option]
//   B) <text> ... D) <text>
//   Correct Answer: X) <text>
//   A [CORRECT]: <explanation>   /   B [INCORRECT]: <explanation>  ...
function parseFormatD(lines) {
  const qStart = /^Q\s*(\d+)\s+Module\s*(\d+)\s*:/i;
  const isOpt = /^([A-D])\)\s*(.+?)\s*(✓)?\s*$/;
  const blocks = []; let cur = null;
  for (const raw of lines) {
    const line = (raw || '').trim(); if (!line) continue;
    const m = qStart.exec(line);
    if (m) { cur = { n: +m[1], mod: +m[2], lines: [] }; blocks.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return blocks.map((b) => {
    const firstOptIx = b.lines.findIndex((l) => isOpt.test(l));
    const bodyLines = (firstOptIx < 0 ? b.lines : b.lines.slice(0, firstOptIx)).filter(Boolean);
    const text = bodyLines.join(' ').replace(/\s{2,}/g, ' ').trim();
    const opts = {}; let correct = '';
    for (const l of b.lines) {
      const om = isOpt.exec(l);
      if (om) { opts[om[1].toUpperCase()] = om[2].trim(); if (om[3]) correct = om[1].toUpperCase(); }
    }
    if (!correct) { for (const l of b.lines) { const cm = /^Correct Answer:\s*([A-D])\)/i.exec(l); if (cm) { correct = cm[1].toUpperCase(); break; } } }
    const fb = {};
    for (const l of b.lines) {
      const fm = /^([A-D])\s*\[(?:CORRECT|INCORRECT)\]\s*:\s*(.*)$/i.exec(l);
      if (fm) fb[fm[1].toUpperCase()] = fm[2].trim();
    }
    const order = ['A', 'B', 'C', 'D'].filter((ltr) => opts[ltr] != null);
    const options = order.map((ltr) => ({ text: opts[ltr], correct: ltr === correct, feedback: fb[ltr] || '' }));
    return { n: b.n, mod: b.mod, text, options };
  });
}

// ---- Format E ("Question N - multiple choice, shuffle" + "A: .."/"*B: .." + "Feedback: .." + "Refer to Module M, Lesson L Video: ..") ---------------
//   Question n - multiple choice, shuffle
//   <question text>
//   A: <text>
//   Feedback: <explanation for A>
//   Refer to Module M, Lesson L Video: <title>
//   *B: <text>          <- leading "*" marks the correct option
//   Feedback: <explanation for B>
//   Refer to Module M, Lesson L Video: <title>
//   C: <text>  ...  D: <text>  ...
function parseFormatE(lines) {
  const qStart = /^Question\s+(\d+)\b/i;
  const isOpt = /^(\*)?\s*([A-D])\s*:\s*(.+)$/;
  const blocks = []; let cur = null;
  for (const raw of lines) {
    const line = (raw || '').trim(); if (!line) continue;
    const m = qStart.exec(line);
    if (m) { cur = { n: +m[1], lines: [] }; blocks.push(cur); continue; }
    if (cur) cur.lines.push(line);
  }
  return blocks.map((b) => {
    const firstOptIx = b.lines.findIndex((l) => isOpt.test(l));
    const bodyLines = (firstOptIx < 0 ? b.lines : b.lines.slice(0, firstOptIx)).filter(Boolean);
    const text = bodyLines.join(' ').replace(/\s{2,}/g, ' ').trim();
    const opts = []; let mod = null; let curOpt = null;
    for (const l of b.lines) {
      const om = isOpt.exec(l);
      if (om) { curOpt = { letter: om[2].toUpperCase(), text: om[3].trim(), correct: !!om[1], feedback: '' }; opts.push(curOpt); continue; }
      if (!curOpt) continue;
      const fm = /^Feedback\s*:?\s*(.*)$/i.exec(l);
      if (fm) { curOpt.feedback = (curOpt.feedback ? curOpt.feedback + ' ' : '') + fm[1].trim(); continue; }
      const rm = /^Refer to Module\s*(\d+)/i.exec(l);
      if (rm && !mod) { mod = +rm[1]; continue; }
    }
    const order = ['A', 'B', 'C', 'D'].filter((ltr) => opts.some((o) => o.letter === ltr));
    const options = order.map((ltr) => { const o = opts.find((x) => x.letter === ltr); return { text: o.text, correct: o.correct, feedback: o.feedback }; });
    return { n: b.n, mod, text, options };
  });
}

async function parseAuto(file) {
  const lines = await rawLines(file);
  const looksE = lines.some((l) => /^Question\s+\d+\s*-/i.test(l)) && lines.some((l) => /^\*?[A-D]\s*:/.test(l));
  if (looksE) return parseFormatE(lines);
  const looksD = lines.some((l) => /^Q\s*\d+\s+Module\s*\d+\s*:/i.test(l));   // inline "Qn  Module M:" tag
  if (looksD) return parseFormatD(lines);
  const looksC = lines.some(isBulletOptLine) && lines.some((l) => /Correct Answer:/i.test(l));  // single-line "· A. · B." options
  if (looksC) return parseFormatC(lines);
  const looksB = lines.some((l) => /^Feedback\b/i.test(l));   // Format B uses standalone "Feedback" lines; A uses "Explanation for option"
  return looksB ? parseFormatB(lines) : parseFormatA(lines);
}

// ---- discovery --------------------------------------------------------------
function findQuizFiles(courseDir) {
  const cands = ['Graded Quiz', 'Graded_Quiz', 'Quiz', 'quiz', 'Quizzes', '.'];
  for (const sub of cands) {
    const dir = path.join(courseDir, sub);
    if (!fs.existsSync(dir)) continue;
    const docs = fs.readdirSync(dir).filter((n) => /\.docx$/i.test(n) && !/^~\$/.test(n));
    if (!docs.length) continue;
    const files = docs.map((n) => { const m = /Module\s*(\d+)/i.exec(n); return { file: path.join(dir, n), module: m ? +m[1] : null }; });
    if (files.length) return files;
  }
  return [];
}

async function loadQuestionsByModule(courseDir) {
  const files = findQuizFiles(courseDir);
  if (!files.length) throw new Error('No quiz .docx found under ' + courseDir + ' (looked in Graded Quiz/, Quiz/, root)');
  const perFileModule = files.length > 1 && files.some((f) => f.module != null);
  const byModule = {}; const bad = []; let total = 0;
  for (const f of files) {
    let qs; try { qs = await parseAuto(f.file); } catch (e) { bad.push({ file: path.basename(f.file), error: e.message }); continue; }
    qs.forEach((q) => {
      const mod = perFileModule ? f.module : (q.mod || Math.ceil(q.n / 10));
      (byModule[mod] = byModule[mod] || []).push(q);
      total++;
      if (q.options.length < 2 || q.options.filter((o) => o.correct).length !== 1) bad.push({ module: mod, n: q.n, file: path.basename(f.file) });
    });
  }
  Object.keys(byModule).forEach((k) => byModule[k].sort((a, b) => a.n - b.n));
  return { byModule, total, bad, files: files.map((f) => ({ file: path.basename(f.file), module: f.module })) };
}

module.exports = { loadQuestionsByModule, parseAuto, parseFormatA, parseFormatB, parseFormatC, parseFormatD, parseFormatE, findQuizFiles };

if (require.main === module) {
  loadQuestionsByModule(path.resolve(process.argv[2] || '.')).then((r) => {
    console.log('Quiz files:', r.files.map((f) => f.file + (f.module ? ' [M' + f.module + ']' : '')).join(', '));
    console.log('Total questions:', r.total);
    Object.keys(r.byModule).sort((a, b) => a - b).forEach((m) => console.log('  M' + m + ': ' + r.byModule[m].length + ' questions'));
    if (r.bad.length) { console.log('\n⚠️  ' + r.bad.length + ' question(s) need review:'); r.bad.slice(0, 12).forEach((b) => console.log('   - ' + JSON.stringify(b))); }
  }).catch((e) => { console.error('❌ ' + e.stack); process.exit(1); });
}
