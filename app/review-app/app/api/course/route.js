import { NextResponse } from 'next/server';
import * as review from '../../../mcp/lib/review-state.js';
export const dynamic = 'force-dynamic';

export async function GET() {
  const course = review.readCourse();
  const sum = review.summary();
  return NextResponse.json({ ...course, summary: sum });
}
