"use client";

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DailyMacros {
    date: string;
    calories: number;
    protein: number;
    carbohydrates: number;
    fats: number;
}

interface DailyMacrosChartProps {
    data: DailyMacros[]; // Data should be aggregated by day
}

export function DailyMacrosChart({ data }: DailyMacrosChartProps) {
    const chartData = useMemo(() => {
        // Ensure data is sorted by date
        return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [data]);

    return (
        <Card className="w-full h-full">
            <CardHeader>
                <CardTitle>Daily Macro Trands</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" />
                        <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                        <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                            itemStyle={{ color: 'var(--foreground)' }}
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="protein" name="Protein (g)" stackId="a" fill="#8884d8" />
                        <Bar yAxisId="left" dataKey="carbohydrates" name="Carbs (g)" stackId="a" fill="#82ca9d" />
                        <Bar yAxisId="left" dataKey="fats" name="Fats (g)" stackId="a" fill="#ffc658" />
                        <Bar yAxisId="right" dataKey="calories" name="Calories (kcal)" fill="#ff7300" opacity={0.3} />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
