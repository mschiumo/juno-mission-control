import { NextResponse } from 'next/server';
import { getDailyQuote } from '@/lib/daily-quote';

export async function GET(): Promise<NextResponse> {
  const { data, cached, fallback } = await getDailyQuote();
  return NextResponse.json(
    fallback
      ? { success: true, data, cached, fallback: true }
      : { success: true, data, cached },
  );
}
