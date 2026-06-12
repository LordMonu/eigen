// app/app/settings/loading.tsx — shimmer for the settings page.
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <div className="p-6 max-w-3xl space-y-10 text-neutral-100">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-32 bg-neutral-900" />
        <Skeleton className="h-4 w-72 bg-neutral-900" />
      </div>

      {/* HF Connections section */}
      <Skeleton className="h-40 bg-neutral-950 border border-neutral-800 rounded-lg" />

      {/* Video Types section */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32 bg-neutral-900" />
        <Skeleton className="h-32 bg-neutral-950 border border-neutral-800 rounded-lg" />
      </div>

      {/* Industries section */}
      <Skeleton className="h-40 bg-neutral-950 border border-neutral-800 rounded-lg" />

      {/* Org section */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32 bg-neutral-900" />
        <Skeleton className="h-40 bg-neutral-950 border border-neutral-800 rounded-lg" />
      </div>

      {/* Danger zone */}
      <Skeleton className="h-32 bg-red-950/30 border border-red-900 rounded-lg" />
    </div>
  )
}
