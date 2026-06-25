'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  Pencil,
  Send,
  RotateCcw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  CornerUpLeft,
  MessagesSquare,
  ChevronRight,
  X,
  Paperclip,
  Download,
  Copy,
  ExternalLink,
} from 'lucide-react';
import type { ActivityEvent, ActivityKind, Goal, GoalResource } from '@/lib/goals/types';
import { activityActorMeta, activityKindColor, timeAgo } from './shared';

const KIND_ICON: Record<ActivityKind, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  created: Plus,
  updated: Pencil,
  handoff: Send,
  recall: RotateCcw,
  progress: Activity,
  completed: CheckCircle2,
  reopened: RotateCcw,
  blocked: AlertTriangle,
  help_request: HelpCircle,
  help_answer: CornerUpLeft,
  resource: Paperclip,
};

const KIND_LABEL: Record<ActivityKind, string> = {
  created: 'Created',
  updated: 'Updated',
  handoff: 'Handed off',
  recall: 'Recalled',
  progress: 'Progress',
  completed: 'Completed',
  reopened: 'Reopened',
  blocked: 'Blocked',
  help_request: 'Needs input',
  help_answer: 'Replied',
  resource: 'Resource',
};

export interface FeedResource {
  goalId: string;
  goalTitle: string;
  resource: GoalResource;
}

type ModalItem =
  | { type: 'event'; event: ActivityEvent }
  | { type: 'help'; goal: Goal }
  | { type: 'resource'; resource: GoalResource; goalTitle: string };

// ── Structured text: turn dense "1) … 2) … - …" messages into lists/paragraphs ──

type Block = { type: 'p'; text: string } | { type: 'ul'; items: string[] } | { type: 'ol'; items: string[] };

function parseBlocks(raw: string): Block[] {
  const text = raw
    .replace(/\s+(\d{1,2}[).]\s)/g, '\n$1') // break run-on "… 2) …" onto its own line
    .replace(/\s+([•‣]\s)/g, '\n$1'); // break inline bullet glyphs
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ type: 'p', text: para.join(' ') });
      para = [];
    }
  };
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const ol = line.match(/^\d{1,2}[).]\s+(.*)/);
    const ul = line.match(/^[-•‣*]\s+(.*)/);
    const last = blocks[blocks.length - 1];
    if (ol) {
      flush();
      if (last && last.type === 'ol') last.items.push(ol[1]);
      else blocks.push({ type: 'ol', items: [ol[1]] });
    } else if (ul) {
      flush();
      if (last && last.type === 'ul') last.items.push(ul[1]);
      else blocks.push({ type: 'ul', items: [ul[1]] });
    } else {
      para.push(line);
    }
  }
  flush();
  return blocks;
}

