// app/app/works/[id]/loading.tsx — shimmer for work detail.
import { Skeleton } from '@/components/ui/skeleton'

export default function WorkDetailLoading() {
  return (
    <div className="p-6 space-y-6 text-neutral-100">
      <Skeleton className="h-4 w-28 bg-neutral-900" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-72 bg-neutral-900" />
            <Skeleton className="h-6 w-20 bg-neutral-900 rounded" />
          </div>
          <Skeleton className="h-4 w-80 bg-neutral-900" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 bg-neutral-900 rounded" />
          <Skeleton className="h-8 w-20 bg-neutral-900 rounded" />
        </div>
      </div>

      {/* Type + Budget cards */}
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-16 bg-neutral-950 border border-neutral-800 rounded-lg" />
        <Skeleton className="h-16 bg-neutral-950 border border-neutral-800 rounded-lg" />
      </div>

      {/* Schedule calendar */}
      <Skeleton className="h-48 bg-neutral-950 border border-neutral-800 rounded-lg" />

      {/* Assign tables (3-column on lg) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-96 bg-neutral-950 border border-neutral-800 rounded-lg"
          />
        ))}
      </div>
    </div>
  )
}
