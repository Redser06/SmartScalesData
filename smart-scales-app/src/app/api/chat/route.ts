import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

async function getWeightHistoryDirect() {
    const entries = await prisma.weightEntry.findMany({
        orderBy: { timestamp: 'asc' },
    });
    return entries.map(entry => ({
        timestamp: entry.timestamp.toISOString(),
        weight: entry.weight,
        bodyFatPercentage: entry.bodyFatPercentage,
        note: entry.note,
    }));
}

async function logWeightDirect(data: { weight: number; note?: string; bodyFat?: number }) {
    try {
        await prisma.weightEntry.create({
            data: {
                weight: data.weight,
                timestamp: new Date(),
                unit: 'kg',
                note: data.note,
                bodyFatPercentage: data.bodyFat,
                source: 'manual_ai',
            },
        });
        revalidatePath('/');
        return { success: true };
    } catch (error) {
        console.error("Error logging weight:", error);
        return { success: false, error: "Failed to save entry" };
    }
}

export async function POST(req: Request) {
    const { messages } = await req.json();

    // Convert UIMessages from client to ModelMessages for streamText
    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
        model: google('gemini-2.0-flash'),
        messages: modelMessages,
        stopWhen: stepCountIs(5), // Allow multiple tool call rounds before stopping
        system: `You are a helpful and motivating health assistant for the "Smart Scales Tracker" app.

You have access to the user's weight data and can perform actions.

Current Date: ${new Date().toLocaleDateString()}

Guidelines:
- Be encouraging but factual.
- When asked about progress, look at the data.
- formatting: Use markdown for tables or lists if helpful.
- If the user provides a weight, ask if they want to log it if they haven't explicitly said "log it".
- When logging, assume "kg" unless specified otherwise.
`,
        tools: {
            getHistory: {
                description: 'Get the recent weight history of the user',
                inputSchema: z.object({
                    limit: z.number().optional().describe('Number of recent entries to retrieve'),
                }),
                execute: async ({ limit }: { limit?: number }) => {
                    const history = await getWeightHistoryDirect();
                    const count = limit || 20;
                    const recentHistory = history.slice(-count).map((h) => ({
                        date: new Date(h.timestamp).toLocaleDateString(),
                        weight: h.weight,
                        fat: h.bodyFatPercentage,
                        note: h.note || ''
                    }));
                    return JSON.stringify(recentHistory);
                },
            },
            logWeight: {
                description: 'Log a new weight entry for today',
                inputSchema: z.object({
                    weight: z.number().describe('Weight in kg'),
                    bodyFat: z.number().optional().describe('Body fat percentage'),
                    note: z.string().optional().describe('Optional note for the entry'),
                }),
                execute: async ({ weight, bodyFat, note }: { weight: number; bodyFat?: number; note?: string }) => {
                    const result = await logWeightDirect({ weight, bodyFat, note });
                    if (result.success) {
                        return `Successfully logged ${weight}kg for today.`;
                    } else {
                        return `Failed to log entry: ${result.error}`;
                    }
                },
            },
        },
    });

    return result.toUIMessageStreamResponse();
}
