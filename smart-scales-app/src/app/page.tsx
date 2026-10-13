"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import {
  getWeightHistory,
  deleteWeightEntry,
  importCsvData,
  getJourneySnapshot,
} from './actions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Scale,
  Activity,
  Target,
  Trash2,
  Upload,
  LogOut,
  ShieldCheck,
  Sparkles,
  Award,
} from 'lucide-react';
import { format, subDays, isAfter } from 'date-fns';
import ChatInterface from '@/components/chat-interface';
import { TrajectoryFanChart } from '@/components/charts/trajectory-fan-chart';
import { BmiFfmiQuadrantChart } from '@/components/charts/bmi-ffmi-quadrant-chart';
import { CompositionPartitionChart } from '@/components/charts/composition-partition-chart';
import { VelocityCorridorChart } from '@/components/charts/velocity-corridor-chart';
import { HistoricHorizonChart } from '@/components/charts/historic-horizon-chart';
import { JourneyProfileDrawer } from '@/components/journey-profile-drawer';
import { ProposalApprovalCard } from '@/components/proposal-approval-card';
import type { JourneyGraphState } from '@/types/journey';

interface StatsCardProps {
  title: string;
  value: string;
  subtext: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
}

const StatsCard = ({ title, value, subtext, icon: Icon, trend }: StatsCardProps) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
    <div className="flex flex-row items-center justify-between pb-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">{title}</h3>
      <Icon className="h-4 w-4 text-zinc-500" />
    </div>
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="flex items-center text-xs text-zinc-500 mt-1">
      {trend !== undefined && trend !== 0 && (
        <span
          className={`flex items-center mr-1 ${
            trend < 0 ? 'text-emerald-500' : 'text-rose-500'
          }`}
        >
          {trend < 0 ? (
            <ArrowDownIcon className="h-3 w-3 mr-0.5" />
          ) : (
            <ArrowUpIcon className="h-3 w-3 mr-0.5" />
          )}
          {Math.abs(trend).toFixed(1)}
        </span>
      )}
      {subtext}
    </div>
  </div>
);

interface WeightEntryRow {
  id: number;
  timestamp: string;
  weight: number;
  calibratedWeightKg?: number | null;
  bmi?: number | null;
  bodyFatPercentage?: number | null;
  calibratedBodyFatPct?: number | null;
  muscleMass?: number | null;
  calibratedMuscleMassKg?: number | null;
  visceralFat?: number | null;
  bodyWaterPercentage?: number | null;
  boneMass?: number | null;
  bmr?: number | null;
  note?: string | null;
  source: string;
}

