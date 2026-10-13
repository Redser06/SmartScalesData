import type {
  CompositionClassification,
  CompositionReconciliation,
  UserJourneyProfileData,
} from '@/types/journey';
import type { CalibratedScaleEntry, RawScaleEntry } from '@/lib/scale-calibrator';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const FORTY_FIVE_DAYS_MS = 45 * 24 * 60 * 60 * 1000;

function toMs(ts: Date | string): number {
  return ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
}

function toIso(ts: Date | string): string {
  return ts instanceof Date ? ts.toISOString() : new Date(ts).toISOString();
}

export interface ReconcileInputEntry extends RawScaleEntry {
  calibratedWeightKg?: number | null;
  calibratedBodyFatPct?: number | null;
  calibratedMuscleMassKg?: number | null;
}

/**
 * Decision D4: BMI vs. FFMI & Composition Partitioning
 * Reconciles calibrated weight, body fat %, and muscle mass into Fat Mass (FM),
 * Lean Body Mass (LBM = W - FM), FFMI, height-normalized FFMI_norm, and clinical classification.
 */
export function reconcileCompositionEntry(
  entry: ReconcileInputEntry,
  profile: Pick<UserJourneyProfileData, 'heightCm' | 'biologicalSex'>,
  baseline14d?: CompositionReconciliation | null
): CompositionReconciliation {
  const rawWeightKg = entry.weight;
  const W = entry.calibratedWeightKg ?? entry.weight;
  const heightMeters = Math.max(1.0, (profile.heightCm || 175) / 100);
  const bmi = W / (heightMeters * heightMeters);

  const rawCalibratedMuscle =
    entry.calibratedMuscleMassKg !== undefined
      ? entry.calibratedMuscleMassKg
      : entry.muscleMass ?? null;

  const rawCalibratedBf =
    entry.calibratedBodyFatPct !== undefined
      ? entry.calibratedBodyFatPct
      : entry.bodyFatPercentage ?? null;

  const boneMassEstimate =
    entry.boneMass !== null && entry.boneMass !== undefined && entry.boneMass > 0
      ? entry.boneMass
      : 0.035 * W;

  // Determine effective body fat percentage while honoring physical LBM lower bound from muscleMass + boneMass
  let effectiveBfPct = rawCalibratedBf;
  if (rawCalibratedMuscle !== null && rawCalibratedMuscle > 0 && W > 0) {
    const impliedMinLbm = Math.min(W * 0.96, rawCalibratedMuscle + boneMassEstimate);
    const maxConsistentBfPct = ((W - impliedMinLbm) / W) * 100;
    if (effectiveBfPct === null || effectiveBfPct === undefined || effectiveBfPct > maxConsistentBfPct) {
      effectiveBfPct = Math.max(4.0, maxConsistentBfPct);
    }
  }
  if (effectiveBfPct === null || effectiveBfPct === undefined) {
    // Fallback estimate from BMI if scale did not report body fat or muscle mass
    effectiveBfPct = profile.biologicalSex === 'female' ? 28.0 : 20.0;
  }

  // Exact partition: FM = W * (BF% / 100), LBM = W - FM => FM + LBM == W
  const fatMassKg = W * (effectiveBfPct / 100);
  const leanBodyMassKg = W - fatMassKg;

  const ffmi = leanBodyMassKg / (heightMeters * heightMeters);
  const normalizedFfmi = ffmi + 6.1 * (1.8 - heightMeters);

  const effectiveMuscleKg =
    rawCalibratedMuscle !== null && rawCalibratedMuscle > 0
      ? rawCalibratedMuscle
      : Math.max(0, leanBodyMassKg - boneMassEstimate);

  const muscleToFatRatio = fatMassKg > 0 ? effectiveMuscleKg / fatMassKg : null;

  const windowDeltaWeightKg = baseline14d ? W - baseline14d.calibratedWeightKg : null;
  const windowDeltaFatMassKg = baseline14d ? fatMassKg - baseline14d.fatMassKg : null;
  const windowDeltaMuscleMassKg =
    baseline14d && effectiveMuscleKg !== null
      ? effectiveMuscleKg -
        (baseline14d.calibratedMuscleMassKg ??
          Math.max(0, baseline14d.leanBodyMassKg - boneMassEstimate))
      : null;
  const windowDeltaLbmKg = baseline14d ? leanBodyMassKg - baseline14d.leanBodyMassKg : null;

  const isFemale = profile.biologicalSex === 'female';
  const ffmiThreshold = isFemale ? 17.5 : 21.0;
  const athleticBfCeiling = isFemale ? 25.0 : 18.0;
  const sarcopenicBfFloor = isFemale ? 32.0 : 25.0;
  const visceralFatOk =
    entry.visceralFat === null || entry.visceralFat === undefined || entry.visceralFat < 10;

  let classification: CompositionClassification = 'balanced_normal';
  let classificationReason = 'Balanced body composition within normal BMI and lean mass ranges.';

  if (
    bmi >= 25.0 &&
    normalizedFfmi >= ffmiThreshold &&
    effectiveBfPct <= athleticBfCeiling &&
    visceralFatOk
  ) {
    classification = 'muscular_overweight_bmi_false_positive';
    classificationReason = `BMI is ${bmi.toFixed(1)} (>=25), but normalized FFMI is ${normalizedFfmi.toFixed(1)} with ${effectiveBfPct.toFixed(1)}% body fat — elevated scale weight is driven by skeletal muscle mass, not excess adiposity.`;
  } else if (
    windowDeltaWeightKg !== null &&
    windowDeltaFatMassKg !== null &&
    windowDeltaMuscleMassKg !== null &&
    Math.abs(windowDeltaWeightKg) <= 1.0 &&
    windowDeltaFatMassKg <= -0.4 &&
    windowDeltaMuscleMassKg >= 0.2
  ) {
    classification = 'recomposition_in_progress';
    classificationReason = `Scale weight shifted by ${windowDeltaWeightKg.toFixed(2)} kg while fat mass dropped ${windowDeltaFatMassKg.toFixed(2)} kg and muscle mass rose +${windowDeltaMuscleMassKg.toFixed(2)} kg over >=14 days.`;
  } else if (
    windowDeltaWeightKg !== null &&
    windowDeltaLbmKg !== null &&
    windowDeltaWeightKg < -0.5 &&
    windowDeltaLbmKg / windowDeltaWeightKg > 0.25
  ) {
    classification = 'muscle_loss_warning';
    classificationReason = `Lean body mass accounted for ${((windowDeltaLbmKg / windowDeltaWeightKg) * 100).toFixed(0)}% of recent weight loss (${windowDeltaLbmKg.toFixed(2)} kg LBM of ${windowDeltaWeightKg.toFixed(2)} kg total). Increase protein and resistance stimulus.`;
  } else if (
    windowDeltaWeightKg !== null &&
    windowDeltaFatMassKg !== null &&
    windowDeltaWeightKg < -0.5 &&
    windowDeltaFatMassKg / windowDeltaWeightKg >= 0.75
  ) {
    classification = 'healthy_lean_loss';
    classificationReason = `${((windowDeltaFatMassKg / windowDeltaWeightKg) * 100).toFixed(0)}% of recent weight loss came from fat mass (${windowDeltaFatMassKg.toFixed(2)} kg FM of ${windowDeltaWeightKg.toFixed(2)} kg total), preserving lean tissue.`;
  } else if (bmi < 25.0 && effectiveBfPct > sarcopenicBfFloor) {
    classification = 'sarcopenic_normal_bmi';
    classificationReason = `BMI is normal (${bmi.toFixed(1)}), but body fat is ${effectiveBfPct.toFixed(1)}% (> ${sarcopenicBfFloor}%), indicating low relative skeletal muscle mass.`;
  } else if (bmi >= 25.0) {
    classification = 'adiposity_driven_elevated_bmi';
    classificationReason = `BMI is ${bmi.toFixed(1)} with ${effectiveBfPct.toFixed(1)}% body fat and normalized FFMI ${normalizedFfmi.toFixed(1)}, indicating fat-loss prioritization.`;
  }

  return {
    entryId: entry.id,
    timestamp: toIso(entry.timestamp),
    source: entry.source || 'old_scale',
    rawWeightKg,
    calibratedWeightKg: W,
    calibratedBodyFatPct: effectiveBfPct,
    calibratedMuscleMassKg: rawCalibratedMuscle ?? effectiveMuscleKg,
    visceralFat: entry.visceralFat ?? null,
    bodyWaterPercentage: entry.bodyWaterPercentage ?? null,
    bmi,
    fatMassKg,
    leanBodyMassKg,
    ffmi,
    normalizedFfmi,
    muscleToFatRatio,
    classification,
    classificationReason,
    windowDeltaWeightKg,
    windowDeltaFatMassKg,
    windowDeltaMuscleMassKg,
    windowDeltaLbmKg,
  };
}

export function reconcileCompositionSeries(
  entries: (CalibratedScaleEntry | ReconcileInputEntry)[],
  profile: Pick<UserJourneyProfileData, 'heightCm' | 'biologicalSex'>
): CompositionReconciliation[] {
  const sorted = [...entries].sort((a, b) => toMs(a.timestamp) - toMs(b.timestamp));
  const reconciled: CompositionReconciliation[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentMs = toMs(current.timestamp);

    // Find baseline entry >= 14 days prior (preferring closest >= 14d within 45d, else latest >= 14d)
    let baseline: CompositionReconciliation | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const prev = reconciled[j];
      const deltaMs = currentMs - toMs(prev.timestamp);
      if (deltaMs >= FOURTEEN_DAYS_MS) {
        baseline = prev;
        if (deltaMs <= FORTY_FIVE_DAYS_MS) {
          break;
        }
      }
    }

    reconciled.push(reconcileCompositionEntry(current, profile, baseline));
  }

  return reconciled;
}
