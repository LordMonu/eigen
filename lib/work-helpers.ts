// lib/work-helpers.ts — work status constants, transitions, helpers.

export const WORK_STATUSES = [
  "ongoing",
  "in_review",
  "rework",
  "paused",
  "completed",
] as const;

export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  ongoing: "Ongoing",
  in_review: "In Review",
  rework: "Rework",
  paused: "Paused",
  completed: "Completed",
};

export const WORK_STATUS_COLORS: Record<WorkStatus, string> = {
  ongoing: "bg-blue-900/40 text-blue-300 border-blue-700",
  in_review: "bg-purple-900/40 text-purple-300 border-purple-700",
  rework: "bg-orange-900/40 text-orange-300 border-orange-700",
  paused: "bg-neutral-800 text-neutral-400 border-neutral-700",
  completed: "bg-green-900/40 text-green-300 border-green-700",
};

type Transition = {
  to: WorkStatus;
  label: string;
  variant: "primary" | "danger" | "success" | "secondary";
};

/**
 * What status transitions are allowed for the given role from the current status.
 * Source of truth for UI buttons — mirrored server-side in the status API route.
 */
export function allowedTransitions(
  currentStatus: WorkStatus,
  role: "master" | "manager" | "creator",
  isOwnWork: boolean,
): Transition[] {
  const transitions: Transition[] = [];

  // Creator or owning manager on their own work: ongoing/rework → in_review
  if (
    isOwnWork &&
    (role === "creator" || role === "manager") &&
    (currentStatus === "ongoing" || currentStatus === "rework")
  ) {
    transitions.push({
      to: "in_review",
      label: "Send for Review",
      variant: "primary",
    });
  }

  // Master/manager actions
  if (role === "master" || role === "manager") {
    if (currentStatus === "ongoing" || currentStatus === "rework") {
      transitions.push({ to: "paused", label: "Pause", variant: "secondary" });
    }
    if (currentStatus === "paused") {
      transitions.push({ to: "ongoing", label: "Resume", variant: "primary" });
    }
    if (currentStatus === "in_review") {
      transitions.push({
        to: "rework",
        label: "Send to Rework",
        variant: "danger",
      });
      transitions.push({
        to: "completed",
        label: "Mark Completed",
        variant: "success",
      });
    }
  }

  return transitions;
}

/**
 * Format date/time fields into a single readable deadline string.
 */
export function formatDeadline(
  end_date: string | null,
  end_time: string | null,
): string | null {
  if (!end_date) return null;
  const date = new Date(end_date + (end_time ? `T${end_time}` : "T23:59"));
  return (
    date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    (end_time
      ? " · " +
        date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : "")
  );
}

/**
 * Format start and end dates into a readable range string.
 */
export function formatDateRange(
  start_date: string | null,
  end_date: string | null,
): string | null {
  if (!start_date && !end_date) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  if (start_date && end_date) {
    const startYear = start_date.split("-")[0];
    const endYear = end_date.split("-")[0];
    if (startYear === endYear) {
      // Same year: "Jun 7 - 27"
      const start = formatDate(start_date);
      const endDate = new Date(end_date);
      const end = endDate.toLocaleDateString("en-US", { day: "numeric" });
      return `${start} - ${end}`;
    } else {
      // Different years: "Dec 28 - Jan 5, 2025"
      return `${formatDate(start_date)} - ${formatDate(end_date)}`;
    }
  }

  if (start_date) return `from ${formatDate(start_date)}`;
  if (end_date) return `until ${formatDate(end_date)}`;
  return null;
}
