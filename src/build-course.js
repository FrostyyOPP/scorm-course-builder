/*
 * build-course.js — Phase B2
 * Reads a course.yml manifest + its folder and builds ONE combined .h5p
 * (H5P.Column stacking videos, readings, and the graded quiz) ready for SCORM.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');
const { parseQuiz, parseReading } = require('./parse-docx');
const {
  indexLibraries, pick, resolveClosure, verStr, zipDir, copyDir, esc, uuid,
  buildQuestionSetParams,
} = require('./build-h5p');

const ROOT = path.resolve(__dirname, '..');

const VIDEO_MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/mp4' };

const VIDEO_L10N = {
  name: 'Video', loading: 'Video player loading...', noPlayers: 'Found no video players that supports the given video format.',
  noSources: 'Video source not provided.', aborted: 'Media playback aborted.', networkFailure: 'Network failure.',
  cannotDecode: 'Unable to decode media.', formatNotSupported: 'Video format not supported.', mediaEncrypted: 'Media encrypted.',
  unknownError: 'Unknown error.', invalidYtId: 'Invalid YouTube ID.', unknownYtId: 'Unable to find the video with the given YouTube ID.',
  invalidYtFormat: 'Incorrect YouTube video format.', play: 'Play', pause: 'Pause', mute: 'Mute', unmute: 'Unmute',
  quality: 'Video quality', captions: 'Captions', close: 'Close', fullscreen: 'Fullscreen', disablefullscreen: 'Disable fullscreen',
  download: 'Download', copyLink: 'Copy link', contentCopied: 'Content copied',
};

function videoInstance(relPath, ext, title, version) {
  return {
    content: {
      library: version,
      params: {
        sources: [{ path: relPath, mime: VIDEO_MIME[ext] || 'video/mp4', copyright: { license: 'U' } }],
        visuals: { fit: false, controls: true },
        playback: { autoplay: false, loop: false },
        l10n: VIDEO_L10N,
      },
      subContentId: uuid(),
      metadata: { contentType: 'Video', license: 'U', title: title || 'Video', authors: [], changes: [] },
    },
    useSeparator: 'auto',
  };
}

function textInstance(html, title, version) {
  return {
    content: {
      library: version,
      params: { text: html },
      subContentId: uuid(),
      metadata: { contentType: 'Text', license: 'U', title: title || 'Text', authors: [], changes: [] },
    },
    useSeparator: 'auto',
  };
}

function quizInstance(params, title, version) {
  return {
    content: {
      library: version,
      params,
      subContentId: uuid(),
      metadata: { contentType: 'Question Set', license: 'U', title: title || 'Quiz', authors: [], changes: [] },
    },
    useSeparator: 'auto',
  };
}

async function buildCourse(dir, manifest, outPath) {
  const byName = indexLibraries();
  const need = (mn, mj) => { const e = pick(byName, mn, mj); if (!e) throw new Error('library missing from cache: ' + mn); return e; };
  const colE = need('H5P.Column', 1), vidE = need('H5P.Video', 1), txtE = need('H5P.AdvancedText', 1);
  const qsE = need('H5P.QuestionSet', 1), mcE = need('H5P.MultiChoice', 1);

  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'course-'));
  try {
    const contentDir = path.join(build, 'content');
    fs.mkdirSync(path.join(contentDir, 'videos'), { recursive: true });

    const columnItems = [];
    const usedLibs = [{ machineName: 'H5P.Column', major: 1 }];

    for (const item of manifest.items) {
      const src = path.join(dir, item.file);
      if (!fs.existsSync(src)) { console.warn('  ⚠️  skipping missing file: ' + item.file); continue; }

      if (item.type === 'video') {
        const ext = path.extname(item.file).toLowerCase();
        const safe = path.basename(item.file).replace(/[^\w.\-]+/g, '_');
        fs.copyFileSync(src, path.join(contentDir, 'videos', safe));
        columnItems.push(videoInstance('videos/' + safe, ext, item.title, verStr(vidE)));
        usedLibs.push({ machineName: 'H5P.Video', major: 1 });
        console.log('  🎬 video   : ' + item.file);
      } else if (item.type === 'reading') {
        const r = await parseReading(src);
        columnItems.push(textInstance(r.html, item.title || r.title, verStr(txtE)));
        usedLibs.push({ machineName: 'H5P.AdvancedText', major: 1 });
        console.log('  📄 reading : ' + item.file + '  ("' + (item.title || r.title) + '")');
      } else if (item.type === 'quiz') {
        const q = await parseQuiz(src);
        const params = buildQuestionSetParams(q, verStr(mcE));
        columnItems.push(quizInstance(params, item.title, verStr(qsE)));
        usedLibs.push({ machineName: 'H5P.QuestionSet', major: 1 }, { machineName: 'H5P.MultiChoice', major: 1 });
        console.log('  ❓ quiz    : ' + item.file + '  (' + q.questions.length + ' questions)');
      } else {
        console.warn('  ⚠️  unknown item type: ' + item.type);
      }
    }
    if (!columnItems.length) throw new Error('No usable items found in manifest.');

    const content = { content: columnItems };

    const { libs, missing } = resolveClosure(byName, usedLibs);
    if (missing.length) console.warn('  ⚠️  libraries not in cache: ' + missing.join(', '));

    const h5pJson = {
      title: manifest.title || 'Course',
      language: 'en', mainLibrary: 'H5P.Column', embedTypes: ['iframe'], license: 'U', defaultLanguage: 'en',
      preloadedDependencies: libs.map((l) => ({ machineName: l.json.machineName, majorVersion: l.major, minorVersion: l.minor })),
    };

    fs.writeFileSync(path.join(build, 'h5p.json'), JSON.stringify(h5pJson, null, 2));
    fs.writeFileSync(path.join(contentDir, 'content.json'), JSON.stringify(content));
    for (const l of libs) copyDir(l.dir, path.join(build, l.folder));

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await zipDir(build, outPath);
    return { outPath, libCount: libs.length, itemCount: columnItems.length };
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
}

function loadManifest(dir) {
  const p = path.join(dir, 'course.yml');
  if (!fs.existsSync(p)) return null;
  return yaml.load(fs.readFileSync(p, 'utf8'));
}

module.exports = { buildCourse, loadManifest };

// CLI: node src/build-course.js <folder> [out.h5p]
if (require.main === module) {
  const dir = path.resolve(process.argv[2] || '.');
  const out = path.resolve(process.argv[3] || path.join(ROOT, 'output', 'course.h5p'));
  const manifest = loadManifest(dir);
  if (!manifest) { console.error('No course.yml in ' + dir + ' — run: node src/scan-folder.js "' + dir + '"'); process.exit(1); }
  buildCourse(dir, manifest, out)
    .then((r) => console.log(`\n✅ Built course .h5p: ${r.outPath}\n   ${r.itemCount} items, ${r.libCount} libraries\n`))
    .catch((e) => { console.error('\n❌ ' + e.stack + '\n'); process.exit(1); });
}
