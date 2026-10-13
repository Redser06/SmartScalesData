import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import {
  assertMonthlyBudgetRemaining,
  BudgetCapExceededError,
  recordLlmSpend,
} from '@/lib/ai/budget-ledger';
import {
  DEFAULT_PRODUCTION_MODEL_ID,
  estimateTokenCostUsd,
  getChatLanguageModel,
  isFakeProviderEnabled,
} from '@/lib/ai/provider';
import { computeStateHash, executeJourneyGraph } from '@/lib/graph/journey-graph';
import type {
  HistoricAnchorItem,
  ScaleCalibrationItem,
  ScenarioProposalItem,
  UserJourneyProfileData,
} from '@/types/journey';

export const maxDuration = 30;

async function buildUserJourneyState(userId: string) {
  const [entries, dbProfile, dbCalibrations, dbAnchors, dbProposals] = await Promise.all([
    prisma.weightEntry.findMany({
      where: { userId },
      orderBy: { timestamp: 'asc' },
    }),
    prisma.userJourneyProfile.findUnique({ where: { userId } }),
    prisma.scaleCalibration.findMany({ where: { userId } }),
    prisma.historicAnchor.findMany({ where: { userId }, orderBy: { anchorDate: 'asc' } }),
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

  return executeJourneyGraph({
    userId,
    entries,
    profile,
    existingCalibrations,
    historicAnchors,
    pendingProposals,
  });
}

export async function proposeWeightEntryForUser(
  userId: string,
  input: {
    weight: number;
    bodyFat?: number;
    muscleMass?: number;
    note?: string;
    timestamp?: string;
  }
) {
  const [entries, dbProfile, dbAnchors] = await Promise.all([
    prisma.weightEntry.findMany({ where: { userId }, orderBy: { timestamp: 'asc' } }),
    prisma.userJourneyProfile.findUnique({ where: { userId } }),
    prisma.historicAnchor.findMany({ where: { userId }, orderBy: { anchorDate: 'asc' } }),
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

  const stateHash = computeStateHash({
    userId,
    entries,
    profile,
    historicAnchors,
  });

  const proposal = await prisma.scenarioProposal.create({
    data: {
      userId,
      kind: 'log_entry',
      stateHash,
      payloadJson: JSON.stringify({
        weight: input.weight,
        bodyFat: input.bodyFat ?? null,
        muscleMass: input.muscleMass ?? null,
        note: input.note ?? null,
        timestamp: input.timestamp ?? new Date().toISOString(),
      }),
      status: 'pending',
    },
  });

  return {
    proposalId: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    stateHash: proposal.stateHash,
    message: `Created pending weight entry proposal (${input.weight} kg). Please click Confirm & Apply in the Proposal Approval Card to save it.`,
  };
}

export async function proposeTargetUpdateForUser(
  userId: string,
  input: {
    targetWeightKg?: number;
    targetBodyFatPct?: number;
    targetMuscleMassKg?: number;
    targetDate?: string;
    preferredWeeklyRatePctBw?: number;
    goalType?: 'cut' | 'recomposition' | 'lean_bulk' | 'maintain';
  }
) {
  const [entries, dbProfile, dbAnchors] = await Promise.all([
    prisma.weightEntry.findMany({ where: { userId }, orderBy: { timestamp: 'asc' } }),
    prisma.userJourneyProfile.findUnique({ where: { userId } }),
    prisma.historicAnchor.findMany({ where: { userId }, orderBy: { anchorDate: 'asc' } }),
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

  const stateHash = computeStateHash({
    userId,
    entries,
    profile,
    historicAnchors,
  });

  const proposal = await prisma.scenarioProposal.create({
    data: {
      userId,
      kind: 'update_target',
      stateHash,
      payloadJson: JSON.stringify(input),
      status: 'pending',
    },
  });

  return {
    proposalId: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    stateHash: proposal.stateHash,
    message:
      'Created pending target/profile update proposal. Please review and click Confirm & Apply in the Proposal Approval Card.',
  };
}

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = session.user.id;
  const { messages } = await req.json();

  // Check $5.00/month budget cap before any cloud LLM call
  try {
    await assertMonthlyBudgetRemaining(userId);
  } catch (err) {
    if (err instanceof BudgetCapExceededError) {
      const fallbackState = await buildUserJourneyState(userId);
      return Response.json({
        role: 'assistant',
        content: fallbackState.motivationalBrief.bodyMarkdown,
        budgetCapped: true,
      });
    }
    throw err;
  }

  if (isFakeProviderEnabled() || !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const state = await buildUserJourneyState(userId);
    return Response.json({
      role: 'assistant',
      content: state.motivationalBrief.bodyMarkdown,
      provider: 'FakeProvider',
    });
  }

  const modelMessages = await convertToModelMessages(messages);

  const updateTargetInputSchema = z.object({
    targetWeightKg: z.number().optional().describe('Proposed target weight in kg'),
    targetBodyFatPct: z.number().optional().describe('Proposed target body fat percentage'),
    targetMuscleMassKg: z.number().optional().describe('Proposed target muscle mass in kg'),
    targetDate: z.string().optional().describe('Proposed target ISO date'),
    preferredWeeklyRatePctBw: z
      .number()
      .optional()
      .describe('Preferred weekly rate of change (%BW/week)'),
    goalType: z
      .enum(['cut', 'recomposition', 'lean_bulk', 'maintain'])
      .optional()
      .describe('Goal type'),
  });

  const result = streamText({
    model: getChatLanguageModel(),
    messages: modelMessages,
    stopWhen: stepCountIs(5),
    system: `You are the grounded Composition & Trajectory Coach for SmartScalesData v2 (${DEFAULT_PRODUCTION_MODEL_ID}).
- You have read-only tools to inspect the user's calibrated composition, EWMA trajectory bands, solution pathways, and historic anchors.
- You NEVER mutate the database directly. To log weight or update a target/profile, call proposeWeightEntry or proposeTargetOrProfileUpdate to create a pending ScenarioProposal for user confirmation.
- Cite only exact numbers returned by the deterministic tools.`,
    tools: {
      getJourneySnapshot: {
        description: 'Get the full deterministic JourneyGraphState snapshot for the current user',
        inputSchema: z.object({}),
        execute: async () => {
          const snapshot = await buildUserJourneyState(userId);
          return JSON.stringify({
            stateHash: snapshot.stateHash,
            latestComposition: snapshot.latestComposition,
            horizonBands: snapshot.trajectory.horizonBands,
            solutionPathways: snapshot.trajectory.solutionPathways,
            milestoneSignals: snapshot.milestoneSignals,
            motivationalBrief: snapshot.motivationalBrief,
          });
        },
      },
      getCompositionReconciliation: {
        description: 'Get BMI vs. FFMI reconciliation and fat/lean tissue partitioning history',
        inputSchema: z.object({
          limit: z.number().optional().describe('Number of recent entries to return'),
        }),
        execute: async ({ limit }: { limit?: number }) => {
          const snapshot = await buildUserJourneyState(userId);
          const count = limit ?? 14;
          return JSON.stringify(snapshot.compositionSeries.slice(-count));
        },
      },
      getTrajectoryAndSolutions: {
        description: 'Get 7-day EWMA series, P10/P50/P90 projection bands, and 3 clamped solution pathways',
        inputSchema: z.object({}),
        execute: async () => {
          const snapshot = await buildUserJourneyState(userId);
          return JSON.stringify(snapshot.trajectory);
        },
      },
      getHistoricAnchors: {
        description: 'Get the user historic weight & composition benchmarks (1y, 5y, 10y ago, peak, adult low)',
        inputSchema: z.object({}),
        execute: async () => {
          const snapshot = await buildUserJourneyState(userId);
          return JSON.stringify(snapshot.historicAnchors);
        },
      },
      proposeWeightEntry: {
        description:
          'Create a pending ScenarioProposal to log a new weight entry (requires user confirmation in ProposalApprovalCard)',
        inputSchema: z.object({
          weight: z.number().describe('Weight in kg'),
          bodyFat: z.number().optional().describe('Body fat percentage'),
          muscleMass: z.number().optional().describe('Muscle mass in kg'),
          note: z.string().optional().describe('Optional note for the entry'),
        }),
        execute: async (input: {
          weight: number;
          bodyFat?: number;
          muscleMass?: number;
          note?: string;
        }) => {
          const res = await proposeWeightEntryForUser(userId, input);
          return JSON.stringify(res);
        },
      },
      proposeTargetUpdate: {
        description:
          'Create a pending ScenarioProposal to update target weight, body fat, date, or weekly rate',
        inputSchema: updateTargetInputSchema,
        execute: async (input: z.infer<typeof updateTargetInputSchema>) => {
          const res = await proposeTargetUpdateForUser(userId, input);
          return JSON.stringify(res);
        },
      },
      proposeTargetOrProfileUpdate: {
        description:
          'Create a pending ScenarioProposal to update target weight, body fat, date, or journey profile settings',
        inputSchema: updateTargetInputSchema,
        execute: async (input: z.infer<typeof updateTargetInputSchema>) => {
          const res = await proposeTargetUpdateForUser(userId, input);
          return JSON.stringify(res);
        },
      },
    },
    onFinish: async ({ usage }) => {
      const tokensIn = usage?.inputTokens ?? 300;
      const tokensOut = usage?.outputTokens ?? 180;
      const costUsd = estimateTokenCostUsd(tokensIn, tokensOut);
      await recordLlmSpend({
        userId,
        nodeId: 'chat_route',
        taskType: 'journey_chat',
        tokensIn,
        tokensOut,
        costUsd,
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
