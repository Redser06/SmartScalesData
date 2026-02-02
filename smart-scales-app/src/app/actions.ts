'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getWeightHistory() {
    const entries = await prisma.weightEntry.findMany({
        orderBy: {
            timestamp: 'asc',
        },
    });

    return entries.map(entry => ({
        ...entry,
        // ensure dates are serialized
        timestamp: entry.timestamp.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
    }));
}

export async function deleteWeightEntry(id: number) {
    try {
        await prisma.weightEntry.delete({
            where: { id },
        });
        revalidatePath('/');
        return { success: true };
    } catch (error) {
        console.error("Error deleting weight entry:", error);
        return { success: false, error: "Failed to delete entry" };
    }
}
