import { NextResponse } from 'next/server';
import * as review from '../../../mcp/lib/review-state.js';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ state: review.readState(), summary: review.summary() });
}

export async function POST(req) {
  const body = await req.json();
  const { action, slideId } = body;
  try {
    let state;
    if (action === 'comment') state = review.addComment(slideId, { id: body.id, text: body.text, annotations: body.annotations });
    else if (action === 'deleteComment') state = review.deleteComment(slideId, body.commentId);
    else if (action === 'approve') state = review.approveSlide(slideId, body.approved !== false);
    else if (action === 'approveAll') { review.approveAll(); state = review.readState(); }
    else return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    return NextResponse.json({ ok: true, state, summary: review.summary() });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
