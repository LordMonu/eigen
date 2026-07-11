"use client";
import { Fragment, useState, useEffect, useMemo, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Play, Undo2 } from "lucide-react";
import type { WorkStatus } from "@/lib/work-helpers";
import type { Role } from "@/lib/roles";
import { isManagerLikeRole } from "@/lib/roles";
import { runConcurrentBatches } from "@/lib/run-concurrent-batches";
import {
  DEFAULT_GENERATION_PREVIEW_SIZE,
  getGenerationCheckboxClassName,
  getGenerationGridStyle,
  getGenerationTileClassName,
  PreviewSizeControl,
  useGenerationPreviewSize,
} from "@/components/app/generations/preview-size-control";

// Per spec: 60-second window for unassign-undo / mark-useful-undo.
// Kept in sync with the same threshold on the unassign + waste API routes.
const UNDO_WINDOW_MS = 60000;

interface Generation {
  id: string;
  external_id: string;
  display_name: string;
  result_url: string;
  media_type: string;
  credits: string;
  hf_created_at: string;
  work_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  is_waste: boolean;
  is_irrelevant: boolean;
  wasted_at: string | null;
  wasted_by: string | null;
  hf_connection_label: string | null;
}

interface Props {
  workId: string;
  clientName: string;
  assignedToClient: Generation[];
  /** Map of work_id → status. Used to flag the "Rework" tag per row. */
  workStatusMap: Record<string, WorkStatus>;
  userRole: Role;
  userId: string;
  accounts: { id: string; label: string }[];
  readOnly?: boolean;
}

type DayGroup<T> = { label: string; items: T[] };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const startOfDay = (dt: Date) =>
    new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function groupByDay<T extends { hf_created_at: string }>(
  rows: T[],
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const row of rows) {
    const label = dayLabel(row.hf_created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(row);
    else groups.push({ label, items: [row] });
  }
  return groups;
}

function isUnassignAllowed({
  userRole,
  userId,
  assignedAt,
  assignedBy,
}: {
  userRole: string;
  userId: string;
  assignedAt: string | null;
  assignedBy: string | null;
}) {
  const isMasterOrManager =
    userRole === "master" || isManagerLikeRole(userRole);
  if (isMasterOrManager) return true;
  if (assignedBy !== userId || !assignedAt) return false;
  const assignedTime = new Date(assignedAt).getTime();
  return Date.now() - assignedTime < UNDO_WINDOW_MS;
}

