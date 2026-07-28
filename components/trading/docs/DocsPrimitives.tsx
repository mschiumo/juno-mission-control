'use client';

import { ReactNode, Children } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Lightbulb, Info, AlertTriangle, Lock } from 'lucide-react';

/**
 * Shared building blocks for the Docs sub-tab. Everything here is presentational:
 * the goal is that every guide reads the same way — same callouts, same step
 * lists, same "open the feature" links — so the docs feel like one manual.
 */

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** A titled section within an article. */
export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Body copy paragraph. */
export function P({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
      {children}
    </p>
  );
}

/** Emphasized inline text (brighter than body copy). */
export function Em({ children }: { children: ReactNode }) {
  return (
    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
      {children}
    </span>
  );
}

/** Bulleted list with docs styling. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <span className="mt-[7px] w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** Numbered step-by-step guide. Children must be <Step> elements. */
export function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="space-y-4">
      {Children.map(children, (child, i) => (
        <li className="flex gap-3">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 num"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--border-default)' }}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">{child}</div>
        </li>
      ))}
    </ol>
  );
}

/** One step inside <Steps>. */
export function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {title}
      </div>
      {children && (
        <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Callouts
// ---------------------------------------------------------------------------

function Callout({
  icon,
  color,
  bg,
  label,
  children,
}: {
  icon: ReactNode;
  color: string;
  bg: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-xl px-4 py-3" style={{ background: bg, border: '1px solid var(--border-subtle)' }}>
      <span className="mt-0.5 shrink-0" style={{ color }}>
        {icon}
      </span>
      <div className="min-w-0 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        <span className="font-semibold mr-1.5" style={{ color }}>
          {label}
        </span>
        {children}
      </div>
    </div>
  );
}

export function Tip({ children }: { children: ReactNode }) {
  return (
    <Callout icon={<Lightbulb className="w-4 h-4" />} color="var(--accent)" bg="var(--accent-dim)" label="Tip">
      {children}
    </Callout>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <Callout icon={<Info className="w-4 h-4" />} color="var(--info)" bg="var(--info-dim)" label="Note">
      {children}
    </Callout>
  );
}

export function Warn({ children }: { children: ReactNode }) {
  return (
    <Callout icon={<AlertTriangle className="w-4 h-4" />} color="var(--warning)" bg="var(--warning-dim)" label="Heads up">
      {children}
    </Callout>
  );
}

// ---------------------------------------------------------------------------
// Inline widgets
// ---------------------------------------------------------------------------

/** Exact on-screen UI text (a button name, a field label) rendered as a chip. */
export function UI({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-px rounded-md text-[13px] font-medium align-baseline"
      style={{ background: 'var(--surface-3)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
    >
      {children}
    </span>
  );
}

/** Keyboard key. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex items-center px-1.5 py-px rounded-md text-xs font-mono align-baseline"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
    >
      {children}
    </kbd>
  );
}

/** Badge marking owner-only features. */
export function OwnerBadge() {
  return (
    <span className="badge badge-warning inline-flex items-center gap-1">
      <Lock className="w-3 h-3" />
      Owner only
    </span>
  );
}

/**
 * Deep link into a Trading sub-tab. `subtab` matches the ?subtab= value;
 * omit it for the Journal tab (which is the default view).
 */
export function FeatureLink({ subtab, children }: { subtab?: string; children: ReactNode }) {
  const href = subtab ? `/?tab=trading&subtab=${subtab}` : '/?tab=trading';
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:brightness-110"
      style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-default)', color: 'var(--accent-light)' }}
    >
      {children}
      <ArrowUpRight className="w-3.5 h-3.5" />
    </Link>
  );
}

/** Inline link to another docs article. */
export function DocLink({ doc, children }: { doc: string; children: ReactNode }) {
  return (
    <Link
      href={`/?tab=trading&subtab=docs&doc=${doc}`}
      className="font-medium underline underline-offset-2 transition-colors"
      style={{ color: 'var(--info)', textDecorationColor: 'var(--border-strong)' }}
    >
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/**
 * Wrapper for illustrative UI mockups. The mock inside is decorative — it is
 * rendered with the app's real design tokens so it always matches the product,
 * but it is inert (no pointer events) and hidden from screen readers; the
 * caption carries the accessible description.
 */
export function Figure({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <figure className="space-y-2">
      {/* The outer div stays interactive so wide figures can scroll horizontally;
          only the mock content itself is inert. */}
      <div
        aria-hidden="true"
        className="rounded-xl p-4 sm:p-5 overflow-x-auto"
        style={{ background: 'var(--bg-base, #050709)', border: '1px solid var(--border-default)' }}
      >
        <div className="pointer-events-none select-none">{children}</div>
      </div>
      <figcaption className="text-xs px-1" style={{ color: 'var(--text-tertiary)' }}>
        {caption}
      </figcaption>
    </figure>
  );
}

/** Simple two-column reference table (label → description). */
export function RefTable({ rows, headers }: { rows: [ReactNode, ReactNode][]; headers?: [string, string] }) {
  return (
    <div className="rounded-xl overflow-hidden overflow-x-auto" style={{ border: '1px solid var(--border-default)' }}>
      <table className="w-full text-sm">
        {headers && (
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {headers[0]}
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                {headers[1]}
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map(([label, desc], i) => (
            <tr key={i} style={{ borderTop: i > 0 || headers ? '1px solid var(--border-subtle)' : undefined }}>
              <td className="px-4 py-2.5 align-top whitespace-nowrap font-medium" style={{ color: 'var(--text-primary)' }}>
                {label}
              </td>
              <td className="px-4 py-2.5 align-top leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