export default function Dashboard() {
  const { data: session } = useSession();
  const [data, setData] = useState<WeightEntryRow[]>([]);
  const [snapshot, setSnapshot] = useState<JourneyGraphState | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<WeightEntryRow | null>(null);
  const [timeRange, setTimeRange] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshWorkspace = useCallback(async () => {
    try {
      const [history, journeyState] = await Promise.all([
        getWeightHistory(),
        getJourneySnapshot({ bypassCache: true }),
      ]);
      setData(history);
      setSnapshot(journeyState);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const content = await file.text();
      const result = await importCsvData(content);

      if (result.success) {
        setUploadResult({
          success: true,
          message: `Imported ${result.imported} entries${
            result.skipped ? `, skipped ${result.skipped} duplicates` : ''
          }`,
        });
        await refreshWorkspace();
      } else {
        setUploadResult({
          success: false,
          message: result.error || 'Import failed',
        });
      }
    } catch (error: unknown) {
      setUploadResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to read file',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredEwmaSeries = useMemo(() => {
    const series = snapshot?.trajectory.ewmaSeries ?? [];
    if (timeRange === 'all') return series;

    const latestTs =
      series.length > 0 ? new Date(series[series.length - 1].timestamp) : new Date();
    let cutoffDate = subDays(latestTs, 30);
    if (timeRange === '1m') cutoffDate = subDays(latestTs, 30);
    if (timeRange === '3m') cutoffDate = subDays(latestTs, 90);
    if (timeRange === '6m') cutoffDate = subDays(latestTs, 180);
    if (timeRange === '1y') cutoffDate = subDays(latestTs, 365);

    return series.filter((item) => isAfter(new Date(item.timestamp), cutoffDate));
  }, [snapshot, timeRange]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading your calibrated composition &amp; trajectory workspace...
      </div>
    );
  }

  const latestComp = snapshot?.latestComposition ?? null;
  const latestEwma =
    snapshot && snapshot.trajectory.ewmaSeries.length > 0
      ? snapshot.trajectory.ewmaSeries[snapshot.trajectory.ewmaSeries.length - 1]
      : null;

  const currentWeight = latestComp?.calibratedWeightKg ?? data[data.length - 1]?.weight ?? 0;
  const startWeight =
    snapshot?.compositionSeries[0]?.calibratedWeightKg ?? data[0]?.weight ?? 0;
  const totalLoss = startWeight - currentWeight;

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-6 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-3xl font-bold tracking-tight text-white">
                SmartScalesData v2
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
                Agent Graph + Composition Suite
              </span>
            </div>
            <p className="text-zinc-400 text-sm">
              Multi-scale 7d median calibration, BMI vs. FFMI partitioning, and seeded P10/P50/P90 trajectory bands.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {snapshot && (
              <JourneyProfileDrawer
                profile={snapshot.profile}
                historicAnchors={snapshot.historicAnchors}
                onUpdated={refreshWorkspace}
              />
            )}

            <Tabs
              defaultValue="all"
              value={timeRange}
              onValueChange={setTimeRange}
              className="w-[320px]"
            >
              <TabsList className="grid w-full grid-cols-5 bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="1m">1M</TabsTrigger>
                <TabsTrigger value="3m">3M</TabsTrigger>
                <TabsTrigger value="6m">6M</TabsTrigger>
                <TabsTrigger value="1y">1Y</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-3 pl-3 border-l border-zinc-800">
              <div className="text-right">
                <p className="text-sm font-medium text-white">
                  {session?.user?.name || 'User'}
                </p>
                <p className="text-xs text-zinc-500">{session?.user?.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => signOut()}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Grounded Coach Brief & Milestone Signals Banner */}
        {snapshot && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 bg-zinc-900/90 border border-indigo-500/30 rounded-xl p-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                  <h2 className="text-sm font-semibold text-white">
                    {snapshot.motivationalBrief.headline}
                  </h2>
                </div>
                <span className="text-[11px] text-zinc-400 font-mono">
                  {snapshot.motivationalBrief.origin === 'llm_grounded'
                    ? 'N5 Sentry Verified'
                    : 'N6 Deterministic Brief'}{' '}
                  · Spend ${snapshot.monthlySpendUsd.toFixed(2)} / ${snapshot.monthlyCapUsd.toFixed(2)}
                </span>
              </div>
              <div className="text-xs text-zinc-300 whitespace-pre-line leading-relaxed">
                {snapshot.motivationalBrief.bodyMarkdown}
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Signals &amp; Water Shield
                  </h3>
                </div>
                {snapshot.waterShieldActive && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                    <ShieldCheck className="h-3 w-3" /> Shield Active
                  </span>
                )}
              </div>
              <div className="space-y-2 max-h-[120px] overflow-y-auto">
                {snapshot.milestoneSignals.length > 0 ? (
                  snapshot.milestoneSignals.map((sig) => (
                    <div
                      key={sig.id}
                      className="text-xs bg-zinc-950 border border-zinc-800 rounded-lg p-2.5"
                    >
                      <div className="font-medium text-emerald-300">{sig.title}</div>
                      <div className="text-zinc-400 text-[11px] mt-0.5">{sig.detail}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-zinc-500">
                    Log additional entries or historic anchors to unlock milestone signals.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Pending Proposals Banner (if any) */}
        {snapshot && snapshot.pendingProposals.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {snapshot.pendingProposals.map((proposal) => (
              <ProposalApprovalCard
                key={proposal.id}
                proposal={proposal}
                onResolved={refreshWorkspace}
              />
            ))}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Calibrated Weight (7d EWMA)"
            value={`${(latestEwma?.ewmaWeightKg ?? currentWeight).toFixed(1)} kg`}
            icon={Scale}
            trend={
              data.length > 1
                ? data[data.length - 1].weight - data[data.length - 2].weight
                : 0
            }
            subtext={`Raw scale: ${currentWeight.toFixed(1)} kg`}
          />
          <StatsCard
            title="Net Journey Change"
            value={`${totalLoss.toFixed(1)} kg`}
            icon={Activity}
            trend={-totalLoss}
            subtext={`Target: ${snapshot?.profile.targetWeightKg.toFixed(1) ?? '82.0'} kg`}
          />
          <StatsCard
            title="Normalized FFMI & LBM"
            value={
              latestComp
                ? `${latestComp.normalizedFfmi.toFixed(1)} kg/m²`
                : '--'
            }
            icon={Activity}
            subtext={
              latestComp
                ? `LBM ${latestComp.leanBodyMassKg.toFixed(1)} kg · ${latestComp.classification.replace(/_/g, ' ')}`
                : 'Composition'
            }
          />
          <StatsCard
            title="Fat Mass & Body Fat %"
            value={
              latestComp
                ? `${latestComp.fatMassKg.toFixed(1)} kg (${latestComp.calibratedBodyFatPct?.toFixed(1) ?? '-'}%)`
                : `${data[data.length - 1]?.bodyFatPercentage ?? '-'}%`
            }
            icon={Target}
            subtext={
              snapshot?.trajectory.etaP50DateIso
                ? `P50 Target ETA: ${format(new Date(snapshot.trajectory.etaP50DateIso), 'MMM d, yyyy')}`
                : 'Partitioned tissue'
            }
          />
        </div>

        {/* 5-Chart Visualisation Suite */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-6">
          <Tabs defaultValue="fan" className="w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  5-Chart Composition &amp; Trajectory Suite
                </h3>
                <p className="text-xs text-zinc-400">
                  Switch across your EWMA projection fan, BMI vs. FFMI clinical quadrant, tissue partition, velocity corridor, and 10Y horizon.
                </p>
              </div>
              <TabsList className="bg-zinc-950 border border-zinc-800 flex-wrap h-auto">
                <TabsTrigger value="fan">1. Trajectory Fan</TabsTrigger>
                <TabsTrigger value="quadrant">2. BMI vs FFMI Quadrant</TabsTrigger>
                <TabsTrigger value="partition">3. Tissue Partition</TabsTrigger>
                <TabsTrigger value="velocity">4. Velocity Corridor</TabsTrigger>
                <TabsTrigger value="horizon">5. Historic Horizon</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="fan">
              <TrajectoryFanChart
                ewmaSeries={filteredEwmaSeries}
                horizonBands={snapshot?.trajectory.horizonBands ?? []}
                targetWeightKg={snapshot?.profile.targetWeightKg ?? 82}
                historicAnchors={snapshot?.historicAnchors ?? []}
              />
            </TabsContent>

            <TabsContent value="quadrant">
              <BmiFfmiQuadrantChart
                compositionSeries={snapshot?.compositionSeries ?? []}
                biologicalSex={snapshot?.profile.biologicalSex ?? 'male'}
              />
            </TabsContent>

            <TabsContent value="partition">
              <CompositionPartitionChart
                compositionSeries={snapshot?.compositionSeries ?? []}
                waterShieldActive={snapshot?.waterShieldActive ?? false}
              />
            </TabsContent>

            <TabsContent value="velocity">
              <VelocityCorridorChart ewmaSeries={filteredEwmaSeries} />
            </TabsContent>

            <TabsContent value="horizon">
              {snapshot && (
                <HistoricHorizonChart
                  historicAnchors={snapshot.historicAnchors}
                  ewmaSeries={snapshot.trajectory.ewmaSeries}
                  profile={snapshot.profile}
                  etaP50DateIso={snapshot.trajectory.etaP50DateIso}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* 3 Clamped Solution Pathways & Horizon Quantiles */}
        {snapshot && (
          <div className="grid gap-4 lg:grid-cols-3">
            {snapshot.trajectory.solutionPathways.map((pw) => (
              <div
                key={pw.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-white">{pw.title}</h4>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        pw.musclePreservationRisk === 'high_clamp_applied'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {pw.musclePreservationRisk === 'high_clamp_applied'
                        ? '-1.0% BW/wk Safety Clamp'
                        : 'Muscle Safe'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{pw.rationale}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800 text-xs">
                  <div>
                    <span className="text-zinc-500 block">Daily Intake</span>
                    <strong className="text-white">{pw.dailyCalorieTargetKcal} kcal</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Protein Floor</span>
                    <strong className="text-emerald-400">{pw.proteinFloorGramsPerDay}g/d</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Weekly Pace</span>
                    <strong className="text-indigo-400">
                      {pw.weeklyRateKg.toFixed(2)} kg ({pw.weeklyRatePctBw}%)
                    </strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Entries Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-[520px]">
          <div className="p-6 border-b border-zinc-800 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Calibrated Scale Entries</h3>
                <p className="text-sm text-zinc-500">
                  Multi-scale CSV import automatically computes 7-day overlapping median offsets.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {uploadResult && (
                  <span
                    className={`text-sm ${
                      uploadResult.success ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {uploadResult.message}
                  </span>
                )}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? 'Importing...' : 'Import Scale CSV'}
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <ScrollArea className="h-full w-full">
              <div className="min-w-full pb-4">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-950 text-zinc-400 font-medium sticky top-0 z-10 shadow-sm border-b border-zinc-800">
                    <tr>
                      <th className="px-6 py-4 bg-zinc-950">Date</th>
                      <th className="px-6 py-4 bg-zinc-950">Raw Weight</th>
                      <th className="px-6 py-4 bg-zinc-950">Calibrated</th>
                      <th className="px-6 py-4 bg-zinc-950">Body Fat %</th>
                      <th className="px-6 py-4 bg-zinc-950">Source</th>
                      <th className="px-6 py-4 bg-zinc-950 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {[...data].reverse().map((entry) => (
                      <tr
                        key={entry.id}
                        className="hover:bg-zinc-800/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <td className="px-6 py-4 text-zinc-300">
                          {format(new Date(entry.timestamp), 'PPP p')}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">{entry.weight} kg</td>
                        <td className="px-6 py-4 font-medium text-white">
                          {(entry.calibratedWeightKg ?? entry.weight).toFixed(2)} kg
                        </td>
                        <td className="px-6 py-4 text-zinc-300">
                          {entry.calibratedBodyFatPct ?? entry.bodyFatPercentage ?? '-'}%
                        </td>
                        <td className="px-6 py-4 text-zinc-500 text-xs uppercase tracking-wider">
                          {entry.source.replace(/_/g, ' ')}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm('Delete this entry?')) {
                                await deleteWeightEntry(entry.id);
                                await refreshWorkspace();
                              }
                            }}
                            className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      <Dialog
        open={!!selectedEntry}
        onOpenChange={(open) => !open && setSelectedEntry(null)}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedEntry && format(new Date(selectedEntry.timestamp), 'PPP p')}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Raw and calibrated composition metrics for this entry.
            </DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Calibrated Weight</span>
                <div className="text-xl font-bold">
                  {(selectedEntry.calibratedWeightKg ?? selectedEntry.weight).toFixed(2)} kg
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">BMI</span>
                <div className="text-xl font-bold">{selectedEntry.bmi ?? '-'}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Body Fat</span>
                <div className="text-xl font-bold text-rose-400">
                  {selectedEntry.calibratedBodyFatPct ?? selectedEntry.bodyFatPercentage ?? '-'}%
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Muscle Mass</span>
                <div className="text-xl font-bold text-emerald-400">
                  {selectedEntry.calibratedMuscleMassKg ?? selectedEntry.muscleMass ?? '-'} kg
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Visceral Fat</span>
                <div className="text-xl font-bold text-orange-400">
                  {selectedEntry.visceralFat ?? '-'}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Water %</span>
                <div className="text-xl font-bold">
                  {selectedEntry.bodyWaterPercentage ?? '-'}%
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Bone Mass</span>
                <div className="text-xl font-bold">{selectedEntry.boneMass ?? '-'} kg</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">BMR</span>
                <div className="text-xl font-bold">{selectedEntry.bmr ?? '-'} kcal</div>
              </div>
              <div className="space-y-1 col-span-2 pt-2 border-t border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase block mb-1">Note</span>
                <p className="text-sm text-zinc-300">
                  {selectedEntry.note || 'No notes for this entry.'}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ChatInterface
        pendingProposals={snapshot?.pendingProposals}
        onProposalResolved={refreshWorkspace}
      />
    </div>
  );
}
