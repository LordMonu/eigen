"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function ReportsLoading() {
  return (
    <div className="min-w-0 p-4 sm:p-6 space-y-4 sm:space-y-6 text-neutral-100">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32 bg-neutral-900" />
        <Skeleton className="h-4 w-72 bg-neutral-900" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-9 w-32 bg-neutral-900 rounded-md" />
        <Skeleton className="h-9 w-32 bg-neutral-900 rounded-md" />
        <Skeleton className="h-9 w-32 bg-neutral-900 rounded-md" />
      </div>

      <Skeleton className="h-80 bg-neutral-950 border border-neutral-800 rounded-lg" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64 bg-neutral-950 border border-neutral-800 rounded-lg" />
        <Skeleton className="h-64 bg-neutral-950 border border-neutral-800 rounded-lg" />
      </div>

      <Skeleton className="h-72 bg-neutral-950 border border-neutral-800 rounded-lg" />
    </div>
  );
}
