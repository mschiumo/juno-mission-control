'use client';

/**
 * Read-only view of the immutable audit trail: every proposal → decision →
 * order transition, newest first. Actor is colour-coded (agent / user / system)
 * so the human-gate boundary is legible at a glance.
 */

import { Bot, User, Cog } from 'lucide-react';
import type { AuditEvent, AuditActor } from '@/types/confluence';

interface Props {
  events: AuditEvent[];
}

function actorMeta(actor: AuditActor): { Icon: typeof Bot; color: string; label: string } {
  switch (actor) {
    case 'agent':
      return { Icon: Bot, color: 'var(--info)', label: 'agent' };
    case 'user':
      return { Icon: User, color: 'var(--accent-light)', label: 'you' };
    default:
      return { Icon: Cog, color: 'var(--text-secondary)', label: 'system' };
  }
}

export default function AuditLog({ events }: Props) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
        Audit Log
        <span className="ml-2 text-[11px] font-normal" style={{ color: 'var(--text-tertiary)' }}>
          immutable · newest first
        </span>
      </h3>

      {events.length === 0 ? (
        <p className="text-[13px] py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>
          No events yet.
        </p>
      ) : (
        <ol className="relative">
          {events.map((e) => {
            const { Icon, color, label } = actorMeta(e.actor);
            return (
              <li key={e.id} className="flex gap-3 pb-3.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color }}>
                      {label}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                      {new Date(e.ts).toLocaleString()}
                    </span>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-tertiary)' }}
                    >
                      {e.type}
                    </span>
                  </div>
                  <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {e.summary}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
