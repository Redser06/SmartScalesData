import { prisma } from '@/lib/prisma';

export const DEFAULT_MONTHLY_CAP_USD = 5.0;

export class BudgetCapExceededError extends Error {
  public readonly monthKey: string;
  public readonly currentSpendUsd: number;
  public readonly capUsd: number;

  constructor(monthKey: string, currentSpendUsd: number, capUsd: number) {
    super(
      `Monthly LLM budget cap exceeded for ${monthKey}: spent $${currentSpendUsd.toFixed(4)} of $${capUsd.toFixed(2)} cap.`
    );
    this.name = 'BudgetCapExceededError';
    this.monthKey = monthKey;
    this.currentSpendUsd = currentSpendUsd;
    this.capUsd = capUsd;
  }
}

export function getCurrentMonthKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function getMonthlySpendUsd(
  userId?: string,
  monthKey: string = getCurrentMonthKey()
): Promise<number> {
  const agg = await prisma.llmSpendLedger.aggregate({
    _sum: {
      costUsd: true,
    },
    where: {
      monthKey,
      ...(userId ? { userId } : {}),
    },
  });

  const total = agg._sum.costUsd ?? 0;
  return Number.isFinite(total) ? total : Number.POSITIVE_INFINITY;
}

export async function assertMonthlyBudgetRemaining(
  userId?: string,
  capUsd: number = DEFAULT_MONTHLY_CAP_USD,
  monthKey: string = getCurrentMonthKey()
): Promise<{ monthKey: string; currentSpendUsd: number; remainingUsd: number }> {
  // Fail-closed on invalid or non-finite cap
  if (!Number.isFinite(capUsd) || capUsd <= 0 || capUsd > DEFAULT_MONTHLY_CAP_USD) {
    throw new BudgetCapExceededError(monthKey, 0, capUsd);
  }

  const [userSpendUsd, globalMonthSpendUsd] = await Promise.all([
    getMonthlySpendUsd(userId, monthKey),
    getMonthlySpendUsd(undefined, monthKey),
  ]);
  const currentSpendUsd = Math.max(userSpendUsd, globalMonthSpendUsd);

  if (!Number.isFinite(currentSpendUsd) || currentSpendUsd >= capUsd) {
    throw new BudgetCapExceededError(monthKey, currentSpendUsd, capUsd);
  }

  return {
    monthKey,
    currentSpendUsd,
    remainingUsd: Math.max(0, capUsd - currentSpendUsd),
  };
}

export interface RecordLlmSpendInput {
  userId: string;
  nodeId: string;
  taskType: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  monthKey?: string;
}

export async function recordLlmSpend(input: RecordLlmSpendInput) {
  const monthKey = input.monthKey ?? getCurrentMonthKey();
  const safeCost =
    Number.isFinite(input.costUsd) && input.costUsd >= 0 ? input.costUsd : DEFAULT_MONTHLY_CAP_USD;

  return prisma.llmSpendLedger.create({
    data: {
      monthKey,
      userId: input.userId,
      nodeId: input.nodeId,
      taskType: input.taskType,
      tokensIn: Math.max(0, Math.round(input.tokensIn || 0)),
      tokensOut: Math.max(0, Math.round(input.tokensOut || 0)),
      costUsd: safeCost,
    },
  });
}
