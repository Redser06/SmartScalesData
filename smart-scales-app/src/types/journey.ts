import { z } from 'zod';

export const CompositionClassificationSchema = z.enum([
  'muscular_overweight_bmi_false_positive',
  'recomposition_in_progress',
  'muscle_loss_warning',
  'healthy_lean_loss',
  'sarcopenic_normal_bmi',
  'adiposity_driven_elevated_bmi',
  'balanced_normal',
]);

export type CompositionClassification = z.infer<typeof CompositionClassificationSchema>;

export const CompositionReconciliationSchema = z.object({
  entryId: z.number(),
  timestamp: z.string(),
  source: z.string(),
  rawWeightKg: z.number(),
  calibratedWeightKg: z.number(),
  calibratedBodyFatPct: z.number().nullable(),
  calibratedMuscleMassKg: z.number().nullable(),
  visceralFat: z.number().nullable(),
  bodyWaterPercentage: z.number().nullable(),
  bmi: z.number(),
  fatMassKg: z.number(),
  leanBodyMassKg: z.number(),
  ffmi: z.number(),
  normalizedFfmi: z.number(),
  muscleToFatRatio: z.number().nullable(),
  classification: CompositionClassificationSchema,
  classificationReason: z.string(),
  windowDeltaWeightKg: z.number().nullable(),
  windowDeltaFatMassKg: z.number().nullable(),
  windowDeltaMuscleMassKg: z.number().nullable(),
  windowDeltaLbmKg: z.number().nullable(),
});

export type CompositionReconciliation = z.infer<typeof CompositionReconciliationSchema>;

export const EwmaPointSchema = z.object({
  dateKey: z.string(),
  timestamp: z.string(),
  rawWeightKg: z.number(),
  calibratedWeightKg: z.number(),
  ewmaWeightKg: z.number(),
  residualKg: z.number(),
  weeklyVelocityKg: z.number(),
  weeklyVelocityPctBw: z.number(),
  impliedDailyDeficitKcal: z.number(),
  safeCorridorMinKgWk: z.number(),
  safeCorridorMaxKgWk: z.number(),
  source: z.string(),
});

export type EwmaPoint = z.infer<typeof EwmaPointSchema>;

export const HorizonBandSchema = z.object({
  horizonDays: z.union([
    z.literal(7),
    z.literal(28),
    z.literal(90),
    z.literal(180),
    z.literal(365),
  ]),
  targetDateIso: z.string(),
  p10Kg: z.number(),
  p50Kg: z.number(),
  p90Kg: z.number(),
  dampedMeanKg: z.number(),
});

export type HorizonBand = z.infer<typeof HorizonBandSchema>;

export const SolutionPathwaySchema = z.object({
  id: z.enum(['current_pace', 'muscle_preserving_recomp', 'target_date_pace']),
  title: z.string(),
  weeklyRateKg: z.number(),
  weeklyRatePctBw: z.number(),
  dailyCalorieTargetKcal: z.number(),
  dailyDeficitKcal: z.number(),
  proteinFloorGramsPerDay: z.number(),
  resistanceDaysPerWeek: z.number(),
  projectedEtaDateIso: z.string().nullable(),
  musclePreservationRisk: z.enum(['low', 'moderate', 'high_clamp_applied']),
  unclampedRequestedRatePctBw: z.number().optional(),
  rationale: z.string(),
});

export type SolutionPathway = z.infer<typeof SolutionPathwaySchema>;

export const MilestoneSignalSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'water_retention_shield',
    'recomposition_victory',
    'visceral_fat_drop',
    'ffmi_milestone',
    'historic_anchor_crossed',
    'historic_anchor_closing',
  ]),
  severity: z.enum(['reassurance', 'victory', 'milestone']),
  title: z.string(),
  detail: z.string(),
  metricValue: z.number(),
  referenceValue: z.number().optional(),
  timestamp: z.string(),
});

export type MilestoneSignal = z.infer<typeof MilestoneSignalSchema>;

export const MotivationalBriefSchema = z.object({
  headline: z.string(),
  bodyMarkdown: z.string(),
  citations: z.array(z.number()),
  origin: z.enum(['llm_grounded', 'deterministic_fallback']),
});

export type MotivationalBrief = z.infer<typeof MotivationalBriefSchema>;

