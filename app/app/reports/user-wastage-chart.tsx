'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

interface Props {
  data: { name: string; wastage_credits: number }[]
}

const chartConfig = {
  wastage_credits: {
    label: 'Wastage Credits',
    color: 'var(--chart-4)',
  },
} satisfies ChartConfig

export function UserWastageChart({ data }: Props) {
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
        <Bar dataKey="wastage_credits" fill="var(--color-wastage_credits)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
