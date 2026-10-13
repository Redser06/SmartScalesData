"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Settings2, Plus, Trash2 } from 'lucide-react';
import {
  createManualWeightEntry,
  deleteHistoricAnchor,
  upsertHistoricAnchor,
  upsertJourneyProfile,
} from '@/app/actions';
import type { HistoricAnchorItem, UserJourneyProfileData } from '@/types/journey';

interface JourneyProfileDrawerProps {
  profile: UserJourneyProfileData;
  historicAnchors: HistoricAnchorItem[];
  onUpdated: () => void;
}

export function JourneyProfileDrawer({
  profile,
  historicAnchors,
  onUpdated,
}: JourneyProfileDrawerProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Profile form state
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [birthYear, setBirthYear] = useState(String(profile.birthYear));
  const [biologicalSex, setBiologicalSex] = useState<UserJourneyProfileData['biologicalSex']>(
    profile.biologicalSex
  );
  const [activityLevel, setActivityLevel] = useState<UserJourneyProfileData['activityLevel']>(
    profile.activityLevel
  );
  const [resistanceDays, setResistanceDays] = useState(String(profile.resistanceTrainingDaysWk));
  const [sleepHours, setSleepHours] = useState(String(profile.sleepHoursAvg ?? 7.5));
  const [goalType, setGoalType] = useState<UserJourneyProfileData['goalType']>(profile.goalType);
  const [targetWeightKg, setTargetWeightKg] = useState(String(profile.targetWeightKg));
  const [targetBodyFatPct, setTargetBodyFatPct] = useState(
    profile.targetBodyFatPct !== null ? String(profile.targetBodyFatPct) : ''
  );
  const [targetMuscleMassKg, setTargetMuscleMassKg] = useState(
    profile.targetMuscleMassKg !== null ? String(profile.targetMuscleMassKg) : ''
  );
  const [targetDate, setTargetDate] = useState(
    profile.targetDate ? profile.targetDate.slice(0, 10) : ''
  );
  const [preferredRate, setPreferredRate] = useState(String(profile.preferredWeeklyRatePctBw));

  // Manual entry form state
  const [manualWeight, setManualWeight] = useState('');
  const [manualBodyFat, setManualBodyFat] = useState('');
  const [manualMuscle, setManualMuscle] = useState('');
  const [manualWater, setManualWater] = useState('');
  const [manualSource, setManualSource] = useState('manual_entry');
  const [manualNote, setManualNote] = useState('');

  // Historic anchor form state
  const [anchorLabel, setAnchorLabel] = useState<HistoricAnchorItem['label']>('1_year_ago');
  const [anchorDate, setAnchorDate] = useState('2025-10-12');
  const [anchorWeight, setAnchorWeight] = useState('');
  const [anchorBodyFat, setAnchorBodyFat] = useState('');
  const [anchorAge, setAnchorAge] = useState('');
  const [anchorContext, setAnchorContext] = useState('');

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);
    try {
      const parsedTargetW = Number.parseFloat(targetWeightKg) || 82;
      const parsedRate = Number.parseFloat(preferredRate) || -0.5;
      await upsertJourneyProfile({
        heightCm: Number.parseFloat(heightCm) || 178,
        birthYear: Number.parseInt(birthYear, 10) || 1988,
        biologicalSex,
        activityLevel,
        resistanceTrainingDaysWk: Number.parseInt(resistanceDays, 10) || 0,
        sleepHoursAvg: sleepHours ? Number.parseFloat(sleepHours) : null,
        goalType,
        targetWeightKg: parsedTargetW,
        targetBodyFatPct: targetBodyFatPct ? Number.parseFloat(targetBodyFatPct) : null,
        targetMuscleMassKg: targetMuscleMassKg ? Number.parseFloat(targetMuscleMassKg) : null,
        targetDate: targetDate ? new Date(`${targetDate}T00:00:00.000Z`).toISOString() : null,
        preferredWeeklyRatePctBw: parsedRate,
        userOverrides: {
          targetWeightKg: parsedTargetW,
          preferredWeeklyRatePctBw: parsedRate,
        },
      });
      setStatusMessage('Journey profile & targets updated.');
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const handleLogManualWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number.parseFloat(manualWeight);
    if (!Number.isFinite(w) || w <= 0) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      await createManualWeightEntry({
        weight: w,
        bodyFatPercentage: manualBodyFat ? Number.parseFloat(manualBodyFat) : null,
        muscleMass: manualMuscle ? Number.parseFloat(manualMuscle) : null,
        bodyWaterPercentage: manualWater ? Number.parseFloat(manualWater) : null,
        source: manualSource || 'manual_entry',
        note: manualNote || null,
      });
      setManualWeight('');
      setManualBodyFat('');
      setManualMuscle('');
      setManualWater('');
      setManualNote('');
      setStatusMessage('Logged weight entry & recalibrated scales.');
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAnchor = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = Number.parseFloat(anchorWeight);
    if (!Number.isFinite(w) || w <= 0) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      await upsertHistoricAnchor({
        label: anchorLabel,
        anchorDate: new Date(`${anchorDate}T00:00:00.000Z`).toISOString(),
        weightKg: w,
        bodyFatPct: anchorBodyFat ? Number.parseFloat(anchorBodyFat) : null,
        ageAtAnchor: anchorAge ? Number.parseInt(anchorAge, 10) : null,
        lifestyleContext: anchorContext || null,
        origin: 'user',
      });
      setAnchorWeight('');
      setAnchorBodyFat('');
      setAnchorContext('');
      setStatusMessage('Saved historic benchmark anchor.');
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-sm gap-2"
        >
          <Settings2 className="h-4 w-4 text-indigo-400" />
          Profile, Manual Log &amp; Anchors
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Journey Profile, Manual Entry &amp; Historic Benchmarks</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Configure your physiological parameters, log entries, or record 1Y / 5Y / 10Y historic anchors.
          </DialogDescription>
        </DialogHeader>

        {statusMessage && (
          <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs px-3 py-2 rounded-lg">
            {statusMessage}
          </div>
        )}

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-zinc-950 border border-zinc-800">
            <TabsTrigger value="profile">Profile &amp; Targets</TabsTrigger>
            <TabsTrigger value="manual">Log Weight Entry</TabsTrigger>
            <TabsTrigger value="anchors">Historic Anchors</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="pt-4">
            <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-zinc-400">Height (cm)</span>
                  <Input
                    type="number"
                    step="0.5"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Birth Year</span>
                  <Input
                    type="number"
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Biological Sex</span>
                  <select
                    value={biologicalSex}
                    onChange={(e) =>
                      setBiologicalSex(
                        e.target.value as UserJourneyProfileData['biologicalSex']
                      )
                    }
                    className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-xs text-white"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Activity Level</span>
                  <select
                    value={activityLevel}
                    onChange={(e) =>
                      setActivityLevel(
                        e.target.value as UserJourneyProfileData['activityLevel']
                      )
                    }
                    className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-xs text-white"
                  >
                    <option value="sedentary">Sedentary (1.2x)</option>
                    <option value="light">Light (1.375x)</option>
                    <option value="moderate">Moderate (1.55x)</option>
                    <option value="active">Active (1.725x)</option>
                    <option value="athlete">Athlete (1.9x)</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Resistance Training (days/wk)</span>
                  <Input
                    type="number"
                    min="0"
                    max="7"
                    value={resistanceDays}
                    onChange={(e) => setResistanceDays(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Avg Sleep (hrs/night)</span>
                  <Input
                    type="number"
                    step="0.5"
                    value={sleepHours}
                    onChange={(e) => setSleepHours(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Goal Mode</span>
                  <select
                    value={goalType}
                    onChange={(e) =>
                      setGoalType(e.target.value as UserJourneyProfileData['goalType'])
                    }
                    className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-xs text-white"
                  >
                    <option value="recomposition">Body Recomposition</option>
                    <option value="cut">Lean Fat Cut</option>
                    <option value="lean_bulk">Lean Muscle Gain</option>
                    <option value="maintain">Maintenance</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Target Weight (kg)</span>
                  <Input
                    type="number"
                    step="0.1"
                    value={targetWeightKg}
                    onChange={(e) => setTargetWeightKg(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Target Body Fat (%)</span>
                  <Input
                    type="number"
                    step="0.5"
                    value={targetBodyFatPct}
                    onChange={(e) => setTargetBodyFatPct(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Target Muscle Mass (kg)</span>
                  <Input
                    type="number"
                    step="0.5"
                    value={targetMuscleMassKg}
                    onChange={(e) => setTargetMuscleMassKg(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Target Date</span>
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Preferred Rate (%BW/wk)</span>
                  <Input
                    type="number"
                    step="0.05"
                    value={preferredRate}
                    onChange={(e) => setPreferredRate(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Save Journey Profile &amp; Targets
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="manual" className="pt-4">
            <form onSubmit={handleLogManualWeight} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-zinc-400">Weight (kg) *</span>
                  <Input
                    type="number"
                    step="0.1"
                    required
                    value={manualWeight}
                    onChange={(e) => setManualWeight(e.target.value)}
                    placeholder="e.g. 88.4"
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Body Fat (%)</span>
                  <Input
                    type="number"
                    step="0.1"
                    value={manualBodyFat}
                    onChange={(e) => setManualBodyFat(e.target.value)}
                    placeholder="e.g. 19.5"
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Muscle Mass (kg)</span>
                  <Input
                    type="number"
                    step="0.1"
                    value={manualMuscle}
                    onChange={(e) => setManualMuscle(e.target.value)}
                    placeholder="e.g. 64.2"
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Body Water (%)</span>
                  <Input
                    type="number"
                    step="0.1"
                    value={manualWater}
                    onChange={(e) => setManualWater(e.target.value)}
                    placeholder="e.g. 56.0"
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Scale Source</span>
                  <Input
                    value={manualSource}
                    onChange={(e) => setManualSource(e.target.value)}
                    placeholder="renpho / withings / manual"
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Note</span>
                  <Input
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    placeholder="Post-workout / morning"
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Log Weight Entry
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="anchors" className="pt-4 space-y-4">
            <form onSubmit={handleSaveAnchor} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-zinc-400">Benchmark Horizon</span>
                  <select
                    value={anchorLabel}
                    onChange={(e) =>
                      setAnchorLabel(e.target.value as HistoricAnchorItem['label'])
                    }
                    className="w-full h-9 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-xs text-white"
                  >
                    <option value="1_year_ago">1 Year Ago</option>
                    <option value="5_years_ago">5 Years Ago</option>
                    <option value="10_years_ago">10 Years Ago</option>
                    <option value="all_time_peak">All-Time Peak</option>
                    <option value="adult_low">Adult Low</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Approximate Date</span>
                  <Input
                    type="date"
                    value={anchorDate}
                    onChange={(e) => setAnchorDate(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Weight (kg) *</span>
                  <Input
                    type="number"
                    step="0.1"
                    required
                    value={anchorWeight}
                    onChange={(e) => setAnchorWeight(e.target.value)}
                    placeholder="e.g. 92.0"
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Body Fat (%)</span>
                  <Input
                    type="number"
                    step="0.5"
                    value={anchorBodyFat}
                    onChange={(e) => setAnchorBodyFat(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Age at Benchmark</span>
                  <Input
                    type="number"
                    value={anchorAge}
                    onChange={(e) => setAnchorAge(e.target.value)}
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Lifestyle Context</span>
                  <Input
                    value={anchorContext}
                    onChange={(e) => setAnchorContext(e.target.value)}
                    placeholder="e.g. Rugby season / marathon"
                    className="bg-zinc-950 border-zinc-800"
                  />
                </label>
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Save Historic Anchor
              </Button>
            </form>

            {historicAnchors.length > 0 && (
              <div className="space-y-2 border-t border-zinc-800 pt-3">
                <h4 className="text-xs font-semibold text-zinc-300">Saved Historic Benchmarks</h4>
                {historicAnchors.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-white">
                        {a.label.replace(/_/g, ' ')}: {a.weightKg.toFixed(1)} kg
                      </span>
                      {a.lifestyleContext ? (
                        <span className="text-zinc-400 ml-2">({a.lifestyleContext})</span>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        await deleteHistoricAnchor(a.id);
                        onUpdated();
                      }}
                      className="h-7 w-7 text-zinc-400 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
