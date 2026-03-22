type PriceCallback = (prices: Record<string, number>) => void;

class PriceBus {
  private ws: WebSocket | null = null;
  private symbolSubscribers = new Map<string, Set<PriceCallback>>();
  private reconnectDelay = 1000;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.connect();
  }

  private connect() {
    console.log('[PriceBus] Opening Finnhub WebSocket');
    const ws = new WebSocket(`wss://ws.finnhub.io?token=${this.apiKey}`);
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.reconnectDelay = 1000;
      console.log('[PriceBus] WebSocket connected');
      for (const symbol of this.symbolSubscribers.keys()) {
        if ((this.symbolSubscribers.get(symbol)?.size ?? 0) > 0) {
          ws.send(JSON.stringify({ type: 'subscribe', symbol }));
        }
      }
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type !== 'trade' || !Array.isArray(msg.data)) return;

        const latest: Record<string, number> = {};
        for (const tick of msg.data) {
          latest[tick.s] = tick.p;
        }

        // Collect unique callbacks subscribed to any updated symbol
        const toNotify = new Set<PriceCallback>();
        for (const symbol of Object.keys(latest)) {
          const subs = this.symbolSubscribers.get(symbol);
          if (subs) {
            for (const cb of subs) toNotify.add(cb);
          }
        }

        for (const cb of toNotify) {
          try { cb(latest); } catch {}
        }
      } catch {}
    });

    ws.addEventListener('close', () => {
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
    for (const symbol of symbols) {
      if (!this.symbolSubscribers.has(symbol)) {
        this.symbolSubscribers.set(symbol, new Set());
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
        }
      }
      this.symbolSubscribers.get(symbol)!.add(callback);
    }
    console.log(`[PriceBus] +subscriber for [${symbols.join(', ')}] — total connections: ${this.subscriberCount}, symbols tracked: ${this.symbolSubscribers.size}`);
  }

  unsubscribe(symbols: string[], callback: PriceCallback) {
    for (const symbol of symbols) {
      const subs = this.symbolSubscribers.get(symbol);
      if (!subs) continue;
      subs.delete(callback);
      if (subs.size === 0) {
        this.symbolSubscribers.delete(symbol);
        if (this.ws?.readyState === WebSocket.OPEN) {
          try { this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol })); } catch {}
        }
      }
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
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  if (!global.__priceBus) {
    console.log('[PriceBus] Creating singleton');
    global.__priceBus = new PriceBus(apiKey);
  } else {
    console.log('[PriceBus] Reusing existing singleton');
  }
  return global.__priceBus;
}
