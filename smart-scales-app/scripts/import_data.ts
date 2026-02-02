
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { PrismaClient } from '../src/generated/client/client';

const prisma = new PrismaClient();

async function main() {
    // Find the CSV file in the parent directory
    const parentDir = path.resolve(__dirname, '../../');
    const files = fs.readdirSync(parentDir);
    const csvFile = files.find(f => f.startsWith('BodyFatScale') && f.endsWith('.csv'));

    if (!csvFile) {
        console.error('No CSV file found starting with BodyFatScale in ' + parentDir);
        process.exit(1);
    }

    const filePath = path.join(parentDir, csvFile);
    console.log(`Reading from ${filePath}...`);

    const fileContent = fs.readFileSync(filePath, 'utf-8');

    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    console.log(`Found ${records.length} records. Importing...`);

    let importedCount = 0;

    for (const record of records as any[]) {
        // Map fields
        // Time format: 28-01-2026 09:02:59
        const [datePart, timePart] = record['Time'].split(' ');
        const [day, month, year] = datePart.split('-');
        const [hour, minute, second] = timePart.split(':');
        const timestamp = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second));

        if (isNaN(timestamp.getTime())) {
            console.warn(`Invalid date for record: ${record['Time']}`);
            continue;
        }

        try {
            await prisma.weightEntry.create({
                data: {
                    timestamp,
                    weight: parseFloat(record['Weight']),
                    unit: record['Weight Unit'],
                    bmi: parseFloatOrNull(record['BMI']),
                    bodyFatPercentage: parseFloatOrNull(record['Body Fat(%)']),
                    muscleMass: parseFloatOrNull(record['Muscle Mass']),
                    visceralFat: parseFloatOrNull(record['VisceralFat']),
                    bodyWaterPercentage: parseFloatOrNull(record['Body Water(%)']),
                    boneMass: parseFloatOrNull(record['Bone Mass']),
                    bmr: parseFloatOrNull(record['BMR']),
                    bodyType: record['Body Type'],
                    bodyScore: parseFloatOrNull(record['body Score']),
                    proteinRate: parseFloatOrNull(record['Protein Rate']),
                    skeletalMuscleRate: parseFloatOrNull(record['Skeletal Muscle Rate']),
                    subcutaneousFat: parseFloatOrNull(record['Subcutaneous Fat']),
                    leanBodyMass: parseFloatOrNull(record['Lean Body Mass']),
                    note: record['Note'] || null,
                    source: 'old_scale',
                    rawData: JSON.stringify(record)
                }
            });
            importedCount++;
        } catch (e: any) {
            if (e.code === 'P2002') {
                console.log(`Skipping duplicate entry for ${timestamp.toISOString()}`);
            } else {
                console.error(`Error importing record ${record['Time']}:`, e);
            }
        }
    }

    console.log(`Successfully imported ${importedCount} entries.`);
}

function parseFloatOrNull(value: string): number | null {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? null : parsed;
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
