'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { getCurrentUserId } from '@/lib/get-user';
import {
  applyCalibrationToEntries,
  computeScaleCalibrations,
  parseMultiScaleCsv,
} from '@/lib/scale-calibrator';
import { computeStateHash, executeJourneyGraph } from '@/lib/graph/journey-graph';
import {
  HistoricAnchorInputSchema,
  type HistoricAnchorInput,
  type HistoricAnchorItem,
  type JourneyGraphState,
  type ScaleCalibrationItem,
  type ScenarioProposalItem,
  type UserJourneyProfileData,
  type UserJourneyProfileInput,
} from '@/types/journey';

let testAuthUserIdOverride: string | null = null;

export async function setTestAuthUserId(userId: string | null) {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.CI === 'true' ||
    process.env.AI_PROVIDER === 'fake'
  ) {
    testAuthUserIdOverride = userId;
  }
}

export async function resolveAuthenticatedUserId(): Promise<string> {
  if (
    testAuthUserIdOverride &&
    (process.env.NODE_ENV === 'test' ||
      process.env.CI === 'true' ||
      process.env.AI_PROVIDER === 'fake')
  ) {
    return testAuthUserIdOverride;
  }
  return getCurrentUserId();
}

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // No-op when running outside Next.js HTTP request context (e.g., property tests)
  }
}

const DEFAULT_PROFILE_BASE: Omit<UserJourneyProfileData, 'userId'> = {
  heightCm: 178,
  birthYear: 1988,
  biologicalSex: 'male',
  activityLevel: 'moderate',
  resistanceTrainingDaysWk: 3,
  sleepHoursAvg: 7.5,
  lifestyleNotes: null,
  goalType: 'recomposition',
  targetWeightKg: 82.0,
  targetBodyFatPct: 16.0,
  targetMuscleMassKg: 66.0,
  targetDate: null,
  preferredWeeklyRatePctBw: -0.5,
  userOverridesJson: '{}',
};

export async function recalibrateUserEntries(userId: string): Promise<ScaleCalibrationItem[]> {
  const [entries, existingDbCalibrations] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId },
      orderBy: { timestamp: 'asc' },
    }),
    prisma.scaleCalibration.findMany({
      where: { userId },
    }),
  ]);

  const existingCalibrations: ScaleCalibrationItem[] = existingDbCalibrations.map((c) => ({
    id: c.id,
    sourceSlug: c.sourceSlug,
    weightOffsetKg: c.weightOffsetKg,
    bodyFatOffsetPct: c.bodyFatOffsetPct,
    muscleMassOffsetKg: c.muscleMassOffsetKg,
    isReferenceScale: c.isReferenceScale,
  }));

  const computedCalibrations = computeScaleCalibrations(entries, existingCalibrations);
  const calibratedEntries = applyCalibrationToEntries(entries, computedCalibrations);

  for (const cal of computedCalibrations) {
    await prisma.scaleCalibration.upsert({
      where: {
        userId_sourceSlug: {
          userId,
          sourceSlug: cal.sourceSlug,
        },
      },
      create: {
        userId,
        sourceSlug: cal.sourceSlug,
        weightOffsetKg: cal.weightOffsetKg,
        bodyFatOffsetPct: cal.bodyFatOffsetPct,
        muscleMassOffsetKg: cal.muscleMassOffsetKg,
        isReferenceScale: cal.isReferenceScale,
      },
      update: {
        weightOffsetKg: cal.weightOffsetKg,
        bodyFatOffsetPct: cal.bodyFatOffsetPct,
        muscleMassOffsetKg: cal.muscleMassOffsetKg,
        isReferenceScale: cal.isReferenceScale,
      },
    });
  }

  for (const calEntry of calibratedEntries) {
    await prisma.weightEntry.update({
      where: { id: calEntry.id },
      data: {
        calibratedWeightKg: calEntry.calibratedWeightKg,
        calibratedBodyFatPct: calEntry.calibratedBodyFatPct,
        calibratedMuscleMassKg: calEntry.calibratedMuscleMassKg,
      },
    });
  }

  return computedCalibrations;
}

