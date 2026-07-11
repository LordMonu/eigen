"use client";

import {
  Fragment,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MediaPreview,
  UnassignButton,
  WastageButton,
} from "@/components/app/works/[id]/assign-tables";
import { UnassignedGenerationsGrid } from "@/components/app/sync/unassigned-generations-grid";
import { ClientFormDialog } from "@/components/app/clients/client-form-dialog";
import { CreateWorkDialog } from "@/components/app/works/create-work-dialog";
import {
  PreviewSizeControl,
  useGenerationPreviewSize,
} from "@/components/app/generations/preview-size-control";
import { PaginationButtons } from "@/components/ui/pagination-buttons";
import {
  fetchSyncStats,
  fetchSyncTabPage,
  tabTotalPages,
  type SyncStats,
  type SyncTab,
} from "@/lib/sync-generation-queries";
import { RefreshCw } from "lucide-react";
import {
  isCooldownActive,
  markSynced,
  getCooldownRemaining,
} from "@/lib/sync-cooldown";
import type { Role } from "@/lib/roles";
import { isManagerLikeRole } from "@/lib/roles";
import { runConcurrentBatches } from "@/lib/run-concurrent-batches";

interface Client {
  id: string;
  name: string;
  industry: string;
}

interface Work {
  id: string;
  title: string | null;
  video_type: string | null;
  client_id: string;
  status: string;
}

interface Generation {
  id: string;
  external_id: string;
  display_name: string;
  job_set_type: string;
  result_url: string;
  media_type: string;
  prompt: string;
  credits: string;
  hf_created_at: string;
  client_id: string | null;
  work_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  is_waste: boolean;
  is_irrelevant: boolean;
  wasted_at: string | null;
  wasted_by: string | null;
  hf_connection_label: string | null;
}

interface AccessibleAccount {
  id: string;
  label: string;
  hf_email: string | null;
}

const UNASSIGNED_BATCH_SIZE = 50;

type DayGroup<T> = { label: string; items: T[] };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sod = (dt: Date) =>
    new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  const diffDays = Math.round((sod(today) - sod(d)) / 86400000);
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

