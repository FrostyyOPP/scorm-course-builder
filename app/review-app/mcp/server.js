#!/usr/bin/env node
/**
 * scorm-review MCP server (stdio).
 *
 * Bridge between the SCORM Review app (Next.js) and a Claude Code session.
 * Thin wrapper over lib/review-state.js, which reads/writes the on-disk JSON
 * under <course>/.review/ — the single source of truth shared with the app.
 * Reviewers comment / annotate / approve in the app, click "Send to Claude"
 * (writes feedback_pending.json), then Claude reads it here, applies fixes,
 * and calls scorm_ack_feedback to archive it. Logging to stderr only (stdio).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as review from './lib/review-state.js';
import { COURSE_DIR } from './lib/paths.js';

const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: `Error: ${msg}` }] });
const wrap = (fn) => async (args) => { try { return ok(await fn(args || {})); } catch (e) { return fail(e?.message || String(e)); } };
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, openWorldHint: false };

const server = new McpServer({ name: 'scorm-review-mcp-server', version: '0.1.0' });

server.registerTool('scorm_review_status', {
  title: 'Review status overview',
  description: 'One-call overview of the SCORM course review: per-slide statuses (pending|comments|approved), counts, and the gate decision. Start here.',
  inputSchema: {}, annotations: READ,
}, wrap(() => review.summary()));

server.registerTool('scorm_review_feedback', {
  title: 'Read pending review feedback',
  description: 'Read the reviewer feedback the user published via "Send to Claude": items[] with {slide, slideTitle, feedback, annotations[], referencedVisuals}. Use before applying corrections.',
  inputSchema: {}, annotations: READ,
}, wrap(() => review.readPending()));

server.registerTool('scorm_gate_decision', {
  title: 'Gate decision',
  description: "Returns 'approved' | 'changes_requested' | 'pending' for the whole course package.",
  inputSchema: {}, annotations: READ,
}, wrap(() => ({ decision: review.gateDecision() })));

server.registerTool('scorm_slide_get', {
  title: 'Get a slide + its review',
  description: 'Full slide data (from the assembled course) plus its review entry: comments, annotations (native-coord shapes), and status.',
  inputSchema: { slideId: z.string().describe('Slide id, e.g. "q1_3", "m1l1", "title"') }, annotations: READ,
}, wrap(({ slideId }) => {
  const course = review.readCourse();
  const slide = (course.slides || []).find((s) => s.id === slideId) || null;
  const entry = (review.readState().slides || {})[slideId] || { status: 'pending', comments: [] };
  return { slide, review: entry, status: review.slideStatus(entry) };
}));

server.registerTool('scorm_ack_feedback', {
  title: 'Acknowledge feedback',
  description: 'Archive the consumed feedback_pending.json into .review/history/ after you have applied the corrections, so it is not re-processed. Destructive: removes the pending file.',
  inputSchema: {}, annotations: { ...WRITE, destructiveHint: true },
}, wrap(() => review.ackFeedback()));

server.registerTool('scorm_chat_inbox', {
  title: 'Unread reviewer chat',
  description: 'Unread reviewer messages from the in-app chat. Reply with scorm_chat_reply.',
  inputSchema: {}, annotations: READ,
}, wrap(() => { const m = review.chatInbox(); return { count: m.length, messages: m }; }));

server.registerTool('scorm_chat_reply', {
  title: 'Reply in reviewer chat',
  description: 'Post a reply to the in-app reviewer chat. Optionally mark the message it answers as read (markReadId).',
  inputSchema: { text: z.string().min(1), markReadId: z.string().optional() }, annotations: WRITE,
}, wrap(({ text, markReadId }) => review.chatReply(text, markReadId || null)));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[scorm-review-mcp] connected (stdio). Course: ${COURSE_DIR}`);
}
main().catch((err) => { console.error('[scorm-review-mcp] fatal:', err); process.exit(1); });
