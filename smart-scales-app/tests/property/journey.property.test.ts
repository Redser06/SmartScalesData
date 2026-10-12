import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prisma } from '@/lib/prisma';
import {
  applyCalibrationToEntries,
  computeScaleCalibrations,
  type RawScaleEntry,
} from '@/lib/scale-calibrator';
import { reconcileCompositionEntry } from '@/lib/composition-reconciler';
import {
  createMulberry32,
  projectTrajectoryAndSolve,
  solveEtaDaysForCalorieDeficit,
} from '@/lib/trajectory-engine';
import {
  clearJourneyGraphCache,
  narrativeAndBoundsCheck,
} from '@/lib/graph/journey-graph';
import {
  assertMonthlyBudgetRemaining,
  BudgetCapExceededError,
  DEFAULT_MONTHLY_CAP_USD,
  recordLlmSpend,
} from '@/lib/ai/budget-ledger';
import { setFakeProviderInterceptor } from '@/lib/ai/provider';
import {
  applyApprovedProposal,
  deleteWeightEntry,
  getJourneySnapshot,
  getWeightHistory,
  importCsvData,
  setTestAuthUserId,
  upsertHistoricAnchor,
  upsertJourneyProfile,
} from '@/app/actions';
import {
  proposeTargetUpdateForUser,
  proposeWeightEntryForUser,
} from '@/app/api/chat/route';
import type { UserJourneyProfileData } from '@/types/journey';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../fixtures/synthetic_journey.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as {
  profile: Omit<UserJourneyProfileData, 'userId' | 'userOverridesJson' | 'lifestyleNotes' | 'targetDate'>;
  csvHeader: string;
  csvRows: string[];
  historicAnchors: Array<{
    label: '10_years_ago' | '5_years_ago' | '1_year_ago';
    anchorDate: string;
    weightKg: number;
    bodyFatPct: number;
    ageAtAnchor: number;
    lifestyleContext: string;
  }>;
};

