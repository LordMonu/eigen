// app/app/dashboard/loading.tsx — shimmer while the dashboard data loads.
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6 text-neutral-100">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-56 bg-neutral-900" />
        <Skeleton className="h-4 w-80 bg-neutral-900" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 space-y-2"
          >
            <Skeleton className="h-3 w-24 bg-neutral-900" />
            <Skeleton className="h-8 w-16 bg-neutral-900" />
            <Skeleton className="h-3 w-32 bg-neutral-900" />
          </div>
        ))}
      </div>

      {/* Pipeline + Near deadline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64 bg-neutral-950 border border-neutral-800 rounded-lg" />
        <Skeleton className="h-64 bg-neutral-950 border border-neutral-800 rounded-lg" />
      </div>

      {/* Trend chart */}
      <Skeleton className="h-80 bg-neutral-950 border border-neutral-800 rounded-lg" />
    </div>
  )
}
