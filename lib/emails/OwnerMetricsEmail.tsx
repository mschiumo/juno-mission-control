/**
 * Daily account-metrics digest for the owner. Rendered by the
 * owner-metrics-digest cron; the numbers come from computeAccountMetrics(),
 * the same source as the in-app Accounts tab.
 */

import { Section, Text, Row, Column, Hr } from '@react-email/components';
import { EmailLayout } from './EmailLayout';
import type { AccountMetrics } from '@/lib/admin-metrics';

const EVENT_LABELS: Record<string, string> = {
  signup: 'New signup',
  trial_started: 'Trial started',
  referral_redeemed: 'Referral redeemed',
  plan_cancelled: 'Plan cancelled',
  account_deleted: 'Account deleted',
  plan_expired: 'Plan expired',
  admin_grant: 'Admin grant',
  admin_revoke: 'Admin revoke',
};

const statBox: React.CSSProperties = {
  backgroundColor: '#161b22',
  border: '1px solid #30363d',
  borderRadius: '10px',
  padding: '14px 10px',
  textAlign: 'center',
};

const statValue: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: 700,
  margin: '0',
};

const statLabel: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '4px 0 0',
};

const sectionTitle: React.CSSProperties = {
  color: '#F97316',
  fontSize: '12px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: '0 0 8px',
};

const lineText: React.CSSProperties = {
  color: '#c9d1d9',
  fontSize: '13px',
  lineHeight: '20px',
  margin: '0 0 4px',
};

const mutedText: React.CSSProperties = {
  color: '#8b949e',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
};

export function OwnerMetricsEmail({ metrics }: { metrics: AccountMetrics }) {
  const m = metrics;
  const paidCount = m.tiers.gold + m.tiers.platinum;
  return (
    <EmailLayout previewText={`${m.totalUsers} accounts · ${paidCount} on paid tiers · ${m.brokerageConnected} brokerages connected`}>
      <Section style={{ padding: '0 24px 8px' }}>
        <Text style={{ color: '#ffffff', fontSize: '18px', fontWeight: 700, margin: '0 0 2px' }}>
          Account Metrics
        </Text>
        <Text style={mutedText}>
          Daily rundown · {new Date(m.generatedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
      </Section>

      {/* Headline stats */}
      <Section style={{ padding: '12px 24px' }}>
        <Row>
          <Column style={{ width: '25%', padding: '0 4px' }}>
            <div style={statBox}>
              <Text style={statValue}>{m.totalUsers}</Text>
              <Text style={statLabel}>Accounts</Text>
            </div>
          </Column>
          <Column style={{ width: '25%', padding: '0 4px' }}>
            <div style={statBox}>
              <Text style={statValue}>{paidCount}</Text>
              <Text style={statLabel}>Paid tiers</Text>
            </div>
          </Column>
          <Column style={{ width: '25%', padding: '0 4px' }}>
            <div style={statBox}>
              <Text style={statValue}>{m.brokerageConnected}</Text>
              <Text style={statLabel}>Brokerages</Text>
            </div>
          </Column>
          <Column style={{ width: '25%', padding: '0 4px' }}>
            <div style={statBox}>
              <Text style={statValue}>{m.last24h.length}</Text>
              <Text style={statLabel}>Events 24h</Text>
            </div>
          </Column>
        </Row>
      </Section>

      {/* Tier breakdown */}
      <Section style={{ padding: '12px 24px' }}>
        <Text style={sectionTitle}>Tiers</Text>
        <Text style={lineText}>
          Silver (free): <strong>{m.tiers.silver}</strong> · Gold: <strong>{m.tiers.gold}</strong> · Platinum:{' '}
          <strong>{m.tiers.platinum}</strong>
        </Text>
        <Text style={mutedText}>
          Active paid access by source — trial: {m.paidSources.trial}, referral: {m.paidSources.referral}, admin:{' '}
          {m.paidSources.admin}, billing: {m.paidSources.billing}. Lifetime trials used: {m.trialsUsedTotal};
          referrals redeemed: {m.referralsRedeemedTotal}. Briefing email opt-ins: {m.briefingOptIns}.
        </Text>
      </Section>

      {/* Expiring soon */}
      {m.expiringWithin7Days.length > 0 && (
        <Section style={{ padding: '12px 24px' }}>
          <Text style={sectionTitle}>Expiring within 7 days</Text>
          {m.expiringWithin7Days.map((e) => (
            <Text key={`${e.email}-${e.expiresAt}`} style={lineText}>
              {e.email} — {e.tier} ({e.source}) until {new Date(e.expiresAt).toLocaleDateString()}
            </Text>
          ))}
        </Section>
      )}

      <Hr style={{ borderColor: '#30363d', margin: '8px 24px' }} />

      {/* Last 24h events */}
      <Section style={{ padding: '12px 24px' }}>
        <Text style={sectionTitle}>Last 24 hours</Text>
        {m.last24h.length === 0 ? (
          <Text style={mutedText}>No account activity.</Text>
        ) : (
          m.last24h.map((e, i) => (
            <Text key={`${e.at}-${i}`} style={lineText}>
              <strong>{EVENT_LABELS[e.type] ?? e.type}</strong>
              {e.email ? ` — ${e.email}` : ''}
              {e.detail ? ` · ${e.detail}` : ''}
            </Text>
          ))
        )}
      </Section>
    </EmailLayout>
  );
}
