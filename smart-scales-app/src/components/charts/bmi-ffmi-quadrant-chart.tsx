"use client";

import { useMemo } from 'react';
import {
  ScatterChart,
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
import type { CompositionReconciliation } from '@/types/journey';

interface BmiFfmiQuadrantChartProps {
  compositionSeries: CompositionReconciliation[];
  biologicalSex: 'male' | 'female' | 'other';
}

interface QuadrantPoint {
  bmi: number;
  normalizedFfmi: number;
  dateLabel: string;
  weightKg: number;
  bodyFatPct: number | null;
  classification: string;
}

export function BmiFfmiQuadrantChart({
  compositionSeries,
  biologicalSex,
}: BmiFfmiQuadrantChartProps) {
  const ffmiCutoff = biologicalSex === 'female' ? 17.5 : 21.0;

  const points = useMemo<QuadrantPoint[]>(() => {
    return compositionSeries.map((c) => ({
      bmi: Number(c.bmi.toFixed(2)),
      normalizedFfmi: Number(c.normalizedFfmi.toFixed(2)),
      dateLabel: format(new Date(c.timestamp), 'MMM d, yyyy'),
      weightKg: Number(c.calibratedWeightKg.toFixed(1)),
      bodyFatPct: c.calibratedBodyFatPct !== null ? Number(c.calibratedBodyFatPct.toFixed(1)) : null,
      classification: c.classification.replace(/_/g, ' '),
    }));
  }, [compositionSeries]);

  if (points.length === 0) {
    return (
      <div className="h-[320px] flex items-center justify-center text-zinc-500 text-sm">
        No composition records to plot on the BMI vs. FFMI Quadrant.
      </div>
    );
  }

  const latestPoint = [points[points.length - 1]];
  const historicalPoints = points.slice(0, -1);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-2">
          <span className="text-emerald-400 font-semibold">Top-Right (BMI &ge; 25, FFMI &ge; {ffmiCutoff}):</span>{' '}
          Athletic / High Skeletal Muscle Mass (BMI False Positive)
        </div>
        <div className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-2">
          <span className="text-amber-400 font-semibold">Bottom-Right (BMI &ge; 25, FFMI &lt; {ffmiCutoff}):</span>{' '}
          Adiposity-Driven Elevated BMI (Prioritize Fat Loss + Protein)
        </div>
      </div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 24, bottom: 12, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              type="number"
              dataKey="bmi"
              name="BMI"
              unit=" kg/m²"
              domain={[18, 36]}
              stroke="#71717a"
              fontSize={11}
            />
            <YAxis
              type="number"
              dataKey="normalizedFfmi"
              name="Normalized FFMI"
              unit=" kg/m²"
              domain={[14, 27]}
              stroke="#71717a"
              fontSize={11}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              contentStyle={{
                backgroundColor: '#18181b',
                borderColor: '#27272a',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              itemStyle={{ color: '#e4e4e7' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />

            <ReferenceLine
              x={25.0}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{
                value: 'BMI 25.0 Cutoff',
                fill: '#f59e0b',
                fontSize: 11,
                position: 'insideTopRight',
              }}
            />
            <ReferenceLine
              y={ffmiCutoff}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{
                value: `Athletic FFMI (${ffmiCutoff})`,
                fill: '#10b981',
                fontSize: 11,
                position: 'insideTopLeft',
              }}
            />

            {historicalPoints.length > 0 && (
              <Scatter
                name="Journey Trajectory"
                data={historicalPoints}
                fill="#6366f1"
                line={{ stroke: '#6366f1', strokeWidth: 1.5 }}
              />
            )}
            <Scatter name="Current Position" data={latestPoint} fill="#10b981" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
