/*
 * brand.js — design tokens extracted from the Course Visual Style Guide,
 * plus helpers to render branded slide HTML and the SCORM-player CSS theme.
 */
const BRAND = {
  navy: '#1e3a8a',
  navyDark: '#0f172a',
  teal: '#14b8a6',
  orange: '#f97316',
  purple: '#8b5cf6',
  slate: '#334155',
  slateMuted: '#64748b',
  bgLight: '#eaf0fa',
  bgCard: '#ffffff',
  gradTeal: 'linear-gradient(135deg, #1e3a8a 0%, #14b8a6 100%)',
  gradPurple: 'linear-gradient(135deg, #1e3a8a 0%, #8b5cf6 100%)',
  fontBody: "'Inter', system-ui, -apple-system, sans-serif",
  fontDisplay: "'Inter', system-ui, -apple-system, sans-serif",
};

// Module accent rotation (style guide: each module gets one accent)
const ACCENTS = [BRAND.teal, BRAND.orange, BRAND.purple];

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// Branded HTML used inside an H5P.AdvancedText element (renders on a slide).
function pill(label, accent) {
  return `<span style="display:inline-block;font:600 22px ${BRAND.fontBody};letter-spacing:.08em;` +
    `text-transform:uppercase;color:#fff;background:${accent};padding:6px 18px;border-radius:999px;">${esc(label)}</span>`;
}

function readingSlideHtml(title, bodyHtml, accent) {
  return `<div style="font-family:${BRAND.fontBody};color:${BRAND.slate};">` +
    `${pill('Read', accent)}` +
    `<h2 style="font:700 44px ${BRAND.fontDisplay};color:${BRAND.navy};margin:18px 0 14px;">${esc(title)}</h2>` +
    `<div style="font-size:26px;line-height:1.5;">${bodyHtml}</div></div>`;
}

function quizStartHtml(title, count, accent) {
  return `<div style="font-family:${BRAND.fontBody};text-align:center;color:${BRAND.slate};">` +
    `${pill('Graded Quiz', accent)}` +
    `<h1 style="font:800 60px ${BRAND.fontDisplay};color:${BRAND.navy};margin:22px 0 10px;">${esc(title)}</h1>` +
    `<p style="font-size:28px;color:${BRAND.slateMuted};margin:0 0 8px;">${count} questions · answer each, then select <b>Check</b>.</p>` +
    `<p style="font-size:24px;color:${BRAND.slateMuted};">Use <b>Next</b> to move forward. Your score appears on the final slide.</p></div>`;
}

function upNextHtml(nextLabel, accent) {
  return `<div style="font-family:${BRAND.fontBody};text-align:center;color:${BRAND.slate};">` +
    `${pill('Up Next', accent)}` +
    `<h1 style="font:800 56px ${BRAND.fontDisplay};color:${BRAND.navy};margin:22px 0 6px;">${esc(nextLabel)}</h1>` +
    `<p style="font-size:26px;color:${BRAND.slateMuted};">Select <b>Next</b> to continue.</p></div>`;
}

// CSS injected into the H5P iframe to brand the player chrome (nav, buttons, fonts).
function playerCss() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap');
.h5p-course-presentation, .h5p-course-presentation * { font-family: ${BRAND.fontBody}; }
.h5p-slide { background: ${BRAND.bgLight} !important; }
/* nav arrows */
.h5p-cp-navigation .h5p-cp-next, .h5p-cp-navigation .h5p-cp-previous { color: ${BRAND.navy} !important; }
.h5p-cp-next:hover, .h5p-cp-previous:hover { color: ${BRAND.teal} !important; }
/* footer / progress bar */
.h5p-cp-footer { background: ${BRAND.navy} !important; border-top: 3px solid ${BRAND.teal} !important; }
.h5p-cp-footer .h5p-cp-footer-toggle-keywords, .h5p-cp-footer button { color: #fff !important; }
.h5p-progressbar .h5p-progressbar-part-show { background: ${BRAND.teal} !important; }
.h5p-cp-progressbar-part.h5p-progressbar-part-show { background: ${BRAND.teal} !important; }
/* question buttons */
.h5p-question-buttons .h5p-joubelui-button,
.h5p-joubelui-button { background: ${BRAND.navy} !important; border-radius: 999px !important; }
.h5p-joubelui-button:hover { background: ${BRAND.teal} !important; }
/* selected/correct answer accents */
.h5p-answer.h5p-selected { border-color: ${BRAND.navy} !important; }
.h5p-question-scorebar .h5p-questionset-scorebar-progress,
.h5p-joubelui-score-bar .h5p-joubelui-score-bar-progress { background: ${BRAND.teal} !important; }
`;
}

module.exports = { BRAND, ACCENTS, esc, readingSlideHtml, quizStartHtml, upNextHtml, playerCss, pill };
