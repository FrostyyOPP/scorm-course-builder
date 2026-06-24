#!/usr/bin/env node
/*
 * preview.js — review a course in the browser BEFORE exporting the SCORM.
 * Assembles the course (the real player + assets), serves it locally, and opens a
 * public Cloudflare quick-tunnel link you can open on any device or share.
 *
 *   node src/preview.js <course-folder>
 *
 * Requires: cloudflared  (brew install cloudflared)  — only for the public link.
 * Press Ctrl+C to stop. Nothing is written to your course folder.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');
const { assembleFull } = require('./build-full');
const { buildScreens, writeCourseDir } = require('./build-shell');
const { parseOutline, findOutlineFile } = require('./parse-outline');

function findDocxOutline(dir) {
  const f = fs.readdirSync(dir).find((n) => /\.docx$/i.test(n) && /outline/i.test(n)) ||
            fs.readdirSync(dir).find((n) => /\.docx$/i.test(n));
  return f && /outline/i.test(f) ? path.join(dir, f) : (f ? path.join(dir, f) : null);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/mp4', '.vtt': 'text/vtt; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.xml': 'application/xml',
};

function staticServer(root) {
  return http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(root, safe);
    if (!filePath.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
      const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.range;
      if (range) { // byte-range support so videos seek/stream
        const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
        if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
        fs.createReadStream(filePath).pipe(res);
      }
    });
  });
}

async function assemble(dir) {
  if (!findOutlineFile(dir) && findDocxOutline(dir)) {
    const a = await assembleFull(dir);
    return { title: a.title, screens: a.screens, assets: a.assets, warnings: a.warnings };
  }
  const course = parseOutline(dir);
  const r = await buildScreens(dir, course);
  return { title: course.title, screens: r.screens, assets: r.assets, warnings: r.warnings };
}

(async () => {
  const dir = path.resolve(process.argv[2] || '.');
  if (!fs.existsSync(dir)) { console.error('Folder not found: ' + dir); process.exit(1); }

  console.log('🛠  Assembling course for preview…');
  const a = await assemble(dir);
  const build = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-'));
  writeCourseDir(build, { title: a.title, screens: a.screens, assets: a.assets });
  console.log(`   ${a.screens.length} screens` + (a.warnings && a.warnings.length ? `  (${a.warnings.length} warning(s), e.g. captions)` : ''));

  const server = staticServer(build);
  await new Promise((r) => server.listen(0, r));
  const localUrl = 'http://localhost:' + server.address().port;
  console.log('   Local:  ' + localUrl);

  console.log('🌐 Opening a public link (Cloudflare quick tunnel)…');
  const cf = spawn('cloudflared', ['tunnel', '--url', localUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
  let printed = false;
  const scan = (buf) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf.toString());
    if (m && !printed) {
      printed = true;
      console.log('\n✅ PUBLIC PREVIEW LINK — open in any browser / share for review:\n');
      console.log('   ' + m[0] + '\n');
      console.log('   Review the whole course, then press Ctrl+C and run the build to export the SCORM:');
      console.log('   node src/index.js "' + dir + '"\n');
    }
  };
  cf.stdout.on('data', scan); cf.stderr.on('data', scan);
  cf.on('error', (e) => {
    if (e.code === 'ENOENT') console.log('\n⚠️  cloudflared not found — public link unavailable. Install: brew install cloudflared\n   The Local link above still works on this machine.');
    else console.log('\n⚠️  tunnel error: ' + e.message);
  });

  const cleanup = () => {
    try { cf.kill(); } catch (e) {}
    try { server.close(); } catch (e) {}
    try { fs.rmSync(build, { recursive: true, force: true }); } catch (e) {}
    console.log('\n👋 Preview stopped.');
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  console.log('   (Press Ctrl+C to stop the preview.)');
})().catch((e) => { console.error('\n❌ ' + e.message + '\n'); process.exit(1); });
