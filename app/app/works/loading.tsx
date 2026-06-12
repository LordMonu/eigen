// app/app/works/loading.tsx — shimmer for the works list.
import { Skeleton } from '@/components/ui/skeleton'

export default function WorksLoading() {
  return (
    <div className="p-6 space-y-6 text-neutral-100">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-32 bg-neutral-900" />
        <Skeleton className="h-4 w-64 bg-neutral-900" />
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 border-b border-neutral-800 pb-px">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 bg-neutral-900 rounded-t" />
        ))}
      </div>

      {/* Toggle */}
      <div className="flex justify-end">
        <Skeleton className="h-9 w-44 bg-neutral-900 rounded-md" />
      </div>

      {/* Work cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-40 bg-neutral-950 border border-neutral-800 rounded-lg"
          />
        ))}
      </div>
    </div>
  )
}
