// app/app/clients/[id]/loading.tsx — shimmer for client detail.
import { Skeleton } from '@/components/ui/skeleton'

export default function ClientDetailLoading() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 text-neutral-100">
      <Skeleton className="h-4 w-32 bg-neutral-900" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <Skeleton className="h-9 w-64 bg-neutral-900" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 bg-neutral-900 rounded" />
          <Skeleton className="h-8 w-16 bg-neutral-900 rounded" />
        </div>
      </div>
      <Skeleton className="h-4 w-40 bg-neutral-900" />

      {/* Credit summary */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-6">
        <Skeleton className="h-3 w-24 bg-neutral-900 mb-4" />
        <div className="grid grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-8 w-16 bg-neutral-900" />
              <Skeleton className="h-3 w-24 bg-neutral-900" />
            </div>
          ))}
        </div>
      </div>

      {/* Works section */}
      <Skeleton className="h-64 bg-neutral-950 border border-neutral-800 rounded-lg" />

      {/* Generations section */}
      <Skeleton className="h-48 bg-neutral-950 border border-neutral-800 rounded-lg" />
    </div>
  )
}
