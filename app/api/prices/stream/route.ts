import { NextRequest } from 'next/server';
import { getPriceBus } from '@/lib/price-bus';

// Node.js runtime required — edge runtime is stateless and cannot share the singleton bus
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean);

  if (!process.env.FINNHUB_API_KEY) {
    return new Response('FINNHUB_API_KEY not configured', { status: 503 });
  }

  if (symbols.length === 0) {
    return new Response('No symbols provided', { status: 400 });
  }

  const bus = getPriceBus();
  if (!bus) {
    return new Response('Price bus unavailable', { status: 503 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (prices: Record<string, number>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(prices)}\n\n`));
        } catch {}
      };

      bus.subscribe(symbols, send);
      controller.enqueue(encoder.encode(': connected\n\n'));

      req.signal.addEventListener('abort', () => {
        bus.unsubscribe(symbols, send);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
