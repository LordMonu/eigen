"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Check, X, RefreshCw } from "lucide-react";
import {
  fetchSyncStats,
  fetchSyncTabPage,
} from "@/lib/sync-generation-queries";
import {
  isCooldownActive,
  markSynced,
  getCooldownRemaining,
} from "@/lib/sync-cooldown";
import type { Role } from "@/lib/roles";

interface UnassignedGeneration {
  id: string;
  external_id: string;
  display_name: string;
  result_url: string;
  media_type: string;
  credits: string;
  hf_created_at: string;
  hf_connection_label: string | null;
}

export interface CreatorStat {
  userId: string;
  name: string;
  actual: number;
  wastage: number;
  rework: number;
}

interface Account {
  id: string;
  label: string;
}

const PICKER_BATCH_SIZE = 80;

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

function hfAssetUrl(externalId: string) {
  return `https://higgsfield.ai/asset/all/${externalId}`;
}

interface Props {
  workId: string;
  workTitle: string;
  clientId: string;
  clientName: string;
  userRole: Role;
  creatorStats: CreatorStat[];
  accounts: Account[];
  readOnly?: boolean;
}

function MediaPreview({
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
  const sizeClass = className ?? "w-32 h-22 2xl:w-40 2xl:h-28";
  const [failed, setFailed] = useState(false);
  const looksAudio =
    /\b(text\s*to\s*speech|tts|voiceover|seed\s*audio|audio|speech|voice)\b/i.test(
      name,
    );

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center rounded bg-neutral-800 text-[10px] text-neutral-600 ${sizeClass}`}
      >
        —
      </div>
    );
  }
  if (mediaType === "audio") {
    return (
      <div
        className={`flex items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-[10px] uppercase tracking-[0.2em] text-sky-300 ${sizeClass}`}
      >
        audio
      </div>
    );
  }
  if (failed && looksAudio) {
    return (
      <div
        className={`flex items-center justify-center rounded border border-neutral-700 bg-neutral-900 text-[10px] uppercase tracking-[0.2em] text-sky-300 ${sizeClass}`}
      >
        audio
      </div>
    );
  }
  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded bg-neutral-800 text-[10px] text-neutral-600 ${sizeClass}`}
      >
        —
      </div>
    );
  }
  if (mediaType === "video") {
    return (
      <div className={`${sizeClass} overflow-hidden rounded bg-black`}>
        <video
          src={url}
          className="h-full w-full object-cover"
          preload="metadata"
          muted
          onError={() => setFailed(true)}
          onMouseEnter={(e) => {
            void (e.currentTarget as HTMLVideoElement).play();
          }}
          onMouseLeave={(e) => {
            const video = e.currentTarget as HTMLVideoElement;
            video.pause();
            video.currentTime = 0;
          }}
        />
      </div>
    );
  }
  return (
    <div className={`${sizeClass} overflow-hidden rounded bg-neutral-800`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function SyncAndAssign({
  workId,
  workTitle,
  clientId,
  clientName,
  userRole,
  creatorStats,
  accounts,
  readOnly = false,
}: Props) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [isPending, startTransition] = useTransition();

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [unassigned, setUnassigned] = useState<UnassignedGeneration[]>([]);
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [unassignedCredits, setUnassignedCredits] = useState(0);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [loadingMoreUnassigned, setLoadingMoreUnassigned] = useState(false);
  const [hasMoreUnassigned, setHasMoreUnassigned] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.id || "",
  );
  const [pickerPage, setPickerPage] = useState(1);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const [destOpen, setDestOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState<
    null | "actual" | "waste" | "irrelevant"
  >(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Destination selector state (Modal B)
  const [destClientId, setDestClientId] = useState<string>(clientId);
  const [destWorkId, setDestWorkId] = useState<string>(workId);
  const [selClients, setSelClients] = useState<{ id: string; name: string }[]>([
    { id: clientId, name: clientName },
  ]);
  const [selWorks, setSelWorks] = useState<
    { id: string; title: string | null }[]
  >([{ id: workId, title: workTitle }]);
  const [loadingSel, setLoadingSel] = useState(false);

  const [markingIrrelevant, setMarkingIrrelevant] = useState<string | null>(
    null,
  );

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const visibleUnassigned = unassigned.filter(
    (g) => g.media_type !== "feature",
  );
  const groupedUnassigned = groupByDay(visibleUnassigned);

  useEffect(() => {
    if (!selectedAccountId) return;
    const update = () =>
      setCooldownLeft(getCooldownRemaining(selectedAccountId));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [selectedAccountId]);

  const loadPickerPage = useCallback(
    async (
      page: number,
      options: { append?: boolean; silent?: boolean } = {},
    ) => {
      const append = options.append === true;
      if (!options.silent) {
        if (append) setLoadingMoreUnassigned(true);
        else setLoadingUnassigned(true);
      }
      const { data, count } = await fetchSyncTabPage<UnassignedGeneration>(
        supabase,
        "unassigned",
        page,
        selectedAccount?.label ?? null,
        {
          count: "exact",
          excludeFeatures: true,
          pageSize: PICKER_BATCH_SIZE,
        },
      );
      const nextTotal = count ?? unassignedTotal;
      setUnassigned((prev) => {
        if (!append) return data;
        const seen = new Set(prev.map((g) => g.id));
        return [...prev, ...data.filter((g) => !seen.has(g.id))];
      });
      if (count != null) setUnassignedTotal(count);
      setHasMoreUnassigned(page * PICKER_BATCH_SIZE < nextTotal);
      if (!options.silent) {
        if (append) setLoadingMoreUnassigned(false);
        else setLoadingUnassigned(false);
      }
    },
    [supabase, selectedAccount?.label, unassignedTotal],
  );

  const loadPickerStats = useCallback(async () => {
    const stats = await fetchSyncStats(
      supabase,
      selectedAccount?.label ?? null,
    );
    if (stats) {
      setUnassignedCredits(stats.unassigned_credits);
    }
  }, [supabase, selectedAccount?.label]);

  function loadMorePicker() {
    const nextPage = pickerPage + 1;
    setPickerPage(nextPage);
    void loadPickerPage(nextPage, { append: true });
  }

  useEffect(() => {
    if (pickerOpen && selectedAccountId) {
      setPickerPage(1);
      void Promise.all([loadPickerStats(), loadPickerPage(1)]);
    }
  }, [selectedAccountId, pickerOpen, loadPickerStats, loadPickerPage]);

  // Load all clients when Modal B opens
  useEffect(() => {
    if (!destOpen) return;
    setDestClientId(clientId);
    setDestWorkId(workId);
    setLoadingSel(true);
    supabase
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name")
      .then(({ data }) => {
        setSelClients(
          data && data.length > 0 ? data : [{ id: clientId, name: clientName }],
        );
        setLoadingSel(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destOpen]);

  // Reload works when destClientId changes
  useEffect(() => {
    if (!destOpen) return;
    supabase
      .from("works")
      .select("id, title")
      .eq("client_id", destClientId)
      .is("deleted_at", null)
      .order("title")
      .then(({ data }) => {
        const works = data && data.length > 0 ? data : [];
        setSelWorks(works);
        setDestWorkId((prev) =>
          works.find((w) => w.id === prev) ? prev : (works[0]?.id ?? workId),
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destClientId, destOpen]);

  async function markAsIrrelevant(genId: string) {
    setMarkingIrrelevant(genId);
    try {
      const res = await fetch(`/api/generations/${genId}/irrelevant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_irrelevant: true }),
      });
      if (res.ok) {
        setPickerPage(1);
        void Promise.all([
          loadPickerStats(),
          loadPickerPage(1, { silent: true }),
        ]);
      }
    } catch (e) {
      console.error("Mark irrelevant failed:", e);
    } finally {
      setMarkingIrrelevant(null);
    }
  }

  async function syncAccount(force = false, full = false) {
    if (!selectedAccountId) return;
    if (!force && isCooldownActive(selectedAccountId)) return;

    setSyncing(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/hf-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: selectedAccountId, full }),
      });
      if (res.status === 409) {
        setSyncError(
          userRole === "master"
            ? "No Higgsfield account connected. Go to Settings to add one."
            : "You don't have access to any Higgsfield account yet. Ask your admin to grant you access.",
        );
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncError(`Sync failed: ${data?.error || "unknown error"}`);
        return;
      }
      markSynced(selectedAccountId);
      setSyncMessage(data?.message || "Sync complete.");
      setSelectedIds(new Set());
      setRangeAnchorId(null);
      setPickerPage(1);
      await loadPickerStats();
      await loadPickerPage(1, { silent: true });
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setSyncError(
        `Sync failed: ${err instanceof Error ? err.message : "network error"}`,
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleSync() {
    setSyncError(null);
    setSyncMessage(null);
    setSelectedIds(new Set());
    setRangeAnchorId(null);
    setPickerPage(1);
    setPickerOpen(true);

    await Promise.all([loadPickerStats(), loadPickerPage(1)]);

    if (!isCooldownActive(selectedAccountId)) {
      await syncAccount();
    }
  }

  function toggleSelect(genId: string) {
    const orderedIds = visibleUnassigned.map((g) => g.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const currentIndex = orderedIds.indexOf(genId);
      const anchorIndex = rangeAnchorId
        ? orderedIds.indexOf(rangeAnchorId)
        : -1;

      if (
        anchorIndex !== -1 &&
        currentIndex !== -1 &&
        genId !== rangeAnchorId &&
        !prev.has(genId)
      ) {
        const [start, end] =
          anchorIndex < currentIndex
            ? [anchorIndex, currentIndex]
            : [currentIndex, anchorIndex];
        for (let i = start; i <= end; i++) next.add(orderedIds[i]);
      } else if (next.has(genId)) {
        next.delete(genId);
      } else {
        next.add(genId);
      }
      return next;
    });
    setRangeAnchorId(genId);
  }

  function toggleSelectDay(items: UnassignedGeneration[]) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = items.every((g) => next.has(g.id));
      items.forEach((g) => {
        if (allSelected) next.delete(g.id);
        else next.add(g.id);
      });
      return next;
    });
  }

  const allVisibleSelected =
    unassigned.length > 0 && unassigned.every((g) => selectedIds.has(g.id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        unassigned.forEach((g) => next.delete(g.id));
      } else {
        unassigned.forEach((g) => next.add(g.id));
      }
      return next;
    });
  }

  function openDestination() {
    if (selectedIds.size === 0) return;
    setBatchError(null);
    setDestOpen(true);
  }

  async function runBatch(mode: "actual" | "waste" | "irrelevant") {
    if (selectedIds.size === 0) return;
    setBatchBusy(mode);
    setBatchError(null);
    const ids = Array.from(selectedIds);
    const targetWorkId = destWorkId || workId;
    const targetClientId = destClientId || clientId;

    const failures: string[] = [];
    const assignedIds: string[] = [];
    await Promise.all(
      ids.map(async (gid) => {
        const res = await fetch(
          `/api/works/${targetWorkId}/assign-generation`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              generationId: gid,
              clientId: targetClientId,
            }),
          },
        );
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          failures.push(`${gid.slice(0, 8)}: ${d?.error || res.statusText}`);
          return;
        }
        assignedIds.push(gid);
      }),
    );

    if (mode === "waste" && assignedIds.length > 0) {
      await Promise.all(
        assignedIds.map(async (gid) => {
          const res = await fetch(`/api/generations/${gid}/waste`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_waste: true }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            failures.push(
              `${gid.slice(0, 8)} (waste): ${d?.error || res.statusText}`,
            );
          }
        }),
      );
    }

    if (mode === "irrelevant" && assignedIds.length > 0) {
      await Promise.all(
        assignedIds.map(async (gid) => {
          const res = await fetch(`/api/generations/${gid}/irrelevant`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_irrelevant: true }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            failures.push(
              `${gid.slice(0, 8)} (irrelevant): ${d?.error || res.statusText}`,
            );
          }
        }),
      );
    }

    setBatchBusy(null);

    if (failures.length > 0 && assignedIds.length === 0) {
      setBatchError(
        `All ${failures.length} failed: ${failures.slice(0, 3).join("; ")}`,
      );
      return;
    }

    if (failures.length > 0) {
      setBatchError(
        `${failures.length} of ${ids.length} failed: ${failures.slice(0, 3).join("; ")}`,
      );
      setPickerPage(1);
      await Promise.all([
        loadPickerStats(),
        loadPickerPage(1, { silent: true }),
      ]);
      setSelectedIds(new Set());
      return;
    }

    setDestOpen(false);
    setPickerOpen(false);
    setSelectedIds(new Set());
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <>
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white text-sm">
            Sync &amp; Assign
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pull fresh generations from Higgsfield, then pick which ones to
            attribute to a client.
          </p>
        </div>

        {/* SYNC BUTTON */}
        <div className="flex flex-col items-center px-6 py-5 gap-3 border-b border-neutral-800">
          <Button
            onClick={handleSync}
            disabled={readOnly || syncing || isPending}
            size="lg"
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold min-w-[14rem] disabled:opacity-40"
          >
            {syncing || isPending ? (
              <>
                <RefreshCw className="size-4 mr-2 animate-spin" />
                {syncing ? "Syncing…" : "Updating…"}
              </>
            ) : (
              <>
                <RefreshCw className="size-4 mr-2" />
                Sync &amp; Assign
              </>
            )}
          </Button>
          {syncMessage && !syncError && (
            <p className="text-xs text-lime-400 text-center max-w-md">
              ✓ {syncMessage}
            </p>
          )}
          {syncError && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-xs flex items-center justify-between gap-2 max-w-md w-full">
              <span>{syncError}</span>
              {syncError.includes("Settings") && (
                <a
                  href="/app/settings"
                  className="text-lime-400 hover:underline shrink-0"
                >
                  Open Settings →
                </a>
              )}
            </div>
          )}
        </div>

        {/* PER-CREATOR STATS */}
        <div className="flex-1 overflow-auto">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Credit breakdown by user
            </h3>
            <span className="text-[10px] text-neutral-500">
              On {clientName}
            </span>
          </div>
          {creatorStats.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-xs">
              No credits attributed by anyone yet.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              <div className="px-4 py-1.5 grid grid-cols-[1fr_repeat(3,minmax(0,4rem))] gap-2 text-[10px] uppercase tracking-wider text-neutral-500">
                <div>User</div>
                <div className="text-right text-lime-400">Actual</div>
                <div className="text-right text-yellow-400">Wastage</div>
                <div className="text-right text-orange-400">Rework</div>
              </div>
              {creatorStats.map((s) => (
                <div
                  key={s.userId}
                  className="px-4 py-2 grid grid-cols-[1fr_repeat(3,minmax(0,4rem))] gap-2 items-center text-xs"
                >
                  <div className="min-w-0 truncate font-medium text-white">
                    {s.name}
                  </div>
                  <div className="text-right font-mono text-lime-300">
                    {s.actual > 0 ? s.actual.toFixed(1) : "—"}
                  </div>
                  <div className="text-right font-mono text-yellow-300">
                    {s.wastage > 0 ? s.wastage.toFixed(1) : "—"}
                  </div>
                  <div className="text-right font-mono text-orange-300">
                    {s.rework > 0 ? s.rework.toFixed(1) : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* MODAL A — picker */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !batchBusy && !isPending && setPickerOpen(false)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg w-[95vw] max-w-[95vw] max-h-[95vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* STICKY HEADER */}
            <div className="sticky top-0 z-10 bg-neutral-950 border-b border-neutral-800 px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-semibold text-white text-">
                  Pick generations
                </h2>
                <span className="text-sm font-bold text-yellow-400 font-mono">
                  {unassignedCredits.toFixed(1)} cr
                </span>
                {accounts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[8px] text-neutral-500 uppercase tracking-wider mr-1">
                      Account:
                    </span>
                    {accounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setSelectedAccountId(acc.id);
                          setPickerPage(1);
                          setSelectedIds(new Set());
                          void Promise.all([
                            loadPickerStats(),
                            loadPickerPage(1),
                          ]);
                        }}
                        className={`text-[8px] px-2 py-0.5 rounded transition-colors ${
                          selectedAccountId === acc.id
                            ? "bg-lime-400 text-black"
                            : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                        }`}
                      >
                        {acc.label}
                      </button>
                    ))}
                    <span className="text-neutral-700 mx-1">·</span>
                    <button
                      type="button"
                      onClick={() => syncAccount(true)}
                      disabled={syncing}
                      className="text-xs text-orange-400 hover:text-orange-300 disabled:text-neutral-600 flex items-center gap-1"
                      title="Force refresh from Higgsfield (bypasses cooldown)"
                    >
                      <RefreshCw
                        className={`size-3 ${syncing ? "animate-spin" : ""}`}
                      />
                      Refresh
                    </button>
                    {cooldownLeft > 0 && !syncing && (
                      <span className="text-[10px] text-neutral-600">
                        next sync in {Math.ceil(cooldownLeft / 60000)}m
                      </span>
                    )}
                    <span className="text-neutral-700 mx-1">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            "Full re-sync re-walks the ENTIRE Higgsfield history for this account to rebuild credit totals. It can take a minute. Continue?",
                          )
                        ) {
                          syncAccount(true, true);
                        }
                      }}
                      disabled={syncing}
                      className="text-xs text-neutral-400 hover:text-neutral-200 disabled:text-neutral-600"
                      title="Re-walk all history and rebuild credit totals (slow — use once)"
                    >
                      Full re-sync
                    </button>
                    <span className="text-neutral-700 mx-1">·</span>
                    <button
                      type="button"
                      onClick={toggleSelectAllVisible}
                      disabled={unassigned.length === 0}
                      className="text-xs text-lime-400 hover:underline disabled:text-neutral-600 disabled:no-underline"
                    >
                      {allVisibleSelected ? "Deselect loaded" : "Select loaded"}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPickerOpen(false)}
                  disabled={batchBusy !== null || isPending}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={openDestination}
                  disabled={
                    selectedIds.size === 0 || batchBusy !== null || isPending
                  }
                  className="h-8 text-xs bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                >
                  Assign ({selectedIds.size})
                </Button>
              </div>
            </div>

            {/* LIST */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto">
                {syncError ? (
                  <div className="p-4">
                    <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-3 rounded text-sm flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium mb-0.5">Sync failed</div>
                        <div className="text-xs opacity-90">{syncError}</div>
                      </div>
                      {syncError.includes("Settings") && (
                        <a
                          href="/app/settings"
                          className="text-lime-400 hover:underline text-xs shrink-0 whitespace-nowrap"
                        >
                          Open Settings →
                        </a>
                      )}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => syncAccount(true)}
                        disabled={syncing || isPending}
                        className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                      >
                        <RefreshCw
                          className={`size-4 mr-1.5 ${syncing ? "animate-spin" : ""}`}
                        />
                        {syncing ? "Retrying…" : "Retry sync"}
                      </Button>
                    </div>
                  </div>
                ) : loadingUnassigned ? (
                  <>
                    <div className="px-4 py-2 border-b border-neutral-800 bg-neutral-900/40 flex items-center gap-2">
                      <RefreshCw className="size-3.5 text-lime-400 animate-spin" />
                      <span className="text-xs text-neutral-400">Loading…</span>
                    </div>
                    <ul className="divide-y divide-neutral-800">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <li
                          key={i}
                          className="px-3 py-2 flex items-center gap-3 animate-pulse"
                        >
                          <div className="size-5 rounded border-2 border-neutral-700 bg-neutral-900 shrink-0" />
                          <div className="w-32 h-22 2xl:w-40 2xl:h-28 rounded bg-neutral-800 shrink-0" />
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="h-3 w-1/2 bg-neutral-800 rounded" />
                            <div className="h-2 w-1/3 bg-neutral-900 rounded" />
                          </div>
                          <div className="h-3 w-10 bg-neutral-800 rounded shrink-0" />
                        </li>
                      ))}
                    </ul>
                  </>
                ) : unassignedTotal === 0 ? (
                  <div className="p-8 text-center text-neutral-500 text-sm">
                    {syncing ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="size-3.5 text-lime-400 animate-spin" />
                        <span className="text-xs text-neutral-400">
                          Pulling fresh generations from Higgsfield…
                        </span>
                      </div>
                    ) : (
                      <>
                        <p>
                          {syncMessage
                            ? "Synced — but nothing new is waiting."
                            : "No unassigned generations."}
                        </p>
                        <p className="text-xs mt-1">
                          Try switching accounts or click Refresh to force sync.
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {syncing && (
                      <div className="px-4 py-1.5 border-b border-neutral-800 bg-neutral-900/40 flex items-center gap-2">
                        <RefreshCw className="size-3 text-lime-400 animate-spin" />
                        <span className="text-[11px] text-neutral-400">
                          Syncing from Higgsfield — new items will appear
                          shortly…
                        </span>
                      </div>
                    )}
                    {groupedUnassigned.map((group) => {
                      const daySelected =
                        group.items.length > 0 &&
                        group.items.every((g) => selectedIds.has(g.id));
                      return (
                        <section key={group.label} className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => toggleSelectDay(group.items)}
                            className="mb-4 flex items-center gap-2 text-sm font-semibold text-white transition hover:text-lime-300"
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
                          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-6 xl:grid-cols-14 2xl:grid-cols-16">
                            {group.items.map((g) => {
                              const checked = selectedIds.has(g.id);
                              return (
                                <a
                                  key={g.id}
                                  href={hfAssetUrl(g.external_id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Open in Higgsfield"
                                  className={`group relative block aspect-square rounded-lg xl:rounded-xl border bg-neutral-950 transition overflow-hidden ${
                                    checked
                                      ? "border-lime-400 shadow-[0_0_0_1px_rgba(163,230,53,0.45)]"
                                      : "border-neutral-800 hover:border-neutral-600"
                                  }`}
                                >
                                  <button
                                    type="button"
                                    aria-pressed={checked}
                                    aria-label={
                                      checked
                                        ? `Deselect ${g.display_name}`
                                        : `Select ${g.display_name}`
                                    }
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleSelect(g.id);
                                    }}
                                    className={`absolute left-2.5 top-2.5 z-10 flex size-7 items-center justify-center rounded-lg border-2 backdrop-blur-sm transition ${
                                      checked
                                        ? "border-lime-400 bg-lime-400 text-black"
                                        : "border-white/25 bg-black/35 text-transparent hover:border-white/45"
                                    }`}
                                  >
                                    <Check className="size-3.5" />
                                  </button>
                                  <MediaPreview
                                    url={g.result_url}
                                    mediaType={g.media_type}
                                    name={g.display_name}
                                    className="h-full w-full object-cover"
                                  />
                                </a>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </>
                )}
              </div>
              {!syncError &&
                !loadingUnassigned &&
                unassignedTotal > 0 &&
                hasMoreUnassigned && (
                  <div className="flex items-center justify-center gap-2 border-t border-neutral-800 px-4 py-2">
                    <p className="text-xs text-neutral-500">
                      {selectedIds.size} of {unassignedTotal} selected
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={loadMorePicker}
                      disabled={loadingMoreUnassigned}
                      className="h-8 min-w-32 text-xs"
                    >
                      {loadingMoreUnassigned ? (
                        <>
                          <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        "Load more"
                      )}
                    </Button>
                    <span className="text-xs text-neutral-500">
                      Showing {unassigned.length} of {unassignedTotal}
                    </span>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL B — destination */}
      {destOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={() => !batchBusy && !isPending && setDestOpen(false)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg max-w-md w-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white text-sm">
                  Assign {selectedIds.size} generation
                  {selectedIds.size === 1 ? "" : "s"}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Pick the destination client, then mark as actual usage or
                  wastage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !batchBusy && !isPending && setDestOpen(false)}
                disabled={batchBusy !== null || isPending}
                className="p-1 rounded hover:bg-neutral-800 transition-colors disabled:opacity-40"
              >
                <X className="size-4 text-neutral-400" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                  Client
                </label>
                <select
                  value={destClientId}
                  onChange={(e) => setDestClientId(e.target.value)}
                  disabled={loadingSel || batchBusy !== null || isPending}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-neutral-500"
                >
                  {selClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                  Work
                </label>
                <select
                  value={destWorkId}
                  onChange={(e) => setDestWorkId(e.target.value)}
                  disabled={
                    loadingSel ||
                    batchBusy !== null ||
                    isPending ||
                    selWorks.length === 0
                  }
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-neutral-500"
                >
                  {selWorks.length === 0 ? (
                    <option value="">No works for this client</option>
                  ) : (
                    selWorks.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title || "Untitled"}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {batchError && (
                <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-xs">
                  {batchError}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-neutral-800 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => runBatch("irrelevant")}
                disabled={
                  batchBusy !== null || isPending || selectedIds.size === 0
                }
                className="text-neutral-400 border-neutral-700 hover:bg-neutral-900"
              >
                {batchBusy === "irrelevant"
                  ? "Marking…"
                  : isPending
                    ? "Updating…"
                    : "R&D"}
              </Button>
              <Button
                variant="outline"
                onClick={() => runBatch("waste")}
                disabled={
                  batchBusy !== null || isPending || selectedIds.size === 0
                }
                className="text-yellow-400 border-yellow-700 hover:bg-yellow-950"
              >
                {batchBusy === "waste"
                  ? "Marking…"
                  : isPending
                    ? "Updating…"
                    : "Wastage"}
              </Button>
              <Button
                onClick={() => runBatch("actual")}
                disabled={
                  batchBusy !== null || isPending || selectedIds.size === 0
                }
                className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
              >
                {batchBusy === "actual"
                  ? "Assigning…"
                  : isPending
                    ? "Updating…"
                    : "Actual usage"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
