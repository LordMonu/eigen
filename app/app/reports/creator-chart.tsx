'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

interface Props {
  data: { id: string; name: string; credits: number; count: number }[]
}

const chartConfig = {
  credits: {
    label: 'Credits',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

export function CreatorChart({ data }: Props) {
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
        <Bar dataKey="credits" fill="var(--color-credits)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
