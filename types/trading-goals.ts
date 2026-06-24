/**
 * Trading Goals — type definitions
 *
 * A trading goal tracks progress toward a target metric over a fixed date
 * window. Progress is computed on read from imported trade history (and, for
 * journal-consistency goals, the daily-journal store) so it always reflects the
 * latest upload — nothing about progress is persisted, so nothing can go stale.
 */

export type GoalCategory = 'profit' | 'consistency' | 'guardrail' | 'journaling';

/** 'gte' — target is met when current >= target. 'lte' — current must stay <= target. */
export type GoalDirection = 'gte' | 'lte';

/** How a metric's value should be formatted in the UI. */
export type GoalUnit = 'currency' | 'percent' | 'count' | 'ratio';

export type GoalMetric =
  // Profit
  | 'net_profit'
  // Consistency
  | 'win_rate'
  | 'profit_factor'
  | 'green_days'
  | 'max_drawdown'
  // Guardrail (discipline caps)
  | 'max_daily_loss'
  | 'max_trade_loss'
  | 'max_trades_per_day'
  // Journaling / process
  | 'quality_setups'
  | 'journal_consistency';

/** User-controlled lifecycle. Achieved/missed are derived (see GoalOutcome), not stored. */
export type GoalStatus = 'active' | 'archived';

/** Derived state of a goal at read time. */
export type GoalOutcome =
  | 'achieved' // target met and window has ended
  | 'missed' // target not met and window has ended
  | 'ahead' // window active, target already met
  | 'on_track' // window active, projected to meet target
  | 'behind' // window active, projected to miss target
  | 'no_data'; // nothing to measure yet

export interface GoalGuardrail {
  metric: GoalMetric;
  target: number;
  direction: GoalDirection;
}

export interface TradingGoal {
  id: string;
  userId: string;
  title: string;
  category: GoalCategory;
  metric: GoalMetric;
  target: number;
  direction: GoalDirection;
  /** Inclusive YYYY-MM-DD window. */
  startDate: string;
  endDate: string;
  /** Optional secondary constraints evaluated alongside the primary metric. */
  guardrails?: GoalGuardrail[];
  note?: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface GuardrailResult {
  metric: GoalMetric;
  label: string;
  target: number;
  direction: GoalDirection;
  unit: GoalUnit;
  current: number;
  breached: boolean;
}

/** Computed progress — never persisted, derived from trades on each read. */
export interface GoalProgress {
  goalId: string;
  metric: GoalMetric;
  unit: GoalUnit;
  direction: GoalDirection;
  target: number;
  current: number;
  /** 0–100, clamped, progress of `current` toward `target`. */
  pct: number;
  /** Is the target currently satisfied? */
  met: boolean;
  outcome: GoalOutcome;

  // Trading-day window (holiday-aware, EST)
  tradingDaysTotal: number;
  tradingDaysElapsed: number;
  tradingDaysRemaining: number;

  // Pacing — only populated for cumulative metrics (paced === true)
  paced: boolean;
  requiredPerDay?: number; // remaining gap ÷ remaining trading days
  actualPerDay?: number; // current ÷ elapsed trading days
  projectedFinal?: number; // actualPerDay × total trading days

  guardrailResults?: GuardrailResult[];

