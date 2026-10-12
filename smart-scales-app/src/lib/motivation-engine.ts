import type {
  CompositionReconciliation,
  EwmaPoint,
  HistoricAnchorItem,
  MilestoneSignal,
  MotivationalBrief,
  SolutionPathway,
  UserJourneyProfileData,
} from '@/types/journey';

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function toMs(iso: string): number {
  return new Date(iso).getTime();
}

export interface MotivationEvaluationResult {
  milestoneSignals: MilestoneSignal[];
  waterShieldActive: boolean;
}

/**
 * Decision D7: Water Shield & Historic Anchors
 * Evaluates overnight water/glycogen retention spikes, non-scale composition victories,
 * and historic anchor crossings without mutating the daily EWMA or trajectory series.
 */
export function evaluateMilestonesAndShields(
  compositionSeries: CompositionReconciliation[],
  ewmaSeries: EwmaPoint[],
  historicAnchors: HistoricAnchorItem[],
  profile: UserJourneyProfileData
): MotivationEvaluationResult {
  const signals: MilestoneSignal[] = [];
  let waterShieldActive = false;

  if (compositionSeries.length === 0) {
    return { milestoneSignals: signals, waterShieldActive: false };
  }

  const latestComp = compositionSeries[compositionSeries.length - 1];
  const latestEwma = ewmaSeries[ewmaSeries.length - 1];
  const prevEwma = ewmaSeries.length >= 2 ? ewmaSeries[ewmaSeries.length - 2] : null;

  // 1. Check overnight / <=2d scale spike (> +0.4 kg) where bodyWaterPercentage rose OR 7-day EWMA continued dropping
  for (let i = compositionSeries.length - 2; i >= 0; i--) {
    const prev = compositionSeries[i];
    const deltaMs = toMs(latestComp.timestamp) - toMs(prev.timestamp);
    if (deltaMs > TWO_DAYS_MS) break;

    const deltaW = latestComp.calibratedWeightKg - prev.calibratedWeightKg;
    if (deltaW > 0.4) {
      const waterRose =
        latestComp.bodyWaterPercentage !== null &&
        prev.bodyWaterPercentage !== null &&
        latestComp.bodyWaterPercentage > prev.bodyWaterPercentage;
      const ewmaContinuedDropping =
        latestEwma && prevEwma ? latestEwma.ewmaWeightKg <= prevEwma.ewmaWeightKg : false;

      if (waterRose || ewmaContinuedDropping) {
        waterShieldActive = true;
        signals.push({
          id: `water-shield-${latestComp.entryId}`,
          kind: 'water_retention_shield',
          severity: 'reassurance',
          title: 'Water & Glycogen Fluctuation Shield Active',
          detail: `Scale rose +${deltaW.toFixed(1)} kg in <=48h while ${
            waterRose
              ? `body water increased to ${latestComp.bodyWaterPercentage?.toFixed(1)}%`
              : `smoothed trend held at ${latestEwma.ewmaWeightKg.toFixed(1)} kg`
          } — transient hydration shift, not fat gain.`,
          metricValue: Number(deltaW.toFixed(2)),
          referenceValue: latestEwma ? Number(latestEwma.ewmaWeightKg.toFixed(2)) : undefined,
          timestamp: latestComp.timestamp,
        });
        break;
      }
    }
  }

  // 2. Non-scale victories (recomposition, lean loss, athletic FFMI, visceral fat drop)
  if (
    latestComp.classification === 'recomposition_in_progress' ||
    latestComp.classification === 'healthy_lean_loss' ||
    latestComp.classification === 'muscular_overweight_bmi_false_positive'
  ) {
    signals.push({
      id: `recomp-${latestComp.entryId}`,
      kind: 'recomposition_victory',
      severity: 'victory',
      title:
        latestComp.classification === 'muscular_overweight_bmi_false_positive'
          ? 'High Muscle Mass / Athletic FFMI Verified'
          : 'Body Recomposition Victory',
      detail: latestComp.classificationReason,
      metricValue: Number(latestComp.leanBodyMassKg.toFixed(2)),
      referenceValue: Number(latestComp.fatMassKg.toFixed(2)),
      timestamp: latestComp.timestamp,
    });
  }

  const firstWithVf = compositionSeries.find(
    (c) => c.visceralFat !== null && c.visceralFat !== undefined
  );
  if (
    firstWithVf &&
    firstWithVf.visceralFat !== null &&
    latestComp.visceralFat !== null &&
    latestComp.visceralFat <= firstWithVf.visceralFat - 1
  ) {
    const vfDrop = firstWithVf.visceralFat - latestComp.visceralFat;
    signals.push({
      id: `vf-drop-${latestComp.entryId}`,
      kind: 'visceral_fat_drop',
      severity: 'victory',
      title: 'Visceral Fat Reduction',
      detail: `Visceral fat index dropped by ${vfDrop.toFixed(1)} points from ${firstWithVf.visceralFat.toFixed(1)} to ${latestComp.visceralFat.toFixed(1)}.`,
      metricValue: latestComp.visceralFat,
      referenceValue: firstWithVf.visceralFat,
      timestamp: latestComp.timestamp,
    });
  }

  const ffmiMilestoneThreshold = profile.biologicalSex === 'female' ? 16.5 : 20.0;
  if (latestComp.normalizedFfmi >= ffmiMilestoneThreshold) {
    signals.push({
      id: `ffmi-${latestComp.entryId}`,
      kind: 'ffmi_milestone',
      severity: 'milestone',
      title: 'Strong Lean Tissue Foundation (FFMI)',
      detail: `Height-normalized FFMI is ${latestComp.normalizedFfmi.toFixed(1)} kg/m², above the ${ffmiMilestoneThreshold.toFixed(1)} athletic lean-mass threshold.`,
      metricValue: Number(latestComp.normalizedFfmi.toFixed(2)),
      referenceValue: ffmiMilestoneThreshold,
      timestamp: latestComp.timestamp,
    });
  }

  // 3. Historic Anchor crossings & gap closing
  const currentWeight = latestEwma?.ewmaWeightKg ?? latestComp.calibratedWeightKg;
  const startWeight = compositionSeries[0].calibratedWeightKg;

  for (const anchor of historicAnchors) {
    const labelHuman = anchor.label.replace(/_/g, ' ');
    if (currentWeight <= anchor.weightKg) {
      signals.push({
        id: `anchor-crossed-${anchor.id}`,
        kind: 'historic_anchor_crossed',
        severity: 'milestone',
        title: `Surpassed ${labelHuman} Benchmark`,
        detail: `Current trend weight (${currentWeight.toFixed(1)} kg) is at or below your ${labelHuman} benchmark of ${anchor.weightKg.toFixed(1)} kg.`,
        metricValue: Number(currentWeight.toFixed(2)),
        referenceValue: Number(anchor.weightKg.toFixed(2)),
        timestamp: latestComp.timestamp,
      });
    } else if (startWeight > anchor.weightKg && currentWeight < startWeight) {
      const totalGap = startWeight - anchor.weightKg;
      const closedGap = startWeight - currentWeight;
      const pctClosed = totalGap > 0 ? Math.min(99, Math.round((closedGap / totalGap) * 100)) : 0;
      const remainingKg = currentWeight - anchor.weightKg;
      signals.push({
        id: `anchor-closing-${anchor.id}`,
        kind: 'historic_anchor_closing',
        severity: 'victory',
        title: `Closing In on ${labelHuman} Weight`,
        detail: `You are within ${remainingKg.toFixed(1)} kg of your ${labelHuman} benchmark (${anchor.weightKg.toFixed(1)} kg), having closed ${pctClosed}% of the gap from journey start.`,
        metricValue: Number(remainingKg.toFixed(2)),
        referenceValue: Number(anchor.weightKg.toFixed(2)),
        timestamp: latestComp.timestamp,
      });
    }
  }

  return {
    milestoneSignals: signals,
    waterShieldActive,
  };
}

