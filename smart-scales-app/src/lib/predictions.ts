
import { addDays } from "date-fns";

export function calculateTrend(data: any[], metric: string = 'weight') {
    if (data.length < 2) return null;

    // Use last 5 data points
    const recentData = data.slice(-5);

    // Simple linear regression: y = mx + c
    // x = days from start of window
    // y = metric value

    const n = recentData.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    const startDate = new Date(recentData[0].timestamp).getTime();

    const points = recentData.map(d => {
        const x = (new Date(d.timestamp).getTime() - startDate) / (1000 * 60 * 60 * 24); // days
        const y = d[metric];
        return { x, y };
    });

    for (const p of points) {
        sumX += p.x;
        sumY += p.y;
        sumXY += p.x * p.y;
        sumXX += p.x * p.x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Current last point time difference from start window
    const lastPointX = points[points.length - 1].x;

    return { slope, intercept, startDate, lastPointX, lastValue: recentData[recentData.length - 1][metric] };
}

export function getProjections(data: any[], trend: any) {
    if (!trend) return [];

    const { slope, intercept, startDate, lastPointX, lastValue } = trend;
    const lastDate = new Date(data[data.length - 1].timestamp);

    const projections = [
        { label: '1 Week', days: 7 },
        { label: '4 Weeks', days: 28 },
        { label: '3 Months', days: 90 },
    ];

    return projections.map(p => {
        const futureDate = addDays(lastDate, p.days);
        const totalDaysX = (futureDate.getTime() - startDate) / (1000 * 60 * 60 * 24);
        const predictedValue = slope * totalDaysX + intercept;
        return {
            label: p.label,
            date: futureDate,
            value: predictedValue,
            change: predictedValue - lastValue
        };
    });
}