  /** Number of trades (or days, for journal_consistency) that fed the measurement. */
  sampleSize: number;
}

export interface GoalMetricMeta {
  metric: GoalMetric;
  label: string;
  category: GoalCategory;
  unit: GoalUnit;
  direction: GoalDirection;
  /** Cumulative metric whose pace can be extrapolated over the window. */
  paced: boolean;
  /** Plain-English description for tooltips and the create form. */
  description: string;
  /** Example target shown as the input placeholder. */
  targetPlaceholder: string;
}

/** Single source of truth for metric behaviour, shared by the engine and the UI. */
export const GOAL_METRICS: Record<GoalMetric, GoalMetricMeta> = {
  net_profit: {
    metric: 'net_profit',
    label: 'Net profit',
    category: 'profit',
    unit: 'currency',
    direction: 'gte',
    paced: true,
    description:
      'Total realized net P&L from closed trades in the window, counted on the day each trade is closed.',
    targetPlaceholder: '1050',
  },
  win_rate: {
    metric: 'win_rate',
    label: 'Win rate',
    category: 'consistency',
    unit: 'percent',
    direction: 'gte',
    paced: false,
    description: 'Share of closed trades that were profitable.',
    targetPlaceholder: '55',
  },
  profit_factor: {
    metric: 'profit_factor',
    label: 'Profit factor',
    category: 'consistency',
    unit: 'ratio',
    direction: 'gte',
    paced: false,
    description: 'Gross profit ÷ gross loss. Above 1.5 is solid, above 2.0 is excellent.',
    targetPlaceholder: '1.5',
  },
  green_days: {
    metric: 'green_days',
    label: 'Green days',
    category: 'consistency',
    unit: 'count',
    direction: 'gte',
    paced: true,
    description: 'Number of trading days in the window that finished net positive.',
    targetPlaceholder: '8',
  },
  max_drawdown: {
    metric: 'max_drawdown',
    label: 'Max drawdown',
    category: 'consistency',
    unit: 'currency',
    direction: 'lte',
    paced: false,
    description:
      'Largest peak-to-trough drop in cumulative P&L over the window. Lower is better.',
    targetPlaceholder: '500',
  },
  max_daily_loss: {
    metric: 'max_daily_loss',
    label: 'Max daily loss',
    category: 'guardrail',
    unit: 'currency',
    direction: 'lte',
    paced: false,
    description:
      'No single trading day may lose more than this. Tracks your worst day in the window.',
    targetPlaceholder: '300',
  },
  max_trade_loss: {
    metric: 'max_trade_loss',
    label: 'Max single-trade loss',
    category: 'guardrail',
    unit: 'currency',
    direction: 'lte',
    paced: false,
    description:
      'No single trade may lose more than this. Caps position risk; tracks your worst trade.',
    targetPlaceholder: '150',
  },
  max_trades_per_day: {
    metric: 'max_trades_per_day',
    label: 'Max trades per day',
    category: 'guardrail',
    unit: 'count',
    direction: 'lte',
    paced: false,
    description:
      'Overtrading guard. No trading day may exceed this many trades; tracks your busiest day.',
    targetPlaceholder: '5',
  },
  quality_setups: {
    metric: 'quality_setups',
    label: 'A+ setups',
    category: 'journaling',
    unit: 'percent',
    direction: 'gte',
    paced: false,
    description:
      'Share of rated trades graded Excellent or Good. Only trades you have graded count toward this.',
    targetPlaceholder: '80',
  },
  journal_consistency: {
    metric: 'journal_consistency',
    label: 'Journaling consistency',
    category: 'journaling',
    unit: 'percent',
    direction: 'gte',
    paced: false,
    description: 'Share of trading days so far in the window that have a daily journal entry.',
    targetPlaceholder: '100',
  },
};

export const GOAL_CATEGORY_LABELS: Record<GoalCategory, string> = {
  profit: 'Profitability',
  consistency: 'Consistency',
  guardrail: 'Guardrail',
  journaling: 'Journaling',
};

/** Metrics grouped by category, for building the create form. */
export const METRICS_BY_CATEGORY: Record<GoalCategory, GoalMetric[]> = {
  profit: ['net_profit'],
  consistency: ['win_rate', 'profit_factor', 'green_days', 'max_drawdown'],
  guardrail: ['max_daily_loss', 'max_trade_loss', 'max_trades_per_day'],
  journaling: ['quality_setups', 'journal_consistency'],
};

// ============================================================================
// API request/response shapes
// ============================================================================

export interface CreateGoalRequest {
  title: string;
  metric: GoalMetric;
  target: number;
  startDate: string;
  endDate: string;
  guardrails?: GoalGuardrail[];
  note?: string;
}

export interface UpdateGoalRequest {
  title?: string;
  target?: number;
  startDate?: string;
  endDate?: string;
  guardrails?: GoalGuardrail[];
  note?: string;
  status?: GoalStatus;
}

/** A goal plus its freshly-computed progress, as returned by the API. */
export interface GoalWithProgress {
  goal: TradingGoal;
  progress: GoalProgress;
}
