// Path resolution for the scorm-review app + MCP. Resolves from this file's own
// location (cross-platform), with COURSE_DIR overridable via env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// mcp/lib -> mcp -> review-app -> app (repo root)
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const STUDIO_ROOT = path.resolve(REPO_ROOT, '..');   // the SCORM Studio folder

// The course under review, resolved course-agnostically (studio carries no course hardcoding):
//   1. COURSE_DIR env, else
//   2. the path written in <studio>/.active-course (the "attach a course" pointer), else
//   3. the bundled example project.
function resolveCourseDir() {
  if (process.env.COURSE_DIR) return process.env.COURSE_DIR;
  try {
    const p = path.join(STUDIO_ROOT, '.active-course');
    if (fs.existsSync(p)) { const v = fs.readFileSync(p, 'utf8').trim(); if (v) return v; }
  } catch (e) { /* ignore */ }
  return path.join(REPO_ROOT, 'example-project');
}
export const COURSE_DIR = resolveCourseDir();
export const REVIEW_DIR = path.join(COURSE_DIR, '.review');

export const P = {
  course: path.join(REVIEW_DIR, 'course.json'),       // assembled slides (from build-v2 --emit)
  state: path.join(REVIEW_DIR, 'state.json'),          // per-slide review state (app-internal)
  pending: path.join(REVIEW_DIR, 'feedback_pending.json'), // flattened "send to claude" snapshot
  approved: path.join(REVIEW_DIR, 'approved.json'),    // all-approved marker
  chat: path.join(REVIEW_DIR, 'chat.jsonl'),
  chatState: path.join(REVIEW_DIR, 'chat_state.json'),
  history: path.join(REVIEW_DIR, 'history'),
};
