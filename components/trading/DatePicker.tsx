'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, isTradingDay, weekdayOf } from '@/lib/trading/trading-days';
import { getTodayInEST } from '@/lib/date-utils';

/**
 * Branded date picker used in place of `<input type="date">`.
 *
 * Works purely on YYYY-MM-DD strings (UTC-noon parsing, like the rest of the
 * trading code) so the viewer's timezone never shifts the chosen day. The
 * popover is portalled to <body> so it escapes the modal's scroll clipping.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const POPOVER_WIDTH = 288;
const POPOVER_GAP = 6;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseIso(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function fmtDisplay(iso: string): string {
  const p = parseIso(iso);
  if (!p) return '';
  return `${pad(p.m + 1)}/${pad(p.d)}/${p.y}`;
}

interface DatePickerProps {
  value: string;
  onChange: (iso: string) => void;
  /** Inclusive lower bound (YYYY-MM-DD). Earlier days are disabled. */
  min?: string;
  'aria-label'?: string;
}

export default function DatePicker({ value, onChange, min, 'aria-label': ariaLabel }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const today = useMemo(() => getTodayInEST(), []);
  const selected = parseIso(value);

  // Month shown in the grid. Follows the selected value when the picker opens.
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const base = selected ?? parseIso(today)!;
    return { y: base.y, m: base.m };
  });
  const [focusIso, setFocusIso] = useState<string>(value || today);

  const openPicker = useCallback(() => {
    const base = parseIso(value) ?? parseIso(today)!;
    setView({ y: base.y, m: base.m });
    setFocusIso(value || today);
    setOpen(true);
  }, [value, today]);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Position the popover below the trigger (or above if there's no room).
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const popH = popoverRef.current?.offsetHeight ?? 320;
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow >= popH + POPOVER_GAP || r.top < popH + POPOVER_GAP
      ? r.bottom + POPOVER_GAP
      : r.top - popH - POPOVER_GAP;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8));
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, view, place]);

  // Close on outside click / Escape; re-place on scroll or resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, close, place]);

  // Move keyboard focus to the active day whenever it changes while open.
  useEffect(() => {
    if (!open) return;
    const btn = popoverRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`);
    btn?.focus();
  }, [open, focusIso, view]);

  const isDisabled = useCallback((iso: string) => Boolean(min && iso < min), [min]);

  const pick = (iso: string) => {
    if (isDisabled(iso)) return;
    onChange(iso);
    close();
  };

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  };

  const moveFocus = (deltaDays: number) => {
    const next = addDays(focusIso, deltaDays);
    const p = parseIso(next)!;
    setView({ y: p.y, m: p.m });
    setFocusIso(next);
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); moveFocus(-1); break;
      case 'ArrowRight': e.preventDefault(); moveFocus(1); break;
      case 'ArrowUp': e.preventDefault(); moveFocus(-7); break;
      case 'ArrowDown': e.preventDefault(); moveFocus(7); break;
      case 'PageUp': e.preventDefault(); shiftMonth(-1); break;
      case 'PageDown': e.preventDefault(); shiftMonth(1); break;
      case 'Home': e.preventDefault(); moveFocus(-weekdayOf(focusIso)); break;
      case 'End': e.preventDefault(); moveFocus(6 - weekdayOf(focusIso)); break;
      default: break;
    }
  };

  // Build the 6-row grid (leading/trailing days from adjacent months).
  const cells = useMemo(() => {
    const first = weekdayOf(toIso(view.y, view.m, 1));
    const start = addDays(toIso(view.y, view.m, 1), -first);
    return Array.from({ length: 42 }, (_, i) => {
      const iso = addDays(start, i);
      const p = parseIso(iso)!;
      return { iso, day: p.d, inMonth: p.m === view.m };
    });
  }, [view]);

  const monthLabel = `${MONTHS[view.m]} ${view.y}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-left focus:outline-none transition-colors num"
        style={{
          background: 'var(--surface-2)',
          border: `1px solid ${open ? 'var(--border-focus)' : 'var(--border-default)'}`,
          color: 'var(--text-primary)',
        }}
      >
        <span>{value ? fmtDisplay(value) : 'Pick a date'}</span>
        <CalendarDays className="w-4 h-4 shrink-0" style={{ color: '#FFFFFF' }} aria-hidden />
      </button>

      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={ariaLabel ? `${ariaLabel} calendar` : 'Calendar'}
            className="fixed z-[60] rounded-xl p-3 select-none"
            style={{
              top: pos.top,
              left: pos.left,
              width: POPOVER_WIDTH,
              background: 'var(--surface-3)',
              border: '1px solid var(--border-strong)',
              boxShadow: '0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,107,0,0.08)',
            }}
          >
            {/* Month header */}
            <div className="flex items-center justify-between mb-2">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
                className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }} aria-live="polite">
                {monthLabel}
              </div>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
                className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Weekday labels */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((w, i) => (
                <div
                  key={i}
                  className="text-center text-[10px] font-medium uppercase tracking-wider py-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-y-0.5" role="grid" onKeyDown={onGridKey}>
              {cells.map(({ iso, day, inMonth }) => {
                const isSelected = iso === value;
                const isToday = iso === today;
                const disabled = isDisabled(iso);
                const offDay = !isTradingDay(iso);
                const tabbable = iso === focusIso;

                let color = 'var(--text-primary)';
                if (disabled) color = 'var(--text-disabled)';
                else if (!inMonth) color = 'var(--text-tertiary)';
                else if (offDay) color = 'var(--text-secondary)';
                if (isSelected) color = '#FFFFFF';
                else if (isToday && !disabled) color = 'var(--accent-light)';

                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    data-iso={iso}
                    tabIndex={tabbable ? 0 : -1}
                    disabled={disabled}
                    aria-selected={isSelected}
                    aria-label={fmtDisplay(iso)}
                    onClick={() => pick(iso)}
                    onFocus={() => setFocusIso(iso)}
                    className={`h-9 w-full rounded-lg text-xs num transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] ${
                      disabled ? 'cursor-not-allowed' : isSelected ? '' : 'hover:bg-[var(--surface-hover)]'
                    }`}
                    style={{
                      color,
                      background: isSelected ? 'var(--accent)' : 'transparent',
                      fontWeight: isSelected || isToday ? 600 : 400,
                      boxShadow: isToday && !isSelected ? 'inset 0 0 0 1px rgba(255,107,0,0.45)' : undefined,
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between mt-2 pt-2"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                Dimmed days are weekends &amp; market holidays
              </span>
              <button
                type="button"
                onClick={() => pick(today)}
                disabled={isDisabled(today)}
                className="text-xs font-medium px-2 py-1 rounded-md transition-colors hover:bg-[var(--accent-dim)] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: 'var(--accent-light)' }}
              >
                Today
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
