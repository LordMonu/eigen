"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function ClientsLoading() {
  return (
    <div className="min-w-0 p-4 sm:p-6 space-y-6 sm:space-y-8 text-neutral-100">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 bg-neutral-900" />
        <Skeleton className="h-4 w-72 bg-neutral-900" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-40 bg-neutral-950 border border-neutral-800 rounded-lg"
          />
        ))}
      </div>
    </div>
  );
}