function StructuredText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
      {blocks.map((b, i) =>
        b.type === 'p' ? (
          <p key={i} className="whitespace-pre-wrap break-words">
            {b.text}
          </p>
        ) : b.type === 'ol' ? (
          <ol key={i} className="list-decimal pl-5 space-y-1">
            {b.items.map((it, j) => (
              <li key={j} className="break-words">
                {it}
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="list-disc pl-5 space-y-1">
            {b.items.map((it, j) => (
              <li key={j} className="break-words">
                {it}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'resource.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Detail modal — full (structured) text for an activity row, the question + reply
 *  box for a help request, or a viewer (open / download) for a resource.
 *  Portaled to <body> so the Goals card can't clip it. */
function FeedModal({ item, onClose, onAnswer }: { item: ModalItem; onClose: () => void; onAnswer: (goal: Goal, text: string) => void }) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);

  let HeaderIcon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  let headerColor: string;
  let headerTitle: string;
  let goalTitle: string | undefined;

  if (item.type === 'help') {
    HeaderIcon = HelpCircle;
    headerColor = 'var(--warning)';
    headerTitle = 'Needs your input';
    goalTitle = item.goal.title;
  } else if (item.type === 'resource') {
    HeaderIcon = Paperclip;
    headerColor = 'var(--info)';
    headerTitle = item.resource.title;
    goalTitle = item.goalTitle;
  } else {
    HeaderIcon = KIND_ICON[item.event.kind] ?? Activity;
    headerColor = activityKindColor[item.event.kind] ?? 'var(--text-secondary)';
    headerTitle = `${activityActorMeta[item.event.actor].icon} ${activityActorMeta[item.event.actor].label} · ${KIND_LABEL[item.event.kind]}`;
    goalTitle = item.event.goalTitle;
  }

  const submitReply = () => {
    if (item.type === 'help' && text.trim()) {
      onAnswer(item.goal, text.trim());
      onClose();
    }
  };

  const content = (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 animate-backdrop-in">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-2xl animate-zoom-in"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
            >
              <HeaderIcon className="w-4 h-4" style={{ color: headerColor }} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {headerTitle}
              </h3>
              {goalTitle && (
                <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {goalTitle}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {item.type === 'resource' ? (
            <div className="space-y-3">
              {item.resource.url && (
                <a
                  href={item.resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm break-all"
                  style={{ color: 'var(--info)' }}
                >
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> {item.resource.url}
                </a>
              )}
              {item.resource.content && (
                <div
                  className="rounded-xl p-3 text-xs whitespace-pre-wrap break-words font-mono"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', maxHeight: '46vh', overflowY: 'auto' }}
                >
                  {item.resource.content}
                </div>
              )}
              {!item.resource.url && !item.resource.content && (
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  No preview available.
                </p>
              )}
            </div>
          ) : (
            <StructuredText text={item.type === 'help' ? item.goal.helpRequest?.question ?? '' : item.event.message} />
          )}
        </div>

        <div className="flex-shrink-0 px-5 py-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {item.type === 'help' ? (
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitReply()}
                placeholder="Reply to Claude…"
                autoFocus
                className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
                onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-default)')}
              />
              <button
                onClick={submitReply}
                disabled={!text.trim()}
                className="px-3 rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-1"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                <Send className="w-3.5 h-3.5" /> Send
              </button>
            </div>
          ) : item.type === 'resource' ? (
            <div className="flex items-center justify-end gap-2">
              {item.resource.content && (
                <>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(item.resource.content ?? '');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}
                  >
                    <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => downloadText(item.resource.filename || `${item.resource.title}.md`, item.resource.content ?? '')}
                    className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </>
              )}
              {item.resource.url && !item.resource.content && (
                <a
                  href={item.resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-1.5"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open link
                </a>
              )}
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                Close
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[11px] num" style={{ color: 'var(--text-tertiary)' }}>
                {timeAgo(item.event.at)}
              </span>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}

export default function GoalActivityFeed({
  events,
  helpGoals,
  resources,
  onAnswer,
  loading,
}: {
  events: ActivityEvent[];
  helpGoals: Goal[];
  resources: FeedResource[];
  onAnswer: (goal: Goal, text: string) => void;
  loading?: boolean;
}) {
  const [modal, setModal] = useState<ModalItem | null>(null);
  const ordered = [...events].reverse(); // newest first

  return (
    <div className="mt-5 rounded-2xl p-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-2 mb-3">
        <MessagesSquare className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Collaboration activity
        </h3>
      </div>

      {helpGoals.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--warning)' }}>
            Needs your input
          </div>
          {helpGoals.map((g) => (
            <button
              key={g.id}
              onClick={() => setModal({ type: 'help', goal: g })}
              className="w-full flex items-center gap-2 text-left rounded-xl px-3 py-2"
              style={{ background: 'var(--warning-dim)', border: '1px solid var(--warning)' }}
            >
              <HelpCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--warning)' }} />
              <span className="min-w-0 flex-1">
                <span className="text-xs font-semibold block truncate" style={{ color: 'var(--text-primary)' }}>
                  {g.title}
                </span>
                <span className="text-[11px] block truncate" style={{ color: 'var(--text-secondary)' }}>
                  {g.helpRequest?.question}
                </span>
              </span>
              <span className="text-[11px] inline-flex items-center gap-0.5 flex-shrink-0 font-medium" style={{ color: 'var(--warning)' }}>
                Reply <ChevronRight className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {resources.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--info)' }}>
            Resources
          </div>
          {resources.map(({ goalId, goalTitle, resource }) => (
            <button
              key={`${goalId}-${resource.id}`}
              onClick={() => setModal({ type: 'resource', resource, goalTitle })}
              className="w-full flex items-center gap-2 text-left rounded-xl px-3 py-2 transition-colors"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--info)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
            >
              <Paperclip className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--info)' }} />
              <span className="min-w-0 flex-1">
                <span className="text-xs font-semibold block truncate" style={{ color: 'var(--text-primary)' }}>
                  {resource.title}
                </span>
                <span className="text-[11px] block truncate" style={{ color: 'var(--text-tertiary)' }}>
                  {goalTitle}
                </span>
              </span>
              <span className="text-[11px] inline-flex items-center gap-0.5 flex-shrink-0 font-medium" style={{ color: 'var(--info)' }}>
                {resource.url && !resource.content ? 'Open' : 'View'} <ChevronRight className="w-3 h-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>
        Recent activity
      </div>
      {loading && events.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Loading…
        </div>
      ) : ordered.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
          No activity yet — hand a task to Claude or update one to see it here.
        </div>
      ) : (
        <ol className="space-y-0.5 max-h-80 overflow-y-auto">
          {ordered.map((e) => {
            const actor = activityActorMeta[e.actor];
            const Icon = KIND_ICON[e.kind] ?? Activity;
            const color = activityKindColor[e.kind] ?? 'var(--text-secondary)';
            return (
              <li key={e.id}>
                <button
                  onClick={() => setModal({ type: 'event', event: e })}
                  className="w-full flex items-center gap-2.5 text-left rounded-lg px-1.5 py-1.5 transition-colors"
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                >
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color }} />
                  </span>
                  <span className="min-w-0 flex-1 text-sm truncate">
                    <span style={{ color: actor.color }}>
                      {actor.icon} {actor.label}
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}> · {e.message}</span>
                  </span>
                  <span className="text-[11px] flex-shrink-0 num" style={{ color: 'var(--text-tertiary)' }}>
                    {timeAgo(e.at)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {modal && (
        <FeedModal
          key={modal.type === 'help' ? `h-${modal.goal.id}` : modal.type === 'resource' ? `r-${modal.resource.id}` : `e-${modal.event.id}`}
          item={modal}
          onClose={() => setModal(null)}
          onAnswer={onAnswer}
        />
      )}
    </div>
  );
}
