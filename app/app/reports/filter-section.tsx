'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Cell, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── Shared types (exported so page.tsx can use them) ─────────────────────────

export interface ClientRow {
  id: string
  name: string
  industry: string | null
  totalWorks: number
  usefulCredits: number
  wastageCredits: number
  reworkUsefulCredits: number
  reworkWastageCredits: number
  models: { name: string; credits: number }[]
}

export interface ModelRow {
  name: string
  usefulCredits: number
  wastageCredits: number
}

export interface VideoTypeRow {
  type: string
  totalWorks: number
  usefulCredits: number
  wastageCredits: number
}

export interface IndustryRow {
  industry: string
  totalClients: number
  totalWorks: number
  usefulCredits: number
  wastageCredits: number
}

export interface WastageRow {
  workId: string
  workTitle: string | null
  clientName: string
  status: string
  usefulCredits: number
  wastageCredits: number
  reworkWastageCredits: number
  totalWastage: number
}

interface Props {
  clients: ClientRow[]
  models: ModelRow[]
  videoTypes: VideoTypeRow[]
  industries: IndustryRow[]
  wastage: WastageRow[]
  fromDate: string
  toDate: string
}

type Tab = 'client' | 'model' | 'video_type' | 'industry' | 'wastage'

const TABS: { key: Tab; label: string }[] = [
  { key: 'client', label: 'By Client' },
  { key: 'model', label: 'By Model' },
  { key: 'video_type', label: 'By Video Type' },
  { key: 'industry', label: 'By Industry' },
  { key: 'wastage', label: 'Wastage' },
]

const PIE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