export default function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [unassigned, setUnassigned] = useState<Generation[]>([]);
  const [unassignedVisibleTotal, setUnassignedVisibleTotal] = useState(0);
  const [loadingMoreUnassigned, setLoadingMoreUnassigned] = useState(false);
  const [hasMoreUnassigned, setHasMoreUnassigned] = useState(false);
  const [assigned, setAssigned] = useState<Generation[]>([]);
  const [wasted, setWasted] = useState<Generation[]>([]);
  const [irrelevant, setIrrelevant] = useState<Generation[]>([]);
  const [selectedUnassignedIds, setSelectedUnassignedIds] = useState<
    Set<string>
  >(new Set());
  const [rangeAnchorId, setRangeAnchorId] = useState<string | null>(null);
  const [bulkClientId, setBulkClientId] = useState("");
  const [bulkWorkId, setBulkWorkId] = useState("");
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [workDialogOpen, setWorkDialogOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<
    "assign" | "waste" | "irrelevant" | null
  >(null);
  const [rowBusy, setRowBusy] = useState<
    Record<string, "assign" | "waste" | "irrelevant" | null>
  >({});
  const [rowError, setRowError] = useState<string | null>(null);

  const [userRole, setUserRole] = useState<Role>("creator");
  const [userId, setUserId] = useState<string>("");
  const [accessibleAccounts, setAccessibleAccounts] = useState<
    AccessibleAccount[]
  >([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [assignedPage, setAssignedPage] = useState(1);
  const [wastedPage, setWastedPage] = useState(1);
  const [irrelevantPage, setIrrelevantPage] = useState(1);
  const [unassignedPreviewSize, setUnassignedPreviewSize] =
    useGenerationPreviewSize("sync-unassigned-preview-size");

  const [supabase] = useState(() => createClient());

  const selectedAccount = useMemo(
    () => accessibleAccounts.find((a) => a.id === selectedAccountId),
    [accessibleAccounts, selectedAccountId],
  );

  useEffect(() => {
    if (!selectedAccountId) return;
    const update = () =>
      setCooldownLeft(getCooldownRemaining(selectedAccountId));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [selectedAccountId]);

  const loadAccountAccess = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: membership } = await supabase
      .from("memberships")
      .select("role, org_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!membership) return;
    setUserRole(membership.role as Role);

    let accs: AccessibleAccount[] = [];
    if (membership.role === "master" || isManagerLikeRole(membership.role)) {
      const { data } = await supabase
        .from("hf_connections")
        .select("id, label, hf_email")
        .eq("org_id", membership.org_id)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      accs = data || [];
    } else {
      const { data: grants } = await supabase
        .from("hf_connection_grants")
        .select("connection_id")
        .eq("user_id", user.id);
      const grantedIds = (grants || []).map((g) => g.connection_id);
      if (grantedIds.length > 0) {
        const { data } = await supabase
          .from("hf_connections")
          .select("id, label, hf_email")
          .eq("org_id", membership.org_id)
          .eq("is_active", true)
          .in("id", grantedIds)
          .order("created_at", { ascending: true });
        accs = data || [];
      }
    }
    setAccessibleAccounts(accs);
    if (accs.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accs[0].id);
    }
  }, [supabase, selectedAccountId]);

  const loadClientsAndWorks = useCallback(async () => {
    const [{ data: clientData }, { data: workData }] = await Promise.all([
      supabase.from("clients").select("id, name, industry").order("name"),
      supabase
        .from("works")
        .select("id, title, video_type, client_id, status")
        .order("created_at", { ascending: false }),
    ]);
    setClients(clientData || []);
    setWorks((workData || []) as Work[]);
  }, [supabase]);

  const loadTab = useCallback(
    async (
      tab: SyncTab,
      page: number,
      options: {
        append?: boolean;
        pageSize?: number;
        includeCount?: boolean;
      } = {},
    ) => {
      const append = options.append === true;
      const pageSize = options.pageSize ?? UNASSIGNED_BATCH_SIZE;
      const label = selectedAccount?.label ?? null;
      const { data, count } = await fetchSyncTabPage<Generation>(
        supabase,
        tab,
        page,
        label,
        tab === "unassigned"
          ? {
              count: (options.includeCount ?? !append) ? "exact" : undefined,
              excludeFeatures: true,
              pageSize,
            }
          : undefined,
      );
      switch (tab) {
        case "unassigned":
          setUnassigned((prev) => {
            if (!append) return data;
            const seen = new Set(prev.map((g) => g.id));
            return [...prev, ...data.filter((g) => !seen.has(g.id))];
          });
          if (count != null) {
            setUnassignedVisibleTotal(count);
            setHasMoreUnassigned(page * pageSize < count);
          } else {
            setHasMoreUnassigned(data.length === pageSize);
          }
          break;
        case "assigned":
          setAssigned(data);
          break;
        case "wasted":
          setWasted(data);
          break;
        case "irrelevant":
          setIrrelevant(data);
          break;
      }
    },
    [supabase, selectedAccount?.label],
  );

  const loadStats = useCallback(async () => {
    const next = await fetchSyncStats(supabase, selectedAccount?.label ?? null);
    if (next) setStats(next);
  }, [supabase, selectedAccount?.label]);

  const refreshVisibleUnassigned = useCallback(
    async (includeCount = true) => {
      await loadTab("unassigned", 1, {
        pageSize: UNASSIGNED_BATCH_SIZE * unassignedPage,
        includeCount,
      });
    },
    [loadTab, unassignedPage],
  );

  const refreshAfterSync = useCallback(async () => {
    await Promise.all([loadStats(), refreshVisibleUnassigned(true)]);
  }, [loadStats, refreshVisibleUnassigned]);

  const refreshAssignedTab = useCallback(async () => {
    await Promise.all([
      loadStats(),
      refreshVisibleUnassigned(true),
      loadTab("assigned", assignedPage),
    ]);
  }, [assignedPage, loadStats, loadTab, refreshVisibleUnassigned]);

  const refreshWastedTab = useCallback(async () => {
    await Promise.all([
      loadStats(),
      refreshVisibleUnassigned(true),
      loadTab("wasted", wastedPage),
    ]);
  }, [loadStats, loadTab, refreshVisibleUnassigned, wastedPage]);

  const refreshIrrelevantTab = useCallback(async () => {
    await Promise.all([
      loadStats(),
      refreshVisibleUnassigned(true),
      loadTab("irrelevant", irrelevantPage),
    ]);
  }, [irrelevantPage, loadStats, loadTab, refreshVisibleUnassigned]);

  const loadInitialData = useCallback(async () => {
    setHasMoreUnassigned(false);
    await Promise.all([
      loadStats(),
      loadTab("unassigned", 1, { includeCount: true }),
      loadTab("assigned", 1),
      loadTab("wasted", 1),
      loadTab("irrelevant", 1),
    ]);
    setUnassignedPage(1);
    setAssignedPage(1);
    setWastedPage(1);
    setIrrelevantPage(1);
  }, [loadStats, loadTab]);

  useEffect(() => {
    async function init() {
      await loadAccountAccess();
    }
    init();
  }, [loadAccountAccess]);

  useEffect(() => {
    if (selectedAccountId) {
      setSelectedUnassignedIds(new Set());
      setRangeAnchorId(null);
      void loadInitialData();
    }
  }, [selectedAccountId, loadInitialData]);

  useEffect(() => {
    if (!selectedAccountId) return;
    void loadClientsAndWorks();
  }, [loadClientsAndWorks, selectedAccountId]);

  async function syncSelectedAccount(force = false, full = false) {
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
      const data = await res.json();
      if (res.status === 409) {
        setSyncError(
          userRole === "master"
            ? "No Higgsfield account connected. Go to Settings to add one."
            : "You don't have access to any Higgsfield account yet. Ask your admin to grant you access.",
        );
        return;
      }
      if (!res.ok) throw new Error(data.error || "Sync failed");
      markSynced(selectedAccountId);
      setSyncMessage(data.message);
      await refreshAfterSync();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSync() {
    if (!selectedAccountId) return;
    if (isCooldownActive(selectedAccountId)) {
      await refreshAfterSync();
      return;
    }
    await syncSelectedAccount();
  }

  const worksFor = useCallback((clientFilter: string): Work[] => {
    return clientFilter
      ? works.filter((w) => w.client_id === clientFilter)
      : works;
  }, [works]);

  const openCreateWorkShortcut = useCallback(() => {
    if (!bulkClientId) {
      setRowError("Pick a client first, then add a new work for it.");
      return;
    }
    setWorkDialogOpen(true);
  }, [bulkClientId]);

  const handleQuickWorkCreated = useCallback((work: {
    id: string;
    title: string | null;
    clientId: string;
  }) => {
    setWorks((prev) => [
      {
        id: work.id,
        title: work.title,
        video_type: null,
        client_id: work.clientId,
        status: "ongoing",
      },
      ...prev,
    ]);
    setBulkClientId(work.clientId);
    setBulkWorkId(work.id);
  }, []);

  const resetUnassignedSelection = useCallback(() => {
    setSelectedUnassignedIds(new Set());
    setRangeAnchorId(null);
  }, []);

  const loadMoreUnassignedRows = useCallback(() => {
    const nextPage = unassignedPage + 1;
    setLoadingMoreUnassigned(true);
    setUnassignedPage(nextPage);
    void loadTab("unassigned", nextPage, {
      append: true,
      includeCount: false,
    }).finally(() => {
      setLoadingMoreUnassigned(false);
    });
  }, [loadTab, unassignedPage]);

  const toggleUnassignedDay = useCallback((items: Array<{ id: string }>) => {
    setSelectedUnassignedIds((prev) => {
      const next = new Set(prev);
      const allSelected = items.every((g) => next.has(g.id));
      items.forEach((g) => {
        if (allSelected) next.delete(g.id);
        else next.add(g.id);
      });
      return next;
    });
  }, []);

  const orderedUnassignedIds = useMemo(
    () =>
      unassigned
        .filter((generation) => generation.media_type !== "feature")
        .map((generation) => generation.id),
    [unassigned],
  );

  const toggleUnassignedSelection = useCallback((id: string) => {
    setSelectedUnassignedIds((prev) => {
      const next = new Set(prev);
      const currentIndex = orderedUnassignedIds.indexOf(id);
      const anchorIndex = rangeAnchorId
        ? orderedUnassignedIds.indexOf(rangeAnchorId)
        : -1;

      if (
        anchorIndex !== -1 &&
        currentIndex !== -1 &&
        id !== rangeAnchorId &&
        !prev.has(id)
      ) {
        const [start, end] =
          anchorIndex < currentIndex
            ? [anchorIndex, currentIndex]
            : [currentIndex, anchorIndex];
        for (let i = start; i <= end; i++) {
          next.add(orderedUnassignedIds[i]);
        }
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
    setRangeAnchorId(id);
  }, [orderedUnassignedIds, rangeAnchorId]);

  async function handleBulkAction(mode: "assign" | "waste" | "irrelevant") {
    setRowError(null);
    if (selectedUnassignedIds.size === 0) return;

    const selectedGenerations = visibleUnassigned.filter((g) =>
      selectedUnassignedIds.has(g.id),
    );
    if (selectedGenerations.length === 0) {
      resetUnassignedSelection();
      return;
    }

    setBulkBusy(mode);

    if (mode === "irrelevant") {
      try {
        const failures: string[] = [];
        await runConcurrentBatches(
          selectedGenerations,
          async (gen) => {
            const res = await fetch(`/api/generations/${gen.id}/irrelevant`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_irrelevant: true }),
            });
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              failures.push(
                `${gen.display_name}: ${d?.error || res.statusText}`,
              );
            }
          },
          8,
        );

        await refreshIrrelevantTab();
        resetUnassignedSelection();

        if (failures.length > 0) {
          setRowError(
            `${failures.length} of ${selectedGenerations.length} failed: ${failures.slice(0, 2).join("; ")}`,
          );
          }
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setBulkBusy(null);
      }
      return;
    }

    if (!bulkWorkId) {
      setRowError("Pick a work first.");
      setBulkBusy(null);
      return;
    }
    const work = works.find((w) => w.id === bulkWorkId);
    if (!work) {
      setRowError("Selected work not found — refresh.");
      setBulkBusy(null);
      return;
    }

    try {
      const failures: string[] = [];
      await runConcurrentBatches(
        selectedGenerations,
        async (gen) => {
          const assignRes = await fetch(
            `/api/works/${work.id}/assign-generation`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                generationId: gen.id,
                clientId: work.client_id,
              }),
            },
          );
          if (!assignRes.ok) {
            const d = await assignRes.json().catch(() => ({}));
            failures.push(
              `${gen.display_name}: ${d?.error || assignRes.statusText}`,
            );
            return;
          }

          if (mode === "waste") {
            const wasteRes = await fetch(`/api/generations/${gen.id}/waste`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ is_waste: true }),
            });
            if (!wasteRes.ok) {
              const d = await wasteRes.json().catch(() => ({}));
              failures.push(
                `${gen.display_name}: ${d?.error || wasteRes.statusText}`,
              );
            }
          }
        },
        8,
      );

      if (mode === "assign") {
        await refreshAssignedTab();
      } else {
        await refreshWastedTab();
      }
      resetUnassignedSelection();

      if (failures.length > 0) {
        setRowError(
          `${failures.length} of ${selectedGenerations.length} failed: ${failures.slice(0, 2).join("; ")}`,
        );
      }
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleUnmarkIrrelevant(gen: Generation) {
    setRowError(null);
    setRowBusy((prev) => ({ ...prev, [gen.id]: "irrelevant" }));
    try {
      const res = await fetch(`/api/generations/${gen.id}/irrelevant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_irrelevant: false }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setRowError(`Failed: ${d?.error || res.statusText}`);
        return;
      }
      await refreshIrrelevantTab();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setRowBusy((prev) => ({ ...prev, [gen.id]: null }));
    }
  }

  const totalUnassigned = stats?.unassigned_credits ?? 0;
  const totalAssigned = stats?.assigned_credits ?? 0;
  const totalWasted = stats?.wasted_credits ?? 0;
  const totalIrrelevant = stats?.irrelevant_credits ?? 0;

  const unassignedTotal = unassignedVisibleTotal;
  const assignedTotal = stats?.assigned_count ?? 0;
  const wastedTotal = stats?.wasted_count ?? 0;
  const irrelevantTotal = stats?.irrelevant_count ?? 0;

  const clientNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    clients.forEach((client) => {
      map[client.id] = client.name;
    });
    return map;
  }, [clients]);
  const workTitle = useCallback(
    (work: Work) => work.title || work.video_type || "Untitled",
    [],
  );
  const worksById = useMemo(() => {
    const map = new Map<string, Work>();
    works.forEach((work) => {
      map.set(work.id, work);
    });
    return map;
  }, [works]);
  const selectedBulkWork = useMemo(
    () => worksById.get(bulkWorkId) ?? null,
    [bulkWorkId, worksById],
  );
  const visibleUnassigned = useMemo(
    () => unassigned.filter((g) => g.media_type !== "feature"),
    [unassigned],
  );
  const visibleAssigned = useMemo(
    () => assigned.filter((g) => g.media_type !== "feature"),
    [assigned],
  );
  const visibleWasted = useMemo(
    () => wasted.filter((g) => g.media_type !== "feature"),
    [wasted],
  );
  const visibleIrrelevant = useMemo(
    () => irrelevant.filter((g) => g.media_type !== "feature"),
    [irrelevant],
  );

  const groupedUnassigned = useMemo(
    () => groupByDay(visibleUnassigned),
    [visibleUnassigned],
  );
  const groupedAssigned = useMemo(
    () => groupByDay(visibleAssigned),
    [visibleAssigned],
  );
  const groupedWasted = useMemo(
    () => groupByDay(visibleWasted),
    [visibleWasted],
  );
  const groupedIrrelevant = useMemo(
    () => groupByDay(visibleIrrelevant),
    [visibleIrrelevant],
  );

  const refreshAssignedAfterUnassign = useCallback(() => {
    void refreshAssignedTab();
  }, [refreshAssignedTab]);

  const refreshWastedAfterUnassign = useCallback(() => {
    void refreshWastedTab();
  }, [refreshWastedTab]);

  function changeTabPage(tab: SyncTab, page: number) {
    switch (tab) {
      case "assigned":
        setAssignedPage(page);
        break;
      case "wasted":
        setWastedPage(page);
        break;
      case "irrelevant":
        setIrrelevantPage(page);
        break;
    }
    void loadTab(tab, page);
  }

  const selectedBulkClient = useMemo(
    () => clients.find((client) => client.id === bulkClientId) ?? null,
    [bulkClientId, clients],
  );

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      <ClientFormDialog
        open={clientDialogOpen}
        onOpenChange={(open) => {
          setClientDialogOpen(open);
          if (!open) {
            window.setTimeout(() => {
              void loadClientsAndWorks();
            }, 250);
          }
        }}
        mode="create"
      />
      {selectedBulkClient && (
        <CreateWorkDialog
          open={workDialogOpen}
          onOpenChange={(open) => {
            setWorkDialogOpen(open);
            if (!open) {
              window.setTimeout(() => {
                void loadClientsAndWorks();
              }, 250);
            }
          }}
          clientId={selectedBulkClient.id}
          clientName={selectedBulkClient.name}
          mode="full"
          onCreated={handleQuickWorkCreated}
          redirectOnCreate={false}
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sync &amp; Assign</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Pull Higgsfield generations and attribute them to a work.
          </p>
        </div>
        <section className="flex gap-2">
          {/* ACCESSIBLE ACCOUNTS BANNER */}
          {accessibleAccounts.length > 0 ? null : (
            <div className="bg-yellow-950/30 border border-yellow-900 text-yellow-300 px-4 py-3 rounded text-sm">
              {userRole === "master" ? (
                <>
                  No Higgsfield accounts connected yet.{" "}
                  <Link
                    href="/app/settings"
                    className="text-lime-400 hover:underline"
                  >
                    Add one in Settings
                  </Link>{" "}
                  to start syncing.
                </>
              ) : (
                <>
                  You don&apos;t have access to any Higgsfield account yet. Ask
                  your admin to grant you access from the Users page.
                </>
              )}
            </div>
          )}

          {syncMessage && (
            <div className="bg-green-950/50 border border-green-800 text-green-300 px-4 py-1 rounded-lg text-sm">
              ✓ {syncMessage}
            </div>
          )}
          {syncError && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 px-4 py-2 rounded text-sm flex items-center justify-between">
              <span>✗ {syncError}</span>
              {syncError.includes("Settings") && (
                <Link
                  href="/app/settings"
                  className="text-lime-400 hover:underline text-xs ml-4"
                >
                  Open Settings →
                </Link>
              )}
            </div>
          )}

          {rowError && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 px-4 py-2 rounded text-sm flex items-center justify-between">
              <span>{rowError}</span>
              <button
                type="button"
                onClick={() => setRowError(null)}
                className="text-neutral-400 hover:text-white text-xs ml-4"
              >
                dismiss
              </button>
            </div>
          )}
          <Button
            onClick={handleSync}
            disabled={syncing || accessibleAccounts.length === 0}
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {syncing ? "Syncing…" : "⟳ Sync from Higgsfield"}
          </Button>
        </section>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
          <p className="text-neutral-400 text-xs uppercase">Unassigned</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            {totalUnassigned.toFixed(1)}
          </p>
          <p className="text-neutral-500 text-xs mt-1">
            {unassignedTotal} generations
          </p>
        </div>
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
          <p className="text-neutral-400 text-xs uppercase">Assigned</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {totalAssigned.toFixed(1)}
          </p>
          <p className="text-neutral-500 text-xs mt-1">
            {assignedTotal} generations
          </p>
        </div>
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
          <p className="text-neutral-400 text-xs uppercase">Wastage</p>
          <p className="text-2xl font-bold text-red-400 mt-1">
            {totalWasted.toFixed(1)}
          </p>
          <p className="text-neutral-500 text-xs mt-1">
            {wastedTotal} generations
          </p>
        </div>
      </div>

      {/* UNASSIGNED — per-row client filter + required work + buttons */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Unassigned Generations</h2>
            <span className="text-sm font-bold text-yellow-400 font-mono">
              {totalUnassigned.toFixed(1)} cr
            </span>
            {accessibleAccounts.length > 0 && (
              <div className="px-4 py- border-b border-neutral-800 bg-neutral-900/50 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-neutral-500">Account:</span>
                {accessibleAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setSelectedAccountId(acc.id);
                    }}
                    className={`text-[10px] px-1 py-0.5 rounded transition-colors ${
                      selectedAccountId === acc.id
                        ? "bg-lime-400 text-black"
                        : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                    title={acc.hf_email || ""}
                  >
                    {acc.label}
                  </button>
                ))}
                <span className="text-neutral-700 mx-1">·</span>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Full re-sync re-walks the ENTIRE Higgsfield history for this account to rebuild credit totals. It can take a minute. Continue?",
                      )
                    ) {
                      void syncSelectedAccount(true, true);
                    }
                  }}
                  disabled={syncing}
                  className="text-xs text-neutral-400 hover:text-neutral-200 disabled:text-neutral-600"
                  title="Re-walk all history and rebuild credit totals (slow — use once)"
                >
                  Full re-sync
                </button>
                {cooldownLeft > 0 && !syncing && (
                  <span className="text-[10px] text-neutral-600">
                    next sync in {Math.ceil(cooldownLeft / 60000)}m
                  </span>
                )}
                <span className="text-neutral-700 mx-1">·</span>
                <PreviewSizeControl
                  value={unassignedPreviewSize}
                  onChange={setUnassignedPreviewSize}
                />
              </div>
            )}
          </div>

          <Badge
            variant="outline"
            className="text-yellow-400 border-yellow-700"
          >
            {unassignedTotal} pending
          </Badge>
        </div>
        {unassignedTotal === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No unassigned generations.</p>
            <p className="text-sm mt-1">Click Sync to load your history.</p>
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex-1 overflow-auto">
              <UnassignedGenerationsGrid
                groups={groupedUnassigned}
                selectedIds={selectedUnassignedIds}
                onToggleDay={toggleUnassignedDay}
                onToggle={toggleUnassignedSelection}
                sectionClassName="px-4 py-2"
                gridClassName="grid gap-2"
                tileSize={unassignedPreviewSize}
              />
            </div>
            {hasMoreUnassigned && (
              <div className="flex items-center justify-center gap-2 border-t border-neutral-800 px-4 py-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadMoreUnassignedRows}
                  disabled={loadingMoreUnassigned}
                  className="h-8 min-w-28 text-xs"
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
                <span className="text-sm text-neutral-500">
                  Showing {visibleUnassigned.length} of {unassignedTotal}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedUnassignedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-[70] flex justify-center px-3 sm:px-4 pointer-events-none">
          <div className="pointer-events-auto w-auto max-w-[calc(100vw-1.5rem)] rounded-2xl border border-neutral-800 bg-neutral-550 px-3 py-3 shadow-[0_16px_60px_rgba(0,0,0,0.5)] backdrop-blur-lg sm:max-w-[calc(100vw-3rem)] sm:px-4">
            <div className="flex flex-col items-center gap-3 xl:flex-row xl:items-center xl:justify-center xl:gap-4">
              <div className="text-sm font-medium text-white text-center whitespace-nowrap">
                {selectedUnassignedIds.size} preview
                {selectedUnassignedIds.size === 1 ? "" : "s"} selected
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center xl:flex-nowrap xl:items-center">
                <Select
                  value={bulkClientId || "__all"}
                  onValueChange={(v) => {
                    if (v === "__create_client__") {
                      setClientDialogOpen(true);
                      return;
                    }
                    const next = v === "__all" ? "" : (v as string);
                    setBulkClientId(next);
                    setBulkWorkId("");
                  }}
                  disabled={bulkBusy !== null}
                >
                  <SelectTrigger className="h-9 w-full min-w-44 bg-neutral-900 border-neutral-700 text-xs sm:w-48">
                    <SelectValue>
                      {(v) => {
                        const val = v as string | null;
                        if (!val || val === "__all") return "All clients";
                        return clientNameMap[val] || val;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__create_client__">
                      + Add new client
                    </SelectItem>
                    <SelectItem value="__all">All clients</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={bulkWorkId}
                  onValueChange={(v) => {
                    if (v === "__create_work__") {
                      openCreateWorkShortcut();
                      return;
                    }
                    setBulkWorkId(v as string);
                  }}
                  disabled={bulkBusy !== null}
                >
                  <SelectTrigger className="h-9 w-full min-w-48 bg-neutral-900 border-neutral-700 text-xs sm:w-60">
                    <SelectValue>
                      {(v) => {
                        const val = v as string | null;
                        if (!val || val === "__create_work__") {
                          return "Pick a work…";
                        }
                        const work = worksById.get(val);
                        return work
                          ? workTitle(work)
                          : selectedBulkWork
                            ? workTitle(selectedBulkWork)
                            : val;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__create_work__">
                      + Add new work
                    </SelectItem>
                    {worksFor(bulkClientId).length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-neutral-500">
                        {bulkClientId
                          ? "No works for this client yet."
                          : "Pick a client to narrow works, or add a new one."}
                      </div>
                    ) : (
                      worksFor(bulkClientId).map((w) => (
                        <SelectItem key={w.id} value={w.id}>
                          {workTitle(w)} ·{" "}
                          {clientNameMap[w.client_id] || "Unknown"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkAction("irrelevant")}
                    disabled={bulkBusy !== null}
                    className="h-9 text-xs px-3 text-neutral-300 border-neutral-700 hover:bg-neutral-900"
                  >
                    {bulkBusy === "irrelevant" ? "…" : "R&D"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkAction("waste")}
                    disabled={bulkBusy !== null || !bulkWorkId}
                    className="h-9 text-xs px-3 text-yellow-400 border-yellow-700 hover:bg-yellow-950"
                  >
                    {bulkBusy === "waste" ? "…" : "Wastage"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleBulkAction("assign")}
                    disabled={bulkBusy !== null || !bulkWorkId}
                    className="h-9 text-xs px-3 bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                  >
                    {bulkBusy === "assign" ? "…" : "Actual usage"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGNED + WASTAGE TABLES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ASSIGNED */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm">
                Assigned across the org
              </h2>
              <span className="text-sm font-bold text-green-400 font-mono">
                {totalAssigned.toFixed(1)} cr
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              {assignedTotal} generation{assignedTotal === 1 ? "" : "s"}
              {selectedAccount ? ` · ${selectedAccount.label}` : ""}
            </p>
          </div>
          {assignedTotal === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>Nothing assigned yet.</p>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden max-h-[90vh]">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-neutral-800">
                    {groupedAssigned.map((group) => (
                      <Fragment key={group.label}>
                        <tr className="bg-neutral-950/95">
                          <td
                            colSpan={4}
                            className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
                          >
                            {group.label}
                          </td>
                        </tr>
                        {group.items.map((g) => (
                          <tr key={g.id} className="hover:bg-neutral-900/60">
                            <td className="px-2 py-2">
                              <a
                                href={hfAssetUrl(g.external_id)}
                                target="_blank"
                                rel="noreferrer"
                                title="Open in Higgsfield"
                                className="inline-block"
                              >
                                <MediaPreview
                                  url={g.result_url}
                                  mediaType={g.media_type}
                                  name={g.display_name}
                                />
                              </a>
                            </td>
                            <td className="px-2 py-2">
                              <a
                                href={hfAssetUrl(g.external_id)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-white hover:text-lime-300 hover:underline"
                                title="Open in Higgsfield"
                              >
                                {g.display_name}
                              </a>
                              <div className="text-neutral-500 text-xs mt-0.5 space-y-0.5">
                                {g.work_id &&
                                  (() => {
                                    const w = g.work_id
                                      ? worksById.get(g.work_id)
                                      : null;
                                    if (!w) return null;
                                    return (
                                      <div>
                                        via{" "}
                                        <Link
                                          href={`/app/works/${w.id}`}
                                          className="text-lime-400 hover:underline"
                                        >
                                          {workTitle(w)}
                                        </Link>
                                        {" · "}
                                        {clientNameMap[w.client_id] ||
                                          "Unknown"}
                                      </div>
                                    );
                                  })()}
                                {!g.work_id && g.client_id && (
                                  <div>
                                    on{" "}
                                    <Link
                                      href={`/app/clients/${g.client_id}`}
                                      className="text-lime-400 hover:underline"
                                    >
                                      {clientNameMap[g.client_id] || "Unknown"}
                                    </Link>
                                  </div>
                                )}
                                {g.hf_connection_label && (
                                  <div>
                                    from{" "}
                                    <span className="text-lime-400">
                                      {g.hf_connection_label}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span
                                className={`font-bold ${
                                  parseFloat(g.credits) > 0
                                    ? "text-orange-400"
                                    : "text-neutral-500"
                                }`}
                              >
                                {parseFloat(g.credits) > 0
                                  ? parseFloat(g.credits).toFixed(1)
                                  : "free"}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <UnassignButton
                                generationId={g.id}
                                assignedAt={g.assigned_at}
                                assignedBy={g.assigned_by}
                                userRole={userRole}
                                userId={userId}
                                onDone={refreshAssignedAfterUnassign}
                                onError={(msg) => setRowError(msg)}
                              />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationButtons
                page={assignedPage}
                totalPages={tabTotalPages(assignedTotal)}
                total={assignedTotal}
                onPageChange={(page) => changeTabPage("assigned", page)}
              />
            </div>
          )}
        </div>

        {/* WASTAGE */}
        <div className="bg-neutral-950 border border-red-900/50 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm flex items-center gap-2">
                Wastage
                {wastedTotal > 0 && (
                  <Badge
                    variant="outline"
                    className="text-red-400 border-red-700"
                  >
                    {wastedTotal}
                  </Badge>
                )}
              </h2>
              <span className="text-sm font-bold text-red-400 font-mono">
                {totalWasted.toFixed(1)} cr
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Marked as not useful — Unassign within 60 s to put back in the
              unassigned pool.
              {selectedAccount ? ` · ${selectedAccount.label}` : ""}
            </p>
          </div>
          {wastedTotal === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>No wastage yet.</p>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden max-h-[90vh]">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-neutral-800">
                    {groupedWasted.map((group) => (
                      <Fragment key={group.label}>
                        <tr className="bg-neutral-950/95">
                          <td
                            colSpan={4}
                            className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
                          >
                            {group.label}
                          </td>
                        </tr>
                        {group.items.map((g) => (
                          <tr
                            key={g.id}
                            className="bg-red-950/10 hover:bg-red-950/20"
                          >
                            <td className="px-2 py-2">
                              <a
                                href={hfAssetUrl(g.external_id)}
                                target="_blank"
                                rel="noreferrer"
                                title="Open in Higgsfield"
                                className="inline-block"
                              >
                                <MediaPreview
                                  url={g.result_url}
                                  mediaType={g.media_type}
                                  name={g.display_name}
                                />
                              </a>
                            </td>
                            <td className="px-2 py-2">
                              <a
                                href={hfAssetUrl(g.external_id)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-neutral-400 line-through hover:text-lime-300 hover:underline"
                                title="Open in Higgsfield"
                              >
                                {g.display_name}
                              </a>
                              <div className="text-xs text-neutral-600 mt-0.5 space-y-0.5">
                                <div>
                                  Marked{" "}
                                  {g.wasted_at
                                    ? new Date(g.wasted_at).toLocaleTimeString()
                                    : ""}
                                </div>
                                {g.work_id &&
                                  (() => {
                                    const w = g.work_id
                                      ? worksById.get(g.work_id)
                                      : null;
                                    if (!w) return null;
                                    return (
                                      <div>
                                        on{" "}
                                        <Link
                                          href={`/app/works/${w.id}`}
                                          className="text-red-400 hover:underline"
                                        >
                                          {workTitle(w)}
                                        </Link>
                                      </div>
                                    );
                                  })()}
                                {g.hf_connection_label && (
                                  <div>
                                    from{" "}
                                    <span className="text-red-400">
                                      {g.hf_connection_label}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <span className="font-bold text-red-400">
                                {parseFloat(g.credits) > 0
                                  ? parseFloat(g.credits).toFixed(1)
                                  : "free"}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <WastageButton
                                generationId={g.id}
                                wastedAt={g.wasted_at}
                                wastedBy={g.wasted_by}
                                userRole={userRole}
                                userId={userId}
                                onDone={refreshWastedAfterUnassign}
                                onError={(msg) => setRowError(msg)}
                              />
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationButtons
                page={wastedPage}
                totalPages={tabTotalPages(wastedTotal)}
                total={wastedTotal}
                onPageChange={(page) => changeTabPage("wasted", page)}
              />
            </div>
          )}
        </div>
      </div>

      {/* IRRELEVANT — practice / past / failed work that counts nowhere */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden opacity-90">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-neutral-300 text-sm flex items-center gap-2">
              R&amp;D
              {irrelevantTotal > 0 && (
                <Badge
                  variant="outline"
                  className="text-neutral-400 border-neutral-700"
                >
                  {irrelevantTotal}
                </Badge>
              )}
            </h2>
            <span className="text-xs font-bold text-neutral-500 font-mono">
              {totalIrrelevant.toFixed(1)} cr
            </span>
          </div>
          <p className="text-xs text-neutral-600">
            R&amp;D / practice / past / failed work. Excluded from credits &amp;
            reports. Unmark to put back in the unassigned pool.
          </p>
        </div>
        {irrelevantTotal === 0 ? (
          <div className="p-6 text-center text-neutral-600 text-sm">
            <p>Nothing marked as R&amp;D.</p>
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-neutral-800">
                  {groupedIrrelevant.map((group) => (
                    <Fragment key={group.label}>
                      <tr className="bg-neutral-950/95">
                        <td
                          colSpan={4}
                          className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
                        >
                          {group.label}
                        </td>
                      </tr>
                      {group.items.map((g) => {
                        const busy = rowBusy[g.id] || null;
                        return (
                          <tr
                            key={g.id}
                            className="hover:bg-neutral-900/40 opacity-70"
                          >
                            <td className="px-2 py-2 w-36 2xl:w-44">
                              <a
                                href={hfAssetUrl(g.external_id)}
                                target="_blank"
                                rel="noreferrer"
                                title="Open in Higgsfield"
                                className="inline-block"
                              >
                                <MediaPreview
                                  url={g.result_url}
                                  mediaType={g.media_type}
                                  name={g.display_name}
                                />
                              </a>
                            </td>
                            <td className="px-2 py-2">
                              <a
                                href={hfAssetUrl(g.external_id)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-neutral-400 hover:text-lime-300 hover:underline"
                                title="Open in Higgsfield"
                              >
                                {g.display_name}
                              </a>
                              {g.hf_connection_label && (
                                <div className="text-neutral-600 text-xs mt-0.5">
                                  from {g.hf_connection_label}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right w-20">
                              <span className="font-bold text-neutral-500">
                                {parseFloat(g.credits) > 0
                                  ? parseFloat(g.credits).toFixed(1)
                                  : "free"}
                              </span>
                            </td>
                            <td className="px-2 py-2 w-24 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUnmarkIrrelevant(g)}
                                disabled={busy !== null}
                                className="h-7 text-xs px-2 text-neutral-300 border-neutral-700 hover:bg-neutral-900"
                                title="Put back in the unassigned pool"
                              >
                                {busy === "irrelevant" ? "…" : "Unmark"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationButtons
              page={irrelevantPage}
              totalPages={tabTotalPages(irrelevantTotal)}
              total={irrelevantTotal}
              onPageChange={(page) => changeTabPage("irrelevant", page)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
