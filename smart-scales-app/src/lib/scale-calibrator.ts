import { parse } from 'csv-parse/sync';
import type { ScaleCalibrationItem } from '@/types/journey';

export interface RawScaleEntry {
  id: number;
  userId?: string | null;
  timestamp: Date | string;
  weight: number;
  unit?: string;
  bmi?: number | null;
  bodyFatPercentage?: number | null;
  muscleMass?: number | null;
  visceralFat?: number | null;
  bodyWaterPercentage?: number | null;
  boneMass?: number | null;
  bmr?: number | null;
  leanBodyMass?: number | null;
  source: string;
  calibratedWeightKg?: number | null;
  calibratedBodyFatPct?: number | null;
  calibratedMuscleMassKg?: number | null;
  note?: string | null;
}

export interface CalibratedScaleEntry extends RawScaleEntry {
  calibratedWeightKg: number;
  calibratedBodyFatPct: number | null;
  calibratedMuscleMassKg: number | null;
}

export interface ParsedCsvScaleRow {
  timestamp: Date;
  weight: number;
  unit: string;
  bmi: number | null;
  bodyFatPercentage: number | null;
  muscleMass: number | null;
  visceralFat: number | null;
  bodyWaterPercentage: number | null;
  boneMass: number | null;
  bmr: number | null;
  bodyType: string | null;
  bodyScore: number | null;
  proteinRate: number | null;
  skeletalMuscleRate: number | null;
  subcutaneousFat: number | null;
  leanBodyMass: number | null;
  note: string | null;
  source: string;
  rawData: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const LB_TO_KG = 0.45359237;

export function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function toTimestampMs(ts: Date | string): number {
  return ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
}

function firstMatchingField(record: Record<string, unknown>, aliases: string[]): string | undefined {
  const lowerMap = new Map<string, string>();
  for (const [k, v] of Object.entries(record)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      lowerMap.set(k.trim().toLowerCase(), String(v).trim());
    }
  }
  for (const alias of aliases) {
    const found = lowerMap.get(alias.toLowerCase());
    if (found !== undefined) return found;
  }
  return undefined;
}

function parseNumericField(record: Record<string, unknown>, aliases: string[]): number | null {
  const raw = firstMatchingField(record, aliases);
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFlexibleTimestamp(rawTime: string, rawSecondaryTime?: string): Date | null {
  const combined = rawSecondaryTime ? `${rawTime.trim()} ${rawSecondaryTime.trim()}` : rawTime.trim();
  if (!combined) return null;

  // Format 1: DD-MM-YYYY HH:mm:ss or DD/MM/YYYY HH:mm:ss (BodyFatScale / Renpho EU)
  const dmyMatch = combined.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (dmyMatch) {
    const first = Number.parseInt(dmyMatch[1], 10);
    const second = Number.parseInt(dmyMatch[2], 10);
    const year = Number.parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? Number.parseInt(dmyMatch[4], 10) : 0;
    const minute = dmyMatch[5] ? Number.parseInt(dmyMatch[5], 10) : 0;
    const secondSec = dmyMatch[6] ? Number.parseInt(dmyMatch[6], 10) : 0;
    // Standard BodyFatScale format is DD-MM-YYYY
    const day = first;
    const month = second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const dt = new Date(year, month - 1, day, hour, minute, secondSec);
      if (!Number.isNaN(dt.getTime())) return dt;
    }
  }

  // Format 2: ISO-8601 or YYYY-MM-DD HH:mm:ss
  const direct = new Date(combined);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  return null;
}

function inferScaleSource(record: Record<string, unknown>, fallbackSource: string): string {
  const explicit = firstMatchingField(record, ['source', 'scale', 'sourceName', 'device', 'Source']);
  if (explicit) {
    return explicit.toLowerCase().replace(/\s+/g, '_');
  }
  const keys = Object.keys(record).map((k) => k.toLowerCase());
  if (keys.includes('time of measurement')) return 'renpho';
  if (keys.includes('fat-free mass (kg)') || keys.includes('hydration (kg)')) return 'withings';
  if (keys.includes('skeletal muscle mass')) return 'garmin';
  if (keys.includes('bodyfatrate') || keys.includes('basalmetabolism')) return 'xiaomi_zepp';
  if (keys.includes('startdate') && keys.includes('sourcename')) return 'apple_health';
  if (keys.includes('water(%)') && keys.includes('bone(kg)')) return 'eufy';
  return fallbackSource;
}

