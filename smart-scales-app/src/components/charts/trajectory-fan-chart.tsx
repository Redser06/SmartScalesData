"use client";

import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import type { EwmaPoint, HistoricAnchorItem, HorizonBand } from '@/types/journey';

interface TrajectoryFanChartProps {
  ewmaSeries: EwmaPoint[];
  horizonBands: HorizonBand[];
  targetWeightKg: number;
  historicAnchors: HistoricAnchorItem[];
}

interface FanChartPoint {
  dateIso: string;
  dateLabel: string;
  rawWeightKg?: number;
  calibratedWeightKg?: number;
  ewmaWeightKg?: number;
  p10Kg?: number;
  p50Kg?: number;
  p90Kg?: number;
  bandRange?: [number, number];
  source?: string;
}

export function TrajectoryFanChart({
  ewmaSeries,
  horizonBands,
  targetWeightKg,
  historicAnchors,
}: TrajectoryFanChartProps) {
  const chartData = useMemo<FanChartPoint[]>(() => {
    const historical: FanChartPoint[] = ewmaSeries.map((pt) => ({
      dateIso: pt.timestamp,
      dateLabel: format(new Date(pt.timestamp), 'MMM d'),
      rawWeightKg: Number(pt.rawWeightKg.toFixed(2)),
      calibratedWeightKg: Number(pt.calibratedWeightKg.toFixed(2)),
      ewmaWeightKg: Number(pt.ewmaWeightKg.toFixed(2)),
      source: pt.source,
    }));

    if (historical.length > 0 && horizonBands.length > 0) {
      const lastHist = historical[historical.length - 1];
      lastHist.p10Kg = lastHist.ewmaWeightKg;
      lastHist.p50Kg = lastHist.ewmaWeightKg;
      lastHist.p90Kg = lastHist.ewmaWeightKg;
      lastHist.bandRange = [lastHist.ewmaWeightKg ?? 0, lastHist.ewmaWeightKg ?? 0];
    }

    const future: FanChartPoint[] = horizonBands.map((band) => ({
      dateIso: band.targetDateIso,
      dateLabel: `+${band.horizonDays}d (${format(new Date(band.targetDateIso), 'MMM d')})`,
      p10Kg: Number(band.p10Kg.toFixed(2)),
      p50Kg: Number(band.p50Kg.toFixed(2)),
      p90Kg: Number(band.p90Kg.toFixed(2)),
      bandRange: [Number(band.p10Kg.toFixed(2)), Number(band.p90Kg.toFixed(2))],
    }));

    return [...historical, ...future];
  }, [ewmaSeries, horizonBands]);

  const anchor1y = historicAnchors.find((a) => a.label === '1_year_ago');
  const anchor10y = historicAnchors.find((a) => a.label === '10_years_ago');

  if (ewmaSeries.length === 0) {
    return (
      <div className="h-[360px] flex items-center justify-center text-zinc-500 text-sm">
        No weight entries yet. Import a CSV or add a manual entry to generate your EWMA & P10/P50/P90 trajectory fan.
      </div>
    );
  }

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 24, bottom: 8, left: 4 }}>
          <defs>
            <linearGradient id="fanConeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="dateLabel"
            stroke="#71717a"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={['auto', 'auto']}
            stroke="#71717a"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(val: number) => `${val}kg`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              borderColor: '#27272a',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            itemStyle={{ color: '#e4e4e7' }}
            labelStyle={{ color: '#a1a1aa' }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

          <ReferenceLine
            y={targetWeightKg}
            stroke="#10b981"
            strokeDasharray="4 4"
            label={{
              value: `Target ${targetWeightKg.toFixed(1)}kg`,
              fill: '#10b981',
              fontSize: 11,
              position: 'insideTopRight',
            }}
          />

          {anchor1y && (
            <ReferenceLine
              y={anchor1y.weightKg}
              stroke="#f59e0b"
              strokeDasharray="3 3"
              label={{
                value: `1Y Ago (${anchor1y.weightKg.toFixed(1)}kg)`,
                fill: '#f59e0b',
                fontSize: 11,
                position: 'insideBottomRight',
              }}
            />
          )}

          {anchor10y && (
            <ReferenceLine
              y={anchor10y.weightKg}
              stroke="#38bdf8"
              strokeDasharray="3 3"
              label={{
                value: `10Y Ago (${anchor10y.weightKg.toFixed(1)}kg)`,
                fill: '#38bdf8',
                fontSize: 11,
                position: 'insideBottomLeft',
              }}
            />
          )}

          <Area
            type="monotone"
            dataKey="p90Kg"
            name="P90 Upper Bound"
            stroke="#818cf8"
            strokeDasharray="2 2"
            strokeWidth={1}
            fill="url(#fanConeGrad)"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="p50Kg"
            name="P50 Median Projection"
            stroke="#a855f7"
            strokeDasharray="5 5"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="p10Kg"
            name="P10 Optimistic Bound"
            stroke="#34d399"
            strokeDasharray="2 2"
            strokeWidth={1}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="ewmaWeightKg"
            name="7-Day EWMA Trend"
            stroke="#8b5cf6"
            strokeWidth={3}
            dot={false}
            connectNulls
          />
          <Scatter
            dataKey="calibratedWeightKg"
            name="Calibrated Scale Reading"
            fill="#e4e4e7"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
