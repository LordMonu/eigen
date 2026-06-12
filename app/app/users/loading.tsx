// app/app/users/loading.tsx — shimmer for the users page.
import { Skeleton } from '@/components/ui/skeleton'

export default function UsersLoading() {
  return (
    <div className="p-6 space-y-8 text-neutral-100">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 bg-neutral-900" />
        <Skeleton className="h-4 w-72 bg-neutral-900" />
      </div>

      {/* Invite section */}
      <Skeleton className="h-56 bg-neutral-950 border border-neutral-800 rounded-lg" />

      {/* Pending section */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <Skeleton className="h-5 w-40 bg-neutral-900" />
        </div>
        <div className="divide-y divide-neutral-800">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between">
              <Skeleton className="h-4 w-32 bg-neutral-900" />
              <Skeleton className="h-8 w-40 bg-neutral-900 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Active members */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <Skeleton className="h-5 w-32 bg-neutral-900" />
        </div>
        <div className="divide-y divide-neutral-800">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between">
              <Skeleton className="h-4 w-32 bg-neutral-900" />
              <Skeleton className="h-8 w-32 bg-neutral-900 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* HF grants */}
      <Skeleton className="h-48 bg-neutral-950 border border-neutral-800 rounded-lg" />
    </div>
  )
}
