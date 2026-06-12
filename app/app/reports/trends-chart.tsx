'use client'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

interface Props {
  data: { date: string; credits: number; count: number }[]
}

const chartConfig = {
  credits: {
    label: 'Credits',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

export function TrendsChart({ data }: Props) {
  return (
    <ChartContainer config={chartConfig} className="h-72 w-full">
      <AreaChart
        accessibilityLayer
        data={data}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickFormatter={(v: string) => {
            const d = new Date(v)
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          stroke="var(--muted-foreground)"
          fontSize={11}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <defs>
          <linearGradient id="fillCredits" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-credits)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-credits)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Area
          dataKey="credits"
          type="natural"
          fill="url(#fillCredits)"
          stroke="var(--color-credits)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
