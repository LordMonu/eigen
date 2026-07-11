"use client";

import {
  useState,
  useCallback,
  useTransition,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { ClientFormDialog } from "@/components/app/clients/client-form-dialog";
import { CreateWorkDialog } from "@/components/app/works/create-work-dialog";
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
import {
  SyncPickerModal,
  type Account,
  type CreatorStat,
  type UnassignedGeneration,
} from "./sync-and-assign-modals";
import { runConcurrentBatches } from "@/lib/run-concurrent-batches";
import { useGenerationPreviewSize } from "@/components/app/generations/preview-size-control";

const PICKER_BATCH_SIZE = 50;

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
  const [pickerPreviewSize, setPickerPreviewSize] = useGenerationPreviewSize(
    "work-sync-picker-preview-size",
  );
  const [unassigned, setUnassigned] = useState<UnassignedGeneration[]>([]);
  const [unassignedTotal, setUnassignedTotal] = useState(0);
  const [unassignedCredits, setUnassignedCredits] = useState(0);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [loadingMoreUnassigned, setLoadingMoreUnassigned] = useState(false);
  const [hasMoreUnassigned, setHasMoreUnassigned] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const rangeAnchorIdRef = useRef<string | null>(null);
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
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [workDialogOpen, setWorkDialogOpen] = useState(false);
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId],
  );
  const selectedDestinationClient = useMemo(
    () => selClients.find((client) => client.id === destClientId) ?? null,
    [destClientId, selClients],
  );
  const visibleUnassigned = useMemo(
    () => unassigned.filter((g) => g.media_type !== "feature"),
    [unassigned],
  );
  const groupedUnassigned = useMemo(
    () => groupByDay(visibleUnassigned),
    [visibleUnassigned],
  );
  const orderedUnassignedIds = useMemo(
    () => visibleUnassigned.map((generation) => generation.id),
    [visibleUnassigned],
  );
  const orderedUnassignedIndex = useMemo(
    () => new Map(orderedUnassignedIds.map((id, index) => [id, index])),
    [orderedUnassignedIds],
  );

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
      options: {
        append?: boolean;
        silent?: boolean;
        includeCount?: boolean;
      } = {},
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
          count: (options.includeCount ?? !append) ? "exact" : undefined,
          excludeFeatures: true,
          pageSize: PICKER_BATCH_SIZE,
          previewOnly: true,
        },
      );
      const nextTotal = count ?? unassignedTotal;
      setUnassigned((prev) => {
        if (!append) return data;
        const seen = new Set(prev.map((g) => g.id));
        return [...prev, ...data.filter((g) => !seen.has(g.id))];
      });
      if (count != null) setUnassignedTotal(count);
      setHasMoreUnassigned(
        count != null
          ? page * PICKER_BATCH_SIZE < nextTotal
          : data.length === PICKER_BATCH_SIZE,
      );
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

  const loadMorePicker = useCallback(() => {
    const nextPage = pickerPage + 1;
    setPickerPage(nextPage);
    void loadPickerPage(nextPage, { append: true, includeCount: false });
  }, [loadPickerPage, pickerPage]);

  useEffect(() => {
    if (pickerOpen && selectedAccountId) {
      const frame = window.requestAnimationFrame(() => {
        setPickerPage(1);
        void Promise.all([
          loadPickerStats(),
          loadPickerPage(1, { includeCount: true }),
        ]);
      });
      return () => window.cancelAnimationFrame(frame);
    }
  }, [selectedAccountId, pickerOpen, loadPickerStats, loadPickerPage]);

  // Load all clients when Modal B opens
  useEffect(() => {
    if (!destOpen) return;
    const frame = window.requestAnimationFrame(() => {
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
    });
    return () => window.cancelAnimationFrame(frame);
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

  const reloadDestinationClients = useCallback(async () => {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .is("deleted_at", null)
      .order("name");

    const nextClients =
      data && data.length > 0 ? data : [{ id: clientId, name: clientName }];
    setSelClients(nextClients);
    return nextClients;
  }, [clientId, clientName, supabase]);

  const reloadDestinationWorks = useCallback(
    async (nextClientId: string) => {
      const { data } = await supabase
        .from("works")
        .select("id, title")
        .eq("client_id", nextClientId)
        .is("deleted_at", null)
        .order("title");

      const nextWorks = data && data.length > 0 ? data : [];
      setSelWorks(nextWorks);
      setDestWorkId((prev) =>
        nextWorks.find((work) => work.id === prev)
          ? prev
          : (nextWorks[0]?.id ?? ""),
      );
      return nextWorks;
    },
    [supabase],
  );

  const openCreateWorkShortcut = useCallback(() => {
    if (!destClientId) {
      setBatchError("Pick a client first, then add a new work for it.");
      return;
    }
    setWorkDialogOpen(true);
  }, [destClientId]);

  const handleQuickWorkCreated = useCallback(
    (work: { id: string; title: string | null; clientId: string }) => {
      setSelWorks((prev) => {
        const next = [{ id: work.id, title: work.title }, ...prev];
        const seen = new Set<string>();
        return next.filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        });
      });
      setDestClientId(work.clientId);
      setDestWorkId(work.id);
    },
    [],
  );

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
      rangeAnchorIdRef.current = null;
      setPickerPage(1);
      await loadPickerStats();
      await loadPickerPage(1, { silent: true, includeCount: true });
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
    rangeAnchorIdRef.current = null;
    setPickerPage(1);
    setPickerOpen(true);

    if (!isCooldownActive(selectedAccountId)) {
      await syncAccount();
    }
  }

  const toggleSelect = useCallback((genId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const anchorId = rangeAnchorIdRef.current;
      const currentIndex = orderedUnassignedIndex.get(genId) ?? -1;
      const anchorIndex = anchorId
        ? (orderedUnassignedIndex.get(anchorId) ?? -1)
        : -1;

      if (
        anchorIndex !== -1 &&
        currentIndex !== -1 &&
        genId !== anchorId &&
        !prev.has(genId)
      ) {
        const [start, end] =
          anchorIndex < currentIndex
            ? [anchorIndex, currentIndex]
            : [currentIndex, anchorIndex];
        for (let i = start; i <= end; i++) {
          next.add(orderedUnassignedIds[i]);
        }
      } else if (next.has(genId)) {
        next.delete(genId);
      } else {
        next.add(genId);
      }
      return next;
    });
    rangeAnchorIdRef.current = genId;
  }, [orderedUnassignedIds, orderedUnassignedIndex]);

  const toggleSelectDay = useCallback((items: Array<{ id: string }>) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = items.every((g) => next.has(g.id));
      items.forEach((g) => {
        if (allSelected) next.delete(g.id);
        else next.add(g.id);
      });
      return next;
    });
  }, []);

  const allVisibleSelected =
    unassigned.length > 0 && unassigned.every((g) => selectedIds.has(g.id));

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        unassigned.forEach((g) => next.delete(g.id));
      } else {
        unassigned.forEach((g) => next.add(g.id));
      }
      return next;
    });
  }, [allVisibleSelected, unassigned]);

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
    await runConcurrentBatches(
      ids,
      async (gid) => {
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
      },
      8,
    );

    if (mode === "waste" && assignedIds.length > 0) {
      await runConcurrentBatches(
        assignedIds,
        async (gid) => {
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
        },
        8,
      );
    }

    if (mode === "irrelevant" && assignedIds.length > 0) {
      await runConcurrentBatches(
        assignedIds,
        async (gid) => {
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
        },
        8,
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
        loadPickerPage(1, { silent: true, includeCount: true }),
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
      <ClientFormDialog
        open={clientDialogOpen}
        onOpenChange={(open) => {
          setClientDialogOpen(open);
          if (!open) {
            window.setTimeout(() => {
              void reloadDestinationClients();
            }, 250);
          }
        }}
        mode="create"
        onCreated={(client) => {
          setSelClients((prev) => {
            const next = [{ id: client.id, name: client.name }, ...prev];
            const seen = new Set<string>();
            return next.filter((row) => {
              if (seen.has(row.id)) return false;
              seen.add(row.id);
              return true;
            });
          });
          setDestClientId(client.id);
          setDestWorkId("");
          setBatchError(null);
        }}
      />
      {selectedDestinationClient && (
        <CreateWorkDialog
          open={workDialogOpen}
          onOpenChange={(open) => {
            setWorkDialogOpen(open);
            if (!open) {
              window.setTimeout(() => {
                void reloadDestinationWorks(selectedDestinationClient.id);
              }, 250);
            }
          }}
          clientId={selectedDestinationClient.id}
          clientName={selectedDestinationClient.name}
          mode="full"
          onCreated={handleQuickWorkCreated}
          redirectOnCreate={false}
        />
      )}
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

      <SyncPickerModal
        pickerOpen={pickerOpen}
        setPickerOpen={setPickerOpen}
        selectedIds={selectedIds}
        selectedAccountId={selectedAccountId}
        accounts={accounts}
        unassignedCredits={unassignedCredits}
        syncMessage={syncMessage}
        syncError={syncError}
        syncing={syncing}
        isPending={isPending}
        loadingUnassigned={loadingUnassigned}
        loadingMoreUnassigned={loadingMoreUnassigned}
        hasMoreUnassigned={hasMoreUnassigned}
        unassigned={unassigned}
        unassignedTotal={unassignedTotal}
        groupedUnassigned={groupedUnassigned}
        allVisibleSelected={allVisibleSelected}
        toggleSelectAllVisible={toggleSelectAllVisible}
        toggleSelectDay={toggleSelectDay}
        toggleSelect={toggleSelect}
        onAccountChange={(accountId) => {
          setSelectedAccountId(accountId);
          setPickerPage(1);
          setSelectedIds(new Set());
          rangeAnchorIdRef.current = null;
        }}
        onRefresh={() => void syncAccount(true)}
        onFullResync={() => {
          if (
            window.confirm(
              "Full re-sync re-walks the ENTIRE Higgsfield history for this account to rebuild credit totals. It can take a minute. Continue?",
            )
          ) {
            void syncAccount(true, true);
          }
        }}
        onCancel={() => setPickerOpen(false)}
        onOpenDestination={openDestination}
        onLoadMore={loadMorePicker}
        cooldownLeft={cooldownLeft}
        previewSize={pickerPreviewSize}
        onPreviewSizeChange={setPickerPreviewSize}
        destOpen={destOpen}
        destClientId={destClientId}
        setDestClientId={setDestClientId}
        destWorkId={destWorkId}
        setDestWorkId={setDestWorkId}
        onCreateClientShortcut={() => {
          setBatchError(null);
          setClientDialogOpen(true);
        }}
        onCreateWorkShortcut={openCreateWorkShortcut}
        selClients={selClients}
        selWorks={selWorks}
        loadingSel={loadingSel}
        selectedIdCount={selectedIds.size}
        batchBusy={batchBusy}
        batchError={batchError}
        onRunBatch={runBatch}
        onDestClose={() => setDestOpen(false)}
      />
    </>
  );
}
