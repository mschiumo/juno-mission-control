import { describe, expect, it } from 'vitest';
import { unwrapOrder } from '@/lib/confluence/broker/live-adapter';
import { payloadSnippet } from '@/lib/confluence/robinhood/mcp-client';

const order = { id: 'abc-123', state: 'confirmed' };

describe('unwrapOrder', () => {
  it('finds the order under every known wrapping', () => {
    expect(unwrapOrder(order)?.id).toBe('abc-123');
    expect(unwrapOrder({ data: order })?.id).toBe('abc-123');
    expect(unwrapOrder({ order })?.id).toBe('abc-123');
    expect(unwrapOrder({ data: { order } })?.id).toBe('abc-123');
  });

  it('accepts order_id as the id field', () => {
    expect(unwrapOrder({ data: { order_id: 'x-9' } })?.order_id).toBe('x-9');
  });

  it('returns null for shapes with no order id (never fabricates one)', () => {
    expect(unwrapOrder(null)).toBeNull();
    expect(unwrapOrder({})).toBeNull();
    expect(unwrapOrder({ data: { state: 'confirmed' } })).toBeNull();
    expect(unwrapOrder({ success: true })).toBeNull();
  });
});

describe('payloadSnippet', () => {
  it('stringifies objects and truncates long payloads', () => {
    expect(payloadSnippet({ a: 1 })).toBe('{"a":1}');
    const long = 'x'.repeat(1000);
    const out = payloadSnippet(long, 100);
    expect(out.length).toBeLessThan(140);
    expect(out).toContain('(1000 chars)');
  });

  it('handles empty and unserializable values', () => {
    expect(payloadSnippet('')).toBe('(empty)');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(typeof payloadSnippet(circular)).toBe('string');
  });
});