/**
 * Deterministic template fallback for N6 (used when LLM is offline, capped, or rejected by N5 sentry).
 * Every numeric value emitted in bodyMarkdown comes directly from grounded state metrics.
 */
export function buildDeterministicCoachBrief(params: {
  latestComposition: CompositionReconciliation | null;
  latestEwma: EwmaPoint | null;
  profile: UserJourneyProfileData;
  recompPathway: SolutionPathway | undefined;
  waterShieldActive: boolean;
}): MotivationalBrief {
  const { latestComposition, latestEwma, profile, recompPathway, waterShieldActive } = params;

  if (!latestComposition) {
    const targetW = Number(profile.targetWeightKg.toFixed(1));
    return {
      headline: 'Ready to Begin Your Calibrated Composition Journey',
      bodyMarkdown: `Your target weight is set to ${targetW} kg. Import a scale CSV or log your first weight entry to unlock composition partitioning and trajectory bands.`,
      citations: [targetW],
      origin: 'deterministic_fallback',
    };
  }

  const calW = Number(latestComposition.calibratedWeightKg.toFixed(1));
  const ewmaW = Number((latestEwma?.ewmaWeightKg ?? latestComposition.calibratedWeightKg).toFixed(1));
  const fmKg = Number(latestComposition.fatMassKg.toFixed(1));
  const lbmKg = Number(latestComposition.leanBodyMassKg.toFixed(1));
  const ffmiNorm = Number(latestComposition.normalizedFfmi.toFixed(1));
  const targetW = Number(profile.targetWeightKg.toFixed(1));
  const proteinG = recompPathway?.proteinFloorGramsPerDay ?? Math.ceil(2.0 * lbmKg);
  const kcalTarget = recompPathway?.dailyCalorieTargetKcal ?? 2000;

  const shieldSentence = waterShieldActive
    ? ` Water fluctuation shield is active: focus on the smoothed trend at ${ewmaW} kg rather than short-term hydration shifts.`
    : '';

  const bodyMarkdown = [
    `- Calibrated scale weight is ${calW} kg with a smoothed trend of ${ewmaW} kg toward your target of ${targetW} kg.${shieldSentence}`,
    `- Tissue partitioning shows ${lbmKg} kg lean body mass and ${fmKg} kg fat mass (height-normalized FFMI ${ffmiNorm}).`,
    `- Recommended muscle-preserving nutrition targets ${kcalTarget} kcal per day with a protein floor of ${proteinG} g per day.`,
  ].join('\n');

  return {
    headline: waterShieldActive
      ? `Hydration Shield Active — Smoothed Trend Steady at ${ewmaW} kg`
      : `Calibrated Trend at ${ewmaW} kg (Lean Mass ${lbmKg} kg)`,
    bodyMarkdown,
    citations: [calW, ewmaW, targetW, lbmKg, fmKg, ffmiNorm, kcalTarget, proteinG],
    origin: 'deterministic_fallback',
  };
}
