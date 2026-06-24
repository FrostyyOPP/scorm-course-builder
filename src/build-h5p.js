/*
 * build-h5p.js — Phase B, step 2
 * Turns parsed quiz data into a valid .h5p package (H5P.QuestionSet of Multiple Choice questions).
 *
 * Strategy: build content.json from the real param shapes observed in working H5P content,
 * compute the transitive library dependency closure from ./libraries, and zip it all up.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const archiver = require('archiver');

const ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'libraries');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function uuid() { return crypto.randomUUID(); }

// ---- library cache index ----------------------------------------------------
function indexLibraries() {
  const byName = {}; // machineName -> [{folder, dir, major, minor, patch, json}]
  for (const folder of fs.readdirSync(LIB_DIR)) {
    const dir = path.join(LIB_DIR, folder);
    const lj = path.join(dir, 'library.json');
    if (!fs.statSync(dir).isDirectory() || !fs.existsSync(lj)) continue;
    const json = JSON.parse(fs.readFileSync(lj, 'utf8'));
    (byName[json.machineName] ||= []).push({
      folder, dir, json,
      major: json.majorVersion, minor: json.minorVersion, patch: json.patchVersion || 0,
    });
  }
  return byName;
}

// pick the best cache entry for a machineName (prefer matching major, then highest minor)
function pick(byName, machineName, major) {
  const cands = byName[machineName];
  if (!cands || !cands.length) return null;
  const sameMajor = cands.filter((c) => c.major === major);
  const pool = sameMajor.length ? sameMajor : cands;
  return pool.sort((a, b) => b.minor - a.minor || b.patch - a.patch)[0];
}

// transitive closure of preloadedDependencies starting from given roots
function resolveClosure(byName, roots) {
  const out = new Map(); // folder -> entry
  const missing = [];
  const seen = new Set();
  const queue = [...roots]; // [{machineName, major}]
  while (queue.length) {
    const { machineName, major } = queue.shift();
    const key = machineName + '@' + major;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = pick(byName, machineName, major);
    if (!entry) { missing.push(machineName + ' ' + major); continue; }
    out.set(entry.folder, entry);
    for (const dep of entry.json.preloadedDependencies || []) {
      queue.push({ machineName: dep.machineName, major: dep.majorVersion });
    }
  }
  return { libs: [...out.values()], missing };
}

function verStr(entry) { return `${entry.json.machineName} ${entry.major}.${entry.minor}`; }

// ---- content builders -------------------------------------------------------
const MC_UI = {
  checkAnswerButton: 'Check', showSolutionButton: 'Show solution', tryAgainButton: 'Retry',
  tipsLabel: 'Show tip', scoreBarLabel: 'You got :num out of :total points',
  tipAvailable: 'Tip available', feedbackAvailable: 'Feedback available', readFeedback: 'Read feedback',
  wrongAnswer: 'Wrong answer', correctAnswer: 'Correct answer',
  shouldCheck: 'Should have been checked', shouldNotCheck: 'Should not have been checked',
  noInput: 'Please answer before viewing the solution',
};

function buildMultiChoice(q, mcVersion) {
  return {
    library: mcVersion, // e.g. "H5P.MultiChoice 1.14"
    params: {
      media: { disableImageZooming: false },
      answers: q.options.map((o) => ({
        correct: !!o.correct,
        tipsAndFeedback: {
          tip: '',
          chosenFeedback: o.feedback ? `<div>${esc(o.feedback)}</div>` : '',
          notChosenFeedback: '',
        },
        text: `<div>${esc(o.text)}</div>`,
      })),
      overallFeedback: [{ from: 0, to: 100 }],
      behaviour: {
        enableRetry: true, enableSolutionsButton: true, enableCheckButton: true,
        type: 'auto', singlePoint: true, randomAnswers: false,
        showSolutionsRequiresInput: true, confirmCheckDialog: false, confirmRetryDialog: false,
        autoCheck: false, passPercentage: 100, showScorePoints: true,
      },
      UI: MC_UI,
      confirmCheck: { header: 'Finish?', body: 'Sure?', cancelLabel: 'Cancel', confirmLabel: 'Finish' },
      confirmRetry: { header: 'Retry?', body: 'Sure?', cancelLabel: 'Cancel', confirmLabel: 'Confirm' },
      question: `<p>${esc(q.text)}</p>`,
    },
    subContentId: uuid(),
    metadata: { contentType: 'Multiple Choice', license: 'U', title: `Question ${q.n}`, authors: [], changes: [] },
  };
}

function buildQuestionSetParams(quiz, mcVersion) {
  return {
    introPage: { showIntroPage: false, startButtonText: 'Start Quiz', introduction: '' },
    progressType: 'dots',
    passPercentage: 50,
    disableBackwardsNavigation: false,
    randomQuestions: false,
    questions: quiz.questions.map((q) => buildMultiChoice(q, mcVersion)),
    introButtonText: 'Start',
    texts: {
      prevButton: 'Previous', nextButton: 'Next', finishButton: 'Finish', submitButton: 'Submit',
      textualProgress: 'Question @current of @total', jumpToQuestion: 'Question %d of %total',
      questionLabel: 'Question', readSpeakerProgress: 'Question @current of @total',
      unansweredText: 'Unanswered', answeredText: 'Answered', currentQuestionText: 'Current question',
      navigationLabel: 'Questions',
    },
    endGame: {
      showResultPage: true, showSolutionButton: true, showRetryButton: true,
      noResultMessage: 'Finished', message: 'Your result:',
      scoreBarLabel: 'You got @finals out of @totals points',
      overallFeedback: [{ from: 0, to: 100, feedback: '' }],
      solutionButtonText: 'Show solution', retryButtonText: 'Retry',
      finishButtonText: 'Finish', submitButtonText: 'Submit',
      showAnimations: false, skippable: false, skipButtonText: 'Skip video',
    },
    override: { checkButton: true },
  };
}

// ---- assemble & zip ---------------------------------------------------------
async function zipDir(srcDir, outFile) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const n of fs.readdirSync(src)) {
    const s = path.join(src, n), d = path.join(dest, n);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

async function buildQuizH5p(quiz, outPath) {
  const byName = indexLibraries();
  const qsEntry = pick(byName, 'H5P.QuestionSet', 1);
  const mcEntry = pick(byName, 'H5P.MultiChoice', 1);
  if (!qsEntry) throw new Error('H5P.QuestionSet not in library cache');
  if (!mcEntry) throw new Error('H5P.MultiChoice not in library cache');

  const mcVersion = verStr(mcEntry);
  const content = buildQuestionSetParams(quiz, mcVersion);

  const { libs, missing } = resolveClosure(byName, [
    { machineName: 'H5P.QuestionSet', major: 1 },
    { machineName: 'H5P.MultiChoice', major: 1 },
  ]);
  if (missing.length) console.warn('  ⚠️  libraries not in cache (may still render): ' + missing.join(', '));

  const h5pJson = {
    title: quiz.title || 'Quiz',
    language: 'en',
    mainLibrary: 'H5P.QuestionSet',
    embedTypes: ['iframe'],
    license: 'U',
    defaultLanguage: 'en',
    preloadedDependencies: libs.map((l) => ({
      machineName: l.json.machineName, majorVersion: l.major, minorVersion: l.minor,
    })),
  };

  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'h5pbuild-'));
  try {
    fs.mkdirSync(path.join(build, 'content'), { recursive: true });
    fs.writeFileSync(path.join(build, 'h5p.json'), JSON.stringify(h5pJson, null, 2));
    fs.writeFileSync(path.join(build, 'content', 'content.json'), JSON.stringify(content));
    for (const l of libs) copyDir(l.dir, path.join(build, l.folder));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await zipDir(build, outPath);
    return { outPath, libCount: libs.length, questionCount: quiz.questions.length };
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
}

module.exports = {
  buildQuizH5p,
  // shared helpers reused by build-course.js
  indexLibraries, pick, resolveClosure, verStr, zipDir, copyDir, esc, uuid,
  buildQuestionSetParams, buildMultiChoice,
};

// CLI: node src/build-h5p.js <quiz.docx> [out.h5p]
if (require.main === module) {
  const { parseQuiz } = require('./parse-docx');
  const [docx, out] = process.argv.slice(2);
  if (!docx) { console.error('Usage: node src/build-h5p.js <quiz.docx> [out.h5p]'); process.exit(1); }
  (async () => {
    const quiz = await parseQuiz(docx);
    const outPath = path.resolve(out || path.join(ROOT, 'output', 'quiz.h5p'));
    const res = await buildQuizH5p(quiz, outPath);
    console.log(`\n✅ Built .h5p: ${res.outPath}\n   ${res.questionCount} questions, ${res.libCount} libraries bundled\n`);
  })().catch((e) => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
}
