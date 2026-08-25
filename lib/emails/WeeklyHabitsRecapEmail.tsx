import { Section, Text, Row, Column } from '@react-email/components';
import * as React from 'react';
import { EmailLayout } from './EmailLayout';
import type { HabitWeek, HabitWeekRow, HabitsRecapAnalysis } from '@/lib/habits-weekly';

export interface WeeklyHabitsRecapEmailProps {
  week: HabitWeek;
  journalEntriesCount: number;
  analysis: HabitsRecapAnalysis | null;
  rawAnalysis: string;
}

const GREEN = '#22C55E';
const AMBER = '#D29922';
const RED = '#EF4444';
const ORANGE = '#FF8C38';
const INDIGO = '#818CF8';

function statusColor(status: HabitWeekRow['status']): string {
  return status === 'complete' ? GREEN : status === 'partial' ? AMBER : RED;
}

function statusLabel(row: HabitWeekRow): string {
  if (row.status === 'complete') return 'Done';
  if (row.status === 'partial') return `${row.completions}/${row.goal}`;
  return '0/' + row.goal;
}

function HabitRow({ row }: { row: HabitWeekRow }) {
  const color = statusColor(row.status);
  return (
    <Row style={{ marginBottom: '8px' }}>
      <Column>
        <Text style={habitName}>
          <span style={{ marginRight: '6px' }}>{row.icon}</span>
          {row.name}
          <span style={freqChip}>{row.frequencyLabel}</span>
        </Text>
      </Column>
      <Column style={{ textAlign: 'right' as const, verticalAlign: 'top', width: '90px' }}>
        <Text style={{ ...habitStatus, color }}>{statusLabel(row)}</Text>
      </Column>
    </Row>
  );
}

export function WeeklyHabitsRecapEmail({
  week,
  journalEntriesCount,
  analysis,
  rawAnalysis,
}: WeeklyHabitsRecapEmailProps) {
  const rateColor = week.completionRate >= 70 ? GREEN : week.completionRate >= 40 ? AMBER : RED;
  const complete = week.rows.filter((r) => r.status === 'complete');
  const partial = week.rows.filter((r) => r.status === 'partial');
  const missed = week.rows.filter((r) => r.status === 'missed');

  return (
    <EmailLayout previewText={`Habits recap — ${week.rangeLabel} · ${week.completionRate}% of goals met`}>
      <Section style={card}>
        <Text style={kicker}>Weekly Habits Recap</Text>
        <Text style={title}>{week.rangeLabel}</Text>
        <Text style={subtitle}>Monday through Sunday · Dashboard habits</Text>
      </Section>

      {/* Stats row */}
      <Section style={card}>
        <Row>
          <Column style={statCol}>
            <Text style={statLabel}>Goals Met</Text>
            <Text style={{ ...statValue, color: rateColor }}>{week.completionRate}%</Text>
          </Column>
          <Column style={statCol}>
            <Text style={statLabel}>Habits Hit</Text>
            <Text style={statValue}>
              {week.completed}/{week.rows.length}
            </Text>
          </Column>
          <Column style={statCol}>
            <Text style={statLabel}>Active Days</Text>
            <Text style={statValue}>{week.activeDays}/7</Text>
          </Column>
          <Column style={statCol}>
            <Text style={statLabel}>Journal Entries</Text>
            <Text style={statValue}>{journalEntriesCount}</Text>
          </Column>
        </Row>
      </Section>

      {analysis && (
        <>
          <Section style={takeawayCard}>
            <Text style={sectionHeading}>Key Takeaway</Text>
            <Text style={takeawayText}>{analysis.keyTakeaway}</Text>
          </Section>

          <InsightSection title="Wins" items={analysis.wins} accent={GREEN} />
          <InsightSection title="Where It Slipped" items={analysis.gaps} accent={ORANGE} />
          <InsightSection title="From Your Journal" items={analysis.journalThemes} accent={INDIGO} />
          <InsightSection title="Focus for Next Week" items={analysis.focusNextWeek} accent={AMBER} />
        </>
      )}
      {!analysis && rawAnalysis && (
        <Section style={card}>
          <Text style={sectionHeading}>Analysis</Text>
          <Text style={bulletText}>{rawAnalysis}</Text>
        </Section>
      )}

      {/* Habit-by-habit rundown */}
      {complete.length > 0 && (
        <Section style={card}>
          <Text style={{ ...sectionHeading, color: GREEN }}>Completed ({complete.length})</Text>
          {complete.map((row) => (
            <HabitRow key={row.id} row={row} />
          ))}
        </Section>
      )}
      {partial.length > 0 && (
        <Section style={card}>
          <Text style={{ ...sectionHeading, color: AMBER }}>Partial ({partial.length})</Text>
          {partial.map((row) => (
            <HabitRow key={row.id} row={row} />
          ))}
        </Section>
      )}
      {missed.length > 0 && (
        <Section style={card}>
          <Text style={{ ...sectionHeading, color: RED }}>Untouched ({missed.length})</Text>
          {missed.map((row) => (
            <HabitRow key={row.id} row={row} />
          ))}
        </Section>
      )}
      {week.monthlyRows.length > 0 && (
        <Section style={card}>
          <Text style={sectionHeading}>Monthly Habits (month-to-date)</Text>
          {week.monthlyRows.map((row) => (
            <HabitRow key={row.id} row={row} />
          ))}
        </Section>
      )}
    </EmailLayout>
  );
}

function InsightSection({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent: string;
}) {
  if (items.length === 0) return null;
  return (
    <Section style={card}>
      <Text style={{ ...sectionHeading, color: accent }}>{title}</Text>
      {items.map((item, i) => (
        <Text key={i} style={bulletText}>
          <span style={{ color: accent }}>•</span>&nbsp;&nbsp;{item}
        </Text>
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles — Dark Precision palette (matches WeeklyJournalInsights)    */
/* ------------------------------------------------------------------ */

const card: React.CSSProperties = {
  backgroundColor: '#0B0F14',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '20px 24px',
  marginBottom: '14px',
};

const takeawayCard: React.CSSProperties = {
  ...card,
  border: '1px solid rgba(255,107,0,0.35)',
  backgroundColor: 'rgba(255,107,0,0.06)',
};

const kicker: React.CSSProperties = {
  color: ORANGE,
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  margin: '0 0 4px',
};

const title: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '20px',
  fontWeight: 700,
  margin: '0 0 2px',
};

const subtitle: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '12px',
  margin: 0,
};

const statCol: React.CSSProperties = {
  textAlign: 'center' as const,
  verticalAlign: 'top',
};

const statLabel: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '0 0 4px',
};

const statValue: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '16px',
  fontWeight: 700,
  margin: 0,
};

const sectionHeading: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  margin: '0 0 10px',
};

const takeawayText: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '14px',
  lineHeight: '22px',
  margin: 0,
};

const bulletText: React.CSSProperties = {
  color: '#A0AEC0',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 8px',
};

const habitName: React.CSSProperties = {
  color: '#EEF2F7',
  fontSize: '13px',
  lineHeight: '20px',
  margin: 0,
};

const freqChip: React.CSSProperties = {
  color: '#4A5568',
  fontSize: '11px',
  marginLeft: '8px',
};

const habitStatus: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: '20px',
  margin: 0,
};