export function MediaPreview({
  url,
  mediaType,
  name,
  className,
}: {
  url: string;
  mediaType: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const looksAudio =
    /\b(text\s*to\s*speech|tts|voiceover|seed\s*audio|audio|speech|voice)\b/i.test(
      name,
    );
  const frameClassName = className ?? "w-32 h-22 2xl:w-40 2xl:h-28";

  // Feature charges (voiceover, voice change, etc.) have no media URL.
  if (mediaType === "feature" || !url) {
    return (
      <div
        className={`${frameClassName} flex items-center justify-center overflow-hidden rounded bg-neutral-800 border border-neutral-700 text-[9px] text-neutral-500 uppercase tracking-wide`}
        title={name}
      >
        feat
      </div>
    );
  }
  if (mediaType === "audio" || (failed && looksAudio)) {
    return (
      <div
        className={`${frameClassName} flex items-center justify-center overflow-hidden rounded bg-neutral-900 border border-neutral-700 text-[9px] text-sky-300 uppercase tracking-[0.2em]`}
        title={name}
      >
        audio
      </div>
    );
  }
  if (failed) {
    return (
      <div
        className={`${frameClassName} flex items-center justify-center overflow-hidden rounded bg-neutral-800 text-[10px] text-neutral-600`}
        title={name}
      >
        —
      </div>
    );
  }
  if (mediaType === "video") {
    return (
      <div
        className={`${frameClassName} relative overflow-hidden rounded-[inherit] bg-black`}
      >
        <video
          src={url}
          className="h-full w-full rounded-[inherit] object-cover bg-black"
          preload="none"
          muted
          playsInline
          onError={() => setFailed(true)}
          onMouseEnter={(e) => {
            void (e.currentTarget as HTMLVideoElement).play();
          }}
          onMouseLeave={(e) => {
            const v = e.currentTarget as HTMLVideoElement;
            v.pause();
            v.currentTime = 0;
          }}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-sm">
            <Play className="ml-0.5 size-3.5 fill-current" />
          </span>
        </span>
      </div>
    );
  }
  return (
    <div
      className={`${frameClassName} overflow-hidden rounded-[inherit] bg-neutral-800`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        className="h-full w-full rounded-[inherit] object-cover bg-neutral-800"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function ReworkTag() {
  return (
    <Badge
      variant="outline"
      className="text-orange-300 border-orange-700 bg-orange-950/40 text-[10px]"
    >
      Rework
    </Badge>
  );
}

function hfAssetUrl(externalId: string) {
  return `https://higgsfield.ai/asset/all/${externalId}`;
}

function PreviewTile({
  generation,
  checked,
  selectable,
  onToggle,
  tileSize,
}: {
  generation: Generation;
  checked: boolean;
  selectable: boolean;
  onToggle: (id: string) => void;
  tileSize: number;
}) {
  return (
    <a
      href={hfAssetUrl(generation.external_id)}
      target="_blank"
      rel="noreferrer"
      title="Open in Higgsfield"
      className={`${getGenerationTileClassName(tileSize)} ${
        checked
          ? "border-lime-400 shadow-[0_0_0_1px_rgba(163,230,53,0.45)]"
          : "border-neutral-800 hover:border-neutral-600"
      } ${selectable ? "" : "opacity-70"}`}
      style={{ contain: "layout paint style" }}
    >
      {selectable && (
        <button
          type="button"
          aria-pressed={checked}
          aria-label={
            checked
              ? `Deselect ${generation.display_name}`
              : `Select ${generation.display_name}`
          }
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggle(generation.id);
          }}
          className={`${getGenerationCheckboxClassName(tileSize)} ${
            checked ? "border-lime-400 bg-lime-400 text-black" : ""
          }`}
        >
          <Check className="size-3.5" />
        </button>
      )}
      <MediaPreview
        url={generation.result_url}
        mediaType={generation.media_type}
        name={generation.display_name}
        className="h-full w-full object-cover"
      />
    </a>
  );
}

function PreviewGridSection({
  title,
  total,
  groups,
  selectedIds,
  onToggle,
  onToggleDay,
  selectableKey,
  sectionClassName = "px-4 py-3",
  gridClassName = "grid gap-1.5",
  tileSize = DEFAULT_GENERATION_PREVIEW_SIZE,
}: {
  title: string;
  total: number;
  groups: DayGroup<Generation>[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleDay: (items: Array<{ id: string }>) => void;
  selectableKey: (generation: Generation) => boolean;
  sectionClassName?: string;
  gridClassName?: string;
  tileSize?: number;
}) {
  const gridStyle = getGenerationGridStyle(tileSize);
  return (
    <section className={sectionClassName}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <Badge
            variant="outline"
            className="text-neutral-400 border-neutral-700"
          >
            {total}
          </Badge>
        </div>
      </div>
      <div className="divide-y divide-neutral-800">
        {groups.map((group) => {
          const selectableItems = group.items.filter(selectableKey);
          const daySelected =
            selectableItems.length > 0 &&
            selectableItems.every((generation) => selectedIds.has(generation.id));

          return (
            <div key={group.label} className="py-3 first:pt-0">
              <button
                type="button"
                onClick={() => onToggleDay(selectableItems)}
                className="mb-4 flex items-center gap-2 text-sm font-semibold text-white transition hover:text-lime-300"
                disabled={selectableItems.length === 0}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded border-2 transition ${
                    daySelected
                      ? "border-lime-400 bg-lime-400 text-black"
                      : "border-neutral-600 bg-transparent text-transparent"
                  }`}
                >
                  <Check className="size-3" />
                </span>
                <span>{group.label}</span>
              </button>
              <div className={gridClassName} style={gridStyle}>
                {group.items.map((generation) => {
                  const selectable = selectableKey(generation);
                  const checked = selectedIds.has(generation.id);
                  return (
                    <PreviewTile
                      key={generation.id}
                      generation={generation}
                      checked={checked}
                      selectable={selectable}
                      onToggle={onToggle}
                      tileSize={tileSize}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function UnassignButton({
  generationId,
  assignedAt,
  assignedBy,
  userRole,
  userId,
  onDone,
  onError,
}: {
  generationId: string;
  assignedAt: string | null;
  assignedBy: string | null;
  userRole: string;
  userId: string;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const isMasterOrManager =
    userRole === "master" || isManagerLikeRole(userRole);
  const isAssigner = assignedBy === userId;

  useEffect(() => {
    if (isMasterOrManager) return;
    if (!isAssigner || !assignedAt) return;

    const assignedTime = new Date(assignedAt).getTime();
    function check() {
      const remaining = UNDO_WINDOW_MS - (Date.now() - assignedTime);
      if (remaining <= 0) {
        setTimeLeft(0);
      } else {
        setTimeLeft(Math.ceil(remaining / 1000));
      }
    }
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [isMasterOrManager, isAssigner, assignedAt]);

  if (!isMasterOrManager) {
    if (!isAssigner || timeLeft === 0 || timeLeft === null) return null;
  }

  async function handleUnassign() {
    setBusy(true);
    try {
      const res = await fetch(`/api/generations/${generationId}/unassign`, {
        method: "POST",
      });
      if (res.ok) {
        // Wrap the parent's refresh in a transition so the button stays
        // disabled until the new server data has rendered (no enabled flicker).
        startTransition(() => {
          onDone();
        });
      } else {
        const data = await res.json().catch(() => ({}));
        onError(`Unassign failed: ${data.error || "unknown error"}`);
      }
    } catch (err) {
      onError(
        `Unassign failed: ${err instanceof Error ? err.message : "network error"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleUnassign}
      disabled={busy || isPending}
      className="h-6 text-xs px-2 text-red-400 border-red-900 hover:bg-red-950"
    >
      {busy || isPending
        ? "…"
        : isMasterOrManager
          ? "Unassign"
          : `Undo (${timeLeft}s)`}
    </Button>
  );
}

// Renders the per-row action button in the Wastage table. Clicking it pulls
// the generation fully back to the unassigned pool (clears client/work/waste
// fields). The label is "Unassign" — replacing the older "Mark Useful" which
// only flipped is_waste back to false and left the row in the Assigned table.
export function WastageButton({
  generationId,
  wastedAt,
  wastedBy,
  userRole,
  userId,
  onDone,
  onError,
}: {
  generationId: string;
  wastedAt: string | null;
  wastedBy: string | null;
  userRole: string;
  userId: string;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const isMasterOrManager =
    userRole === "master" || isManagerLikeRole(userRole);
  const isWaster = wastedBy === userId;
  const isWasted = wastedAt !== null;

  useEffect(() => {
    if (!isWasted || !wastedAt) return;
    if (isMasterOrManager) return;
    if (!isWaster) return;

    const wastedTime = new Date(wastedAt).getTime();
    function check() {
      const remaining = UNDO_WINDOW_MS - (Date.now() - wastedTime);
      if (remaining <= 0) {
        setTimeLeft(0);
      } else {
        setTimeLeft(Math.ceil(remaining / 1000));
      }
    }
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [isWasted, wastedAt, isMasterOrManager, isWaster]);

  async function handleUnassign() {
    setBusy(true);
    try {
      const res = await fetch(`/api/generations/${generationId}/unassign`, {
        method: "POST",
      });
      if (res.ok) {
        startTransition(() => {
          onDone();
        });
      } else {
        const data = await res.json().catch(() => ({}));
        onError(`Unassign failed: ${data.error || "unknown error"}`);
      }
    } catch (err) {
      onError(
        `Unassign failed: ${err instanceof Error ? err.message : "network error"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!isWasted) return null;

  // Visibility: master/manager anytime; waster only within the 60s window.
  const isWithinWindow = isWaster && timeLeft !== null && timeLeft > 0;
  if (!isMasterOrManager && !isWithinWindow) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleUnassign}
      disabled={busy || isPending}
      className="h-6 text-xs px-2 text-lime-400 border-lime-700 hover:bg-lime-950"
    >
      {busy || isPending ? (
        "…"
      ) : (
        <>
          <Undo2 className="size-3 mr-1" />
          {isMasterOrManager && !isWithinWindow
            ? "Unassign"
            : `Unassign (${timeLeft}s)`}
        </>
      )}
    </Button>
  );
}

export function AssignTables({
  workId,
  clientName,
  assignedToClient,
  workStatusMap,
  userRole,
  userId,
  accounts,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selectedAccountLabel, setSelectedAccountLabel] = useState<string>(
    accounts[0]?.label || "",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [previewSize, setPreviewSize] = useGenerationPreviewSize(
    "work-assign-preview-size",
  );

  const allAssigned = assignedToClient.filter(
    (g) => !g.is_waste && !g.is_irrelevant && g.media_type !== "feature",
  );
  const allWasted = assignedToClient.filter(
    (g) => g.is_waste && !g.is_irrelevant && g.media_type !== "feature",
  );
  const allIrrelevant = assignedToClient.filter(
    (g) => g.is_irrelevant && g.media_type !== "feature",
  );

  const assignedUseful = selectedAccountLabel
    ? allAssigned.filter((g) => g.hf_connection_label === selectedAccountLabel)
    : allAssigned;
  const wasted = selectedAccountLabel
    ? allWasted.filter((g) => g.hf_connection_label === selectedAccountLabel)
    : allWasted;

  const assignedToThisWork = assignedUseful.filter((g) => g.work_id === workId);
  const assignedElsewhere = assignedUseful.filter((g) => g.work_id !== workId);

  const groupedAssigned = groupByDay(assignedUseful);
  const groupedWasted = groupByDay(wasted);
  const groupedIrrelevant = groupByDay(allIrrelevant);
  const generationIndex = useMemo(() => {
    return new Map<string, Generation>([
      ...assignedUseful.map((g) => [g.id, g] as const),
      ...wasted.map((g) => [g.id, g] as const),
      ...allIrrelevant.map((g) => [g.id, g] as const),
    ]);
  }, [assignedUseful, wasted, allIrrelevant]);

  // Total credits per bucket
  const totalAssignedCredits = assignedUseful.reduce(
    (s, g) => s + parseFloat(g.credits || "0"),
    0,
  );
  const totalWastedCredits = wasted.reduce(
    (s, g) => s + parseFloat(g.credits || "0"),
    0,
  );

  // The Rework tag is a CROSS-WORK signal: it flags a row whose source
  // work is in 'rework' status AND is DIFFERENT from the work we're viewing.
  // The current work's own status already lives in the header status badge,
  // so re-stamping every row would be redundant noise.
  function renderReworkTag(genWorkId: string | null) {
    if (!genWorkId) return null;
    if (genWorkId === workId) return null;
    const status = workStatusMap[genWorkId];
    if (status !== "rework") return null;
    return (
      <span className="ml-1 inline-flex align-middle">
        <ReworkTag />
      </span>
    );
  }

  const canSelectGeneration = useCallback(
    (generation: Generation) =>
      isUnassignAllowed({
        userRole,
        userId,
        assignedAt: generation.assigned_at ?? generation.wasted_at,
        assignedBy: generation.assigned_by ?? generation.wasted_by,
      }),
    [userId, userRole],
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectionGroup = useCallback((items: Array<{ id: string }>) => {
    const allowed = items.filter((item) => generationIndex.has(item.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = allowed.every((item) => next.has(item.id));
      allowed.forEach((item) => {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      });
      return next;
    });
  }, [generationIndex]);

  const selectedGenerations = useMemo(
    () =>
      Array.from(selectedIds)
        .map((id) => generationIndex.get(id))
        .filter((generation): generation is Generation => !!generation),
    [generationIndex, selectedIds],
  );

  const handleBulkUnassign = useCallback(async () => {
    if (selectedGenerations.length === 0) return;
    setBulkBusy(true);
    try {
      const failures: string[] = [];
      await runConcurrentBatches(
        selectedGenerations,
        async (generation) => {
          const res = await fetch(`/api/generations/${generation.id}/unassign`, {
            method: "POST",
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            failures.push(
              `${generation.display_name}: ${data.error || res.statusText}`,
            );
          }
        },
        8,
      );
      if (failures.length > 0) {
        setError(
          `${failures.length} of ${selectedGenerations.length} failed: ${failures.slice(0, 2).join("; ")}`,
        );
      }
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unassign failed");
    } finally {
      setBulkBusy(false);
    }
  }, [router, selectedGenerations]);

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-neutral-400 hover:text-white text-xs ml-4"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {accounts.length > 1 ? (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider mr-1">
              Account:
            </span>
            {accounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => {
                  setSelectedAccountLabel(acc.label);
                }}
                className={`text-xs px-2 py-0.5 rounded transition-colors ${
                  selectedAccountLabel === acc.label
                    ? "bg-lime-400 text-black"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                }`}
              >
                {acc.label}
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        <PreviewSizeControl value={previewSize} onChange={setPreviewSize} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ASSIGNED TO THIS CLIENT */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm">
                Assigned to {clientName}
              </h2>
              <span className="text-sm font-bold text-lime-400 font-mono">
                {totalAssignedCredits.toFixed(1)} cr
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              {assignedToThisWork.length} on this work ·{" "}
              {assignedElsewhere.length} on other works
            </p>
          </div>
          {assignedUseful.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>Nothing assigned to {clientName} yet.</p>
            </div>
          ) : (
            <PreviewGridSection
              title={`Assigned to ${clientName}`}
              total={assignedUseful.length}
              groups={groupedAssigned}
              selectedIds={selectedIds}
              onToggle={toggleSelection}
              onToggleDay={toggleSelectionGroup}
              selectableKey={canSelectGeneration}
              sectionClassName="px-4 py-3"
              gridClassName="grid gap-1.5"
              tileSize={previewSize}
            />
          )}
        </div>

        {/* WASTAGE */}
        <div className="bg-neutral-950 border border-red-900/50 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                Wastage
                {wasted.length > 0 && (
                  <Badge
                    variant="outline"
                    className="text-red-400 border-red-700"
                  >
                    {wasted.length}
                  </Badge>
                )}
              </h2>
              <span className="text-sm font-bold text-red-400 font-mono">
                {totalWastedCredits.toFixed(1)} cr
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Marked as not useful
            </p>
          </div>
          {wasted.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>No wastage yet.</p>
            </div>
          ) : (
            <PreviewGridSection
              title="Wastage"
              total={wasted.length}
              groups={groupedWasted}
              selectedIds={selectedIds}
              onToggle={toggleSelection}
              onToggleDay={toggleSelectionGroup}
              selectableKey={canSelectGeneration}
              sectionClassName="px-4 py-3"
              gridClassName="grid gap-1.5"
              tileSize={previewSize}
            />
          )}
        </div>
      </div>

      {/* R&D */}
      {allIrrelevant.length > 0 && (
        <div className="bg-neutral-950 border border-neutral-700/30 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-neutral-500 text-sm flex items-center gap-2">
              R&amp;D
              <Badge
                variant="outline"
                className="text-neutral-600 border-neutral-700"
              >
                {allIrrelevant.length}
              </Badge>
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              R&amp;D / practice / past work for this workstream — not counted
              in credits
            </p>
          </div>
          <div className="overflow-auto max-h-44">
            <PreviewGridSection
              title="R&D"
              total={allIrrelevant.length}
              groups={groupedIrrelevant}
              selectedIds={selectedIds}
              onToggle={toggleSelection}
              onToggleDay={toggleSelectionGroup}
              selectableKey={canSelectGeneration}
              sectionClassName="px-4 py-3"
              gridClassName="grid gap-1.5"
              tileSize={previewSize}
            />
          </div>
        </div>
      )}

      {selectedGenerations.length > 0 && !readOnly && (
        <div className="fixed inset-x-0 bottom-5 z-[80] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/95 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.5)] backdrop-blur-lg">
            <div className="text-sm text-white">
              {selectedGenerations.length} selected
            </div>
            <Button
              onClick={handleBulkUnassign}
              disabled={bulkBusy}
              className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
            >
              {bulkBusy ? "Unassigning…" : "Unassign"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
