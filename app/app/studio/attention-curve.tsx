'use client'

// app/app/studio/attention-curve.tsx — predicted per-second retention curve.
// Uses the project's ChartContainer convention (chartConfig with color: var(--chart-1),
// then var(--color-retention) on the SVG) to stay consistent with the report charts.
//
// The linearGradient ID is generated via useId() so that multiple VariantCards
// on the same page each own a distinct SVG definition. HTML IDs must be unique;
// a shared "retentionGrad" would cause all charts to use the first gradient
// found in the document, which breaks when gradients ever differ by score tier.

import { useId } from 'react'
import { Activity } from 'lucide-react'
import { Area, AreaChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

interface CurvePoint {
  second: number
  retention: number
}

const chartConfig = {
  retention: {
    label: 'Retention',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

export function AttentionCurve({ data }: { data: CurvePoint[] }) {
  // useId() gives a React-stable unique prefix so the <linearGradient> id
  // doesn't collide when two+ VariantCards are on the same page.
  const uid = useId()
  const gradId = `retentionGrad-${uid.replace(/:/g, '')}`

  return (
    <div>
      <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-neutral-500 mb-2">
        <Activity className="size-3" />
        Predicted attention
      </p>
      <ChartContainer config={chartConfig} className="h-24 w-full">
        <AreaChart
          accessibilityLayer
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-retention)"
                stopOpacity={0.4}
              />
              <stop
                offset="95%"
                stopColor="var(--color-retention)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="second"
            tick={{ fontSize: 9 }}
            stroke="var(--muted-foreground)"
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}s`}
          />
          <YAxis domain={[0, 100]} hide />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel={false}
                labelFormatter={(_v, payload) =>
                  payload?.[0]?.payload
                    ? `${payload[0].payload.second}s`
                    : ''
                }
                // Single ReactNode is more robust than the [value, name] tuple —
                // ChartTooltipContent renders the formatter result directly.
                formatter={(value) => `${value}% retention`}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="retention"
            stroke="var(--color-retention)"
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 3, fill: 'var(--color-retention)' }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
