// app/app/loading.tsx — Suspense fallback for all /app/* routes.
// Next.js can prefetch this skeleton, so sidebar nav swaps content instantly
// while the real server-rendered page streams in. Without it, dynamic routes
// have to wait for the full server response before showing anything.
import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="p-6 space-y-6 text-neutral-100">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48 bg-neutral-900" />
        <Skeleton className="h-4 w-72 bg-neutral-900" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 bg-neutral-950 border border-neutral-800 rounded-lg" />
        ))}
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-32 bg-neutral-900" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 bg-neutral-950 border border-neutral-800 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}
