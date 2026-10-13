import crypto from 'node:crypto';
import {
  MotivationalBriefSchema,
  type CompositionReconciliation,
  type HistoricAnchorItem,
  type JourneyGraphState,
  type MotivationalBrief,
  type ScaleCalibrationItem,
  type ScenarioProposalItem,
  type UserJourneyProfileData,
} from '@/types/journey';
import {
  applyCalibrationToEntries,
  computeScaleCalibrations,
  type RawScaleEntry,
} from '@/lib/scale-calibrator';
import { reconcileCompositionSeries } from '@/lib/composition-reconciler';
import { projectTrajectoryAndSolve } from '@/lib/trajectory-engine';
import {
  buildDeterministicCoachBrief,
  evaluateMilestonesAndShields,
} from '@/lib/motivation-engine';
import { runTaskModel } from '@/lib/ai/provider';
import { DEFAULT_MONTHLY_CAP_USD, getMonthlySpendUsd } from '@/lib/ai/budget-ledger';

const narrativeCache = new Map<string, MotivationalBrief>();

export function clearJourneyGraphCache() {
  narrativeCache.clear();
}

export function computeStateHash(params: {
  userId: string;
  entries: RawScaleEntry[];
  profile: UserJourneyProfileData;
  historicAnchors: HistoricAnchorItem[];
}): string {
  const payload = JSON.stringify({
    userId: params.userId,
    entryIds: params.entries.map((e) => [
      e.id,
      e.weight,
      e.bodyFatPercentage ?? null,
      e.muscleMass ?? null,
      e.timestamp instanceof Date ? e.timestamp.toISOString() : e.timestamp,
    ]),
    profile: {
      heightCm: params.profile.heightCm,
      birthYear: params.profile.birthYear,
      biologicalSex: params.profile.biologicalSex,
      activityLevel: params.profile.activityLevel,
      resistanceTrainingDaysWk: params.profile.resistanceTrainingDaysWk,
      goalType: params.profile.goalType,
      targetWeightKg: params.profile.targetWeightKg,
      targetBodyFatPct: params.profile.targetBodyFatPct,
      targetMuscleMassKg: params.profile.targetMuscleMassKg,
      targetDate: params.profile.targetDate,
      preferredWeeklyRatePctBw: params.profile.preferredWeeklyRatePctBw,
      userOverridesJson: params.profile.userOverridesJson,
    },
    anchors: params.historicAnchors.map((a) => [a.id, a.label, a.weightKg]),
  });

  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Collect all grounded numeric values present in JourneyGraphState (excluding motivationalBrief).
 */
export function collectGroundedNumbersFromState(
  state: Omit<JourneyGraphState, 'motivationalBrief'>
): number[] {
  const grounded: number[] = [];

  function walk(value: unknown, keyPath = ''): void {
    if (typeof value === 'number' && Number.isFinite(value)) {
      grounded.push(value);
      grounded.push(Math.abs(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, keyPath);
      }
      return;
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === 'motivationalBrief') continue;
        walk(v, `${keyPath}.${k}`);
      }
    }
  }

  walk({
    profile: state.profile,
    calibrations: state.calibrations,
    compositionSeries: state.compositionSeries,
    latestComposition: state.latestComposition,
    trajectory: state.trajectory,
    historicAnchors: state.historicAnchors,
    milestoneSignals: state.milestoneSignals,
    monthlySpendUsd: state.monthlySpendUsd,
    monthlyCapUsd: state.monthlyCapUsd,
  });

  return grounded;
}

export interface NarrativeSentryResult {
  passed: boolean;
  extractedNumbers: number[];
  ungroundedNumbers: number[];
}

/**
 * N5 narrative_and_bounds_check (deterministic sentry):
 * Extracts all floats/integers from motivationalBrief.bodyMarkdown and verifies
 * every number matches a value in JourneyGraphState within +/- 0.1.
 */
