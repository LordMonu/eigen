"use client";

import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";

// Parse a Postgres DATE (YYYY-MM-DD) into a local-time Date, NOT UTC midnight,
// so the highlighted day matches what's stored regardless of the user's timezone.
function parseLocalDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

interface Props {
  startDate: string | null;
  endDate: string | null;
}

export function ScheduleCalendar({ startDate, endDate }: Props) {
  const from = parseLocalDate(startDate);
  const to = parseLocalDate(endDate);

  if (!from && !to) {
    return (
      <div className="p-6 text-center text-neutral-500 text-sm">
        No schedule set for this work.
      </div>
    );
  }

  const range: DateRange = { from, to };
  const sameMonth =
    !!from &&
    !!to &&
    from.getFullYear() === to.getFullYear() &&
    from.getMonth() === to.getMonth();
  const numberOfMonths = sameMonth || !from || !to ? 1 : 2;
  const defaultMonth = from ?? to;

  return (
    <div
      className="flex justify-center p-3 select-none"
      aria-label="Read-only schedule"
    >
      <Calendar
        mode="range"
        selected={range}
        defaultMonth={defaultMonth}
        numberOfMonths={numberOfMonths}
        showOutsideDays={false}
        className="
          pointer-events-none
          [--cell-size:--spacing(11)]
          text-base
          [&_.rdp-weekday]:text-xs
          [&_[data-range-start=true]]:bg-lime-400
          [&_[data-range-start=true]]:text-black
          [&_[data-range-end=true]]:bg-lime-400
          [&_[data-range-end=true]]:text-black
          [&_[data-range-middle=true]]:bg-lime-900/40
          [&_[data-range-middle=true]]:text-lime-200
          [&_[data-selected-single=true]]:bg-lime-400
          [&_[data-selected-single=true]]:text-black
          [&_button]:cursor-default
        "
      />
    </div>
  );
}
