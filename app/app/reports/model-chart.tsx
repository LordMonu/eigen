'use client'

import { Cell, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'

interface Props {
  data: { name: string; credits: number; count: number }[]
}

// oklch tokens — reference directly as var(--chart-N).
const COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

export function ModelChart({ data }: Props) {
  const chartConfig: ChartConfig = data.reduce((acc, item, i) => {
    acc[item.name] = {
      label: item.name,
      color: COLORS[i % COLORS.length],
    }
    return acc
  }, {} as ChartConfig)

  if (data.length === 0) {
    return (
      <div className="text-center text-neutral-500 py-12">
        No paid generations in this period.
      </div>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="h-80 w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent />} />
        <Pie
          data={data}
          dataKey="credits"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={100}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent />} />
      </PieChart>
    </ChartContainer>
  )
}