export function narrativeAndBoundsCheck(
  bodyMarkdown: string,
  state: Omit<JourneyGraphState, 'motivationalBrief'>
): NarrativeSentryResult {
  const groundedPool = collectGroundedNumbersFromState(state);
  const regex = /[-+]?\d+(?:\.\d+)?/g;
  const matches = bodyMarkdown.match(regex) ?? [];
  const extractedNumbers = matches
    .map((m) => Number.parseFloat(m))
    .filter((n) => Number.isFinite(n));

  const ungroundedNumbers: number[] = [];
  for (const num of extractedNumbers) {
    const isGrounded = groundedPool.some(
      (g) => Math.abs(num - g) <= 0.1 || Math.abs(Math.abs(num) - Math.abs(g)) <= 0.1
    );
    if (!isGrounded) {
      ungroundedNumbers.push(num);
    }
  }

  return {
    passed: ungroundedNumbers.length === 0,
    extractedNumbers,
    ungroundedNumbers,
  };
}

export interface ExecuteJourneyGraphParams {
  userId: string;
  entries: RawScaleEntry[];
  profile: UserJourneyProfileData;
  existingCalibrations?: ScaleCalibrationItem[];
  historicAnchors?: HistoricAnchorItem[];
  pendingProposals?: ScenarioProposalItem[];
  seed?: number;
  bypassCache?: boolean;
}

/**
 * Executes the SmartScalesData v2 Runtime Agent Graph:
 * N1 normalize_and_calibrate
 *   -> parallel [N2a reconcile_composition, N2b project_trajectory_and_solve, N2c evaluate_historic_milestones]
 *   -> N3 solution_pathways_planner & N4 coach_narrate (cached by inputHash)
 *   -> N5 narrative_and_bounds_check (retry N4 at most once on mismatch)
 *   -> N6 deterministic_template_fallback (on budget cap or second sentry rejection)
 */
