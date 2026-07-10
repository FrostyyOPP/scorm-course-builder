import { NextResponse } from 'next/server';
import * as review from '../../../mcp/lib/review-state.js';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ pending: review.readPending(), decision: review.gateDecision() });
}

export async function POST() {
  const payload = review.sendToClaude();
  return NextResponse.json({ ok: true, ...payload });
}
