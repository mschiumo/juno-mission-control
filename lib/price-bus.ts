type PriceCallback = (prices: Record<string, number>) => void;

class PriceBus {
  private ws: WebSocket | null = null;
  private symbolSubscribers = new Map<string, Set<PriceCallback>>();
  private reconnectDelay = 1000;
  private apiKey: string;
  private authenticated = false;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.connect();
  }

  private connect() {
    this.authenticated = false;
    console.log('[PriceBus] Opening Polygon WebSocket');
    const ws = new WebSocket('wss://socket.polygon.io/stocks');
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectDelay = 1000;
      console.log('[PriceBus] WebSocket connected, authenticating...');
      ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }));
    });

    ws.addEventListener('message', (event) => {
      try {
        const messages = JSON.parse(event.data as string);
        if (!Array.isArray(messages)) return;

        for (const msg of messages) {
          // Handle auth response
          if (msg.ev === 'status') {
            if (msg.status === 'auth_success') {
              this.authenticated = true;
              console.log('[PriceBus] Authenticated with Polygon');
              // Re-subscribe to all active symbols
              const symbols = [...this.symbolSubscribers.keys()].filter(
                (s) => (this.symbolSubscribers.get(s)?.size ?? 0) > 0
              );
              if (symbols.length > 0) {
                ws.send(JSON.stringify({
                  action: 'subscribe',
                  params: symbols.map((s) => `T.${s}`).join(','),
                }));
              }
            } else if (msg.status === 'auth_failed') {
              console.error('[PriceBus] Polygon auth failed:', msg.message);
            }
            continue;
          }

          // Handle trade events — ev: "T", sym: "AAPL", p: 150.25
          if (msg.ev === 'T' && msg.sym && typeof msg.p === 'number') {
            const symbol = msg.sym;
            const price = msg.p;

            const subs = this.symbolSubscribers.get(symbol);
            if (subs) {
              const update = { [symbol]: price };
              for (const cb of subs) {
                try { cb(update); } catch {}
              }
            }
          }
        }
      } catch {}
    });

    ws.addEventListener('close', () => {
      this.authenticated = false;
      console.log(`[PriceBus] WebSocket closed, reconnecting in ${this.reconnectDelay}ms`);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      setTimeout(() => this.connect(), this.reconnectDelay);
    });

    ws.addEventListener('error', () => {
      ws.close();
    });
  }

  private get subscriberCount() {
    let total = 0;
    for (const subs of this.symbolSubscribers.values()) total += subs.size;
    return total;
  }

  subscribe(symbols: string[], callback: PriceCallback) {
    const newSymbols: string[] = [];
    for (const symbol of symbols) {
      if (!this.symbolSubscribers.has(symbol)) {
        this.symbolSubscribers.set(symbol, new Set());
        newSymbols.push(symbol);
      }
      this.symbolSubscribers.get(symbol)!.add(callback);
    }
    if (newSymbols.length > 0 && this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        params: newSymbols.map((s) => `T.${s}`).join(','),
      }));
    }
    console.log(`[PriceBus] +subscriber for [${symbols.join(', ')}] — total connections: ${this.subscriberCount}, symbols tracked: ${this.symbolSubscribers.size}`);
  }

  unsubscribe(symbols: string[], callback: PriceCallback) {
    const removedSymbols: string[] = [];
    for (const symbol of symbols) {
      const subs = this.symbolSubscribers.get(symbol);
      if (!subs) continue;
      subs.delete(callback);
      if (subs.size === 0) {
        this.symbolSubscribers.delete(symbol);
        removedSymbols.push(symbol);
      }
    }
    if (removedSymbols.length > 0 && this.authenticated && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          action: 'unsubscribe',
          params: removedSymbols.map((s) => `T.${s}`).join(','),
        }));
      } catch {}
    }
    console.log(`[PriceBus] -subscriber for [${symbols.join(', ')}] — total connections: ${this.subscriberCount}, symbols tracked: ${this.symbolSubscribers.size}`);
  }
}

// Global singleton — shared across all requests within a server instance.
// Uses global to survive Next.js hot-reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __priceBus: PriceBus | undefined;
}

export function getPriceBus(): PriceBus | null {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;
  if (!global.__priceBus) {
    console.log('[PriceBus] Creating singleton');
    global.__priceBus = new PriceBus(apiKey);
  } else {
    console.log('[PriceBus] Reusing existing singleton');
  }
  return global.__priceBus;
}
