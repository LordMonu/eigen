"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function SyncPageLoading() {
  return (
    <div className="p-6 space-y-6 text-neutral-100">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 bg-neutral-900" />
          <Skeleton className="h-4 w-72 bg-neutral-900" />
        </div>
        <Skeleton className="h-10 w-48 bg-neutral-900 rounded-md" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-24 bg-neutral-950 border border-neutral-800 rounded-lg"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-96 bg-neutral-950 border border-neutral-800 rounded-lg" />
        <Skeleton className="h-96 bg-neutral-950 border border-neutral-800 rounded-lg" />
      </div>
    </div>
  );
}
