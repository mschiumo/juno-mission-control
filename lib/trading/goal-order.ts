/**
 * Trading Goals — display order
 *
 * Goals are stored in one list per user; the trader can drag-and-drop to
 * arrange them. Arrangement is persisted as `sortOrder` (position in the full
 * list), so a goal keeps its place relative to its neighbours even as it moves
 * between the Active / Achieved / Missed sections when its window closes.
 */

import type { TradingGoal } from '@/types/trading-goals';

type Orderable = Pick<TradingGoal, 'sortOrder' | 'createdAt'>;

/**
 * Comparator for display order. Arranged goals keep their `sortOrder`; goals
 * created since the last arrangement have none and float to the top, newest
 * first, so a fresh goal is never buried under an old arrangement.
 */
export function compareGoalOrder(a: Orderable, b: Orderable): number {
  const ao = a.sortOrder;
  const bo = b.sortOrder;
  if (ao === undefined && bo === undefined) return a.createdAt < b.createdAt ? 1 : -1;
  if (ao === undefined) return -1;
  if (bo === undefined) return 1;
  return ao - bo;
}

/**
 * Move `fromId` into `toId`'s slot within one section, leaving every goal
 * outside that section exactly where it was.
 *
 * @param order    every goal id, in current display order
 * @param section  the ids of the section the drag happened in (same relative order)
 * @returns the new full order, or null when the move is a no-op or either id
 *          isn't in the section (drags never cross sections)
 */
export function moveWithinSection(order: string[], section: string[], fromId: string, toId: string): string[] | null {
  const from = section.indexOf(fromId);
  const to = section.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = section.slice();
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  const slots = new Set(section);
  let k = 0;
  return order.map((id) => (slots.has(id) ? next[k++] : id));
}
