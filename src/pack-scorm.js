#!/usr/bin/env node
/*
 * pack-scorm.js — Phase A
 * Wraps a single .h5p file into a self-contained SCORM 1.2 package (a .zip an LMS can import).
 *
 * Output package layout:
 *   imsmanifest.xml        SCORM 1.2 manifest (lists every file)
 *   index.html             entry point; renders the H5P via h5p-standalone
 *   scorm-api.js           SCORM 1.2 runtime wrapper (init / set score / complete / finish)
 *   h5p/                   h5p-standalone runtime (js/css/fonts/images)
 *   workspace/             the unzipped .h5p (h5p.json + content/ + libraries)
 *
 * Usage: node src/pack-scorm.js <input.h5p> [--title "Course Title"] [--out output]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const archiver = require('archiver');
const { BRAND, playerCss } = require('./brand');

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course';
}

// recursively list every file under dir, returning forward-slash paths relative to dir
function listFiles(dir, base = dir) {
  let out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out = out.concat(listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name), d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildManifest(title, files) {
  const id = 'COURSE-' + slugify(title).toUpperCase();
  const fileEls = files.map((f) => `      <file href="${xmlEscape(f)}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<manifest identifier="${id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${xmlEscape(title)}</title>
      <item identifier="ITEM-1" identifierref="RES-1" isvisible="true">
        <title>${xmlEscape(title)}</title>
        <adlcp:masteryscore>50</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${fileEls}
    </resource>
  </resources>
</manifest>
`;
}

const INDEX_HTML = (title, brand) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${xmlEscape(title)}</title>
  <link rel="stylesheet" href="h5p/styles/h5p.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root{ --navy:${brand.navy}; --teal:${brand.teal}; --bg:${brand.bgLight}; --font:${brand.fontBody}; }
    html,body{margin:0;padding:0;background:var(--bg);font-family:var(--font);}
    #course-header{
      position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:14px;
      background:${brand.gradTeal};color:#fff;padding:14px 26px;
      box-shadow:0 2px 10px rgba(15,23,42,.18);
    }
    #course-header .dot{width:12px;height:12px;border-radius:50%;background:#fff;opacity:.9;}
    #course-header h1{font:700 20px var(--font);margin:0;letter-spacing:.01em;}
    #course-header .tag{margin-left:auto;font:600 12px var(--font);letter-spacing:.12em;
      text-transform:uppercase;background:rgba(255,255,255,.18);padding:5px 12px;border-radius:999px;}
    #h5p-container{max-width:1180px;margin:0 auto;padding:18px 12px 40px;}
  </style>
</head>
<body>
  <header id="course-header">
    <span class="dot"></span>
    <h1>${xmlEscape(title)}</h1>
    <span class="tag">Course</span>
  </header>
  <div id="h5p-container"></div>
  <script src="scorm-api.js"></script>
  <script src="h5p/main.bundle.js"></script>
  <script>window.__BRAND_CSS__ = ${JSON.stringify(brand.css)};</script>
  <script>
    (function () {
      SCORM.init();
      var el = document.getElementById('h5p-container');
      // Resolve an ABSOLUTE base from index.html's own location (the directory it is
      // served from, with a trailing slash). H5P core builds content-file URLs as
      // origin+contentUrl without inserting a slash when contentUrl is relative, which
      // breaks embedded media. An absolute base sidesteps that and works under any
      // LMS subpath.
      var BASE = (function () {
        var h = window.location.href.split('#')[0].split('?')[0];
        return h.substring(0, h.lastIndexOf('/') + 1);
      })();
      new H5PStandalone.H5P(el, {
        h5pJsonPath: BASE + 'workspace',
        frameJs: BASE + 'h5p/frame.bundle.js',
        frameCss: BASE + 'h5p/styles/h5p.css'
      }).then(function () {
        // Brand the H5P player: inject the style-guide CSS into the content iframe.
        // Re-applied on a short interval because H5P (re)builds slides lazily.
        function brandIframe() {
          var ifr = el.querySelector('iframe.h5p-iframe') || el.querySelector('iframe');
          if (!ifr || !ifr.contentDocument) return;
          var d = ifr.contentDocument;
          if (d.getElementById('brand-style')) return;
          var st = d.createElement('style');
          st.id = 'brand-style';
          st.textContent = window.__BRAND_CSS__ || '';
          (d.head || d.documentElement).appendChild(st);
        }
        brandIframe();
        var tries = 0, iv = setInterval(function () { brandIframe(); if (++tries > 20) clearInterval(iv); }, 300);
        // Report results to the LMS as the learner answers, via H5P's xAPI events.
        if (window.H5P && H5P.externalDispatcher) {
          H5P.externalDispatcher.on('xAPI', function (event) {
            try {
              var st = event.data && event.data.statement;
              if (!st) return;
              var verb = st.verb && st.verb.display && st.verb.display['en-US'];
              var res = st.result;
              if (res && res.score && typeof res.score.scaled === 'number') {
                var pct = Math.round(res.score.scaled * 100);
                SCORM.setScore(pct, 0, 100);
              }
              if (verb === 'completed' || verb === 'passed' || verb === 'answered') {
                if (res && res.completion) SCORM.setComplete(res.success);
              }
            } catch (e) { /* never break the content over reporting */ }
          });
        }
      });
      window.addEventListener('beforeunload', function () { SCORM.finish(); });
    })();
  </script>
