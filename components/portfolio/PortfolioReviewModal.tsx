'use client';

/**
 * Weekly portfolio review modal — the click-in report view, modeled on the
 * Journal Insights report modal (components/trading/JournalInsightsView.tsx):
 * the review list shows compact tiles, and this modal renders the full
 * structured report. Styled with the app's CSS tokens to match the Portfolio
 * tab rather than the trading hexes.
 */

import { useEffect } from 'react';
import { X, Lightbulb, HeartPulse, SearchCheck, Eye, Sparkles } from 'lucide-react';

export interface PortfolioReview {
  periodKey: string;
  periodLabel: string;
  generatedAt: string;
  analysis: string;
  totalValue: number | null;
  weekChange: number | null;
  positionsCount: number;
}

export interface StructuredPortfolioReview {
  keyTakeaway: string;
  health: string[];
  repositioning: string[];
  watch: string[];
}

/** Extract the structured JSON object from the stored analysis text. */
export function parsePortfolioReview(raw: string): StructuredPortfolioReview | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed.keyTakeaway && Array.isArray(parsed.health)) {
      return {
        keyTakeaway: parsed.keyTakeaway,
        health: parsed.health,
        repositioning: Array.isArray(parsed.repositioning) ? parsed.repositioning : [],
        watch: Array.isArray(parsed.watch) ? parsed.watch : [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

const usd0 = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function BulletList({ items, color }: { items: string[]; color: string }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionCard({
  icon,
  title,
  color,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  color: string;
  items: string[];
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color }}>
          {title}
        </span>
      </div>
      <BulletList items={items} color={color} />
    </div>
  );
}

export default function PortfolioReviewModal({
  review,
  onClose,
}: {
  review: PortfolioReview;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const structured = parsePortfolioReview(review.analysis);
  const changeColor =
    (review.weekChange ?? 0) > 0
      ? 'var(--positive)'
      : (review.weekChange ?? 0) < 0
        ? 'var(--negative)'
        : 'var(--text-secondary)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)' }}
      >
        {/* Sticky header */}
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 py-4"
          style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {review.periodLabel} Portfolio Review
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {review.positionsCount} positions
              {review.totalValue != null && <> · {usd0(review.totalValue)}</>}
              {review.weekChange != null && (
                <>
                  {' '}
                  · <span style={{ color: changeColor }}>
                    {review.weekChange >= 0 ? '+' : ''}
                    {usd0(review.weekChange)} this week
                  </span>
                </>
              )}
              {' '}· generated{' '}
              {new Date(review.generatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close review"
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {structured ? (
            <>
              <div
                className="rounded-lg px-4 py-3.5"
                style={{ background: 'var(--accent-dim)', border: '1px solid rgba(255,107,0,0.3)' }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Lightbulb className="w-3.5 h-3.5" style={{ color: 'var(--accent-light)' }} />
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent-light)' }}>
                    Key Takeaway
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                  {structured.keyTakeaway}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SectionCard
                  icon={<HeartPulse className="w-3.5 h-3.5" style={{ color: 'var(--info)' }} />}
                  title="Portfolio Health"
                  color="var(--info)"
                  items={structured.health}
                />
                <SectionCard
                  icon={<SearchCheck className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />}
                  title="Worth a Closer Look"
                  color="var(--warning)"
                  items={structured.repositioning}
                />
              </div>

              {structured.watch.length > 0 && (
                <SectionCard
                  icon={<Eye className="w-3.5 h-3.5" style={{ color: 'var(--accent-light)' }} />}
                  title="Watching Next Week"
                  color="var(--accent-light)"
                  items={structured.watch}
                />
              )}
            </>
          ) : (
            <p className="text-xs whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
              {review.analysis}
            </p>
          )}

          <div
            className="flex items-center gap-2 pt-3 text-[11px]"
            style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}
          >
            <Sparkles className="w-3 h-3 flex-shrink-0" />
            AI-generated analysis of your own account data — a reflective tool, not financial advice.
          </div>
        </div>
      </div>
    </div>
  );
}