export const UserJourneyProfileInputSchema = z.object({
  heightCm: z.number().min(100).max(250),
  birthYear: z.number().int().min(1920).max(2020),
  biologicalSex: z.enum(['male', 'female', 'other']),
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'athlete']).default('moderate'),
  resistanceTrainingDaysWk: z.number().int().min(0).max(7).default(0),
  sleepHoursAvg: z.number().min(2).max(16).nullable().optional(),
  lifestyleNotes: z.string().nullable().optional(),
  goalType: z.enum(['cut', 'recomposition', 'lean_bulk', 'maintain']).default('recomposition'),
  targetWeightKg: z.number().min(30).max(300),
  targetBodyFatPct: z.number().min(3).max(60).nullable().optional(),
  targetMuscleMassKg: z.number().min(15).max(150).nullable().optional(),
  targetDate: z.string().nullable().optional(),
  preferredWeeklyRatePctBw: z.number().min(-2.0).max(1.0).default(-0.5),
  userOverridesJson: z.string().optional(),
});

export type UserJourneyProfileInput = z.input<typeof UserJourneyProfileInputSchema>;

export interface UserJourneyProfileData {
  id?: string;
  userId: string;
  heightCm: number;
  birthYear: number;
  biologicalSex: 'male' | 'female' | 'other';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
  resistanceTrainingDaysWk: number;
  sleepHoursAvg: number | null;
  lifestyleNotes: string | null;
  goalType: 'cut' | 'recomposition' | 'lean_bulk' | 'maintain';
  targetWeightKg: number;
  targetBodyFatPct: number | null;
  targetMuscleMassKg: number | null;
  targetDate: string | null;
  preferredWeeklyRatePctBw: number;
  userOverridesJson: string;
}

export const HistoricAnchorInputSchema = z.object({
  id: z.string().optional(),
  label: z.enum(['1_year_ago', '5_years_ago', '10_years_ago', 'all_time_peak', 'adult_low']),
  anchorDate: z.string(),
  weightKg: z.number().min(30).max(350),
  bodyFatPct: z.number().min(3).max(65).nullable().optional(),
  muscleMassKg: z.number().min(10).max(150).nullable().optional(),
  ageAtAnchor: z.number().int().min(12).max(110).nullable().optional(),
  lifestyleContext: z.string().nullable().optional(),
  origin: z.string().default('user'),
  citationNote: z.string().nullable().optional(),
});

export type HistoricAnchorInput = z.input<typeof HistoricAnchorInputSchema>;

export interface HistoricAnchorItem {
  id: string;
  userId: string;
  label: '1_year_ago' | '5_years_ago' | '10_years_ago' | 'all_time_peak' | 'adult_low';
  anchorDate: string;
  weightKg: number;
  bodyFatPct: number | null;
  muscleMassKg: number | null;
  ageAtAnchor: number | null;
  lifestyleContext: string | null;
  origin: string;
  citationNote: string | null;
}

export interface ScaleCalibrationItem {
  id?: string;
  sourceSlug: string;
  weightOffsetKg: number;
  bodyFatOffsetPct: number;
  muscleMassOffsetKg: number;
  isReferenceScale: boolean;
  overlappingPairsCount?: number;
}

export interface ScenarioProposalItem {
  id: string;
  userId: string;
  kind: 'log_entry' | 'update_target' | 'apply_solution_pathway';
  stateHash: string;
  payloadJson: string;
  status: 'pending' | 'approved' | 'discarded';
  approvalRef: string | null;
  createdAt: string;
}

export interface TrajectoryResult {
  ewmaSeries: EwmaPoint[];
  recentDailySlopeKg: number;
  weeklySlopeKg: number;
  horizonBands: HorizonBand[];
  etaP10DateIso: string | null;
  etaP50DateIso: string | null;
  etaP90DateIso: string | null;
  maintenanceKcal: number;
  bmrKcal: number;
  solutionPathways: SolutionPathway[];
}

export interface JourneyGraphState {
  userId: string;
  stateHash: string;
  inputHash: string;
  generatedAtIso: string;
  profile: UserJourneyProfileData;
  calibrations: ScaleCalibrationItem[];
  compositionSeries: CompositionReconciliation[];
  latestComposition: CompositionReconciliation | null;
  trajectory: TrajectoryResult;
  historicAnchors: HistoricAnchorItem[];
  milestoneSignals: MilestoneSignal[];
  waterShieldActive: boolean;
  motivationalBrief: MotivationalBrief;
  pendingProposals: ScenarioProposalItem[];
  monthlySpendUsd: number;
  monthlyCapUsd: number;
}
