import { NextResponse } from 'next/server';
import * as review from '../../../mcp/lib/review-state.js';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ messages: review.chatAll() });
}

export async function POST(req) {
  const { text, slideId } = await req.json();
  const msg = review.chatPost('user', text, slideId || null);
  return NextResponse.json({ ok: true, message: msg });
}
