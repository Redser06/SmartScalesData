'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { parse } from 'csv-parse/sync';
import { getCurrentUserId } from '@/lib/get-user';

export async function getWeightHistory() {
    const userId = await getCurrentUserId();

    const entries = await prisma.weightEntry.findMany({
        where: { userId },
        orderBy: {
            timestamp: 'asc',
        },
    });

    return entries.map(entry => ({
        ...entry,
        timestamp: entry.timestamp.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
    }));
}

export async function deleteWeightEntry(id: number) {
    const userId = await getCurrentUserId();

    try {
        // Verify ownership before deleting
        const entry = await prisma.weightEntry.findFirst({
            where: { id, userId },
        });

        if (!entry) {
            return { success: false, error: "Entry not found or access denied" };
        }

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

function parseFloatOrNull(value: string): number | null {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
}

export async function importCsvData(csvContent: string) {
    const userId = await getCurrentUserId();

    try {
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        let importedCount = 0;
        let skippedCount = 0;
        const errors: string[] = [];

        for (const record of records as any[]) {
            const timeValue = record['Time'];
            if (!timeValue) {
                errors.push('Missing Time field in record');
                continue;
            }

            const [datePart, timePart] = timeValue.split(' ');
            const [day, month, year] = datePart.split('-');
            const [hour, minute, second] = timePart.split(':');
            const timestamp = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                parseInt(second)
            );

            if (isNaN(timestamp.getTime())) {
                errors.push(`Invalid date: ${timeValue}`);
                continue;
            }

            try {
                await prisma.weightEntry.create({
                    data: {
                        userId,
                        timestamp,
                        weight: parseFloat(record['Weight']),
                        unit: record['Weight Unit'] || 'kg',
                        bmi: parseFloatOrNull(record['BMI']),
                        bodyFatPercentage: parseFloatOrNull(record['Body Fat(%)']),
                        muscleMass: parseFloatOrNull(record['Muscle Mass']),
                        visceralFat: parseFloatOrNull(record['VisceralFat']),
                        bodyWaterPercentage: parseFloatOrNull(record['Body Water(%)']),
                        boneMass: parseFloatOrNull(record['Bone Mass']),
                        bmr: parseFloatOrNull(record['BMR']),
                        bodyType: record['Body Type'] || null,
                        bodyScore: parseFloatOrNull(record['body Score']),
                        proteinRate: parseFloatOrNull(record['Protein Rate']),
                        skeletalMuscleRate: parseFloatOrNull(record['Skeletal Muscle Rate']),
                        subcutaneousFat: parseFloatOrNull(record['Subcutaneous Fat']),
                        leanBodyMass: parseFloatOrNull(record['Lean Body Mass']),
                        note: record['Note'] || null,
                        source: 'csv_import',
                        rawData: JSON.stringify(record)
                    }
                });
                importedCount++;
            } catch (e: any) {
                if (e.code === 'P2002') {
                    skippedCount++;
                } else {
                    errors.push(`Error importing ${timeValue}: ${e.message}`);
                }
            }
        }

        revalidatePath('/');
        return {
            success: true,
            imported: importedCount,
            skipped: skippedCount,
            errors: errors.length > 0 ? errors.slice(0, 5) : undefined
        };
    } catch (error: any) {
        console.error("Error importing CSV:", error);
        return { success: false, error: error.message || "Failed to import CSV" };
    }
}
