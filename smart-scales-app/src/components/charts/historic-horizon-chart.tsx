"use client";

import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import type { EwmaPoint, HistoricAnchorItem, UserJourneyProfileData } from '@/types/journey';

interface HistoricHorizonChartProps {
  historicAnchors: HistoricAnchorItem[];
  ewmaSeries: EwmaPoint[];
  profile: UserJourneyProfileData;
  etaP50DateIso: string | null;
}

interface MacroHorizonNode {
  stage: string;
  dateLabel: string;
  weightKg: number;
  bodyFatPct?: number;
  age?: number;
  context?: string;
}

const ANCHOR_ORDER: Record<string, number> = {
  '10_years_ago': 1,
  '5_years_ago': 2,
  all_time_peak: 3,
  adult_low: 4,
  '1_year_ago': 5,
};

const ANCHOR_LABELS: Record<string, string> = {
  '10_years_ago': '10 Years Ago',
  '5_years_ago': '5 Years Ago',
  '1_year_ago': '1 Year Ago',
  all_time_peak: 'All-Time Peak',
  adult_low: 'Adult Low',
};

export function HistoricHorizonChart({
  historicAnchors,
  ewmaSeries,
  profile,
  etaP50DateIso,
}: HistoricHorizonChartProps) {
  const nodes = useMemo<MacroHorizonNode[]>(() => {
    const sortedAnchors = [...historicAnchors].sort(
      (a, b) => (ANCHOR_ORDER[a.label] ?? 99) - (ANCHOR_ORDER[b.label] ?? 99)
    );

    const anchorNodes: MacroHorizonNode[] = sortedAnchors.map((a) => {
      const year = new Date(a.anchorDate).getUTCFullYear();
      const computedAge = a.ageAtAnchor ?? Math.max(12, year - profile.birthYear);
      return {
        stage: `${ANCHOR_LABELS[a.label] ?? a.label} (Age ${computedAge})`,
        dateLabel: format(new Date(a.anchorDate), 'yyyy'),
        weightKg: Number(a.weightKg.toFixed(1)),
        bodyFatPct: a.bodyFatPct !== null ? Number(a.bodyFatPct.toFixed(1)) : undefined,
        age: computedAge,
        context: a.lifestyleContext ?? undefined,
      };
    });

    if (ewmaSeries.length > 0) {
      const first = ewmaSeries[0];
      const latest = ewmaSeries[ewmaSeries.length - 1];
      anchorNodes.push({
        stage: 'Journey Start',
        dateLabel: format(new Date(first.timestamp), 'MMM yyyy'),
        weightKg: Number(first.calibratedWeightKg.toFixed(1)),
        context: 'First recorded scale entry',
      });
      anchorNodes.push({
        stage: 'Current (EWMA)',
        dateLabel: format(new Date(latest.timestamp), 'MMM d, yyyy'),
        weightKg: Number(latest.ewmaWeightKg.toFixed(1)),
        context: '7-day smoothed trend',
      });
    }

    anchorNodes.push({
      stage: 'Target ETA (P50)',
      dateLabel: etaP50DateIso ? format(new Date(etaP50DateIso), 'MMM d, yyyy') : 'Goal',
      weightKg: Number(profile.targetWeightKg.toFixed(1)),
      bodyFatPct:
        profile.targetBodyFatPct !== null ? Number(profile.targetBodyFatPct.toFixed(1)) : undefined,
      context: `Goal (${profile.goalType.replace(/_/g, ' ')})`,
    });

    return anchorNodes;
  }, [historicAnchors, ewmaSeries, profile, etaP50DateIso]);

  return (
    <div className="space-y-3">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={nodes} margin={{ top: 12, right: 24, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="stage"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => `${v}kg`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />

            <Bar
              dataKey="weightKg"
              name="Benchmark Weight (kg)"
              fill="#6366f1"
              fillOpacity={0.35}
              radius={[6, 6, 0, 0]}
              barSize={38}
            />
            <Line
              type="monotone"
              dataKey="weightKg"
              name="Multi-Year Arc"
              stroke="#a855f7"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#10b981' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {historicAnchors.length > 0 && (
        <div className="grid gap-2 md:grid-cols-3 text-xs">
          {historicAnchors.map((a) => (
            <div key={a.id} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5">
              <div className="flex items-center justify-between font-medium text-zinc-200">
                <span>{ANCHOR_LABELS[a.label] ?? a.label}</span>
                <span className="text-indigo-400">{a.weightKg.toFixed(1)} kg</span>
              </div>
              <div className="text-zinc-500 mt-0.5">
                {format(new Date(a.anchorDate), 'MMM yyyy')}
                {a.ageAtAnchor ? ` · Age ${a.ageAtAnchor}` : ''}
                {a.lifestyleContext ? ` · ${a.lifestyleContext}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
