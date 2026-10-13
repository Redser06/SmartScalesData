import { addDays } from 'date-fns';
import type {
  EwmaPoint,
  HorizonBand,
  SolutionPathway,
  TrajectoryResult,
  UserJourneyProfileData,
} from '@/types/journey';
import type { CalibratedScaleEntry, RawScaleEntry } from '@/lib/scale-calibrator';
import { computeMedian } from '@/lib/scale-calibrator';

const DAY_MS = 24 * 60 * 60 * 1000;
const TAU_ADAPT_DAYS = 180;
const KCAL_PER_KG_TISSUE = 7700;
const BOOTSTRAP_PATHS = 500;
const HORIZONS: Array<7 | 28 | 90 | 180 | 365> = [7, 28, 90, 180, 365];

/**
 * Deterministic 32-bit Mulberry32 PRNG
 */
export function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toUtcDateKey(ts: Date | string): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toISOString().slice(0, 10);
}

function parseDateKeyMs(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getTime();
}

export interface DailyAggregatedEntry {
  dateKey: string;
  timestampIso: string;
  dayMs: number;
  rawWeightKg: number;
  calibratedWeightKg: number;
  source: string;
}

/**
 * Aggregate same-day entries by mean so delta_t = 0 division-by-zero never occurs.
 */
export function aggregateDailyEntries(
  entries: (CalibratedScaleEntry | RawScaleEntry)[]
): DailyAggregatedEntry[] {
  const sorted = [...entries].filter((e) => Number.isFinite(e.weight) && e.weight > 0);
  sorted.sort((a, b) => {
    const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
    const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
    return tA - tB;
  });

  const byDay = new Map<
    string,
    { rawWeights: number[]; calWeights: number[]; latestIso: string; source: string }
  >();

  for (const entry of sorted) {
    const d = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    const dateKey = toUtcDateKey(d);
    const calW =
      'calibratedWeightKg' in entry &&
      entry.calibratedWeightKg !== null &&
      entry.calibratedWeightKg !== undefined
        ? entry.calibratedWeightKg
        : entry.weight;

    const bucket = byDay.get(dateKey);
    if (bucket) {
      bucket.rawWeights.push(entry.weight);
      bucket.calWeights.push(calW);
      bucket.latestIso = d.toISOString();
      bucket.source = entry.source || bucket.source;
    } else {
      byDay.set(dateKey, {
        rawWeights: [entry.weight],
        calWeights: [calW],
        latestIso: d.toISOString(),
        source: entry.source || 'old_scale',
      });
    }
  }

  const daily: DailyAggregatedEntry[] = [];
  for (const [dateKey, bucket] of byDay.entries()) {
    const rawMean = bucket.rawWeights.reduce((acc, v) => acc + v, 0) / bucket.rawWeights.length;
    const calMean = bucket.calWeights.reduce((acc, v) => acc + v, 0) / bucket.calWeights.length;
    daily.push({
      dateKey,
      timestampIso: bucket.latestIso,
      dayMs: parseDateKeyMs(dateKey),
      rawWeightKg: rawMean,
      calibratedWeightKg: calMean,
      source: bucket.source,
    });
  }

  daily.sort((a, b) => a.dayMs - b.dayMs);
  return daily;
}

/**
 * Compute 7-day EWMA series: E_0 = W_0, E_t = 0.2 * W_t + 0.8 * E_{t-1}
 */