function cr(n: number) {
  return n > 0 ? n.toFixed(2) : '—'
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FilterSection({ clients, models, videoTypes, industries, wastage, fromDate, toDate }: Props) {
  const [tab, setTab] = useState<Tab>('client')
  const [modelsModal, setModelsModal] = useState<ClientRow | null>(null)

  return (
    <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-neutral-800 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'text-white border-b-2 border-white bg-neutral-900/40'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tables — only active tab renders */}
      <div className="overflow-auto max-h-[520px]">
        {tab === 'client' && (
          <ClientTable rows={clients} fromDate={fromDate} toDate={toDate} onViewModels={setModelsModal} />
        )}
        {tab === 'model' && <ModelTable rows={models} />}
        {tab === 'video_type' && <VideoTypeTable rows={videoTypes} />}
        {tab === 'industry' && <IndustryTable rows={industries} />}
        {tab === 'wastage' && <WastageTable rows={wastage} />}
      </div>

      {/* Models pie chart modal */}
      <Dialog open={!!modelsModal} onOpenChange={(o) => !o && setModelsModal(null)}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-lg">
              {modelsModal?.name} — Models Used
            </DialogTitle>
          </DialogHeader>
          {modelsModal && modelsModal.models.length > 0 ? (
            <div className="space-y-4">
              {/* Pie chart */}
              <div className="border border-neutral-800 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-neutral-800 bg-neutral-900/30 text-xs text-neutral-500 uppercase tracking-wider font-semibold">
                  Distribution
                </div>
                <ModelsPie data={modelsModal.models} />
              </div>

              {/* Model list */}
              <div className="border border-neutral-800 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-neutral-800 bg-neutral-900/30 text-xs text-neutral-500 uppercase tracking-wider font-semibold">
                  Models ({modelsModal.models.length})
                </div>
                <div className="divide-y divide-neutral-800/60">
                  {modelsModal.models.map((m, i) => (
                    <div key={m.name} className="flex items-center justify-between px-4 py-2.5">
                      <span className="flex items-center gap-3 text-sm">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="text-neutral-200">{m.name}</span>
                      </span>
                      <span className="text-orange-400 font-semibold">{m.credits.toFixed(2)} cr</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-900/30 border-t border-neutral-700">
                    <span className="text-neutral-400 font-medium">Total Credits</span>
                    <span className="text-white font-bold">{modelsModal.models.reduce((s, m) => s + m.credits, 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-neutral-500 text-sm py-8 text-center">No model data for this client yet.</p>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ─── By Client ────────────────────────────────────────────────────────────────

function ClientTable({
  rows,
  fromDate,
  toDate,
  onViewModels,
}: {
  rows: ClientRow[]
  fromDate: string
  toDate: string
  onViewModels: (row: ClientRow) => void
}) {
  const router = useRouter()

  if (rows.length === 0) {
    return <Empty message="No clients with activity in this period." />
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-neutral-950 z-10">
        <tr className="text-xs text-neutral-500 border-b border-neutral-800">
          <th className="text-left py-2 pl-4">Client</th>
          <th className="text-right py-2">Works</th>
          <th className="text-right py-2">Useful Cr.</th>
          <th className="text-right py-2">Wastage Cr.</th>
          <th className="text-right py-2">Rework Useful</th>
          <th className="text-right py-2">Rework Waste</th>
          <th className="text-center py-2 pr-4">Models</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-800/60">
        {rows.map((row) => (
          <tr
            key={row.id}
            className="hover:bg-neutral-900/40 cursor-pointer"
            onClick={() => router.push(`/app/reports/clients/${row.id}?from=${fromDate}&to=${toDate}`)}
          >
            <td className="py-2.5 pl-4 text-white font-medium">{row.name}</td>
            <td className="py-2.5 text-right text-neutral-400">{row.totalWorks}</td>
            <td className="py-2.5 text-right text-lime-400 font-medium">{cr(row.usefulCredits)}</td>
            <td className="py-2.5 text-right text-red-400">{cr(row.wastageCredits)}</td>
            <td className="py-2.5 text-right text-blue-400">{cr(row.reworkUsefulCredits)}</td>
            <td className="py-2.5 text-right text-orange-400">{cr(row.reworkWastageCredits)}</td>
            <td className="py-2.5 text-center pr-4">
              <button
                onClick={(e) => { e.stopPropagation(); onViewModels(row) }}
                className="text-[11px] px-2.5 py-1 rounded border border-neutral-700 text-neutral-400 hover:border-lime-700 hover:text-lime-400 transition-colors"
              >
                {row.models.length > 0 ? `${row.models.length} model${row.models.length !== 1 ? 's' : ''}` : 'Models'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── By Model ────────────────────────────────────────────────────────────────

function ModelTable({ rows }: { rows: ModelRow[] }) {
  if (rows.length === 0) {
    return <Empty message="No generation data in this period." />
  }
  const totalUseful = rows.reduce((s, r) => s + r.usefulCredits, 0)
  const totalWastage = rows.reduce((s, r) => s + r.wastageCredits, 0)
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-neutral-950 z-10">
        <tr className="text-xs text-neutral-500 border-b border-neutral-800">
          <th className="text-left py-2 pl-4">Model</th>
          <th className="text-right py-2">Useful Credits</th>
          <th className="text-right py-2 pr-4">Total Wastage</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-800/60">
        {rows.map((row) => (
          <tr key={row.name} className="hover:bg-neutral-900/40">
            <td className="py-2.5 pl-4 text-white font-medium">{row.name}</td>
            <td className="py-2.5 text-right text-lime-400 font-bold">{cr(row.usefulCredits)}</td>
            <td className="py-2.5 text-right pr-4 text-red-400">{cr(row.wastageCredits)}</td>
          </tr>
        ))}
        <tr className="border-t border-neutral-700">
          <td className="py-2 pl-4 text-neutral-400 font-medium">Total</td>
          <td className="py-2 text-right text-white font-bold">{totalUseful.toFixed(2)}</td>
          <td className="py-2 text-right pr-4 text-red-400 font-bold">{totalWastage.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
  )
}

// ─── By Video Type ────────────────────────────────────────────────────────────

function VideoTypeTable({ rows }: { rows: VideoTypeRow[] }) {
  if (rows.length === 0) {
    return <Empty message="No video types in this period." />
  }
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-neutral-950 z-10">
        <tr className="text-xs text-neutral-500 border-b border-neutral-800">
          <th className="text-left py-2 pl-4">Video Type</th>
          <th className="text-right py-2">Works</th>
          <th className="text-right py-2">Useful Credits</th>
          <th className="text-right py-2 pr-4">Wastage Credits</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-800/60">
        {rows.map((row) => (
          <tr key={row.type} className="hover:bg-neutral-900/40">
            <td className="py-2.5 pl-4 text-white font-medium">{row.type}</td>
            <td className="py-2.5 text-right text-neutral-400">{row.totalWorks}</td>
            <td className="py-2.5 text-right text-lime-400 font-medium">{cr(row.usefulCredits)}</td>
            <td className="py-2.5 text-right pr-4 text-red-400">{cr(row.wastageCredits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── By Industry ─────────────────────────────────────────────────────────────

function IndustryTable({ rows }: { rows: IndustryRow[] }) {
  if (rows.length === 0) {
    return <Empty message="No industry data in this period." />
  }
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-neutral-950 z-10">
        <tr className="text-xs text-neutral-500 border-b border-neutral-800">
          <th className="text-left py-2 pl-4">Industry</th>
          <th className="text-right py-2">Clients</th>
          <th className="text-right py-2">Works</th>
          <th className="text-right py-2">Useful Credits</th>
          <th className="text-right py-2 pr-4">Wastage Credits</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-800/60">
        {rows.map((row) => (
          <tr key={row.industry} className="hover:bg-neutral-900/40">
            <td className="py-2.5 pl-4 text-white font-medium">{row.industry}</td>
            <td className="py-2.5 text-right text-neutral-400">{row.totalClients}</td>
            <td className="py-2.5 text-right text-neutral-400">{row.totalWorks}</td>
            <td className="py-2.5 text-right text-lime-400 font-medium">{cr(row.usefulCredits)}</td>
            <td className="py-2.5 text-right pr-4 text-red-400">{cr(row.wastageCredits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── Wastage ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ongoing: 'text-blue-400',
  in_review: 'text-yellow-400',
  rework: 'text-orange-400',
  paused: 'text-neutral-400',
  completed: 'text-green-400',
}

function WastageTable({ rows }: { rows: WastageRow[] }) {
  if (rows.length === 0) {
    return <Empty message="No wastage recorded in this period." />
  }
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-neutral-950 z-10">
        <tr className="text-xs text-neutral-500 border-b border-neutral-800">
          <th className="text-left py-2 pl-4">Work</th>
          <th className="text-left py-2">Client</th>
          <th className="text-left py-2">Status</th>
          <th className="text-right py-2">Useful Cr.</th>
          <th className="text-right py-2">Wastage Cr.</th>
          <th className="text-right py-2">Rework Waste</th>
          <th className="text-right py-2 pr-4">Total Wastage</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-800/60">
        {rows.map((row) => (
          <tr key={row.workId} className="hover:bg-neutral-900/40">
            <td className="py-2.5 pl-4 text-white font-medium">
              {row.workTitle || <span className="text-neutral-500 italic">Untitled</span>}
            </td>
            <td className="py-2.5 text-neutral-400 text-xs">{row.clientName}</td>
            <td className="py-2.5">
              <span className={`text-xs font-medium ${STATUS_COLORS[row.status] ?? 'text-neutral-400'}`}>
                {row.status.replace(/_/g, ' ')}
              </span>
            </td>
            <td className="py-2.5 text-right text-lime-400">{cr(row.usefulCredits)}</td>
            <td className="py-2.5 text-right text-red-400">{cr(row.wastageCredits)}</td>
            <td className="py-2.5 text-right text-orange-400">{cr(row.reworkWastageCredits)}</td>
            <td className="py-2.5 text-right pr-4 text-red-400 font-bold">{row.totalWastage.toFixed(2)}</td>
          </tr>
        ))}
        <tr className="border-t border-neutral-700">
          <td colSpan={6} className="py-2 pl-4 text-neutral-400 font-medium">Total Wastage</td>
          <td className="py-2 text-right pr-4 text-red-400 font-bold">
            {rows.reduce((s, r) => s + r.totalWastage, 0).toFixed(2)}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

function Empty({ message }: { message: string }) {
  return <div className="p-8 text-center text-neutral-500 text-sm">{message}</div>
}

function ModelsPie({ data }: { data: { name: string; credits: number }[] }) {
  const chartConfig: ChartConfig = data.reduce((acc, item, i) => {
    acc[item.name] = { label: item.name, color: PIE_COLORS[i % PIE_COLORS.length] }
    return acc
  }, {} as ChartConfig)

  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent />} />
        <Pie
          data={data}
          dataKey="credits"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={40}
          outerRadius={80}
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent />} />
      </PieChart>
    </ChartContainer>
  )
}
