"use client";

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface FoodFrequency {
    name: string;
    count: number;
    calories: number; // Average calories
}

interface FoodFrequencyChartProps {
    data: FoodFrequency[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export function FoodFrequencyChart({ data }: FoodFrequencyChartProps) {
    const sortedData = useMemo(() => {
        return [...data].sort((a, b) => b.count - a.count).slice(0, 10);
    }, [data]);

    return (
        <Card className="w-full h-full">
            <CardHeader>
                <CardTitle>Standard Consumption</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        layout="vertical"
                        data={sortedData}
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                            cursor={{ fill: 'transparent' }}
                        />
                        <Bar dataKey="count" name="Times Eaten" radius={[0, 4, 4, 0]}>
                            {sortedData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