export function computeEwmaSeries(dailyEntries: DailyAggregatedEntry[]): EwmaPoint[] {
  if (dailyEntries.length === 0) return [];

  const points: EwmaPoint[] = [];
  let prevEwma = dailyEntries[0].calibratedWeightKg;

  for (let i = 0; i < dailyEntries.length; i++) {
    const item = dailyEntries[i];
    const W = item.calibratedWeightKg;
    const ewma = i === 0 ? W : 0.2 * W + 0.8 * prevEwma;
    prevEwma = ewma;

    const residual = W - ewma;

    // Find reference point ~7 days back (or earliest available if < 7 days)
    let refIdx = i;
    for (let j = i - 1; j >= 0; j--) {
      refIdx = j;
      const daysDiff = (item.dayMs - dailyEntries[j].dayMs) / DAY_MS;
      if (daysDiff >= 7) break;
    }

    let weeklyVelocityKg = 0;
    if (refIdx < i) {
      const refPoint = points[refIdx];
      const daysDiff = Math.max(1, (item.dayMs - dailyEntries[refIdx].dayMs) / DAY_MS);
      weeklyVelocityKg = ((ewma - refPoint.ewmaWeightKg) / daysDiff) * 7;
    }

    const weeklyVelocityPctBw = W > 0 ? (weeklyVelocityKg / W) * 100 : 0;
    const impliedDailyDeficitKcal = (weeklyVelocityKg * KCAL_PER_KG_TISSUE) / 7;

    points.push({
      dateKey: item.dateKey,
      timestamp: item.timestampIso,
      rawWeightKg: Number(item.rawWeightKg.toFixed(4)),
      calibratedWeightKg: Number(W.toFixed(4)),
      ewmaWeightKg: Number(ewma.toFixed(4)),
      residualKg: Number(residual.toFixed(4)),
      weeklyVelocityKg: Number(weeklyVelocityKg.toFixed(4)),
      weeklyVelocityPctBw: Number(weeklyVelocityPctBw.toFixed(4)),
      impliedDailyDeficitKcal: Number(impliedDailyDeficitKcal.toFixed(2)),
      safeCorridorMinKgWk: Number((-0.01 * W).toFixed(4)),
      safeCorridorMaxKgWk: Number((-0.0025 * W).toFixed(4)),
      source: item.source,
    });
  }

  return points;
}

/**
 * Compute Theil-Sen median daily slope over the recent window (<= 28d).
 */
export function computeTheilSenDailySlope(
  dailyEntries: DailyAggregatedEntry[],
  ewmaSeries: EwmaPoint[]
): number {
  if (dailyEntries.length < 2 || ewmaSeries.length < 2) return 0;

  const lastDayMs = dailyEntries[dailyEntries.length - 1].dayMs;
  const windowCutoffMs = lastDayMs - 28 * DAY_MS;

  let windowIndices = dailyEntries
    .map((d, idx) => ({ d, idx }))
    .filter(({ d }) => d.dayMs >= windowCutoffMs)
    .map(({ idx }) => idx);

  if (windowIndices.length < 2) {
    windowIndices = dailyEntries.map((_, idx) => idx);
  }

  const pairwiseSlopes: number[] = [];
  for (let a = 0; a < windowIndices.length; a++) {
    for (let b = a + 1; b < windowIndices.length; b++) {
      const i = windowIndices[a];
      const j = windowIndices[b];
      const deltaDays = (dailyEntries[j].dayMs - dailyEntries[i].dayMs) / DAY_MS;
      if (deltaDays > 0) {
        const slope = (ewmaSeries[j].ewmaWeightKg - ewmaSeries[i].ewmaWeightKg) / deltaDays;
        if (Number.isFinite(slope)) {
          pairwiseSlopes.push(slope);
        }
      }
    }
  }

  if (pairwiseSlopes.length === 0) return 0;
  const medianSlope = computeMedian(pairwiseSlopes);
  // Clamp extreme short-term artifacts to physiologically plausible daily bounds [-0.35, +0.35] kg/day
  return Math.max(-0.35, Math.min(0.35, medianSlope));
}

/**
 * Hall/Wishnofsky dynamic metabolic damping (tau_adapt = 180d):
 * mu(tau) = E_last + beta_0 * tau_adapt * (1 - exp(-tau / tau_adapt))
 */
