'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Legend } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

interface Props {
  data: { name: string; on_time: number; missed: number }[]
}

const chartConfig = {
  on_time: {
    label: 'On Time',
    color: 'var(--chart-1)',
  },
  missed: {
    label: 'Missed',
    color: 'var(--chart-5)',
  },
} satisfies ChartConfig

export function UserOntimeChart({ data }: Props) {
  return (
    <ChartContainer config={chartConfig} className="h-72 w-full">
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 8, right: 8, bottom: 24, left: 8 }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickFormatter={(v: string) =>
            v.length > 12 ? v.substring(0, 10) + '…' : v
          }
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          stroke="var(--muted-foreground)"
          fontSize={11}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Legend />
        <Bar dataKey="on_time" fill="var(--color-on_time)" stackId="a" radius={[0, 0, 0, 0]} />
        <Bar dataKey="missed" fill="var(--color-missed)" stackId="a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
