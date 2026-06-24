/*
 * build-cp.js — slide-by-slide course as H5P.CoursePresentation.
 * Layout: one piece of content per slide —
 *   video → video → reading → quiz-start → one question per slide → (auto) summary.
 * Brand styling from brand.js (Course Visual Style Guide).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { parseQuiz, parseReading } = require('./parse-docx');
const {
  indexLibraries, pick, resolveClosure, verStr, zipDir, copyDir, uuid, buildMultiChoice,
} = require('./build-h5p');
const brand = require('./brand');

const ROOT = path.resolve(__dirname, '..');
const VIDEO_MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/mp4' };
const VIDEO_L10N = {
  name: 'Video', loading: 'Video player loading...', noPlayers: 'Found no video players that supports the given video format.',
  noSources: 'Video source not provided.', aborted: 'Media playback aborted.', networkFailure: 'Network failure.',
  cannotDecode: 'Unable to decode media.', formatNotSupported: 'Video format not supported.', mediaEncrypted: 'Media encrypted.',
  unknownError: 'Unknown error.', invalidYtId: 'Invalid YouTube ID.', unknownYtId: 'Unable to find the video.',
  invalidYtFormat: 'Incorrect YouTube video format.', play: 'Play', pause: 'Pause', mute: 'Mute', unmute: 'Unmute',
  quality: 'Video quality', captions: 'Captions', close: 'Close', fullscreen: 'Fullscreen', disablefullscreen: 'Disable fullscreen',
  download: 'Download', copyLink: 'Copy link', contentCopied: 'Content copied',
};

// --- raw library-instance builders (CP element actions) ---
function videoAction(relPath, ext, title, ver) {
  return {
    library: ver,
    params: {
      sources: [{ path: relPath, mime: VIDEO_MIME[ext] || 'video/mp4', copyright: { license: 'U' } }],
      visuals: { fit: false, controls: true }, playback: { autoplay: false, loop: false }, l10n: VIDEO_L10N,
    },
    subContentId: uuid(),
    metadata: { contentType: 'Video', license: 'U', title: title || 'Video', authors: [], changes: [] },
  };
}
function textAction(html, title, ver) {
  return {
    library: ver, params: { text: html }, subContentId: uuid(),
    metadata: { contentType: 'Text', license: 'U', title: title || 'Text', authors: [], changes: [] },
  };
}

// --- slide wrapper ---
function slide(element) {
  return { elements: element ? [element] : [], keywords: [], slideBackgroundSelector: {} };
}
function element(action, box) {
  return {
    x: box.x, y: box.y, width: box.width, height: box.height,
    action, alwaysDisplayComments: false, backgroundOpacity: 0,
    displayAsButton: false, buttonSize: 'big', goToSlideType: 'specified', invisible: false,
  };
}
const BOX_FULL = { x: 3, y: 5, width: 94, height: 90 };   // video — fills slide
const BOX_TEXT = { x: 6, y: 8, width: 88, height: 84 };   // reading / intro
const BOX_Q = { x: 6, y: 6, width: 88, height: 88 };      // a question

async function buildCP(dir, manifest, outPath) {
  const byName = indexLibraries();
  const need = (mn, mj) => { const e = pick(byName, mn, mj); if (!e) throw new Error('library missing from cache: ' + mn); return e; };
  const cpE = need('H5P.CoursePresentation', 1), vidE = need('H5P.Video', 1);
  const txtE = need('H5P.AdvancedText', 1), mcE = need('H5P.MultiChoice', 1);

  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-'));
  try {
    const contentDir = path.join(build, 'content');
    fs.mkdirSync(path.join(contentDir, 'videos'), { recursive: true });

    const slides = [];
    const usedLibs = [{ machineName: 'H5P.CoursePresentation', major: 1 }];
    let moduleIdx = 0;

    for (const item of manifest.items) {
      const src = path.join(dir, item.file);
      if (!fs.existsSync(src)) { console.warn('  ⚠️  missing: ' + item.file); continue; }
      const accent = brand.ACCENTS[moduleIdx % brand.ACCENTS.length];

      if (item.type === 'video') {
        const ext = path.extname(item.file).toLowerCase();
        const safe = path.basename(item.file).replace(/[^\w.\-]+/g, '_');
        fs.copyFileSync(src, path.join(contentDir, 'videos', safe));
        slides.push(slide(element(videoAction('videos/' + safe, ext, item.title, verStr(vidE)), BOX_FULL)));
        usedLibs.push({ machineName: 'H5P.Video', major: 1 });
        console.log('  🎬 slide: video  — ' + item.file);
      } else if (item.type === 'reading') {
        const r = await parseReading(src);
        const html = brand.readingSlideHtml(item.title || r.title, r.html, accent);
        slides.push(slide(element(textAction(html, item.title || r.title, verStr(txtE)), BOX_TEXT)));
        usedLibs.push({ machineName: 'H5P.AdvancedText', major: 1 });
        console.log('  📄 slide: reading — ' + item.file);
      } else if (item.type === 'quiz') {
        const q = await parseQuiz(src);
        // quiz-start interstitial slide
        const startHtml = brand.quizStartHtml(item.title || 'Graded Quiz', q.questions.length, accent);
        slides.push(slide(element(textAction(startHtml, 'Quiz Start', verStr(txtE)), BOX_TEXT)));
        usedLibs.push({ machineName: 'H5P.AdvancedText', major: 1 });
        // one question per slide
        for (const ques of q.questions) {
          slides.push(slide(element(buildMultiChoice(ques, verStr(mcE)), BOX_Q)));
        }
        usedLibs.push({ machineName: 'H5P.MultiChoice', major: 1 });
        console.log('  ❓ slides: quiz-start + ' + q.questions.length + ' question slides');
      }
      moduleIdx++;
    }
    if (!slides.length) throw new Error('No slides produced from manifest.');

    const content = {
      presentation: {
        slides,
        keywordListEnabled: true, keywordListAlwaysShow: false,
        keywordListAutoHide: false, keywordListOpacity: 90, globalBackgroundSelector: {},
      },
      l10n: {
        slide: 'Slide', score: 'Score', yourScore: 'Your Score', maxScore: 'Max Score', total: 'Total',
        totalScore: 'Total Score', showSolutions: 'Show solutions', retry: 'Retry', exportAnswers: 'Export text',
        hideKeywords: 'Hide navigation', showKeywords: 'Show navigation', fullscreen: 'Fullscreen',
        exitFullscreen: 'Exit fullscreen', prevSlide: 'Back', nextSlide: 'Next', currentSlide: 'Current slide',
        lastSlide: 'Last slide', solutionModeTitle: 'Exit solution mode', solutionModeText: 'Solution Mode',
        summaryMultipleTaskText: 'Multiple tasks', scoreMessage: 'You achieved:', summary: 'Summary',
        solutionsButtonTitle: 'Show comments', printTitle: 'Print', printIngress: 'How would you like to print?',
        printAllSlides: 'Print all slides', printCurrentSlide: 'Print current slide', noTitle: 'No title',
        accessibilitySlideNavigationExplanation: 'Use left and right arrow to change slide.',
        containsNotCompleted: '@slideName contains not completed interaction',
        containsCompleted: '@slideName contains completed interaction',
        slideCount: 'Slide @index of @total', accessibilityCanvasLabel: 'Presentation canvas.',
        shareFacebook: 'Share on Facebook', shareTwitter: 'Share on Twitter', shareGoogle: 'Share on Google+',
      },
      override: {
        activeSurface: false, hideSummarySlide: false, summarySlideSolutionButton: true,
        summarySlideRetryButton: true, enablePrintButton: false,
        social: {
          showFacebookShare: false,
          facebookShare: { url: '@currentpageurl', quote: 'I scored @score out of @maxScore.' },
          showTwitterShare: false,
          twitterShare: { statement: 'I scored @score out of @maxScore.', url: '@currentpageurl', hashtags: 'h5p, course' },
          showGoogleShare: false,
          googleShareUrl: '@currentpageurl',
        },
      },
    };

    const { libs, missing } = resolveClosure(byName, usedLibs);
    if (missing.length) console.warn('  ⚠️  libs not in cache: ' + missing.join(', '));

    const h5pJson = {
      title: manifest.title || 'Course', language: 'en', mainLibrary: 'H5P.CoursePresentation',
      embedTypes: ['iframe'], license: 'U', defaultLanguage: 'en',
      preloadedDependencies: libs.map((l) => ({ machineName: l.json.machineName, majorVersion: l.major, minorVersion: l.minor })),
    };

    fs.writeFileSync(path.join(build, 'h5p.json'), JSON.stringify(h5pJson, null, 2));
    fs.writeFileSync(path.join(contentDir, 'content.json'), JSON.stringify(content));
    for (const l of libs) copyDir(l.dir, path.join(build, l.folder));

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await zipDir(build, outPath);
    return { outPath, slideCount: slides.length, libCount: libs.length };
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
}

function loadManifest(dir) {
  const p = path.join(dir, 'course.yml');
  return fs.existsSync(p) ? yaml.load(fs.readFileSync(p, 'utf8')) : null;
}

module.exports = { buildCP, loadManifest };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || '.');
  const out = path.resolve(process.argv[3] || path.join(ROOT, 'output', 'cp-course.h5p'));
  const manifest = loadManifest(dir);
  if (!manifest) { console.error('No course.yml in ' + dir); process.exit(1); }
  buildCP(dir, manifest, out)
    .then((r) => console.log(`\n✅ Built CP .h5p: ${r.outPath}\n   ${r.slideCount} slides, ${r.libCount} libraries\n`))
    .catch((e) => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
}