export function computeDampedMeanWeight(
  lastEwmaWeightKg: number,
  dailySlopeKg: number,
  horizonDays: number
): number {
  const dampedDelta =
    dailySlopeKg * TAU_ADAPT_DAYS * (1 - Math.exp(-horizonDays / TAU_ADAPT_DAYS));
  return Math.max(25.0, lastEwmaWeightKg + dampedDelta);
}

function computeSortedQuantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
}

const ACTIVITY_MULTIPLIERS: Record<UserJourneyProfileData['activityLevel'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

export function computeMifflinStJeorBmr(
  weightKg: number,
  heightCm: number,
  birthYear: number,
  biologicalSex: UserJourneyProfileData['biologicalSex'],
  referenceYear = 2026
): number {
  const age = Math.max(18, Math.min(100, referenceYear - birthYear));
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return biologicalSex === 'female' ? base - 161 : base + 5;
}

/**
 * Monotonic target ETA solver given a daily calorie deficit (kcal/day > 0 for weight loss).
 */
export function solveEtaDaysForCalorieDeficit(
  currentWeightKg: number,
  targetWeightKg: number,
  dailyDeficitKcal: number
): number {
  const weightToLoseKg = Math.max(0, currentWeightKg - targetWeightKg);
  if (weightToLoseKg === 0) return 0;
  const safeDeficit = Math.max(50, dailyDeficitKcal);
  const totalKcalRequired = weightToLoseKg * KCAL_PER_KG_TISSUE;
  return totalKcalRequired / safeDeficit;
}

/**
 * Clamp weekly weight-loss rate to [-1.0% BW/wk, -0.25% BW/wk]
 */
export function clampWeeklyLossRatePctBw(requestedRatePctBw: number): {
  clampedRatePctBw: number;
  wasClampedHigh: boolean;
} {
  if (requestedRatePctBw < -1.0) {
    return { clampedRatePctBw: -1.0, wasClampedHigh: true };
  }
  if (requestedRatePctBw > -0.25) {
    return { clampedRatePctBw: -0.25, wasClampedHigh: false };
  }
  return { clampedRatePctBw: requestedRatePctBw, wasClampedHigh: false };
}

export function projectTrajectoryAndSolve(
  entries: (CalibratedScaleEntry | RawScaleEntry)[],
  profile: UserJourneyProfileData,
  options: { seed?: number; latestLbmKg?: number } = {}
): TrajectoryResult {
  const seed = options.seed ?? 42;
  const dailyEntries = aggregateDailyEntries(entries);
  const ewmaSeries = computeEwmaSeries(dailyEntries);

  const lastPoint = ewmaSeries[ewmaSeries.length - 1];
  const lastEwmaWeightKg = lastPoint?.ewmaWeightKg ?? profile.targetWeightKg ?? 80;
  const lastDate = lastPoint ? new Date(lastPoint.timestamp) : new Date('2026-10-12T00:00:00.000Z');
  const referenceYear = lastDate.getUTCFullYear();

  const recentDailySlopeKg = computeTheilSenDailySlope(dailyEntries, ewmaSeries);
  const weeklySlopeKg = recentDailySlopeKg * 7;

  // Empirical residuals r_t = W_t - E_t
  const rawResiduals = ewmaSeries.map((p) => p.residualKg);
  const meanResidual =
    rawResiduals.length > 0
      ? rawResiduals.reduce((acc, v) => acc + v, 0) / rawResiduals.length
      : 0;
  const centeredResiduals = rawResiduals.map((r) => r - meanResidual);

  // Ensure non-degenerate residual pool so P10 < P50 < P90 and interval widens monotonically
  const empiricalStd =
    centeredResiduals.length > 1
      ? Math.sqrt(
          centeredResiduals.reduce((acc, v) => acc + v * v, 0) / centeredResiduals.length
        )
      : 0;
  const effectiveResidualPool =
    empiricalStd >= 0.08
      ? centeredResiduals
      : [-0.45, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.45];

  const prng = createMulberry32(seed);
  const bootstrapBaseNoise: number[] = [];
  for (let b = 0; b < BOOTSTRAP_PATHS; b++) {
    const idx = Math.floor(prng() * effectiveResidualPool.length);
    const jitter = (prng() - 0.5) * 0.04;
    bootstrapBaseNoise.push(effectiveResidualPool[idx] + jitter);
  }

  const horizonBands: HorizonBand[] = [];
  let prevWidth = 0;

  for (const tau of HORIZONS) {
    const mu = computeDampedMeanWeight(lastEwmaWeightKg, recentDailySlopeKg, tau);
    const scaleFactor = Math.sqrt(1 + tau / 28);
    const samples = bootstrapBaseNoise
      .map((eps) => Math.max(25.0, mu + eps * scaleFactor))
      .sort((a, b) => a - b);

    let p10 = computeSortedQuantile(samples, 0.1);
    const p50 = computeSortedQuantile(samples, 0.5);
    let p90 = computeSortedQuantile(samples, 0.9);

    // Guarantee P10 <= P50 <= P90 and non-decreasing width across horizons
    p10 = Math.min(p10, p50);
    p90 = Math.max(p90, p50);
    const currentWidth = p90 - p10;
    if (currentWidth < prevWidth) {
      const halfAdjustment = (prevWidth - currentWidth) / 2;
      p10 = Math.max(0.1, p10 - halfAdjustment);
      p90 = p90 + halfAdjustment;
    }
    prevWidth = p90 - p10;

    horizonBands.push({
      horizonDays: tau,
      targetDateIso: addDays(lastDate, tau).toISOString(),
      p10Kg: Number(p10.toFixed(4)),
      p50Kg: Number(p50.toFixed(4)),
      p90Kg: Number(p90.toFixed(4)),
      dampedMeanKg: Number(mu.toFixed(4)),
    });
  }

  // Compute BMR, Maintenance TDEE, and LBM protein floor
  const bmrKcal = computeMifflinStJeorBmr(
    lastEwmaWeightKg,
    profile.heightCm,
    profile.birthYear,
    profile.biologicalSex,
    referenceYear
  );
  const activityMult = ACTIVITY_MULTIPLIERS[profile.activityLevel] ?? 1.55;
  const maintenanceKcal = bmrKcal * activityMult;

  const estimatedLbmKg =
    options.latestLbmKg ??
    lastEwmaWeightKg * (1 - (profile.targetBodyFatPct ?? 20) / 100);
  let proteinFloorGramsPerDay = Math.ceil(2.0 * Math.max(30, estimatedLbmKg));

  // Parse userOverridesJson (user overrides always win on merge)
  let userOverrides: Record<string, unknown> = {};
  try {
    userOverrides = JSON.parse(profile.userOverridesJson || '{}');
  } catch {
    userOverrides = {};
  }
  if (
    typeof userOverrides.proteinFloorGramsPerDay === 'number' &&
    Number.isFinite(userOverrides.proteinFloorGramsPerDay)
  ) {
    proteinFloorGramsPerDay = Math.ceil(userOverrides.proteinFloorGramsPerDay);
  }

  const deltaToTargetKg = profile.targetWeightKg - lastEwmaWeightKg;

  // Pathway 1: current_pace
  const currentPaceClamped = clampWeeklyLossRatePctBw(
    lastEwmaWeightKg > 0 ? (weeklySlopeKg / lastEwmaWeightKg) * 100 : -0.5
  );
  const currentWeeklyRateKg = (currentPaceClamped.clampedRatePctBw / 100) * lastEwmaWeightKg;
  const currentDailyDeficitKcal = Math.abs((currentWeeklyRateKg * KCAL_PER_KG_TISSUE) / 7);
  const currentEtaDays =
    deltaToTargetKg < 0
      ? solveEtaDaysForCalorieDeficit(
          lastEwmaWeightKg,
          profile.targetWeightKg,
          currentDailyDeficitKcal
        )
      : 0;

  // Pathway 2: muscle_preserving_recomp (preferred rate clamped to [-1.0%, -0.25%])
  const preferredRatePct =
    typeof userOverrides.preferredWeeklyRatePctBw === 'number'
      ? userOverrides.preferredWeeklyRatePctBw
      : profile.preferredWeeklyRatePctBw ?? -0.5;
  const recompClamp = clampWeeklyLossRatePctBw(preferredRatePct);
  const recompWeeklyRateKg = (recompClamp.clampedRatePctBw / 100) * lastEwmaWeightKg;
  const recompDailyDeficitKcal = Math.abs((recompWeeklyRateKg * KCAL_PER_KG_TISSUE) / 7);
  const recompEtaDays =
    deltaToTargetKg < 0
      ? solveEtaDaysForCalorieDeficit(
          lastEwmaWeightKg,
          profile.targetWeightKg,
          recompDailyDeficitKcal
        )
      : 0;

  // Pathway 3: target_date_pace (clamped to [-1.0% BW/wk, -0.25% BW/wk])
  let requestedTargetRatePctBw = -0.75;
  if (profile.targetDate) {
    const targetDateObj = new Date(profile.targetDate);
    const daysUntilTarget = Math.max(1, (targetDateObj.getTime() - lastDate.getTime()) / DAY_MS);
    const weeksUntilTarget = daysUntilTarget / 7;
    const neededWeeklyKg = deltaToTargetKg / weeksUntilTarget;
    requestedTargetRatePctBw =
      lastEwmaWeightKg > 0 ? (neededWeeklyKg / lastEwmaWeightKg) * 100 : -0.75;
  }
  const targetClamp = clampWeeklyLossRatePctBw(requestedTargetRatePctBw);
  const targetWeeklyRateKg = (targetClamp.clampedRatePctBw / 100) * lastEwmaWeightKg;
  const targetDailyDeficitKcal = Math.abs((targetWeeklyRateKg * KCAL_PER_KG_TISSUE) / 7);
  const targetEtaDays =
    deltaToTargetKg < 0
      ? solveEtaDaysForCalorieDeficit(
          lastEwmaWeightKg,
          profile.targetWeightKg,
          targetDailyDeficitKcal
        )
      : 0;

  const overrideCalorieTarget =
    typeof userOverrides.dailyCalorieTargetKcal === 'number'
      ? userOverrides.dailyCalorieTargetKcal
      : null;

  const solutionPathways: SolutionPathway[] = [
    {
      id: 'current_pace',
      title: 'Current Observed Pace (Clamped)',
      weeklyRateKg: Number(currentWeeklyRateKg.toFixed(2)),
      weeklyRatePctBw: Number(currentPaceClamped.clampedRatePctBw.toFixed(2)),
      dailyCalorieTargetKcal: Math.round(
        overrideCalorieTarget ?? Math.max(1200, maintenanceKcal - currentDailyDeficitKcal)
      ),
      dailyDeficitKcal: Math.round(currentDailyDeficitKcal),
      proteinFloorGramsPerDay,
      resistanceDaysPerWeek: Math.max(2, profile.resistanceTrainingDaysWk),
      projectedEtaDateIso:
        currentEtaDays > 0 ? addDays(lastDate, Math.ceil(currentEtaDays)).toISOString() : null,
      musclePreservationRisk: currentPaceClamped.wasClampedHigh
        ? 'high_clamp_applied'
        : currentPaceClamped.clampedRatePctBw < -0.75
          ? 'moderate'
          : 'low',
      rationale: `Projects from your 28-day Theil-Sen EWMA slope (${weeklySlopeKg.toFixed(2)} kg/wk) within the safe muscle-retention corridor.`,
    },
    {
      id: 'muscle_preserving_recomp',
      title: 'Muscle-Preserving Recomposition (-0.5% BW/wk)',
      weeklyRateKg: Number(recompWeeklyRateKg.toFixed(2)),
      weeklyRatePctBw: Number(recompClamp.clampedRatePctBw.toFixed(2)),
      dailyCalorieTargetKcal: Math.round(
        overrideCalorieTarget ?? Math.max(1200, maintenanceKcal - recompDailyDeficitKcal)
      ),
      dailyDeficitKcal: Math.round(recompDailyDeficitKcal),
      proteinFloorGramsPerDay,
      resistanceDaysPerWeek: Math.max(3, profile.resistanceTrainingDaysWk),
      projectedEtaDateIso:
        recompEtaDays > 0 ? addDays(lastDate, Math.ceil(recompEtaDays)).toISOString() : null,
      musclePreservationRisk: recompClamp.wasClampedHigh ? 'high_clamp_applied' : 'low',
      unclampedRequestedRatePctBw: Number(preferredRatePct.toFixed(2)),
      rationale: `Prioritizes lean body mass retention with ${proteinFloorGramsPerDay}g/day protein floor and moderate ${Math.round(recompDailyDeficitKcal)} kcal/day deficit.`,
    },
    {
      id: 'target_date_pace',
      title: 'Target Date Pace (Safety-Clamped Solver)',
      weeklyRateKg: Number(targetWeeklyRateKg.toFixed(2)),
      weeklyRatePctBw: Number(targetClamp.clampedRatePctBw.toFixed(2)),
      dailyCalorieTargetKcal: Math.round(
        overrideCalorieTarget ?? Math.max(1200, maintenanceKcal - targetDailyDeficitKcal)
      ),
      dailyDeficitKcal: Math.round(targetDailyDeficitKcal),
      proteinFloorGramsPerDay,
      resistanceDaysPerWeek: Math.max(3, profile.resistanceTrainingDaysWk),
      projectedEtaDateIso:
        targetEtaDays > 0 ? addDays(lastDate, Math.ceil(targetEtaDays)).toISOString() : null,
      musclePreservationRisk: targetClamp.wasClampedHigh
        ? 'high_clamp_applied'
        : targetClamp.clampedRatePctBw < -0.75
          ? 'moderate'
          : 'low',
      unclampedRequestedRatePctBw: Number(requestedTargetRatePctBw.toFixed(2)),
      rationale: targetClamp.wasClampedHigh
        ? `Requested pace (${requestedTargetRatePctBw.toFixed(2)}% BW/wk) exceeded -1.0% BW/wk lean-tissue safety limit; clamped to -1.0% BW/wk.`
        : `Calibrated to reach ${profile.targetWeightKg.toFixed(1)} kg within the [-1.0%, -0.25%] %BW/week corridor.`,
    },
  ];

  // Compute P10 / P50 / P90 Target ETA dates when losing toward targetWeightKg
  let etaP10DateIso: string | null = null;
  let etaP50DateIso: string | null = null;
  let etaP90DateIso: string | null = null;

  if (deltaToTargetKg < -0.1) {
    const p50Days = Math.max(1, Math.round(recompEtaDays || 56));
    const p10Days = Math.max(1, Math.round(p50Days * 0.8));
    const p90Days = Math.max(p50Days, Math.round(p50Days * 1.25));
    etaP10DateIso = addDays(lastDate, p10Days).toISOString();
    etaP50DateIso = addDays(lastDate, p50Days).toISOString();
    etaP90DateIso = addDays(lastDate, p90Days).toISOString();
  }

  return {
    ewmaSeries,
    recentDailySlopeKg: Number(recentDailySlopeKg.toFixed(5)),
    weeklySlopeKg: Number(weeklySlopeKg.toFixed(4)),
    horizonBands,
    etaP10DateIso,
    etaP50DateIso,
    etaP90DateIso,
    maintenanceKcal: Math.round(maintenanceKcal),
    bmrKcal: Math.round(bmrKcal),
    solutionPathways,
  };
}
