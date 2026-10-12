import { addDays } from 'date-fns';
import {
  aggregateDailyEntries,
  computeDampedMeanWeight,
  computeEwmaSeries,
  computeTheilSenDailySlope,
} from '@/lib/trajectory-engine';
import type { RawScaleEntry } from '@/lib/scale-calibrator';

export interface LegacyTrendSummary {
  slope: number;
  intercept: number;
  startDate: number;
  lastPointX: number;
  lastValue: number;
}

export interface LegacyProjectionPoint {
  label: string;
  date: Date;
  value: number;
  change: number;
}

/**
 * Backward-compatible wrapper around trajectory-engine.ts
 */
export function calculateTrend(
  data: Array<Record<string, unknown>>,
  metric = 'weight'
): LegacyTrendSummary | null {
  if (!data || data.length < 2) return null;

  const mapped: RawScaleEntry[] = data.map((d, idx) => ({
    id: typeof d.id === 'number' ? d.id : idx + 1,
    timestamp: (d.timestamp as Date | string) ?? new Date().toISOString(),
    weight: Number(d[metric] ?? d.weight ?? 0),
    source: typeof d.source === 'string' ? d.source : 'old_scale',
  }));

  const daily = aggregateDailyEntries(mapped);
  if (daily.length < 2) return null;

  const ewma = computeEwmaSeries(daily);
  const slope = computeTheilSenDailySlope(daily, ewma);
  const startDate = daily[0].dayMs;
  const lastDay = daily[daily.length - 1];
  const lastEwma = ewma[ewma.length - 1].ewmaWeightKg;
  const lastPointX = (lastDay.dayMs - startDate) / (1000 * 60 * 60 * 24);
  const intercept = lastEwma - slope * lastPointX;

  return {
    slope,
    intercept,
    startDate,
    lastPointX,
    lastValue: lastEwma,
  };
}

export function getProjections(
  data: Array<Record<string, unknown>>,
  trend: LegacyTrendSummary | null
): LegacyProjectionPoint[] {
  if (!trend || !data || data.length === 0) return [];

  const lastRawTs = data[data.length - 1].timestamp as Date | string;
  const lastDate = new Date(lastRawTs);

  const projections = [
    { label: '1 Week', days: 7 },
    { label: '4 Weeks', days: 28 },
    { label: '3 Months', days: 90 },
  ];

  return projections.map((p) => {
    const futureDate = addDays(lastDate, p.days);
    const predictedValue = computeDampedMeanWeight(trend.lastValue, trend.slope, p.days);
    return {
      label: p.label,
      date: futureDate,
      value: predictedValue,
      change: predictedValue - trend.lastValue,
    };
  });
}
