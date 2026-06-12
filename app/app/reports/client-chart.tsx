'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

interface Props {
  data: { id: string; name: string; credits: number; count: number; percent: number }[]
}

// This theme stores color tokens as oklch(), so reference them as var(--chart-N)
// directly (NOT hsl(var(--chart-N)), which would be invalid CSS here).
const chartConfig = {
  credits: {
    label: 'Credits',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

export function ClientChart({ data }: Props) {
  return (
    <ChartContainer config={chartConfig} className="h-80 w-full">
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 24, top: 8, bottom: 8 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--border)" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          stroke="var(--muted-foreground)"
          fontSize={11}
        />
        <YAxis
          dataKey="name"
          type="category"
          tickLine={false}
          axisLine={false}
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickFormatter={(v: string) =>
            v.length > 18 ? v.substring(0, 16) + '…' : v
          }
          width={130}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="credits" fill="var(--color-credits)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