export async function executeJourneyGraph(
  params: ExecuteJourneyGraphParams
): Promise<JourneyGraphState> {
  const {
    userId,
    entries,
    profile,
    existingCalibrations = [],
    historicAnchors = [],
    pendingProposals = [],
    seed = 42,
    bypassCache = false,
  } = params;

  // N1: normalize_and_calibrate
  const calibrations = computeScaleCalibrations(entries, existingCalibrations);
  const calibratedEntries = applyCalibrationToEntries(entries, calibrations);

  // Parallel N2a (reconcile_composition) & N2b (project_trajectory_and_solve)
  const [compositionSeries, initialTrajectory] = await Promise.all([
    Promise.resolve(reconcileCompositionSeries(calibratedEntries, profile)),
    Promise.resolve(projectTrajectoryAndSolve(calibratedEntries, profile, { seed })),
  ]);

  const latestComposition: CompositionReconciliation | null =
    compositionSeries.length > 0 ? compositionSeries[compositionSeries.length - 1] : null;

  // Re-run N2b with exact reconciled latestLbmKg if available so protein floor matches LBM
  const trajectory = latestComposition
    ? projectTrajectoryAndSolve(calibratedEntries, profile, {
        seed,
        latestLbmKg: latestComposition.leanBodyMassKg,
      })
    : initialTrajectory;

  // N2c: evaluate_historic_milestones
  const { milestoneSignals, waterShieldActive } = evaluateMilestonesAndShields(
    compositionSeries,
    trajectory.ewmaSeries,
    historicAnchors,
    profile
  );

  const stateHash = computeStateHash({
    userId,
    entries: calibratedEntries,
    profile,
    historicAnchors,
  });

  const inputHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        stateHash,
        latestComposition,
        ewmaLast: trajectory.ewmaSeries[trajectory.ewmaSeries.length - 1] ?? null,
        solutionPathways: trajectory.solutionPathways,
        waterShieldActive,
      })
    )
    .digest('hex')
    .slice(0, 16);

  let monthlySpendUsd = 0;
  try {
    monthlySpendUsd = await getMonthlySpendUsd(userId);
  } catch {
    monthlySpendUsd = 0;
  }

  const baseStateWithoutBrief: Omit<JourneyGraphState, 'motivationalBrief'> = {
    userId,
    stateHash,
    inputHash,
    generatedAtIso:
      latestComposition?.timestamp ??
      (profile.targetDate ? new Date(profile.targetDate).toISOString() : '2026-10-12T00:00:00.000Z'),
    profile,
    calibrations,
    compositionSeries,
    latestComposition,
    trajectory,
    historicAnchors,
    milestoneSignals,
    waterShieldActive,
    pendingProposals,
    monthlySpendUsd,
    monthlyCapUsd: DEFAULT_MONTHLY_CAP_USD,
  };

  const latestEwma =
    trajectory.ewmaSeries.length > 0
      ? trajectory.ewmaSeries[trajectory.ewmaSeries.length - 1]
      : null;
  const recompPathway = trajectory.solutionPathways.find(
    (p) => p.id === 'muscle_preserving_recomp'
  );

  // N6 deterministic template builder (used as FakeProvider generator and N6 fallback)
  const buildFallbackBrief = (): MotivationalBrief =>
    buildDeterministicCoachBrief({
      latestComposition,
      latestEwma,
      profile,
      recompPathway,
      waterShieldActive,
    });

  if (!bypassCache && narrativeCache.has(inputHash)) {
    const cachedBrief = narrativeCache.get(inputHash)!;
    return {
      ...baseStateWithoutBrief,
      motivationalBrief: cachedBrief,
    };
  }

  // N3 & N4 -> N5 (with at most 1 retry on N4 before routing to N6 deterministic_template_fallback)
  let finalBrief: MotivationalBrief | null = null;
  let lastSentryFailures: number[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const retryFeedback =
        attempt > 1 && lastSentryFailures.length > 0
          ? `\nCRITICAL RETRY: Your previous response contained ungrounded numbers [${lastSentryFailures.join(', ')}]. Use ONLY exact numbers from the provided JSON state.`
          : '';

      const n4Result = await runTaskModel<MotivationalBrief>({
        taskType: 'coach_narrate',
        userId,
        nodeId: 'N4_coach_narrate',
        system:
          'You are the SmartScalesData v2 Grounded Composition Coach. Every single number in bodyMarkdown MUST match a numeric field in the provided state within +/- 0.1. Never invent numbers or list indices.',
        prompt: `Generate a concise motivational brief grounded exclusively in this state: ${JSON.stringify({
          calibratedWeightKg: latestComposition?.calibratedWeightKg,
          ewmaWeightKg: latestEwma?.ewmaWeightKg,
          fatMassKg: latestComposition?.fatMassKg,
          leanBodyMassKg: latestComposition?.leanBodyMassKg,
          normalizedFfmi: latestComposition?.normalizedFfmi,
          targetWeightKg: profile.targetWeightKg,
          dailyCalorieTargetKcal: recompPathway?.dailyCalorieTargetKcal,
          proteinFloorGramsPerDay: recompPathway?.proteinFloorGramsPerDay,
        })}${retryFeedback}`,
        schema: MotivationalBriefSchema,
        fakeFallbackGenerator: () => ({
          ...buildFallbackBrief(),
          origin: 'llm_grounded',
        }),
      });

      // N5: narrative_and_bounds_check
      const sentry = narrativeAndBoundsCheck(n4Result.output.bodyMarkdown, baseStateWithoutBrief);
      if (sentry.passed) {
        finalBrief = {
          ...n4Result.output,
          origin: 'llm_grounded',
        };
        break;
      } else {
        lastSentryFailures = sentry.ungroundedNumbers;
      }
    } catch {
      // BudgetCapExceededError or provider failure -> exit retry loop and route to N6
      break;
    }
  }

  // N6: deterministic_template_fallback
  if (!finalBrief) {
    finalBrief = buildFallbackBrief();
  }

  if (!bypassCache) {
    narrativeCache.set(inputHash, finalBrief);
  }

  return {
    ...baseStateWithoutBrief,
    motivationalBrief: finalBrief,
  };
}
