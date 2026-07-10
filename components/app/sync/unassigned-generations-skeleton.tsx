"use client";

import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  rows?: number;
  cardsPerRow?: number;
};

export function UnassignedGenerationsSkeleton({
  rows = 6,
  cardsPerRow = 2,
}: Props) {
  return (
    <div className="space-y-5 px-4 py-4">
      {Array.from({ length: rows }).map((_, i) => {
        const count = i === 0 ? cardsPerRow * 2 : cardsPerRow * 4;
        return (
          <section key={i} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded border border-neutral-700 bg-neutral-900" />
              <Skeleton className="h-4 w-24 bg-neutral-800" />
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: count }).map((__, j) => (
                <Skeleton
                  key={j}
                  className="size-28 sm:size-32 rounded-xl bg-neutral-900 border border-neutral-800"
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
