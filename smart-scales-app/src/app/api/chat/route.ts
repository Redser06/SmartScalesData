import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { searchProducts } from '@/lib/openfoodfacts';

export const maxDuration = 30;

async function getWeightHistoryDirect(userId: string) {
    const entries = await prisma.weightEntry.findMany({
        where: { userId },
        orderBy: { timestamp: 'asc' },
    });
    return entries.map(entry => ({
        timestamp: entry.timestamp.toISOString(),
        weight: entry.weight,
        bodyFatPercentage: entry.bodyFatPercentage,
        note: entry.note,
    }));
}


async function logWeightDirect(userId: string, data: { weight: number; note?: string; bodyFat?: number }) {
    try {
        await prisma.weightEntry.create({
            data: {
                userId,
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

async function logNutritionDirect(userId: string, data: {
    foodName: string;
    calories: number;
    protein: number;
    carbohydrates: number;
    fats: number;
    servingSize?: string;
    servingCount?: number;
    sourceId?: string;
    tags?: string;
}) {
    try {
        await prisma.nutritionEntry.create({
            data: {
                userId,
                foodName: data.foodName,
                calories: data.calories,
                protein: data.protein,
                carbohydrates: data.carbohydrates,
                fats: data.fats,
                servingSize: data.servingSize,
                servingCount: data.servingCount || 1.0,
                sourceId: data.sourceId,
                tags: data.tags,
            }
        });
        revalidatePath('/');
        return { success: true };
    } catch (error) {
        console.error("Error logging nutrition:", error);
        return { success: false, error: "Failed to save nutrition entry" };
    }
}

export async function POST(req: Request) {
    // Get authenticated user
    const session = await auth();

    if (!session?.user?.id) {
        return new Response("Unauthorized", { status: 401 });
    }

    const userId = session.user.id;
    const { messages } = await req.json();

    const modelMessages = await convertToModelMessages(messages);

    const result = streamText({
        model: google('gemini-2.0-flash'),
        messages: modelMessages,
        stopWhen: stepCountIs(5),
        system: `You are a helpful and motivating health assistant for the "Smart Scales Tracker" app.

You have access to the user's weight data and can perform actions.

Current Date: ${new Date().toLocaleDateString()}

Guidelines:
- Be encouraging but factual.
- When asked about progress, look at the data.
- formatting: Use markdown for tables or lists if helpful.
- If the user provides a weight, ask if they want to log it if they haven't explicitly said "log it".
- When logging, assume "kg" unless specified otherwise.
- When the user mentions food (e.g. "I ate an apple"), use the 'searchFood' tool to find nutritional info.
- Confirm findings with the user if ambiguous, otherwise proceed to log it using 'logFood'.
- Only log food if the user explicitly confirms or the intent is clear (e.g. "Log my breakfast of...").
`,
        tools: {
            getHistory: {
                description: 'Get the recent weight history of the user',
                inputSchema: z.object({
                    limit: z.number().optional().describe('Number of recent entries to retrieve'),
                }),
                execute: async ({ limit }: { limit?: number }) => {
                    const history = await getWeightHistoryDirect(userId);
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
                    const result = await logWeightDirect(userId, { weight, bodyFat, note });
                    if (result.success) {
                        return `Successfully logged ${weight}kg for today.`;
                    } else {
                        return `Failed to log entry: ${result.error}`;
                    }
                },
            },
            searchFood: {
                description: 'Search for food items to get nutritional info (calories, macros)',
                inputSchema: z.object({
                    query: z.string().describe('Food name to search for (e.g. "cheerios", "avocado")'),
                }),
                execute: async ({ query }: { query: string }) => {
                    const products = await searchProducts(query);
                    // Simplify output for the LLM
                    return products.map(p => ({
                        id: p.code,
                        name: p.product_name,
                        brand: p.brands,
                        calories: p.nutriments["energy-kcal_100g"],
                        protein: p.nutriments.proteins_100g,
                        carbs: p.nutriments.carbohydrates_100g,
                        fat: p.nutriments.fat_100g,
                        serving: p.serving_size
                    }));
                },
            },
            logFood: {
                description: 'Log a food entry to the database',
                inputSchema: z.object({
                    foodName: z.string(),
                    calories: z.number(),
                    protein: z.number(),
                    carbohydrates: z.number(),
                    fats: z.number(),
                    servingSize: z.string().optional(),
                    servingCount: z.number().optional().describe('Multiplier for the serving (default 1.0)'),
                    sourceId: z.string().optional().describe('OpenFoodFacts ID/Barcode'),
                    tags: z.string().optional().describe('Comma separated tags e.g. "breakfast, dairy"'),
                }),
                execute: async (data: any) => {
                    const result = await logNutritionDirect(userId, data);
                    if (result.success) {
                        return `Logged: ${data.foodName} (${data.calories} kcal)`;
                    } else {
                        return `Failed to log food: ${result.error}`;
                    }
                },
            },
        },
    });

    return result.toUIMessageStreamResponse();
}
