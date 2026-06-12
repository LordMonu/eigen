'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Cell, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkGenItem {
  id: string
  modelName: string
  credits: number
  isWaste: boolean
  isRework: boolean
  createdAt: string   // hf_created_at ISO
  assignedAt: string | null
}

export interface WorkRow {
  id: string
  title: string | null
  status: string
  creatorName: string
  videoType: string | null
  startDate: string | null
  endDate: string | null
  maxCredits: number | null
  usefulCredits: number
  wastageCredits: number
  reworkUsefulCredits: number
  reworkWastageCredits: number
  generationCount: number
  models: { name: string; credits: number }[]
  generationsList: WorkGenItem[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ongoing: 'text-blue-400',
  in_review: 'text-yellow-400',
  rework: 'text-orange-400',
  paused: 'text-neutral-400',
  completed: 'text-green-400',
}

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

function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ─── Works table ──────────────────────────────────────────────────────────────

export function WorksView({ rows, clientName }: { rows: WorkRow[]; clientName: string }) {
  const [modal, setModal] = useState<WorkRow | null>(null)

  return (
    <>
      <div className="overflow-auto">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-sm">
            No works found for this client.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-950 z-10">
              <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                <th className="text-left py-2 pl-4">Work</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Creator</th>
                <th className="text-right py-2">Useful Cr.</th>
                <th className="text-right py-2">Wastage Cr.</th>
                <th className="text-right py-2">Rework Useful</th>
                <th className="text-right py-2 pr-4">Rework Waste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-neutral-900/40 cursor-pointer"
                  onClick={() => setModal(row)}
                >
                  <td className="py-2.5 pl-4">
                    <span className="text-white font-medium">
                      {row.title || <span className="text-neutral-500 italic">Untitled</span>}
                    </span>
                    {row.videoType && (
                      <span className="text-neutral-600 text-xs ml-2">{row.videoType}</span>
                    )}
                  </td>
                  <td className="py-2.5">
                    <span className={`text-xs font-medium ${STATUS_COLORS[row.status] ?? 'text-neutral-400'}`}>
                      {row.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2.5 text-neutral-400 text-xs">{row.creatorName}</td>
                  <td className="py-2.5 text-right text-lime-400 font-medium">{cr(row.usefulCredits)}</td>
                  <td className="py-2.5 text-right text-red-400">{cr(row.wastageCredits)}</td>
                  <td className="py-2.5 text-right text-blue-400">{cr(row.reworkUsefulCredits)}</td>
                  <td className="py-2.5 text-right pr-4 text-orange-400">{cr(row.reworkWastageCredits)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-neutral-700">
              <tr>
                <td colSpan={3} className="py-2 pl-4 text-neutral-400 font-medium">Total</td>
                <td className="py-2 text-right text-white font-bold">
                  {rows.reduce((s, r) => s + r.usefulCredits, 0).toFixed(2)}
                </td>
                <td className="py-2 text-right text-red-400 font-bold">
                  {rows.reduce((s, r) => s + r.wastageCredits, 0).toFixed(2)}
                </td>
                <td className="py-2 text-right text-blue-400 font-bold">
                  {rows.reduce((s, r) => s + r.reworkUsefulCredits, 0).toFixed(2)}
                </td>
                <td className="py-2 text-right pr-4 text-orange-400 font-bold">
                  {rows.reduce((s, r) => s + r.reworkWastageCredits, 0).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Work detail modal */}
      <Dialog open={!!modal} onOpenChange={(o) => !o && setModal(null)}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {modal?.title || 'Untitled Work'}
            </DialogTitle>
          </DialogHeader>
          {modal && <WorkDetail row={modal} clientName={clientName} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Work detail modal content ────────────────────────────────────────────────

function WorkDetail({ row, clientName }: { row: WorkRow; clientName: string }) {
  const totalUseful = row.usefulCredits + row.reworkUsefulCredits
  const totalWastage = row.wastageCredits + row.reworkWastageCredits

  return (
    <div className="space-y-5 text-sm">

      {/* ── Info grid ── */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <InfoItem label="Client" value={clientName} />
        <InfoItem label="Status">
          <span className={`font-semibold ${STATUS_COLORS[row.status] ?? 'text-neutral-300'}`}>
            {row.status.replace(/_/g, ' ')}
          </span>
        </InfoItem>
        <InfoItem label="Creator" value={row.creatorName} />
        <InfoItem label="Video Type" value={row.videoType || '—'} />
        <InfoItem
          label="Start Date"
          value={row.startDate ? new Date(row.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
        />
        <InfoItem
          label="End Date"
          value={row.endDate ? new Date(row.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
        />
        {row.maxCredits != null && (
          <InfoItem label="Credit Budget" value={`${row.maxCredits} cr`} />
        )}
        <InfoItem label="Total Generations" value={String(row.generationCount)} />
      </div>

      {/* ── Credits breakdown ── */}
      <div className="border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-neutral-800 bg-neutral-900/30 text-xs text-neutral-500 uppercase tracking-wider font-semibold">
          Credits Breakdown
        </div>
        <div className="divide-y divide-neutral-800/60">
          <CreditRow label="Useful Credits" value={row.usefulCredits} color="text-lime-400" />
          <CreditRow label="Wastage Credits" value={row.wastageCredits} color="text-red-400" />
          <CreditRow label="Rework — Useful" value={row.reworkUsefulCredits} color="text-blue-400" />
          <CreditRow label="Rework — Wastage" value={row.reworkWastageCredits} color="text-orange-400" />
          <div className="grid grid-cols-2 divide-x divide-neutral-800">
            <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/20">
              <span className="text-neutral-300 font-medium">Total Useful</span>
              <span className="text-white font-bold">{totalUseful.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-neutral-900/20">
              <span className="text-neutral-300 font-medium">Total Wastage</span>
              <span className="text-red-400 font-bold">{totalWastage.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Models pie chart ── */}
      {row.models.length > 0 && (
        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-neutral-800 bg-neutral-900/30 text-xs text-neutral-500 uppercase tracking-wider font-semibold">
            Models Used ({row.models.length})
          </div>
          <WorkModelsPie data={row.models} />
          {/* model credit list */}
          <div className="divide-y divide-neutral-800/40 border-t border-neutral-800">
            {row.models.map((m, i) => (
              <div key={m.name} className="flex items-center justify-between px-3 py-1.5 text-xs">
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="text-neutral-300">{m.name}</span>
                </span>
                <span className="text-orange-400 font-medium">{m.credits.toFixed(2)} cr</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Generations timeline ── */}
      {row.generationsList.length > 0 && (
        <div className="border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-neutral-800 bg-neutral-900/30 text-xs text-neutral-500 uppercase tracking-wider font-semibold">
            Generations Timeline ({row.generationsList.length})
          </div>
          <div className="overflow-auto max-h-64">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-neutral-950">
                <tr className="text-[10px] text-neutral-600 border-b border-neutral-800/60">
                  <th className="text-left py-1.5 pl-3">Model</th>
                  <th className="text-right py-1.5">Credits</th>
                  <th className="text-left py-1.5 pl-3">Type</th>
                  <th className="text-right py-1.5 pr-3">Generated At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/40">
                {row.generationsList.map((g) => (
                  <tr key={g.id} className={g.isWaste ? 'opacity-50' : ''}>
                    <td className="py-1.5 pl-3 text-neutral-300">{g.modelName}</td>
                    <td className={`py-1.5 text-right font-medium ${g.isWaste ? 'text-red-400' : 'text-lime-400'}`}>
                      {g.credits > 0 ? g.credits.toFixed(2) : 'free'}
                    </td>
                    <td className="py-1.5 pl-3">
                      {g.isWaste ? (
                        <span className="text-red-500">{g.isRework ? 'rework waste' : 'wastage'}</span>
                      ) : g.isRework ? (
                        <span className="text-orange-400">rework</span>
                      ) : (
                        <span className="text-neutral-500">useful</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-neutral-500 whitespace-nowrap">
                      {fmtDateTime(g.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function InfoItem({
  label,
  value,
  children,
}: {
  label: string
  value?: string
  children?: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[11px] text-neutral-500 uppercase tracking-wide">{label}</div>
      {children ?? <div className="text-neutral-200 mt-0.5 font-medium">{value ?? '—'}</div>}
    </div>
  )
}

function CreditRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-neutral-400">{label}</span>
      <span className={`font-semibold ${color}`}>{value > 0 ? value.toFixed(2) : '—'}</span>
    </div>
  )
}

function WorkModelsPie({ data }: { data: { name: string; credits: number }[] }) {
  const chartConfig: ChartConfig = data.reduce((acc, item, i) => {
    acc[item.name] = { label: item.name, color: PIE_COLORS[i % PIE_COLORS.length] }
    return acc
  }, {} as ChartConfig)

  return (
    <ChartContainer config={chartConfig} className="h-48 w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent />} />
        <Pie data={data} dataKey="credits" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={60} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent />} />
      </PieChart>
    </ChartContainer>
  )
}
