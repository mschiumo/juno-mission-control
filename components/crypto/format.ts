/** Compact display formatting shared by the crypto cards. */

export function fmtUsd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(digits)}`;
}

/** Token prices span many magnitudes; show enough significant digits. */
export function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.001) return `$${value.toFixed(4)}`;
  return `$${value.toPrecision(3)}`;
}

export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function fmtAge(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`;
  if (hours < 24 * 30) return `${Math.round(hours / 24)}d`;
  return `${Math.round(hours / (24 * 30))}mo`;
}

export function pctColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return '#8b949e';
  return value >= 0 ? '#3fb950' : '#f85149';
}

export const CHAIN_LABELS: Record<string, string> = {
  solana: 'SOL',
  ethereum: 'ETH',
  base: 'BASE',
};
