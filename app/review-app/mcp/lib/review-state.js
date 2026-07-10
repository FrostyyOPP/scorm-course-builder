// Shared, file-backed review state for the scorm-review app + MCP.
// Single source of truth on disk (mirrors Course Studio's pattern). The Next app
// mutates the rich state.json; "send to Claude" flattens it into feedback_pending.json
// which the MCP reads. Annotations are inline shape arrays in native (1920x1080) coords.
import fs from 'node:fs';
import path from 'node:path';
import { P, REVIEW_DIR } from './paths.js';

const now = () => new Date().toISOString();
const stamp = () => now().replace(/[:.]/g, '-');
function ensureDir() { fs.mkdirSync(REVIEW_DIR, { recursive: true }); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; } }
function writeAtomic(file, obj) {
  ensureDir();
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  try { if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak'); } catch (e) {}
  fs.renameSync(tmp, file);
}
const VISUAL_RE = /#([A-Z]{2,5}(?:-[A-Z0-9]+)+)\b/g;
function referencedVisuals(text) { const out = []; let m; while ((m = VISUAL_RE.exec(text || ''))) out.push(m[1]); return out; }

export function readCourse() { return readJson(P.course, { title: 'Course', slides: [] }); }
export function readState() { return readJson(P.state, { updatedAt: null, slides: {} }); }
export function writeState(s) { s.updatedAt = now(); writeAtomic(P.state, s); return s; }

function slideEntry(state, slideId) {
  if (!state.slides[slideId]) state.slides[slideId] = { status: 'pending', comments: [], approvedAt: null };
  return state.slides[slideId];
}
export function slideStatus(entry) {
  if (!entry) return 'pending';
  if (entry.approvedAt) return 'approved';
  if ((entry.comments || []).some((c) => !c.resolved)) return 'comments';
  return 'pending';
}

// ---- mutations (called by the app's API routes) ----
export function addComment(slideId, { id, text, annotations }) {
  const state = readState();
  const e = slideEntry(state, slideId);
  if (id) {
    const c = e.comments.find((x) => x.id === id);
    if (c) { c.text = text; c.annotations = annotations || []; c.updatedAt = now(); }
  } else {
    e.comments.push({ id: `c_${Date.now()}_${e.comments.length}`, text: text || '', annotations: annotations || [], resolved: false, createdAt: now() });
  }
  e.approvedAt = null; // a new/edited comment reopens the slide
  e.status = slideStatus(e);
  return writeState(state);
}
export function deleteComment(slideId, commentId) {
  const state = readState();
  const e = slideEntry(state, slideId);
  e.comments = (e.comments || []).filter((c) => c.id !== commentId);
  e.status = slideStatus(e);
  return writeState(state);
}
export function approveSlide(slideId, approved) {
  const state = readState();
  const e = slideEntry(state, slideId);
  e.approvedAt = approved ? now() : null;
  e.status = slideStatus(e);
  return writeState(state);
}

// ---- overview ----
export function summary() {
  const course = readCourse();
  const state = readState();
  const slides = course.slides || [];
  let approved = 0, withComments = 0, pending = 0;
  const rows = slides.map((s) => {
    const e = state.slides[s.id];
    const st = slideStatus(e);
    if (st === 'approved') approved++; else if (st === 'comments') withComments++; else pending++;
    return { id: s.id, type: s.type, title: s.title || s.kicker || s.type, status: st, comments: (e && e.comments ? e.comments.length : 0) };
  });
  return { title: course.title, total: slides.length, approved, withComments, pending, decision: gateDecision(), slides: rows };
}

// ---- gate: send-to-claude / decision / ack ----
export function sendToClaude() {
  const course = readCourse();
  const state = readState();
  const byId = Object.fromEntries((course.slides || []).map((s) => [s.id, s]));
  const items = [];
  for (const [slideId, e] of Object.entries(state.slides || {})) {
    const open = (e.comments || []).filter((c) => !c.resolved);
    for (const c of open) {
      const s = byId[slideId] || {};
      items.push({
        slide: slideId, slideType: s.type || '', slideTitle: s.title || s.kicker || '',
        commentId: c.id, feedback: c.text, annotations: c.annotations || [],
        referencedVisuals: referencedVisuals(c.text),
      });
    }
  }
  const payload = { course: course.title, createdAt: now(), count: items.length, items };
  writeAtomic(P.pending, payload);
  return payload;
}
export function readPending() { return readJson(P.pending, { count: 0, items: [] }); }
export function gateDecision() {
  if (fs.existsSync(P.approved)) return 'approved';
  const pend = readPending();
  if (pend && pend.count > 0) return 'changes_requested';
  return 'pending';
}
export function ackFeedback() {
  if (!fs.existsSync(P.pending)) return { acked: 0 };
  fs.mkdirSync(P.history, { recursive: true });
  const dest = path.join(P.history, `feedback_${stamp()}.json`);
  fs.renameSync(P.pending, dest);
  return { acked: 1, archived: dest };
}
export function approveAll() {
  const course = readCourse();
  writeAtomic(P.approved, { course: course.title, approvedAt: now(), totalSlides: (course.slides || []).length });
  return readJson(P.approved, {});
}

// ---- agent chat (file-based, like Course Studio) ----
export function chatPost(role, text, slideId) {
  ensureDir();
  const msg = { id: `m_${Date.now()}`, role, text, slideId: slideId || null, at: now() };
  fs.appendFileSync(P.chat, JSON.stringify(msg) + '\n');
  return msg;
}
export function chatAll() {
  try { return fs.readFileSync(P.chat, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; }
}
export function chatInbox() {
  const all = chatAll();
  const { lastReadId } = readJson(P.chatState, { lastReadId: null });
  let started = !lastReadId;
  const out = [];
  for (const m of all) { if (started && m.role === 'user') out.push(m); if (m.id === lastReadId) started = true; }
  return out;
}
export function chatReply(text, markReadId) {
  const msg = chatPost('assistant', text);
  if (markReadId) writeAtomic(P.chatState, { lastReadId: markReadId, at: now() });
  return msg;
}