export async function getWeightHistory() {
  const userId = await resolveAuthenticatedUserId();

  const entries = await prisma.weightEntry.findMany({
    where: { userId },
    orderBy: {
      timestamp: 'asc',
    },
  });

  return entries.map((entry) => ({
    ...entry,
    timestamp: entry.timestamp.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));
}

export async function deleteWeightEntry(id: number) {
  const userId = await resolveAuthenticatedUserId();

  try {
    const entry = await prisma.weightEntry.findFirst({
      where: { id, userId },
    });

    if (!entry) {
      return { success: false, error: 'Entry not found or access denied' };
    }

    await prisma.weightEntry.delete({
      where: { id },
    });
    await recalibrateUserEntries(userId);
    safeRevalidate('/');
    return { success: true };
  } catch (error) {
    console.error('Error deleting weight entry:', error);
    return { success: false, error: 'Failed to delete entry' };
  }
}

export async function importCsvData(csvContent: string, defaultSource = 'csv_import') {
  const userId = await resolveAuthenticatedUserId();

  try {
    const { rows, errors } = parseMultiScaleCsv(csvContent, defaultSource);

    let importedCount = 0;
    let skippedCount = 0;

    for (const row of rows) {
      try {
        await prisma.weightEntry.create({
          data: {
            userId,
            timestamp: row.timestamp,
            weight: row.weight,
            unit: row.unit,
            bmi: row.bmi,
            bodyFatPercentage: row.bodyFatPercentage,
            muscleMass: row.muscleMass,
            visceralFat: row.visceralFat,
            bodyWaterPercentage: row.bodyWaterPercentage,
            boneMass: row.boneMass,
            bmr: row.bmr,
            bodyType: row.bodyType,
            bodyScore: row.bodyScore,
            proteinRate: row.proteinRate,
            skeletalMuscleRate: row.skeletalMuscleRate,
            subcutaneousFat: row.subcutaneousFat,
            leanBodyMass: row.leanBodyMass,
            calibratedWeightKg: row.weight,
            calibratedBodyFatPct: row.bodyFatPercentage,
            calibratedMuscleMassKg: row.muscleMass,
            note: row.note,
            source: row.source,
            rawData: row.rawData,
          },
        });
        importedCount++;
      } catch (e: unknown) {
        const prismaErr = e as { code?: string; message?: string };
        if (prismaErr.code === 'P2002') {
          skippedCount++;
        } else {
          errors.push(
            `Error importing ${row.timestamp.toISOString()}: ${prismaErr.message ?? 'unknown error'}`
          );
        }
      }
    }

    if (importedCount > 0) {
      await recalibrateUserEntries(userId);
    }

    safeRevalidate('/');
    return {
      success: true,
      imported: importedCount,
      skipped: skippedCount,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to import CSV';
    console.error('Error importing CSV:', error);
    return { success: false, imported: 0, skipped: 0, error: msg };
  }
}

export async function createManualWeightEntry(input: {
  weight: number;
  timestamp?: string;
  bodyFatPercentage?: number | null;
  muscleMass?: number | null;
  visceralFat?: number | null;
  bodyWaterPercentage?: number | null;
  boneMass?: number | null;
  note?: string | null;
  source?: string;
}) {
  const userId = await resolveAuthenticatedUserId();
  const ts = input.timestamp ? new Date(input.timestamp) : new Date();

  const created = await prisma.weightEntry.create({
    data: {
      userId,
      timestamp: ts,
      weight: input.weight,
      unit: 'kg',
      bodyFatPercentage: input.bodyFatPercentage ?? null,
      muscleMass: input.muscleMass ?? null,
      visceralFat: input.visceralFat ?? null,
      bodyWaterPercentage: input.bodyWaterPercentage ?? null,
      boneMass: input.boneMass ?? null,
      calibratedWeightKg: input.weight,
      calibratedBodyFatPct: input.bodyFatPercentage ?? null,
      calibratedMuscleMassKg: input.muscleMass ?? null,
      note: input.note ?? null,
      source: input.source ?? 'manual_entry',
    },
  });

  await recalibrateUserEntries(userId);
  safeRevalidate('/');
  return {
    success: true,
    entry: {
      ...created,
      timestamp: created.timestamp.toISOString(),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    },
  };
}

export async function upsertJourneyProfile(
  input: Partial<UserJourneyProfileInput> & { userOverrides?: Record<string, unknown> }
) {
  const userId = await resolveAuthenticatedUserId();
  const existing = await prisma.userJourneyProfile.findUnique({
    where: { userId },
  });

  let existingOverrides: Record<string, unknown> = {};
  try {
    existingOverrides = JSON.parse(existing?.userOverridesJson ?? '{}');
  } catch {
    existingOverrides = {};
  }

  let incomingOverrides: Record<string, unknown> = {};
  if (input.userOverridesJson) {
    try {
      incomingOverrides = JSON.parse(input.userOverridesJson);
    } catch {
      incomingOverrides = {};
    }
  }
  if (input.userOverrides) {
    incomingOverrides = { ...incomingOverrides, ...input.userOverrides };
  }

  // User overrides always win on merge
  const mergedOverrides = {
    ...existingOverrides,
    ...incomingOverrides,
  };

  const targetDateValue =
    input.targetDate !== undefined
      ? input.targetDate
        ? new Date(input.targetDate)
        : null
      : existing?.targetDate ?? null;

  const upserted = await prisma.userJourneyProfile.upsert({
    where: { userId },
    create: {
      userId,
      heightCm: input.heightCm ?? DEFAULT_PROFILE_BASE.heightCm,
      birthYear: input.birthYear ?? DEFAULT_PROFILE_BASE.birthYear,
      biologicalSex: input.biologicalSex ?? DEFAULT_PROFILE_BASE.biologicalSex,
      activityLevel: input.activityLevel ?? DEFAULT_PROFILE_BASE.activityLevel,
      resistanceTrainingDaysWk:
        input.resistanceTrainingDaysWk ?? DEFAULT_PROFILE_BASE.resistanceTrainingDaysWk,
      sleepHoursAvg: input.sleepHoursAvg ?? DEFAULT_PROFILE_BASE.sleepHoursAvg,
      lifestyleNotes: input.lifestyleNotes ?? DEFAULT_PROFILE_BASE.lifestyleNotes,
      goalType: input.goalType ?? DEFAULT_PROFILE_BASE.goalType,
      targetWeightKg:
        typeof mergedOverrides.targetWeightKg === 'number'
          ? mergedOverrides.targetWeightKg
          : input.targetWeightKg ?? DEFAULT_PROFILE_BASE.targetWeightKg,
      targetBodyFatPct: input.targetBodyFatPct ?? DEFAULT_PROFILE_BASE.targetBodyFatPct,
      targetMuscleMassKg: input.targetMuscleMassKg ?? DEFAULT_PROFILE_BASE.targetMuscleMassKg,
      targetDate: targetDateValue,
      preferredWeeklyRatePctBw:
        typeof mergedOverrides.preferredWeeklyRatePctBw === 'number'
          ? mergedOverrides.preferredWeeklyRatePctBw
          : input.preferredWeeklyRatePctBw ?? DEFAULT_PROFILE_BASE.preferredWeeklyRatePctBw,
      userOverridesJson: JSON.stringify(mergedOverrides),
    },
    update: {
      heightCm: input.heightCm ?? existing?.heightCm ?? DEFAULT_PROFILE_BASE.heightCm,
      birthYear: input.birthYear ?? existing?.birthYear ?? DEFAULT_PROFILE_BASE.birthYear,
      biologicalSex:
        input.biologicalSex ?? existing?.biologicalSex ?? DEFAULT_PROFILE_BASE.biologicalSex,
      activityLevel:
        input.activityLevel ?? existing?.activityLevel ?? DEFAULT_PROFILE_BASE.activityLevel,
      resistanceTrainingDaysWk:
        input.resistanceTrainingDaysWk ??
        existing?.resistanceTrainingDaysWk ??
        DEFAULT_PROFILE_BASE.resistanceTrainingDaysWk,
      sleepHoursAvg:
        input.sleepHoursAvg !== undefined ? input.sleepHoursAvg : existing?.sleepHoursAvg ?? null,
      lifestyleNotes:
        input.lifestyleNotes !== undefined
          ? input.lifestyleNotes
          : existing?.lifestyleNotes ?? null,
      goalType: input.goalType ?? existing?.goalType ?? DEFAULT_PROFILE_BASE.goalType,
      targetWeightKg:
        typeof mergedOverrides.targetWeightKg === 'number'
          ? mergedOverrides.targetWeightKg
          : input.targetWeightKg ?? existing?.targetWeightKg ?? DEFAULT_PROFILE_BASE.targetWeightKg,
      targetBodyFatPct:
        input.targetBodyFatPct !== undefined
          ? input.targetBodyFatPct
          : existing?.targetBodyFatPct ?? null,
      targetMuscleMassKg:
        input.targetMuscleMassKg !== undefined
          ? input.targetMuscleMassKg
          : existing?.targetMuscleMassKg ?? null,
      targetDate: targetDateValue,
      preferredWeeklyRatePctBw:
        typeof mergedOverrides.preferredWeeklyRatePctBw === 'number'
          ? mergedOverrides.preferredWeeklyRatePctBw
          : input.preferredWeeklyRatePctBw ??
            existing?.preferredWeeklyRatePctBw ??
            DEFAULT_PROFILE_BASE.preferredWeeklyRatePctBw,
      userOverridesJson: JSON.stringify(mergedOverrides),
    },
  });

  safeRevalidate('/');
  return {
    success: true,
    profile: {
      ...upserted,
      targetDate: upserted.targetDate ? upserted.targetDate.toISOString() : null,
      updatedAt: upserted.updatedAt.toISOString(),
    },
  };
}

export async function upsertHistoricAnchor(input: HistoricAnchorInput) {
  const userId = await resolveAuthenticatedUserId();
  const parsed = HistoricAnchorInputSchema.parse(input);

  const existing = parsed.id
    ? await prisma.historicAnchor.findFirst({ where: { id: parsed.id, userId } })
    : await prisma.historicAnchor.findFirst({ where: { userId, label: parsed.label } });

  const record = existing
    ? await prisma.historicAnchor.update({
        where: { id: existing.id },
        data: {
          label: parsed.label,
          anchorDate: new Date(parsed.anchorDate),
          weightKg: parsed.weightKg,
          bodyFatPct: parsed.bodyFatPct ?? null,
          muscleMassKg: parsed.muscleMassKg ?? null,
          ageAtAnchor: parsed.ageAtAnchor ?? null,
          lifestyleContext: parsed.lifestyleContext ?? null,
          origin: parsed.origin ?? 'user',
          citationNote: parsed.citationNote ?? null,
        },
      })
    : await prisma.historicAnchor.create({
        data: {
          userId,
          label: parsed.label,
          anchorDate: new Date(parsed.anchorDate),
          weightKg: parsed.weightKg,
          bodyFatPct: parsed.bodyFatPct ?? null,
          muscleMassKg: parsed.muscleMassKg ?? null,
          ageAtAnchor: parsed.ageAtAnchor ?? null,
          lifestyleContext: parsed.lifestyleContext ?? null,
          origin: parsed.origin ?? 'user',
          citationNote: parsed.citationNote ?? null,
        },
      });

  safeRevalidate('/');
  return {
    success: true,
    anchor: {
      ...record,
      anchorDate: record.anchorDate.toISOString(),
      createdAt: record.createdAt.toISOString(),
    },
  };
}

export async function deleteHistoricAnchor(id: string) {
  const userId = await resolveAuthenticatedUserId();
  const existing = await prisma.historicAnchor.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return { success: false, error: 'Historic anchor not found or access denied' };
  }
  await prisma.historicAnchor.delete({ where: { id } });
  safeRevalidate('/');
  return { success: true };
}

async function loadUserGraphInputs(userId: string) {
  const [entries, dbProfile, dbCalibrations, dbAnchors, dbProposals] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId },
      orderBy: { timestamp: 'asc' },
    }),
    prisma.userJourneyProfile.findUnique({
      where: { userId },
    }),
    prisma.scaleCalibration.findMany({
      where: { userId },
    }),
    prisma.historicAnchor.findMany({
      where: { userId },
      orderBy: { anchorDate: 'asc' },
    }),
    prisma.scenarioProposal.findMany({
      where: { userId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const profile: UserJourneyProfileData = dbProfile
    ? {
        id: dbProfile.id,
        userId,
        heightCm: dbProfile.heightCm,
        birthYear: dbProfile.birthYear,
        biologicalSex: dbProfile.biologicalSex as UserJourneyProfileData['biologicalSex'],
        activityLevel: dbProfile.activityLevel as UserJourneyProfileData['activityLevel'],
        resistanceTrainingDaysWk: dbProfile.resistanceTrainingDaysWk,
        sleepHoursAvg: dbProfile.sleepHoursAvg,
        lifestyleNotes: dbProfile.lifestyleNotes,
        goalType: dbProfile.goalType as UserJourneyProfileData['goalType'],
        targetWeightKg: dbProfile.targetWeightKg,
        targetBodyFatPct: dbProfile.targetBodyFatPct,
        targetMuscleMassKg: dbProfile.targetMuscleMassKg,
        targetDate: dbProfile.targetDate ? dbProfile.targetDate.toISOString() : null,
        preferredWeeklyRatePctBw: dbProfile.preferredWeeklyRatePctBw,
        userOverridesJson: dbProfile.userOverridesJson,
      }
    : {
        userId,
        ...DEFAULT_PROFILE_BASE,
      };

  const existingCalibrations: ScaleCalibrationItem[] = dbCalibrations.map((c) => ({
    id: c.id,
    sourceSlug: c.sourceSlug,
    weightOffsetKg: c.weightOffsetKg,
    bodyFatOffsetPct: c.bodyFatOffsetPct,
    muscleMassOffsetKg: c.muscleMassOffsetKg,
    isReferenceScale: c.isReferenceScale,
  }));

  const historicAnchors: HistoricAnchorItem[] = dbAnchors.map((a) => ({
    id: a.id,
    userId: a.userId,
    label: a.label as HistoricAnchorItem['label'],
    anchorDate: a.anchorDate.toISOString(),
    weightKg: a.weightKg,
    bodyFatPct: a.bodyFatPct,
    muscleMassKg: a.muscleMassKg,
    ageAtAnchor: a.ageAtAnchor,
    lifestyleContext: a.lifestyleContext,
    origin: a.origin,
    citationNote: a.citationNote,
  }));

  const pendingProposals: ScenarioProposalItem[] = dbProposals.map((p) => ({
    id: p.id,
    userId: p.userId,
    kind: p.kind as ScenarioProposalItem['kind'],
    stateHash: p.stateHash,
    payloadJson: p.payloadJson,
    status: p.status as ScenarioProposalItem['status'],
    approvalRef: p.approvalRef,
    createdAt: p.createdAt.toISOString(),
  }));

  return {
    entries,
    profile,
    existingCalibrations,
    historicAnchors,
    pendingProposals,
  };
}

export async function createScenarioProposal(input: {
  kind: 'log_entry' | 'update_target' | 'apply_solution_pathway';
  payload: Record<string, unknown>;
  stateHash?: string;
}): Promise<ScenarioProposalItem> {
  const userId = await resolveAuthenticatedUserId();
  const { entries, profile, historicAnchors } = await loadUserGraphInputs(userId);
  const currentStateHash =
    input.stateHash ??
    computeStateHash({
      userId,
      entries,
      profile,
      historicAnchors,
    });

  const created = await prisma.scenarioProposal.create({
    data: {
      userId,
      kind: input.kind,
      stateHash: currentStateHash,
      payloadJson: JSON.stringify(input.payload),
      status: 'pending',
    },
  });

  safeRevalidate('/');
  return {
    id: created.id,
    userId: created.userId,
    kind: created.kind as ScenarioProposalItem['kind'],
    stateHash: created.stateHash,
    payloadJson: created.payloadJson,
    status: created.status as ScenarioProposalItem['status'],
    approvalRef: created.approvalRef,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function getPendingProposals(): Promise<ScenarioProposalItem[]> {
  const userId = await resolveAuthenticatedUserId();
  const proposals = await prisma.scenarioProposal.findMany({
    where: { userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });

  return proposals.map((p) => ({
    id: p.id,
    userId: p.userId,
    kind: p.kind as ScenarioProposalItem['kind'],
    stateHash: p.stateHash,
    payloadJson: p.payloadJson,
    status: p.status as ScenarioProposalItem['status'],
    approvalRef: p.approvalRef,
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function applyApprovedProposal(
  proposalId: string,
  stateHash: string,
  approvalRef: string,
  userOverridePatch?: Record<string, unknown>
) {
  const userId = await resolveAuthenticatedUserId();

  if (!approvalRef || !approvalRef.trim()) {
    return { success: false, error: 'Explicit approvalRef is required to apply a proposal' };
  }

  const proposal = await prisma.scenarioProposal.findFirst({
    where: { id: proposalId, userId },
  });

  if (!proposal) {
    return { success: false, error: 'Proposal not found or access denied' };
  }

  if (proposal.status !== 'pending') {
    return { success: false, error: `Proposal is already ${proposal.status}` };
  }

  if (proposal.stateHash !== stateHash) {
    return {
      success: false,
      error: `State hash mismatch: proposal bound to ${proposal.stateHash}, got ${stateHash}`,
    };
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(proposal.payloadJson);
  } catch {
    return { success: false, error: 'Invalid proposal payload JSON' };
  }

  if (proposal.kind === 'log_entry') {
    const mergedEntry = { ...payload, ...(userOverridePatch ?? {}) };
    const weight = Number(mergedEntry.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      return { success: false, error: 'Invalid proposed weight value' };
    }
    const ts =
      typeof mergedEntry.timestamp === 'string' ? new Date(mergedEntry.timestamp) : new Date();
    const bodyFat =
      typeof mergedEntry.bodyFat === 'number'
        ? mergedEntry.bodyFat
        : typeof mergedEntry.bodyFatPercentage === 'number'
          ? mergedEntry.bodyFatPercentage
          : null;
    const muscleMass =
      typeof mergedEntry.muscleMass === 'number' ? mergedEntry.muscleMass : null;

    await prisma.weightEntry.create({
      data: {
        userId,
        timestamp: ts,
        weight,
        unit: 'kg',
        bodyFatPercentage: bodyFat,
        muscleMass,
        calibratedWeightKg: weight,
        calibratedBodyFatPct: bodyFat,
        calibratedMuscleMassKg: muscleMass,
        note: typeof mergedEntry.note === 'string' ? mergedEntry.note : null,
        source: 'approved_proposal',
      },
    });
    await recalibrateUserEntries(userId);
  } else if (proposal.kind === 'update_target' || proposal.kind === 'apply_solution_pathway') {
    const existingProfile = await prisma.userJourneyProfile.findUnique({
      where: { userId },
    });
    let existingUserOverrides: Record<string, unknown> = {};
    try {
      existingUserOverrides = JSON.parse(existingProfile?.userOverridesJson ?? '{}');
    } catch {
      existingUserOverrides = {};
    }

    // User edits in userOverridesJson always win over AI proposal payload
    const effectivePayload = {
      ...payload,
      ...existingUserOverrides,
      ...(userOverridePatch ?? {}),
    };

    const nextOverrides = {
      ...existingUserOverrides,
      ...(userOverridePatch ?? {}),
    };

    await upsertJourneyProfile({
      targetWeightKg:
        typeof effectivePayload.targetWeightKg === 'number'
          ? effectivePayload.targetWeightKg
          : undefined,
      targetBodyFatPct:
        typeof effectivePayload.targetBodyFatPct === 'number'
          ? effectivePayload.targetBodyFatPct
          : undefined,
      targetMuscleMassKg:
        typeof effectivePayload.targetMuscleMassKg === 'number'
          ? effectivePayload.targetMuscleMassKg
          : undefined,
      targetDate:
        typeof effectivePayload.targetDate === 'string' ? effectivePayload.targetDate : undefined,
      preferredWeeklyRatePctBw:
        typeof effectivePayload.preferredWeeklyRatePctBw === 'number'
          ? effectivePayload.preferredWeeklyRatePctBw
          : undefined,
      goalType:
        typeof effectivePayload.goalType === 'string'
          ? (effectivePayload.goalType as UserJourneyProfileData['goalType'])
          : undefined,
      userOverridesJson: JSON.stringify(nextOverrides),
    });
  }

  const updatedProposal = await prisma.scenarioProposal.update({
    where: { id: proposal.id },
    data: {
      status: 'approved',
      approvalRef: approvalRef.trim(),
    },
  });

  safeRevalidate('/');
  return {
    success: true,
    proposal: {
      id: updatedProposal.id,
      status: updatedProposal.status,
      approvalRef: updatedProposal.approvalRef,
    },
  };
}

export async function discardProposal(proposalId: string) {
  const userId = await resolveAuthenticatedUserId();
  const proposal = await prisma.scenarioProposal.findFirst({
    where: { id: proposalId, userId },
  });

  if (!proposal) {
    return { success: false, error: 'Proposal not found or access denied' };
  }

  await prisma.scenarioProposal.update({
    where: { id: proposal.id },
    data: { status: 'discarded' },
  });

  safeRevalidate('/');
  return { success: true };
}

export async function getJourneySnapshot(options?: {
  seed?: number;
  bypassCache?: boolean;
}): Promise<JourneyGraphState> {
  const userId = await resolveAuthenticatedUserId();
  const { entries, profile, existingCalibrations, historicAnchors, pendingProposals } =
    await loadUserGraphInputs(userId);

  return executeJourneyGraph({
    userId,
    entries,
    profile,
    existingCalibrations,
    historicAnchors,
    pendingProposals,
    seed: options?.seed ?? 42,
    bypassCache: options?.bypassCache ?? false,
  });
}
