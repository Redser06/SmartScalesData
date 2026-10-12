import { google } from '@ai-sdk/google';
import { generateObject, generateText } from 'ai';
import type { z } from 'zod';
import {
  assertMonthlyBudgetRemaining,
  DEFAULT_MONTHLY_CAP_USD,
  recordLlmSpend,
} from '@/lib/ai/budget-ledger';

export type AiTaskType = 'coach_narrate' | 'solution_planner' | 'journey_chat';

export const DEFAULT_PRODUCTION_MODEL_ID = 'gemini-3.8-flash';

// Pricing per 1M tokens for Gemini 3.8 Flash
const INPUT_COST_PER_MILLION_USD = 0.15;
const OUTPUT_COST_PER_MILLION_USD = 0.6;

export function isFakeProviderEnabled(): boolean {
  return (
    process.env.AI_PROVIDER === 'fake' ||
    process.env.CI === 'true' ||
    process.env.CI === '1'
  );
}

export function getChatLanguageModel() {
  return google(DEFAULT_PRODUCTION_MODEL_ID);
}

export function estimateTokenCostUsd(tokensIn: number, tokensOut: number): number {
  const inCost = (Math.max(0, tokensIn) / 1_000_000) * INPUT_COST_PER_MILLION_USD;
  const outCost = (Math.max(0, tokensOut) / 1_000_000) * OUTPUT_COST_PER_MILLION_USD;
  return Number((inCost + outCost).toFixed(6));
}

export interface RunTaskModelOptions<T> {
  taskType: AiTaskType;
  userId: string;
  nodeId: string;
  system: string;
  prompt: string;
  schema?: z.ZodType<T>;
  capUsd?: number;
  fakeFallbackGenerator?: () => T;
}

export interface RunTaskModelResult<T> {
  output: T;
  provider: 'fake' | 'google';
  modelId: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

// Test hook for injecting custom FakeProvider responses (e.g. for N5 ungrounded-number sentry tests)
let customFakeInterceptor:
  | ((opts: { taskType: AiTaskType; nodeId: string; attempt: number }) => unknown | undefined)
  | null = null;
let interceptorAttemptCounter = 0;

export function setFakeProviderInterceptor(
  fn: ((opts: { taskType: AiTaskType; nodeId: string; attempt: number }) => unknown | undefined) | null
) {
  customFakeInterceptor = fn;
  interceptorAttemptCounter = 0;
}

export async function runTaskModel<T = string>(
  options: RunTaskModelOptions<T>
): Promise<RunTaskModelResult<T>> {
  const {
    taskType,
    userId,
    nodeId,
    system,
    prompt,
    schema,
    capUsd = DEFAULT_MONTHLY_CAP_USD,
    fakeFallbackGenerator,
  } = options;

  // Enforce $5.00/month hard cap BEFORE any model execution
  await assertMonthlyBudgetRemaining(userId, capUsd);

  if (isFakeProviderEnabled() || !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    interceptorAttemptCounter += 1;
    if (customFakeInterceptor) {
      const intercepted = customFakeInterceptor({
        taskType,
        nodeId,
        attempt: interceptorAttemptCounter,
      });
      if (intercepted !== undefined) {
        return {
          output: intercepted as T,
          provider: 'fake',
          modelId: 'FakeProvider',
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
        };
      }
    }

    if (fakeFallbackGenerator) {
      return {
        output: fakeFallbackGenerator(),
        provider: 'fake',
        modelId: 'FakeProvider',
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
      };
    }

    return {
      output: '' as unknown as T,
      provider: 'fake',
      modelId: 'FakeProvider',
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
    };
  }

  const model = google(DEFAULT_PRODUCTION_MODEL_ID);

  if (schema) {
    const result = await generateObject({
      model,
      system,
      prompt,
      schema,
    });

    const tokensIn = result.usage?.inputTokens ?? 250;
    const tokensOut = result.usage?.outputTokens ?? 150;
    const costUsd = estimateTokenCostUsd(tokensIn, tokensOut);

    await recordLlmSpend({
      userId,
      nodeId,
      taskType,
      tokensIn,
      tokensOut,
      costUsd,
    });

    return {
      output: result.object,
      provider: 'google',
      modelId: DEFAULT_PRODUCTION_MODEL_ID,
      tokensIn,
      tokensOut,
      costUsd,
    };
  }

  const textResult = await generateText({
    model,
    system,
    prompt,
  });

  const tokensIn = textResult.usage?.inputTokens ?? 250;
  const tokensOut = textResult.usage?.outputTokens ?? 150;
  const costUsd = estimateTokenCostUsd(tokensIn, tokensOut);

  await recordLlmSpend({
    userId,
    nodeId,
    taskType,
    tokensIn,
    tokensOut,
    costUsd,
  });

  return {
    output: textResult.text as unknown as T,
    provider: 'google',
    modelId: DEFAULT_PRODUCTION_MODEL_ID,
    tokensIn,
    tokensOut,
    costUsd,
  };
}
