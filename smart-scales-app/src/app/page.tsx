"use client";

import { useEffect, useState, useMemo, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { getWeightHistory, deleteWeightEntry, importCsvData, getNutritionHistory } from './actions';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { DailyMacrosChart } from '@/components/analytics/DailyMacrosChart';
import { FoodFrequencyChart } from '@/components/analytics/FoodFrequencyChart';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ArrowDownIcon, ArrowUpIcon, Scale, Calendar, Activity, TrendingDown, Target, Trash2, Upload, LogOut } from 'lucide-react';
import { format, subDays, isAfter } from 'date-fns';
import { calculateTrend, getProjections } from '@/lib/predictions';
import ChatInterface from '@/components/chat-interface';

// Simple UI Components
const StatsCard = ({ title, value, subtext, icon: Icon, trend }: any) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
    <div className="flex flex-row items-center justify-between pb-2">
      <h3 className="text-sm font-medium text-zinc-400">{title}</h3>
      <Icon className="h-4 w-4 text-zinc-500" />
    </div>
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="flex items-center text-xs text-zinc-500 mt-1">
      {trend && (
        <span className={`flex items-center mr-1 ${trend < 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
          {trend < 0 ? <ArrowDownIcon className="h-3 w-3 mr-0.5" /> : <ArrowUpIcon className="h-3 w-3 mr-0.5" />}
          {Math.abs(trend).toFixed(1)}
        </span>
      )}
      {subtext}
    </div>
  </div>
);

const PredictionCard = ({ label, date, value, change }: any) => (
  <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 flex flex-col items-center text-center">
    <span className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</span>
    <span className="text-3xl font-bold text-white mb-1">{value.toFixed(1)} <span className="text-sm text-zinc-400 font-normal">kg</span></span>
    <span className="text-xs text-zinc-400 mb-2">{format(date, 'MMM do')}</span>
    <div className={`text-xs px-2 py-1 rounded-full ${change < 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
      {change > 0 ? '+' : ''}{change.toFixed(1)} kg
    </div>
  </div>
)

export default function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [projections, setProjections] = useState<any[]>([]);
  const [timeRange, setTimeRange] = useState("all");
  const [uploading, setUploading] = useState(false);

  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);
  const [nutrition, setNutrition] = useState<{ daily: any[], frequency: any[] }>({ daily: [], frequency: [] });
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          message: `Imported ${result.imported} entries${result.skipped ? `, skipped ${result.skipped} duplicates` : ''}`
        });
        // Refresh data
        const history = await getWeightHistory();
        setData(history);
      } else {
        setUploadResult({ success: false, message: result.error || 'Import failed' });
      }
    } catch (error: any) {
      setUploadResult({ success: false, message: error.message || 'Failed to read file' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // Fetch data only when authenticated
  useEffect(() => {
    if (status !== 'authenticated') return;

    getWeightHistory()
      .then((history) => {
        setData(history);

        // Calculate projections based on FULL history trends
        if (history.length >= 5) {
          const trend = calculateTrend(history, 'weight');
          const proj = getProjections(history, trend);
          setProjections(proj);
        }

        setLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load weight history:', error);
        setLoading(false);
      });

    getNutritionHistory()
      .then(nut => {
        setNutrition(nut);
      })
      .catch((error) => {
        console.error('Failed to load nutrition history:', error);
      });
  }, [status]);

  const filteredData = useMemo(() => {
    if (timeRange === "all") return data;

    const now = new Date();
    let cutoffDate = subDays(now, 7); // Default to 1 week

    if (timeRange === "1m") cutoffDate = subDays(now, 30);
    if (timeRange === "3m") cutoffDate = subDays(now, 90);
    if (timeRange === "6m") cutoffDate = subDays(now, 180);
    if (timeRange === "1y") cutoffDate = subDays(now, 365);

    return data.filter(item => isAfter(new Date(item.timestamp), cutoffDate));
  }, [data, timeRange]);

  // Show loading while checking auth or fetching data
  if (status === 'loading' || loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading your journey...</div>;
  }

  // Don't render if not authenticated (will redirect)
  if (status !== 'authenticated') {
    return null;
  }

  const currentWeight = data[data.length - 1]?.weight || 0;
  const startWeight = data[0]?.weight || 0;
  const totalLoss = startWeight - currentWeight;
  const recentTrend = data.length > 7 ? data[data.length - 8].weight - currentWeight : 0;
  // Note: Stats usually reflect "All Time" reality, but charts reflect the view. 
  // Let's keep stats as "Current Reality" (latest data point vs history) regardless of zoom, 
  // or should they reflect the zoomed window? Usually "Current Weight" is absolute. 
  // "Total Loss" implies from start of journey. I will keep Stats absolute for now.

  return (
    <div className="min-h-screen bg-black text-zinc-100 p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
              Welcome back, {session?.user?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-zinc-400">Your weight loss journey at a glance.</p>
          </div>
          <div className="flex items-center gap-4">
            <Tabs defaultValue="all" value={timeRange} onValueChange={setTimeRange} className="w-[400px]">
              <TabsList className="grid w-full grid-cols-5 bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="1m" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 hover:text-zinc-300">1M</TabsTrigger>
                <TabsTrigger value="3m" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 hover:text-zinc-300">3M</TabsTrigger>
                <TabsTrigger value="6m" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 hover:text-zinc-300">6M</TabsTrigger>
                <TabsTrigger value="1y" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 hover:text-zinc-300">1Y</TabsTrigger>
                <TabsTrigger value="all" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white text-zinc-500 hover:text-zinc-300">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-3 pl-4 border-l border-zinc-800">
              <div className="text-right">
                <p className="text-sm font-medium text-white">{session?.user?.name || 'User'}</p>
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

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Current Weight"
            value={`${currentWeight} kg`}
            icon={Scale}
            trend={data.length > 1 ? data[data.length - 1].weight - data[data.length - 2].weight : 0}
            subtext="since last entry"
          />
          <StatsCard
            title="Total Loss"
            value={`${totalLoss.toFixed(1)} kg`}
            icon={Activity}
            trend={-totalLoss}
            subtext="since start"
          />
          <StatsCard
            title="Recent Trend (7 entries)"
            value={`${Math.abs(recentTrend).toFixed(1)} kg`}
            icon={Activity}
            subtext={recentTrend > 0 ? "lost recently" : "gained recently"}
          />
          <StatsCard
            title="Latest Body Fat"
            value={`${data[data.length - 1]?.bodyFatPercentage ?? '-'}%`}
            icon={Activity}
            subtext="composition"
          />
        </div>

        {/* Chart Area */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="col-span-2 bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white">Weight History</h3>
              <p className="text-sm text-zinc-400">Visualizing your progress over time</p>
            </div>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredData}>
                  <defs>
                    <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(str) => format(new Date(str), 'MMM d')}
                    stroke="#71717a"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={30}
                  />
                  <YAxis
                    domain={['dataMin - 1', 'dataMax + 1']}
                    stroke="#71717a"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}kg`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                    itemStyle={{ color: '#e4e4e7' }}
                    labelStyle={{ color: '#a1a1aa' }}
                    labelFormatter={(label) => format(new Date(label), 'PPP p')}
                  />
                  <Area
                    type="monotone"
                    dataKey="weight"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorWeight)"
                    animationDuration={500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Predictions Section */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-5 w-5 text-indigo-400" />
                <h3 className="text-lg font-semibold text-white">Future Trajectory</h3>
              </div>
              <p className="text-sm text-zinc-400">Predicted based on last 5 entries</p>
            </div>

            <div className="flex-1 flex flex-col justify-center gap-4">
              {projections.length > 0 ? (
                projections.map((proj, i) => (
                  <PredictionCard key={i} {...proj} />
                ))
              ) : (
                <div className="text-zinc-500 text-center">Not enough data for predictions</div>
              )}
            </div>

          </div>
        </div>

        {/* Nutrition Section */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-white">Nutrition Insights</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-[400px]">
              <DailyMacrosChart data={nutrition.daily} />
            </div>
            <div className="h-[400px]">
              <FoodFrequencyChart data={nutrition.frequency} />
            </div>
          </div>
        </div>

        {/* Recent Entries Table */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-[600px]">
          <div className="p-6 border-b border-zinc-800 shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Recent Entries</h3>
                <p className="text-sm text-zinc-500">Click on any row to view full composition details.</p>
              </div>
              <div className="flex items-center gap-3">
                {uploadResult && (
                  <span className={`text-sm ${uploadResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? 'Importing...' : 'Import CSV'}
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
                      <th className="px-6 py-4 bg-zinc-950">Weight</th>
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
                        <td className="px-6 py-4 font-medium text-white">{entry.weight} kg</td>
                        <td className="px-6 py-4 text-zinc-300">{entry.bodyFatPercentage}%</td>
                        <td className="px-6 py-4 text-zinc-500 text-xs uppercase tracking-wider">{entry.source.replace('_', ' ')}</td>
                        <td className="px-6 py-4">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm('Delete this entry?')) {
                                await deleteWeightEntry(entry.id);
                                setData(data.filter(d => d.id !== entry.id));
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

      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedEntry && format(new Date(selectedEntry.timestamp), 'PPP p')}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Detailed composition metrics for this weight entry.
            </DialogDescription>
          </DialogHeader>
          {selectedEntry && (
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Weight</span>
                <div className="text-xl font-bold">{selectedEntry.weight} kg</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">BMI</span>
                <div className="text-xl font-bold">{selectedEntry.bmi}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Body Fat</span>
                <div className="text-xl font-bold text-rose-400">{selectedEntry.bodyFatPercentage}%</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Muscle Mass</span>
                <div className="text-xl font-bold text-emerald-400">{selectedEntry.muscleMass} kg</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Visceral Fat</span>
                <div className="text-xl font-bold text-orange-400">{selectedEntry.visceralFat}</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Water %</span>
                <div className="text-xl font-bold">{selectedEntry.bodyWaterPercentage}%</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">Bone Mass</span>
                <div className="text-xl font-bold">{selectedEntry.boneMass} kg</div>
              </div>
              <div className="space-y-1">
                <span className="text-xs text-zinc-500 uppercase">BMR</span>
                <div className="text-xl font-bold">{selectedEntry.bmr} kcal</div>
              </div>
              <div className="space-y-1 col-span-2 pt-2 border-t border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase block mb-1">Note</span>
                <p className="text-sm text-zinc-300">{selectedEntry.note || "No notes for this entry."}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ChatInterface />
    </div>
  );
}
