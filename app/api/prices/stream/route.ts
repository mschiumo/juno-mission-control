import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean);

  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    return new Response('FINNHUB_API_KEY not configured', { status: 503 });
  }

  if (symbols.length === 0) {
    return new Response('No symbols provided', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const ws = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);

      ws.addEventListener('open', () => {
        for (const symbol of symbols) {
          ws.send(JSON.stringify({ type: 'subscribe', symbol }));
        }
        // Send an initial ping so the client knows the connection is live
        controller.enqueue(encoder.encode(': connected\n\n'));
      });

      ws.addEventListener('message', (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type !== 'trade' || !Array.isArray(msg.data)) return;

          // Deduplicate: keep only the latest price per symbol in this batch
          const latest: Record<string, number> = {};
          for (const tick of msg.data) {
            latest[tick.s] = tick.p;
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(latest)}\n\n`));
        } catch {
          // ignore malformed messages
        }
      });

      const cleanup = () => {
        for (const symbol of symbols) {
          try { ws.send(JSON.stringify({ type: 'unsubscribe', symbol })); } catch {}
        }
        ws.close();
        try { controller.close(); } catch {}
      };

      ws.addEventListener('error', cleanup);
      ws.addEventListener('close', () => { try { controller.close(); } catch {} });
      req.signal.addEventListener('abort', cleanup);
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
