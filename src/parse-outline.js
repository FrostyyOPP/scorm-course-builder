/*
 * parse-outline.js — read the master course outline into a structure.
 * Supports a simple Markdown outline (outline/*.md|.txt). A .docx outline can be
 * added once a sample of the author's format is available.
 *
 * Returns: { title, subtitle, modules:[{title, items:[{type,file,title,module}]}], items:[...] }
 */
const fs = require('fs');
const path = require('path');

const TYPE_FOLDER = { video: 'videos', reading: 'readings', quiz: 'quizzes' };

function parseMarkdownOutline(text) {
  const lines = text.split('\n');
  let title = 'Course';
  let subtitle = '';
  const modules = [];
  let current = null;
  let inComment = false;

  for (let raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/<!--/.test(line)) inComment = true;
    if (inComment) { if (/-->/.test(line)) inComment = false; continue; }

    const t = line.trim();
    if (!t) continue;

    let m;
    if ((m = /^#\s+(.+)$/.exec(t))) { title = m[1].trim(); continue; }
    if ((m = /^>\s*(.+)$/.exec(t))) { subtitle = m[1].trim(); continue; }
    if ((m = /^##\s+(.+)$/.exec(t))) { current = { title: m[1].trim(), items: [] }; modules.push(current); continue; }
    if ((m = /^[-*]\s+(video|reading|quiz)\s*:\s*(.+)$/i.exec(t))) {
      const type = m[1].toLowerCase();
      let rest = m[2].trim();
      let itemTitle = '';
      const pipe = rest.indexOf('|');
      if (pipe >= 0) { itemTitle = rest.slice(pipe + 1).trim(); rest = rest.slice(0, pipe).trim(); }
      if (!current) { current = { title: '', items: [] }; modules.push(current); }
      current.items.push({ type, file: rest, title: itemTitle, module: current.title });
    }
  }
  const items = modules.flatMap((mod) => mod.items);
  return { title, subtitle, modules, items };
}

// Find the outline file inside a project's outline/ folder.
function findOutlineFile(projectDir) {
  const dir = path.join(projectDir, 'outline');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => /\.(md|markdown|txt)$/i.test(f));
  return files.length ? path.join(dir, files[0]) : null;
}

function parseOutline(projectDir) {
  const file = findOutlineFile(projectDir);
  if (!file) throw new Error('No outline found. Put a Markdown outline in: ' + path.join(projectDir, 'outline') + '/');
  const text = fs.readFileSync(file, 'utf8');
  const course = parseMarkdownOutline(text);
  if (!course.items.length) throw new Error('Outline has no content items (lines like "- video: file.mp4").');
  return course;
}

// Resolve an outline item to an absolute file path in its type folder. Falls back to a
// case-insensitive basename match if the exact name is not found.
function resolveItemFile(projectDir, item) {
  const folder = TYPE_FOLDER[item.type];
  if (!folder) return null;
  const dir = path.join(projectDir, folder);
  const exact = path.join(dir, item.file);
  if (fs.existsSync(exact)) return exact;
  if (!fs.existsSync(dir)) return null;
  const want = item.file.trim().toLowerCase();
  const hit = fs.readdirSync(dir).find((f) => f.toLowerCase() === want);
  if (hit) return path.join(dir, hit);
  // looser: match ignoring extension/spacing
  const base = want.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '');
  const loose = fs.readdirSync(dir).find((f) => f.toLowerCase().replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/g, '') === base);
  return loose ? path.join(dir, loose) : null;
}

module.exports = { parseOutline, parseMarkdownOutline, resolveItemFile, findOutlineFile, TYPE_FOLDER };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || '.');
  const course = parseOutline(dir);
  console.log('Title   :', course.title);
  console.log('Subtitle:', course.subtitle || '(none)');
  course.modules.forEach((mod) => {
    console.log('\n## ' + mod.title);
    mod.items.forEach((it) => {
      const f = resolveItemFile(dir, it);
      console.log('   [' + it.type + '] ' + it.file + (it.title ? '  "' + it.title + '"' : '') + '  ->  ' + (f ? 'FOUND' : '❌ MISSING'));
    });
  });
}
