"use client";

import { useState } from "react";
import { Expand, Shrink } from "lucide-react";
import { cn } from "@/lib/utils";

export const MIN_GENERATION_PREVIEW_SIZE = 108;
export const MAX_GENERATION_PREVIEW_SIZE = 180;
export const DEFAULT_GENERATION_PREVIEW_SIZE = 116;

function clampSize(value: number) {
  return Math.min(
    MAX_GENERATION_PREVIEW_SIZE,
    Math.max(MIN_GENERATION_PREVIEW_SIZE, value),
  );
}

export function useGenerationPreviewSize(
  storageKey: string,
  initialValue = DEFAULT_GENERATION_PREVIEW_SIZE,
) {
  const [size, setSize] = useState(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return initialValue;
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return clampSize(parsed);
      }
    } catch {
      // Ignore localStorage failures and fall back to the in-memory default.
    }
    return initialValue;
  });

  function updateSize(next: number) {
    const clamped = clampSize(next);
    setSize(clamped);
    try {
      window.localStorage.setItem(storageKey, String(clamped));
    } catch {
      // Ignore localStorage failures and keep the current session responsive.
    }
  }

  return [size, updateSize] as const;
}

export function getGenerationGridStyle(tileSize: number) {
  return {
    gridTemplateColumns: `repeat(auto-fill, minmax(${clampSize(tileSize)}px, 1fr))`,
  };
}

export function getGenerationTileClassName(tileSize: number) {
  const clamped = clampSize(tileSize);
  return cn(
    "group relative block aspect-square overflow-hidden border bg-neutral-950 transition",
    clamped >= 136 ? "rounded-xl xl:rounded-2xl" : "rounded-lg xl:rounded-xl",
  );
}

export function getGenerationCheckboxClassName(tileSize: number) {
  const clamped = clampSize(tileSize);
  return cn(
    "absolute z-10 flex items-center justify-center rounded-lg border-2 border-white/25 bg-black/35 text-transparent backdrop-blur-sm transition hover:border-white/45",
    clamped >= 136
      ? "left-3 top-3 size-8"
      : clamped >= 108
        ? "left-2.5 top-2.5 size-7"
        : "left-2 top-2 size-6",
  );
}

export function PreviewSizeControl({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2.5 py-1.5",
        className,
      )}
    >
      <Shrink className="size-3.5 text-neutral-500" />
      <input
        type="range"
        min={MIN_GENERATION_PREVIEW_SIZE}
        max={MAX_GENERATION_PREVIEW_SIZE}
        step={4}
        value={clampSize(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-24 cursor-pointer accent-lime-400 sm:w-28"
        aria-label="Preview size"
      />
      <Expand className="size-3.5 text-neutral-500" />
    </label>
  );
}
