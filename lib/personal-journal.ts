/**
 * Shared reader for the personal (mindset/goals) Dashboard journal.
 *
 * Entries live at `personal-journal:{userId}:{YYYY-MM-DD}` as hashes — fully
 * separate from the trading `daily-journal:` store. Dates are plain calendar
 * strings, so range filtering is string comparison; never re-parse them through
 * a timeZone override (that shifts the day for viewers east of ET).
 */

import { getRedisClient } from '@/lib/redis';

export interface PersonalJournalPrompt {
  id: string;
  question: string;
  answer: string;
}

export interface PersonalJournalEntry {
  id: string;
  date: string;
  prompts: PersonalJournalPrompt[];
  createdAt: string;
  updatedAt: string;
}

/** Every entry with `startDate <= date <= endDate`, oldest first. */
export async function fetchPersonalJournalEntries(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<PersonalJournalEntry[]> {
  const redis = await getRedisClient();
  const keys = await redis.keys(`personal-journal:${userId}:*`);

  const inRange = keys.filter((key) => {
    const date = key.slice(`personal-journal:${userId}:`.length);
    return date >= startDate && date <= endDate;
  });

  const entries: PersonalJournalEntry[] = [];
  for (const key of inRange) {
    const data = await redis.hGetAll(key);
    if (!data?.id) continue;
    let prompts: PersonalJournalPrompt[] = [];
    try {
      prompts = JSON.parse(data.prompts || '[]');
    } catch {
      /* malformed entry — keep the date, drop the prompts */
    }
    entries.push({
      id: data.id,
      date: data.date,
      prompts,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return entries;
}

/** Markdown-ish rendering of the entries, for feeding to the model. */
export function summarizeJournalEntries(entries: PersonalJournalEntry[]): string {
  const lines: string[] = [`## Journal Entries (${entries.length} total)\n`];
  for (const entry of entries) {
    lines.push(`### ${entry.date}`);
    for (const prompt of entry.prompts) {
      if (prompt.answer?.trim()) {
        lines.push(`**${prompt.question}**`);
        lines.push(prompt.answer.trim());
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