export function parseMultiScaleCsv(
  csvContent: string,
  defaultSource = 'csv_import'
): { rows: ParsedCsvScaleRow[]; errors: string[] } {
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  const rows: ParsedCsvScaleRow[] = [];
  const errors: string[] = [];

  for (const record of records) {
    const rawTime = firstMatchingField(record, [
      'Time',
      'Time of Measurement',
      'Date',
      'time',
      'startDate',
      'creationDate',
      'Timestamp',
    ]);
    const secondaryTime =
      rawTime && !rawTime.includes(':')
        ? firstMatchingField(record, ['Clock', 'Measurement Time'])
        : undefined;

    if (!rawTime) {
      errors.push('Missing Time/Date field in record');
      continue;
    }

    const timestamp = parseFlexibleTimestamp(rawTime, secondaryTime);
    if (!timestamp) {
      errors.push(`Invalid date: ${rawTime}`);
      continue;
    }

    const rawWeight = parseNumericField(record, [
      'Weight',
      'Weight(kg)',
      'Weight (kg)',
      'weight',
      'value',
      'Weight(lb)',
      'Weight (lb)',
    ]);

    if (rawWeight === null || rawWeight <= 0) {
      errors.push(`Invalid weight at ${rawTime}`);
      continue;
    }

    const explicitUnit =
      firstMatchingField(record, ['Weight Unit', 'unit', 'Unit'])?.toLowerCase() ??
      (firstMatchingField(record, ['Weight(lb)', 'Weight (lb)']) !== undefined ? 'lb' : 'kg');

    const weightKg = explicitUnit.startsWith('lb') ? rawWeight * LB_TO_KG : rawWeight;

    const fatMassKgWithings = parseNumericField(record, ['Fat mass (kg)', 'Fat Mass (kg)']);
    let bodyFatPercentage = parseNumericField(record, [
      'Body Fat(%)',
      'Body Fat (%)',
      'Body Fat',
      'bodyFatRate',
      'Body Fat Percentage',
    ]);
    if (bodyFatPercentage === null && fatMassKgWithings !== null && weightKg > 0) {
      bodyFatPercentage = (fatMassKgWithings / weightKg) * 100;
    }

    const muscleMass = parseNumericField(record, [
      'Muscle Mass',
      'Muscle Mass(kg)',
      'Muscle mass (kg)',
      'Skeletal Muscle Mass',
      'muscleMass',
    ]);

    const source = inferScaleSource(record, defaultSource);

    rows.push({
      timestamp,
      weight: Number(weightKg.toFixed(4)),
      unit: 'kg',
      bmi: parseNumericField(record, ['BMI', 'bmi']),
      bodyFatPercentage,
      muscleMass,
      visceralFat: parseNumericField(record, ['VisceralFat', 'Visceral Fat', 'visceralFat']),
      bodyWaterPercentage: parseNumericField(record, [
        'Body Water(%)',
        'Body Water (%)',
        'Water(%)',
        'Body Water',
        'bodyWaterRate',
      ]),
      boneMass: parseNumericField(record, ['Bone Mass', 'Bone Mass(kg)', 'Bone mass (kg)', 'Bone(kg)', 'boneMass']),
      bmr: parseNumericField(record, ['BMR', 'BMR(kcal)', 'basalMetabolism']),
      bodyType: firstMatchingField(record, ['Body Type', 'bodyType']) ?? null,
      bodyScore: parseNumericField(record, ['body Score', 'Body Score', 'bodyScore']),
      proteinRate: parseNumericField(record, ['Protein Rate', 'Protein(%)', 'proteinRate']),
      skeletalMuscleRate: parseNumericField(record, ['Skeletal Muscle Rate', 'Skeletal Muscle(%)']),
      subcutaneousFat: parseNumericField(record, ['Subcutaneous Fat', 'Subcutaneous Fat(%)']),
      leanBodyMass: parseNumericField(record, ['Lean Body Mass', 'Fat-free mass (kg)', 'Lean Body Mass(kg)']),
      note: firstMatchingField(record, ['Note', 'Notes', 'note']) ?? null,
      source,
      rawData: JSON.stringify(record),
    });
  }

  return { rows, errors };
}

/**
 * Decision D6: 7-Day Overlapping Window Median Calibration
 * For any non-reference scale S_k and reference scale S_ref, finds all pairs (e_i in S_ref, e_j in S_k)
 * with |t_i - t_j| <= 7 days. When >= 3 pairs exist and no manual override is set, computes
 * delta_m(S_k) = median(m(e_i) - m(e_j)).
 */
