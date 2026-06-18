// app/app/clients/loading.tsx — shimmer for the clients list page.
import { Skeleton } from '@/components/ui/skeleton'

export default function ClientsLoading() {
  return (
    <div className="min-w-0 p-4 sm:p-6 space-y-4 sm:space-y-6 text-neutral-100">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32 bg-neutral-900" />
          <Skeleton className="h-4 w-full max-w-sm bg-neutral-900" />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Skeleton className="h-9 w-full sm:w-52 bg-neutral-900 rounded-md" />
          <Skeleton className="h-9 w-full sm:w-32 bg-neutral-900 rounded-md" />
        </div>
      </div>

      {/* Status pipeline cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-20 bg-neutral-950 border border-neutral-800 rounded-lg"
          />
        ))}
      </div>

      {/* Client list */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="divide-y divide-neutral-800">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-40 bg-neutral-900" />
                <Skeleton className="h-3 w-28 bg-neutral-900" />
              </div>
              <Skeleton className="h-6 w-20 bg-neutral-900 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
