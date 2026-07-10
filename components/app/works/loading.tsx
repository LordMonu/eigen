"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function WorksLoading() {
  return (
    <div className="min-w-0 p-4 sm:p-6 space-y-4 sm:space-y-6 text-neutral-100">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32 bg-neutral-900" />
        <Skeleton className="h-4 w-full max-w-sm bg-neutral-900" />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto border-b border-neutral-800 px-4 pb-px sm:mx-0 sm:px-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 shrink-0 bg-neutral-900 rounded-t" />
        ))}
      </div>

      <div className="flex justify-stretch sm:justify-end">
        <Skeleton className="h-9 w-full sm:w-44 bg-neutral-900 rounded-md" />
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