export function computeScaleCalibrations(
  entries: RawScaleEntry[],
  existingCalibrations: ScaleCalibrationItem[] = [],
  manualOverridesBySource: Record<string, boolean> = {}
): ScaleCalibrationItem[] {
  if (entries.length === 0) return existingCalibrations;

  // Group entries by sourceSlug
  const bySource = new Map<string, RawScaleEntry[]>();
  for (const entry of entries) {
    const slug = entry.source || 'old_scale';
    const group = bySource.get(slug) ?? [];
    group.push(entry);
    bySource.set(slug, group);
  }

  const existingBySlug = new Map<string, ScaleCalibrationItem>();
  for (const cal of existingCalibrations) {
    existingBySlug.set(cal.sourceSlug, cal);
  }

  // Determine reference scale: explicit isReferenceScale in existingCalibrations, else most frequent source
  let referenceSlug = existingCalibrations.find((c) => c.isReferenceScale)?.sourceSlug;
  if (!referenceSlug || !bySource.has(referenceSlug)) {
    let maxCount = -1;
    for (const [slug, list] of bySource.entries()) {
      if (list.length > maxCount) {
        maxCount = list.length;
        referenceSlug = slug;
      }
    }
  }

  if (!referenceSlug) return [];

  const refEntries = bySource.get(referenceSlug) ?? [];
  const results: ScaleCalibrationItem[] = [];

  for (const [slug, sourceEntries] of bySource.entries()) {
    const existing = existingBySlug.get(slug);
    if (slug === referenceSlug) {
      results.push({
        id: existing?.id,
        sourceSlug: slug,
        weightOffsetKg: 0,
        bodyFatOffsetPct: 0,
        muscleMassOffsetKg: 0,
        isReferenceScale: true,
        overlappingPairsCount: sourceEntries.length,
      });
      continue;
    }

    // Respect manual override if flagged
    if (existing && manualOverridesBySource[slug]) {
      results.push({
        ...existing,
        isReferenceScale: false,
      });
      continue;
    }

    const weightDiffs: number[] = [];
    const bfDiffs: number[] = [];
    const muscleDiffs: number[] = [];

    for (const ref of refEntries) {
      const tRef = toTimestampMs(ref.timestamp);
      for (const cand of sourceEntries) {
        const tCand = toTimestampMs(cand.timestamp);
        if (Math.abs(tRef - tCand) <= SEVEN_DAYS_MS) {
          weightDiffs.push(ref.weight - cand.weight);
          if (
            ref.bodyFatPercentage !== null &&
            ref.bodyFatPercentage !== undefined &&
            cand.bodyFatPercentage !== null &&
            cand.bodyFatPercentage !== undefined
          ) {
            bfDiffs.push(ref.bodyFatPercentage - cand.bodyFatPercentage);
          }
          if (
            ref.muscleMass !== null &&
            ref.muscleMass !== undefined &&
            cand.muscleMass !== null &&
            cand.muscleMass !== undefined
          ) {
            muscleDiffs.push(ref.muscleMass - cand.muscleMass);
          }
        }
      }
    }

    const hasEnoughPairs = weightDiffs.length >= 3;
    const weightOffsetKg = hasEnoughPairs
      ? Number(computeMedian(weightDiffs).toFixed(4))
      : existing?.weightOffsetKg ?? 0;
    const bodyFatOffsetPct =
      bfDiffs.length >= 3
        ? Number(computeMedian(bfDiffs).toFixed(4))
        : existing?.bodyFatOffsetPct ?? 0;
    const muscleMassOffsetKg =
      muscleDiffs.length >= 3
        ? Number(computeMedian(muscleDiffs).toFixed(4))
        : existing?.muscleMassOffsetKg ?? 0;

    results.push({
      id: existing?.id,
      sourceSlug: slug,
      weightOffsetKg: Object.is(weightOffsetKg, -0) ? 0 : weightOffsetKg,
      bodyFatOffsetPct: Object.is(bodyFatOffsetPct, -0) ? 0 : bodyFatOffsetPct,
      muscleMassOffsetKg: Object.is(muscleMassOffsetKg, -0) ? 0 : muscleMassOffsetKg,
      isReferenceScale: false,
      overlappingPairsCount: weightDiffs.length,
    });
  }

  return results;
}

export function applyCalibrationToEntries(
  entries: RawScaleEntry[],
  calibrations: ScaleCalibrationItem[]
): CalibratedScaleEntry[] {
  const calMap = new Map<string, ScaleCalibrationItem>();
  for (const cal of calibrations) {
    calMap.set(cal.sourceSlug, cal);
  }

  return entries.map((entry) => {
    const cal = calMap.get(entry.source || 'old_scale');
    const wOffset = cal?.weightOffsetKg ?? 0;
    const bfOffset = cal?.bodyFatOffsetPct ?? 0;
    const mOffset = cal?.muscleMassOffsetKg ?? 0;

    const calibratedWeightKg =
      wOffset === 0 ? entry.weight : Number((entry.weight + wOffset).toFixed(4));

    const calibratedBodyFatPct =
      entry.bodyFatPercentage === null || entry.bodyFatPercentage === undefined
        ? null
        : bfOffset === 0
          ? entry.bodyFatPercentage
          : Number(Math.max(2, Math.min(75, entry.bodyFatPercentage + bfOffset)).toFixed(4));

    const calibratedMuscleMassKg =
      entry.muscleMass === null || entry.muscleMass === undefined
        ? null
        : mOffset === 0
          ? entry.muscleMass
          : Number(Math.max(5, entry.muscleMass + mOffset).toFixed(4));

    return {
      ...entry,
      calibratedWeightKg,
      calibratedBodyFatPct,
      calibratedMuscleMassKg,
    };
  });
}