</body>
</html>
`;

const SCORM_API_JS = `/* Minimal SCORM 1.2 runtime wrapper. Finds the LMS API and reports status/score. */
var SCORM = (function () {
  var api = null, started = false, finished = false;
  function find(win) {
    var n = 0;
    while (win && !win.API && win.parent && win.parent !== win && n < 10) { win = win.parent; n++; }
    return win && win.API ? win.API : null;
  }
  function get() {
    if (api) return api;
    api = find(window);
    if (!api && window.opener) api = find(window.opener);
    return api;
  }
  return {
    init: function () {
      var a = get();
      if (!a || started) return;
      a.LMSInitialize('');
      var status = a.LMSGetValue('cmi.core.lesson_status');
      if (!status || status === 'not attempted' || status === 'unknown') {
        a.LMSSetValue('cmi.core.lesson_status', 'incomplete');
      }
      a.LMSCommit('');
      started = true;
    },
    setScore: function (raw, min, max) {
      var a = get(); if (!a) return;
      a.LMSSetValue('cmi.core.score.raw', String(raw));
      a.LMSSetValue('cmi.core.score.min', String(min));
      a.LMSSetValue('cmi.core.score.max', String(max));
      a.LMSCommit('');
    },
    setComplete: function (passed) {
      var a = get(); if (!a) return;
      a.LMSSetValue('cmi.core.lesson_status', passed === false ? 'failed' : (passed === true ? 'passed' : 'completed'));
      a.LMSCommit('');
    },
    finish: function () {
      var a = get(); if (!a || finished) return;
      finished = true;
      a.LMSFinish('');
    }
  };
})();
`;

async function zipDir(srcDir, outFile) {
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outFile);
    const archive = archiver('zip', { zlib: { level: 1 } }); // light: media is already compressed
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(srcDir, false);
    archive.finalize();
  });
}

async function packScorm(h5pPath, opts = {}) {
  if (!fs.existsSync(h5pPath)) throw new Error('Input .h5p not found: ' + h5pPath);
  const projectRoot = path.resolve(__dirname, '..');
  const standaloneDist = path.join(projectRoot, 'node_modules', 'h5p-standalone', 'dist');
  if (!fs.existsSync(standaloneDist)) throw new Error('h5p-standalone dist missing — run npm install');

  const title = opts.title || path.basename(h5pPath, path.extname(h5pPath));
  const outDir = opts.out ? path.resolve(opts.out) : path.join(projectRoot, 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'scorm-'));
  try {
    // 1. unzip the .h5p into workspace/
    const workspace = path.join(build, 'workspace');
    fs.mkdirSync(workspace, { recursive: true });
    new AdmZip(h5pPath).extractAllTo(workspace, true);
    if (!fs.existsSync(path.join(workspace, 'h5p.json'))) {
      throw new Error('Invalid .h5p: no h5p.json at its root');
    }

    // 2. copy the h5p-standalone runtime into h5p/
    copyDir(standaloneDist, path.join(build, 'h5p'));

    // 3. write entry files
    const brandTokens = { ...BRAND, css: playerCss() };
    fs.writeFileSync(path.join(build, 'index.html'), INDEX_HTML(title, brandTokens));
    fs.writeFileSync(path.join(build, 'scorm-api.js'), SCORM_API_JS);

    // 4. manifest must list every packaged file
    const allFiles = listFiles(build).filter((f) => f !== 'imsmanifest.xml');
    fs.writeFileSync(path.join(build, 'imsmanifest.xml'), buildManifest(title, allFiles));

    // 5. zip it up
    const outFile = path.join(outDir, slugify(title) + '-scorm.zip');
    await zipDir(build, outFile);
    return outFile;
  } finally {
    fs.rmSync(build, { recursive: true, force: true });
  }
}

module.exports = { packScorm, buildManifest, listFiles, zipDir, slugify, SCORM_API_JS };

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const h5pPath = args.find((a) => !a.startsWith('--'));
  const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  if (!h5pPath) {
    console.error('Usage: node src/pack-scorm.js <input.h5p> [--title "Course Title"] [--out output]');
    process.exit(1);
  }
  packScorm(h5pPath, { title: get('--title'), out: get('--out') })
    .then((f) => console.log('\n✅ SCORM package created:\n   ' + f + '\n'))
    .catch((e) => { console.error('\n❌ ' + e.message + '\n'); process.exit(1); });
}
