"use client";

import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import type { EwmaPoint } from '@/types/journey';

interface VelocityCorridorChartProps {
  ewmaSeries: EwmaPoint[];
}

export function VelocityCorridorChart({ ewmaSeries }: VelocityCorridorChartProps) {
  const chartData = useMemo(() => {
    return ewmaSeries.map((pt) => ({
      dateLabel: format(new Date(pt.timestamp), 'MMM d'),
      weeklyVelocityKg: Number(pt.weeklyVelocityKg.toFixed(2)),
      weeklyVelocityPctBw: Number(pt.weeklyVelocityPctBw.toFixed(2)),
      impliedDailyDeficitKcal: Math.round(pt.impliedDailyDeficitKcal),
      safeCorridorMinKgWk: Number(pt.safeCorridorMinKgWk.toFixed(2)),
      safeCorridorMaxKgWk: Number(pt.safeCorridorMaxKgWk.toFixed(2)),
    }));
  }, [ewmaSeries]);

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-zinc-500 text-sm">
        No velocity data available yet.
      </div>
    );
  }

  const latest = chartData[chartData.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
        <span>
          Rolling Velocity: <strong className="text-white">{latest.weeklyVelocityKg} kg/wk</strong> ({latest.weeklyVelocityPctBw}% BW/wk)
        </span>
        <span>
          Safe Muscle-Preserving Corridor:{' '}
          <strong className="text-emerald-400">
            [{latest.safeCorridorMinKgWk} kg/wk, {latest.safeCorridorMaxKgWk} kg/wk]
          </strong>{' '}
          ([-1.0% BW, -0.25% BW])
        </span>
        <span>
          Implied Energy Balance: <strong className="text-indigo-400">{latest.impliedDailyDeficitKcal} kcal/day</strong>
        </span>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="kgWk"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}kg/w`}
            />
            <YAxis
              yAxisId="kcal"
              orientation="right"
              stroke="#818cf8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}kcal`}
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

            <ReferenceLine yAxisId="kgWk" y={0} stroke="#52525b" strokeDasharray="3 3" />
            <ReferenceLine
              yAxisId="kgWk"
              y={latest.safeCorridorMinKgWk}
              stroke="#f43f5e"
              strokeDasharray="4 4"
              label={{
                value: '-1.0% BW Floor (Max Safe Loss)',
                fill: '#f43f5e',
                fontSize: 10,
                position: 'insideBottomLeft',
              }}
            />
            <ReferenceLine
              yAxisId="kgWk"
              y={latest.safeCorridorMaxKgWk}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{
                value: '-0.25% BW Ceiling',
                fill: '#10b981',
                fontSize: 10,
                position: 'insideTopLeft',
              }}
            />

            <Area
              yAxisId="kgWk"
              type="monotone"
              dataKey="weeklyVelocityKg"
              name="Weekly Rate (kg/wk)"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.18}
              strokeWidth={2}
            />
            <Line
              yAxisId="kcal"
              type="monotone"
              dataKey="impliedDailyDeficitKcal"
              name="Implied Daily Balance (kcal/d)"
              stroke="#818cf8"
              strokeWidth={1.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
