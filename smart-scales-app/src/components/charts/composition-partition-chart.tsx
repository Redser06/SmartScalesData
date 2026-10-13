"use client";

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { Droplets, ShieldCheck } from 'lucide-react';
import type { CompositionReconciliation } from '@/types/journey';

interface CompositionPartitionChartProps {
  compositionSeries: CompositionReconciliation[];
  waterShieldActive: boolean;
}

export function CompositionPartitionChart({
  compositionSeries,
  waterShieldActive,
}: CompositionPartitionChartProps) {
  const chartData = useMemo(() => {
    return compositionSeries.map((c) => ({
      dateLabel: format(new Date(c.timestamp), 'MMM d'),
      fatMassKg: Number(c.fatMassKg.toFixed(2)),
      leanBodyMassKg: Number(c.leanBodyMassKg.toFixed(2)),
      muscleMassKg:
        c.calibratedMuscleMassKg !== null ? Number(c.calibratedMuscleMassKg.toFixed(2)) : undefined,
      bodyWaterPct:
        c.bodyWaterPercentage !== null ? Number(c.bodyWaterPercentage.toFixed(1)) : undefined,
    }));
  }, [compositionSeries]);

  if (chartData.length === 0) {
    return (
      <div className="h-[320px] flex items-center justify-center text-zinc-500 text-sm">
        No composition partition data available yet.
      </div>
    );
  }

  const latest = compositionSeries[compositionSeries.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs text-zinc-300">
          <span>
            Lean Body Mass: <strong className="text-emerald-400">{latest.leanBodyMassKg.toFixed(1)} kg</strong>
          </span>
          <span>
            Fat Mass: <strong className="text-rose-400">{latest.fatMassKg.toFixed(1)} kg</strong>
          </span>
          <span>
            Conservation: <strong className="text-zinc-100">{(latest.leanBodyMassKg + latest.fatMassKg).toFixed(1)} kg</strong>
          </span>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            waterShieldActive
              ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
              : 'bg-zinc-800/70 text-zinc-400 border-zinc-700'
          }`}
        >
          {waterShieldActive ? (
            <>
              <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
              Water Fluctuation Shield Active ({latest.bodyWaterPercentage ?? '--'}% H₂O)
            </>
          ) : (
            <>
              <Droplets className="h-3.5 w-3.5 text-zinc-400" />
              Hydration Normal ({latest.bodyWaterPercentage ?? '--'}% H₂O)
            </>
          )}
        </div>
      </div>

      <div className="h-[290px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 20, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="dateLabel"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="mass"
              stroke="#71717a"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}kg`}
            />
            <YAxis
              yAxisId="water"
              orientation="right"
              stroke="#38bdf8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={[35, 75]}
              tickFormatter={(v: number) => `${v}%`}
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

            <Area
              yAxisId="mass"
              type="monotone"
              stackId="partition"
              dataKey="leanBodyMassKg"
              name="Lean Body Mass (kg)"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.25}
            />
            <Area
              yAxisId="mass"
              type="monotone"
              stackId="partition"
              dataKey="fatMassKg"
              name="Fat Mass (kg)"
              stroke="#f43f5e"
              fill="#f43f5e"
              fillOpacity={0.3}
            />
            <Line
              yAxisId="mass"
              type="monotone"
              dataKey="muscleMassKg"
              name="Skeletal/Total Muscle (kg)"
              stroke="#34d399"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="water"
              type="monotone"
              dataKey="bodyWaterPct"
              name="Body Water (%)"
              stroke="#38bdf8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