describe('SmartScalesData v2 Property & Invariant Suite', () => {
  let userAId = '';
  let userBId = '';

  before(async () => {
    const suffix = Date.now().toString(36);
    const userA = await prisma.user.create({
      data: {
        email: `prop-user-a-${suffix}@example.com`,
        name: 'Property User A',
      },
    });
    const userB = await prisma.user.create({
      data: {
        email: `prop-user-b-${suffix}@example.com`,
        name: 'Property User B',
      },
    });
    userAId = userA.id;
    userBId = userB.id;
  });

  after(async () => {
    await setTestAuthUserId(null);
    setFakeProviderInterceptor(null);
    await prisma.user.deleteMany({
      where: { id: { in: [userAId, userBId] } },
    });
    await prisma.llmSpendLedger.deleteMany({
      where: { userId: { in: [userAId, userBId] } },
    });
  });

  it('1. CSV import idempotence & 7-day median scale offset no-op when delta = 0', async () => {
    await setTestAuthUserId(userAId);
    const csvContent = [fixture.csvHeader, ...fixture.csvRows].join('\n');

    const firstImport = await importCsvData(csvContent);
    assert.equal(firstImport.success, true);
    assert.equal(firstImport.imported, fixture.csvRows.length);
    assert.equal(firstImport.skipped, 0);

    // Second import of identical CSV must be a pure idempotent no-op
    const secondImport = await importCsvData(csvContent);
    assert.equal(secondImport.success, true);
    assert.equal(secondImport.imported, 0);
    assert.equal(secondImport.skipped, fixture.csvRows.length);

    // 7-day median calibration no-op property when two scales have zero offset (delta = 0)
    const prng = createMulberry32(101);
    const baseEntries: RawScaleEntry[] = Array.from({ length: 6 }, (_, i) => {
      const ts = new Date(Date.UTC(2026, 8, 1 + i * 2, 7, 30, 0));
      const w = 85 + (prng() - 0.5) * 4;
      const bf = 20 + (prng() - 0.5) * 2;
      const mm = 62 + (prng() - 0.5) * 2;
      return {
        id: i + 1,
        timestamp: ts,
        weight: w,
        bodyFatPercentage: bf,
        muscleMass: mm,
        source: 'ref_scale',
      };
    });

    const identicalSecondaryEntries: RawScaleEntry[] = baseEntries.map((e, idx) => ({
      ...e,
      id: 100 + idx,
      source: 'secondary_scale',
    }));

    const combined = [...baseEntries, ...identicalSecondaryEntries];
    const calibrations = computeScaleCalibrations(combined);
    for (const cal of calibrations) {
      assert.equal(cal.weightOffsetKg, 0);
      assert.equal(cal.bodyFatOffsetPct, 0);
      assert.equal(cal.muscleMassOffsetKg, 0);
    }

    const calibrated = applyCalibrationToEntries(combined, calibrations);
    for (let i = 0; i < combined.length; i++) {
      assert.equal(calibrated[i].calibratedWeightKg, combined[i].weight);
      assert.equal(calibrated[i].calibratedBodyFatPct, combined[i].bodyFatPercentage);
      assert.equal(calibrated[i].calibratedMuscleMassKg, combined[i].muscleMass);
    }
  });

  it('2. Cross-user isolation on getWeightHistory, getJourneySnapshot, and deleteWeightEntry', async () => {
    await setTestAuthUserId(userBId);
    const userBCsv = [
      fixture.csvHeader,
      '02-09-2026 08:00:00,74.2,kg,23.1,16.5,58.0,6,59.0,3.1,1750,User B entry,withings',
    ].join('\n');
    const bImport = await importCsvData(userBCsv);
    assert.equal(bImport.imported, 1);

    const historyB = await getWeightHistory();
    assert.equal(historyB.length, 1);
    const entryBId = historyB[0].id;

    // Switch back to User A and verify User A cannot see or delete User B's entry
    await setTestAuthUserId(userAId);
    const historyA = await getWeightHistory();
    assert.equal(historyA.length, fixture.csvRows.length);
    assert.equal(
      historyA.some((e) => e.id === entryBId || e.userId !== userAId),
      false
    );

    const snapshotA = await getJourneySnapshot({ bypassCache: true });
    assert.equal(snapshotA.userId, userAId);
    assert.equal(
      snapshotA.compositionSeries.some((c) => c.entryId === entryBId),
      false
    );

    const crossDeleteAttempt = await deleteWeightEntry(entryBId);
    assert.equal(crossDeleteAttempt.success, false);

    // Verify User B's entry still exists untouched
    await setTestAuthUserId(userBId);
    const historyBAfter = await getWeightHistory();
    assert.equal(historyBAfter.length, 1);
  });

  it('3. Partition conservation (FM + LBM == W within 1e-9) and HistoricAnchor invariance', async () => {
    await setTestAuthUserId(userAId);
    await upsertJourneyProfile(fixture.profile);

    const snapshotBeforeAnchors = await getJourneySnapshot({ seed: 77, bypassCache: true });
    assert.ok(snapshotBeforeAnchors.compositionSeries.length > 0);

    for (const comp of snapshotBeforeAnchors.compositionSeries) {
      const partitionSum = comp.fatMassKg + comp.leanBodyMassKg;
      assert.ok(
        Math.abs(partitionSum - comp.calibratedWeightKg) <= 1e-9,
        `Expected FM + LBM == W within 1e-9, got |${partitionSum} - ${comp.calibratedWeightKg}|`
      );
    }

    // Randomized property check across 50 synthetic weight/bodyFat combinations
    const prng = createMulberry32(999);
    for (let trial = 0; trial < 50; trial++) {
      const w = 50 + prng() * 80;
      const bf = 6 + prng() * 40;
      const h = 150 + prng() * 45;
      const rec = reconcileCompositionEntry(
        {
          id: trial + 1,
          timestamp: new Date(Date.UTC(2026, 8, 10)).toISOString(),
          weight: w,
          bodyFatPercentage: bf,
          source: 'synthetic',
        },
        { heightCm: h, biologicalSex: trial % 2 === 0 ? 'male' : 'female' }
      );
      assert.ok(Math.abs(rec.fatMassKg + rec.leanBodyMassKg - rec.calibratedWeightKg) <= 1e-9);
    }

    // HistoricAnchor invariance: adding a 10-year-ago anchor must not alter daily ewmaSeries or recentDailySlopeKg
    for (const anchor of fixture.historicAnchors) {
      await upsertHistoricAnchor(anchor);
    }
    const snapshotAfterAnchors = await getJourneySnapshot({ seed: 77, bypassCache: true });

    assert.deepEqual(
      snapshotAfterAnchors.trajectory.ewmaSeries,
      snapshotBeforeAnchors.trajectory.ewmaSeries
    );
    assert.equal(
      snapshotAfterAnchors.trajectory.recentDailySlopeKg,
      snapshotBeforeAnchors.trajectory.recentDailySlopeKg
    );
  });

  it('4. Monotonic transition from adiposity_driven_elevated_bmi to muscular_overweight_bmi_false_positive as muscleMass increases at fixed (H, W)', () => {
    const fixedHeightCm = 180;
    const fixedWeightKg = 90; // BMI = 27.78 >= 25.0
    const muscleSweepKg = [50, 54, 58, 62, 66, 70, 74, 78];

    const reconciliations = muscleSweepKg.map((muscleMass, idx) =>
      reconcileCompositionEntry(
        {
          id: idx + 1,
          timestamp: new Date(Date.UTC(2026, 9, 1 + idx)).toISOString(),
          weight: fixedWeightKg,
          muscleMass,
          visceralFat: 7,
          source: 'sweep',
        },
        { heightCm: fixedHeightCm, biologicalSex: 'male' }
      )
    );

    // Verify initial state is adiposity_driven_elevated_bmi and final state is muscular_overweight_bmi_false_positive
    assert.equal(reconciliations[0].classification, 'adiposity_driven_elevated_bmi');
    assert.equal(
      reconciliations[reconciliations.length - 1].classification,
      'muscular_overweight_bmi_false_positive'
    );

    // Verify monotonic non-decreasing normalizedFfmi and single monotonic classification transition
    let seenMuscular = false;
    for (let i = 0; i < reconciliations.length; i++) {
      if (i > 0) {
        assert.ok(
          reconciliations[i].normalizedFfmi >= reconciliations[i - 1].normalizedFfmi - 1e-9
        );
      }
      if (reconciliations[i].classification === 'muscular_overweight_bmi_false_positive') {
        seenMuscular = true;
      } else if (seenMuscular) {
        assert.fail(
          'Classification reverted from muscular_overweight_bmi_false_positive to ' +
            reconciliations[i].classification
        );
      }
    }
  });

  it('5. Seed determinism, same-timestamp stability (no NaN/Infinity), and 0 < P10(h) <= P50(h) <= P90(h) with non-decreasing width across h in {7, 28, 90, 180, 365}', () => {
    const duplicateTsIso = '2026-09-15T07:30:00.000Z';
    const sameTimestampEntries: RawScaleEntry[] = [
      { id: 1, timestamp: duplicateTsIso, weight: 91.2, source: 'scale_a' },
      { id: 2, timestamp: duplicateTsIso, weight: 90.8, source: 'scale_b' },
      { id: 3, timestamp: '2026-09-22T07:30:00.000Z', weight: 90.1, source: 'scale_a' },
      { id: 4, timestamp: '2026-09-22T07:30:00.000Z', weight: 89.9, source: 'scale_b' },
    ];

    const testProfile: UserJourneyProfileData = {
      userId: userAId,
      ...fixture.profile,
      lifestyleNotes: null,
      targetDate: '2026-12-31T00:00:00.000Z',
      userOverridesJson: '{}',
    };

    const run1 = projectTrajectoryAndSolve(sameTimestampEntries, testProfile, { seed: 12345 });
    const run2 = projectTrajectoryAndSolve(sameTimestampEntries, testProfile, { seed: 12345 });

    // Exact seed determinism
    assert.deepEqual(run1.horizonBands, run2.horizonBands);
    assert.equal(run1.recentDailySlopeKg, run2.recentDailySlopeKg);
    assert.ok(Number.isFinite(run1.recentDailySlopeKg));

    for (const pt of run1.ewmaSeries) {
      assert.ok(Number.isFinite(pt.ewmaWeightKg));
      assert.ok(Number.isFinite(pt.weeklyVelocityKg));
    }

    // Check quantile ordering and non-decreasing width across horizons {7, 28, 90, 180, 365}
    let previousWidth = -1;
    for (const band of run1.horizonBands) {
      assert.ok(band.p10Kg > 0);
      assert.ok(band.p10Kg <= band.p50Kg);
      assert.ok(band.p50Kg <= band.p90Kg);
      const width = band.p90Kg - band.p10Kg;
      assert.ok(
        width >= previousWidth - 1e-9,
        `Expected interval width at horizon ${band.horizonDays}d (${width}) >= previous width (${previousWidth})`
      );
      previousWidth = width;
    }
  });

  it('6. Target solver monotonicity vs. calorie deficit and [-1.0% BW/wk, -0.25% BW/wk] clamp', () => {
    const deficits = [200, 350, 500, 650, 800, 1000];
    const etas = deficits.map((d) => solveEtaDaysForCalorieDeficit(92, 84, d));

    for (let i = 1; i < etas.length; i++) {
      assert.ok(
        etas[i] < etas[i - 1],
        `Expected ETA at deficit ${deficits[i]} kcal (${etas[i]}d) < ETA at ${deficits[i - 1]} kcal (${etas[i - 1]}d)`
      );
    }

    // Verify aggressive target date triggers [-1.0% BW/wk, -0.25% BW/wk] clamp and high_clamp_applied
    const entries: RawScaleEntry[] = [
      { id: 1, timestamp: '2026-09-01T07:30:00.000Z', weight: 92.0, source: 'renpho' },
      { id: 2, timestamp: '2026-09-15T07:30:00.000Z', weight: 91.0, source: 'renpho' },
    ];
    const aggressiveProfile: UserJourneyProfileData = {
      userId: userAId,
      ...fixture.profile,
      targetWeightKg: 80.0,
      // Only 14 days after last entry for a 11 kg drop (> -5% BW/wk unclamped)
      targetDate: '2026-09-29T00:00:00.000Z',
      preferredWeeklyRatePctBw: -1.8,
      lifestyleNotes: null,
      userOverridesJson: '{}',
    };

    const solved = projectTrajectoryAndSolve(entries, aggressiveProfile, { seed: 42 });
    for (const pw of solved.solutionPathways) {
      assert.ok(
        pw.weeklyRatePctBw >= -1.0 && pw.weeklyRatePctBw <= -0.25,
        `Pathway ${pw.id} rate ${pw.weeklyRatePctBw}% out of [-1.0, -0.25] bounds`
      );
    }

    const targetDatePathway = solved.solutionPathways.find((p) => p.id === 'target_date_pace');
    assert.ok(targetDatePathway);
    assert.equal(targetDatePathway.musclePreservationRisk, 'high_clamp_applied');
  });

  it('7. Zero legacy Gemini model strings in repo, $5/mo ledger cap, N5 numeric sentry fallback, and proposal-only chat invariance', async () => {
    // 7a. Scan repository for forbidden legacy model identifiers
    const repoRoot = path.resolve(__dirname, '../../..');
    const forbiddenRegex = new RegExp(['gemini', '[12]\\.'].join('-'), 'i');
    const violatingFiles: string[] = [];

    function scanDir(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === '.git' ||
          entry.name === 'node_modules' ||
          entry.name === '.next' ||
          entry.name === 'generated' ||
          entry.name.endsWith('.db')
        ) {
          continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (/\.(ts|tsx|js|mjs|md|json)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (forbiddenRegex.test(content)) {
            violatingFiles.push(fullPath);
          }
        }
      }
    }

    scanDir(repoRoot);
    assert.deepEqual(
      violatingFiles,
      [],
      `Found forbidden legacy Gemini model references in: ${violatingFiles.join(', ')}`
    );

    // 7b. N5 narrative_and_bounds_check rejects ungrounded numbers, retries N4 once, then routes to N6 deterministic_template_fallback
    await setTestAuthUserId(userAId);
    clearJourneyGraphCache();
    let n4Attempts = 0;
    setFakeProviderInterceptor(({ taskType }) => {
      if (taskType === 'coach_narrate') {
        n4Attempts += 1;
        return {
          headline: 'Ungrounded Hallucination Test',
          bodyMarkdown: 'Your weight dropped by 9999.42 kg in 7777 days!',
          citations: [9999.42],
          origin: 'llm_grounded',
        };
      }
      return undefined;
    });

    const snapshotWithUngroundedLlm = await getJourneySnapshot({ bypassCache: true });
    assert.equal(n4Attempts, 2, 'Expected N4 to be tried initially + 1 retry before N6 fallback');
    assert.equal(snapshotWithUngroundedLlm.motivationalBrief.origin, 'deterministic_fallback');

    const sentryOnFallback = narrativeAndBoundsCheck(
      snapshotWithUngroundedLlm.motivationalBrief.bodyMarkdown,
      snapshotWithUngroundedLlm
    );
    assert.equal(sentryOnFallback.passed, true);
    setFakeProviderInterceptor(null);

    // 7c. $5.00/month hard cap enforcement in LlmSpendLedger
    await recordLlmSpend({
      userId: userAId,
      nodeId: 'test_cap_node',
      taskType: 'coach_narrate',
      tokensIn: 100000,
      tokensOut: 100000,
      costUsd: DEFAULT_MONTHLY_CAP_USD,
    });

    await assert.rejects(
      () => assertMonthlyBudgetRemaining(userAId),
      (err: unknown) => err instanceof BudgetCapExceededError
    );

    clearJourneyGraphCache();
    const cappedSnapshot = await getJourneySnapshot({ bypassCache: true });
    assert.equal(cappedSnapshot.motivationalBrief.origin, 'deterministic_fallback');

    // 7d. Chat proposal-only state invariance prior to approval, and userOverridesJson priority on merge
    const historyBeforeProposal = await getWeightHistory();
    const proposedWeight = historyBeforeProposal[historyBeforeProposal.length - 1].weight - 0.6;

    const weightProposal = await proposeWeightEntryForUser(userAId, {
      weight: proposedWeight,
      note: 'Proposed via chat tool',
    });
    assert.equal(weightProposal.status, 'pending');

    const historyWhilePending = await getWeightHistory();
    assert.equal(
      historyWhilePending.length,
      historyBeforeProposal.length,
      'Chat proposal tool must not mutate WeightEntry before explicit user confirmation'
    );

    const approveWeightRes = await applyApprovedProposal(
      weightProposal.proposalId,
      weightProposal.stateHash,
      'conor-confirm-weight-1'
    );
    assert.equal(approveWeightRes.success, true);

    const historyAfterApproval = await getWeightHistory();
    assert.equal(historyAfterApproval.length, historyBeforeProposal.length + 1);

    // Verify userOverridesJson wins on merge when applying a target update proposal
    const lockedTargetWeight = 83.2;
    await upsertJourneyProfile({
      targetWeightKg: lockedTargetWeight,
      userOverrides: { targetWeightKg: lockedTargetWeight },
    });

    const aiTargetProposal = await proposeTargetUpdateForUser(userAId, {
      targetWeightKg: 76.0,
    });
    const approveTargetRes = await applyApprovedProposal(
      aiTargetProposal.proposalId,
      aiTargetProposal.stateHash,
      'conor-confirm-target-1'
    );
    assert.equal(approveTargetRes.success, true);

    const snapshotAfterMerge = await getJourneySnapshot({ bypassCache: true });
    assert.equal(
      snapshotAfterMerge.profile.targetWeightKg,
      lockedTargetWeight,
      'User edits in userOverridesJson must always win on merge over AI proposal values'
    );
  });
});
