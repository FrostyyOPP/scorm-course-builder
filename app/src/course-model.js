/*
 * course-model.js — the single source of truth for a course's STRUCTURE.
 *
 * The assembler (build-v2.js) is fully generic; everything course-specific lives in
 *   <course>/.pipeline/course.model.json
 * which is produced by parse-outline.js (auto-parse of the Starweaver outline .docx)
 * and confirmed by the reviewer at the Scope gate.
 *
 * Schema (all paths are relative to the course folder, using forward slashes):
 * {
 *   "title": "Course Title",
 *   "subtitle": "one-line subtitle",
 *   "passPercentage": 70,
 *   "accents": { "1":"indigo","2":"teal","3":"coral","4":"violet" },   // optional
 *   "videosDir": "Videos",                                             // optional, default "Videos"
 *   "courseIntro": "Videos/INTRO & OUTRO/Intro-....mp4",               // optional
 *   "outro": "Videos/INTRO & OUTRO/Outro-....mp4",                     // optional
 *   "skin": "neumorphic",                                              // optional visual skin
 *   "scoring": { "includeActivities": true },                          // optional: count dragdrop points in the LMS score
 *   "disclaimer": "shown on the title slide",                          // optional
 *   "captionLangs": [ { "code":"fr","label":"Français","default":true }, { "code":"en","label":"English" } ],
 *     // optional; when set (2+ entries), every narrated slide gets a caption-language menu instead of
 *     // a single on/off toggle. Convention: captions/<basename>.<code>.vtt (video) and
 *     // captions/vo-<slideId>.<code>.vtt (menu/VO narration). Omit for legacy single-caption courses.
 *   "ui": { "...": "optional bilingual UI-string overrides — see build-v2.js UI_DEFAULTS" },
 *   "introScreens": [ <screen>, ... ],                                 // optional content slides between title and home
 *   "modules": [
 *     { "n":1, "title":"Module title", "intro":"Videos/.../M1 Intro....mp4",
 *       "lessons":[ { "title":"Lesson title",
 *                     "videos":[ {"title":"Video title","file":"Videos/.../M1L1V1-....mp4"} ] } ],
 *       "readings":[ {"title":"Reading title","url":"https://..."} ],
 *       // -- slide-based modules (no video): a declarative screen list --
 *       "screens":[ <screen>, ... ],
 *       // -- assessment module: questions authored inline instead of in the quiz .docx --
 *       "assessment": true, "quizImage":"qi6", "questions":[ {text, options:[{text,correct,feedback}]} ] } ]
 * }
 *
 * A <screen> is one of:
 *   { id, type:"content", title, kicker?, subtitle?, image?, layout:"split"|"cards",
 *     imageSide?:"left"|"right", callout?, points?:[string], cards?:[{label,text,icon}], vo? }
 *   { id, type:"knowledgeCheck", title, question, options:[{text,correct,feedback}], vo? }
 *   { id, type:"dragdrop", mode:"match"|"sequence"|"sort", graded:bool, title, prompt, attempts,
 *     targets?/slots?/bins?, items:[{text,target|slot|bin}], feedbackCorrect, feedbackIncorrect, vo? }
 *
 * A course uses EITHER lessons/videos OR screens per module; both may coexist across modules.
 *
 * loadModel(courseDir) reads the file, applies defaults, and honours the VIDEOS_DIR
 * env override (e.g. VIDEOS_DIR=Videos_min) by rewriting the leading videos-dir segment
 * of every video path — so a compressed build never edits the model.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_ACCENTS = ['indigo', 'teal', 'coral', 'violet', 'indigo', 'teal', 'coral', 'violet'];
const MODEL_REL = path.join('.pipeline', 'course.model.json');

function modelPath(courseDir) { return path.join(courseDir, MODEL_REL); }
function hasModel(courseDir) { return fs.existsSync(modelPath(courseDir)); }

function loadModel(courseDir) {
  const p = modelPath(courseDir);
  if (!fs.existsSync(p)) {
    throw new Error(
      'No course model at ' + p + '\n' +
      'Run the outline parser first:  node app/src/parse-outline.js "' + courseDir + '"\n' +
      '(then confirm it at the Scope gate).'
    );
  }
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));

  // defaults
  m.subtitle = m.subtitle || '';
  m.passPercentage = (typeof m.passPercentage === 'number') ? m.passPercentage : 70;
  m.videosDir = m.videosDir || 'Videos';
  if (!m.accents) { m.accents = {}; (m.modules || []).forEach((mod, i) => { m.accents[mod.n || (i + 1)] = DEFAULT_ACCENTS[i % DEFAULT_ACCENTS.length]; }); }
  m.introScreens = m.introScreens || [];
  m.captionLangs = m.captionLangs || [];
  m.ui = m.ui || {};
  m.modules = m.modules || [];
  m.modules.forEach((mod) => { mod.lessons = mod.lessons || []; mod.readings = mod.readings || []; mod.screens = mod.screens || []; mod.questions = mod.questions || []; });

  // VIDEOS_DIR override: rewrite the leading "<videosDir>/" segment of every path
  const override = process.env.VIDEOS_DIR;
  if (override && override !== m.videosDir) {
    const base = m.videosDir.replace(/\/+$/, '');
    const swap = (rel) => (typeof rel === 'string' && rel.indexOf(base + '/') === 0) ? (override + rel.slice(base.length)) : rel;
    m.courseIntro = swap(m.courseIntro);
    m.outro = swap(m.outro);
    m.modules.forEach((mod) => { mod.intro = swap(mod.intro); mod.lessons.forEach((l) => { (l.videos || []).forEach((v) => { v.file = swap(v.file); }); }); });
  }
  return m;
}

module.exports = { loadModel, hasModel, modelPath, MODEL_REL };
