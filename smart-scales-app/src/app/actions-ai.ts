'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function logWeightEntry(data: { weight: number; note?: string; bodyFat?: number }) {
    try {
        const newEntry = await prisma.weightEntry.create({
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
        return { success: true, entry: newEntry };
    } catch (error) {
        console.error("Error logging weight:", error);
        return { success: false, error: "Failed to save entry" };
    }
}
