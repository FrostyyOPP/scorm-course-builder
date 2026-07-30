// Serve the live v2 course SAME-ORIGIN under /course/ so the reviewer iframe is not
// cross-origin (screenshots + strict browsers render it) and no separate server is needed.
// index.html + asset map come from <course>/.review (build-v2 --emit); player/styles/vendor
// from the repo's src/shell-v2; scorm-api from src/shell. Video assets support byte-range.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { COURSE_DIR, REPO_ROOT, REVIEW_DIR } from '../../../mcp/lib/paths.js';

export const dynamic = 'force-dynamic';
const SHELL = path.join(REPO_ROOT, 'src', 'shell-v2');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

function serve(file, req) {
  let st; try { st = fs.statSync(file); } catch (e) { return new Response('Not found', { status: 404 }); }
  if (!st.isFile()) return new Response('Not found', { status: 404 });
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    const start = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end }));
    return new Response(stream, { status: 206, headers: { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Cache-Control': 'no-store' } });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { headers: { 'Content-Type': type, 'Content-Length': String(st.size), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' } });
}

export async function GET(req, { params }) {
  const parts = params.path || [];
  const rel = parts.join('/');
  if (!rel || rel === 'index.html') {
    let html; try { html = fs.readFileSync(path.join(REVIEW_DIR, 'index.html'), 'utf8'); } catch (e) { return new Response('Run build-v2 --emit first', { status: 404 }); }
    html = html.replace('<head>', '<head>\n<base href="/course/">'); // resolve relative assets under /course/ regardless of trailing slash
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  if (rel === 'scorm-api.js') return serve(path.join(REPO_ROOT, 'src', 'shell', 'scorm-api.js'), req);
  if (rel.startsWith('assets/')) {
    let map = {}; try { map = JSON.parse(fs.readFileSync(path.join(REVIEW_DIR, 'assets.json'), 'utf8')); } catch (e) {}
    const src = map[rel];
    return src ? serve(src, req) : new Response('Not found', { status: 404 });
  }
  const skinMatch = /^skin-([\w-]+)\.css$/.exec(rel);
  if (skinMatch) return serve(path.join(SHELL, 'skins', skinMatch[1] + '.css'), req);
  const f = path.join(SHELL, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(SHELL)) return new Response('Forbidden', { status: 403 });
  return serve(f, req);
}
