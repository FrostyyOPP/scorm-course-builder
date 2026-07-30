/*
 * author-menu-vo.js — generates the menu/index-slide narration scripts for a localized course.
 *
 * The localize pipeline CONSUMES <course>/_src/menu-vo-<lang>.json but nothing produced it, so
 * every course was hand-authoring it. This closes that gap generically.
 *
 * Reads:  <course>/.localize.json          (lang + menuTemplates: intro/ordinals/outro)
 *         <course>/_src/structure-<lang>.json  (translated module/lesson/video/reading titles)
 * Writes: <course>/_src/menu-vo-<lang>.json
 *
 * Shape per HARD RULE L5 — intro sentence, then "<ordinal>, <item title>." per card, then a
 * fixed outro. No item counts, no "Module N" prefixes.
 *
 * HARD RULE L5 also governs the SPOKEN text: when a title is bilingual "Target (English)", only
 * the target-language half is spoken. A bracketed gloss is for the eye, never the ear.
 *
 * Usage: node app/author-menu-vo.js <courseDir> [--force]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const FORCE = process.argv.includes('--force');
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, '.localize.json'), 'utf-8'));
const LANG = CFG.lang || 'fr';
const T = CFG.menuTemplates;
if (!T || !T.intro || !T.ordinals || !T.outro) {
  console.error('`.localize.json` needs menuTemplates { intro:{course,module,lesson}, ordinals:[], outro }');
  process.exit(1);
}
const SP = path.join(ROOT, '_src', `structure-${LANG}.json`);
if (!fs.existsSync(SP)) { console.error('missing ' + SP); process.exit(1); }
const S = JSON.parse(fs.readFileSync(SP, 'utf-8'));

// "Titre français (English gloss)" -> "Titre français". Handles a gloss that itself contains
// parentheses, e.g. "... (AFR) (Mastering the Risk-Based Approach (RBA))".
function speak(title) {
  const s = String(title || '').trim();
  if (!s.endsWith(')')) return s;
  let depth = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === ')') depth++;
    else if (s[i] === '(') { depth--; if (depth === 0) { const head = s.slice(0, i).trim(); return head || s; } }
  }
  return s;
}
function menuLine(level, titles) {
  const parts = [T.intro[level]];
  titles.forEach((t, i) => {
    if (i >= T.ordinals.length) return;                 // more items than ordinals: see warning below
    parts.push(`${T.ordinals[i]}, ${speak(t)}.`);
  });
  parts.push(T.outro);
  return parts.join(' ');
}

const vo = {};
const warn = [];
const courseTitle = speak(CFG.courseTitleFr || S.title);

// fixed-template slides
vo.title = (CFG.templates && CFG.templates.title)
  || `Bienvenue dans la formation en ligne ${courseTitle}. Cliquez sur Commencer pour débuter le cours.`;
vo.exit = (CFG.templates && CFG.templates.exit)
  || "Merci d'avoir suivi ce cours. Cliquez sur Quitter pour terminer.";

// home: one card per module
vo.home = menuLine('course', S.modules.map(m => m.title));
if (S.modules.length > T.ordinals.length) warn.push(`home has ${S.modules.length} modules but only ${T.ordinals.length} ordinals`);

for (const m of S.modules) {
  const lessons = m.lessons || [];
  // module menu: one card per lesson
  vo['m' + m.n] = menuLine('module', lessons.map(l => l.title));
  if (lessons.length > T.ordinals.length) warn.push(`m${m.n} has ${lessons.length} lessons but only ${T.ordinals.length} ordinals`);

  // lesson menus: one card per video
  lessons.forEach((l, li) => {
    const vids = (l.videos || []).map(v => v.title);
    if (!vids.length) { warn.push(`m${m.n}l${li + 1} has no videos, no menu clip written`); return; }
    vo[`m${m.n}l${li + 1}`] = menuLine('lesson', vids);
    if (vids.length > T.ordinals.length) warn.push(`m${m.n}l${li + 1} has ${vids.length} videos but only ${T.ordinals.length} ordinals`);
  });

  // quiz intro + reading, one per module (shared wording, per-slide ids)
  vo['qi' + m.n] = (CFG.templates && CFG.templates.quizIntro)
    || "Vérifions maintenant votre compréhension des sujets abordés jusqu'à présent. Cliquez sur Démarrer pour commencer le quiz.";
  const nRead = (m.readings || []).length;
  for (let r = 1; r <= Math.max(0, nRead); r++) {
    // the engine keys a module's reading slide as r<module>read; multiple readings share it
    vo[`r${m.n}read`] = (CFG.templates && CFG.templates.reading)
      || "Cliquez sur l'onglet pour consulter les documents de lecture de ce module.";
  }
}

const out = path.join(ROOT, '_src', `menu-vo-${LANG}.json`);
if (fs.existsSync(out) && !FORCE) {
  console.error(`${out} exists. Re-run with --force to overwrite (this discards any hand edits).`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(vo, null, 2));

const cued = Object.keys(vo).filter(k => k === 'home' || /^m\d+$/.test(k) || /^m\d+l\d+$/.test(k));
console.log(`wrote ${path.basename(out)}: ${Object.keys(vo).length} clips`);
console.log(`  cued (need card-reveal sync): ${cued.length} -> ${cued.join(', ')}`);
console.log(`  simple: ${Object.keys(vo).filter(k => !cued.includes(k)).join(', ')}`);
if (warn.length) { console.log('\nwarnings:'); warn.forEach(w => console.log('   !', w)); }
console.log('\nsample home:\n ', vo.home);
console.log('\nsample lesson menu:\n ', vo[cued.find(k => /^m\d+l\d+$/.test(k))]);
