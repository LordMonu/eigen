"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
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
} from "@/app/app/works/[id]/assign-tables";
import {
  PaginationButtons,
  paginate,
} from "@/components/ui/pagination-buttons";
import { RefreshCw } from "lucide-react";
import {
  isCooldownActive,
  markSynced,
  getCooldownRemaining,
} from "@/lib/sync-cooldown";

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

interface RowChoice {
  clientFilter: string;
  workId: string;
}

export default function SyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [clients, setClients] = useState<Client[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [unassigned, setUnassigned] = useState<Generation[]>([]);
  const [assigned, setAssigned] = useState<Generation[]>([]);
  const [wasted, setWasted] = useState<Generation[]>([]);
  const [rowChoices, setRowChoices] = useState<Record<string, RowChoice>>({});
  const [rowBusy, setRowBusy] = useState<
    Record<string, "assign" | "waste" | "irrelevant" | null>
  >({});
  const [rowError, setRowError] = useState<string | null>(null);

  const [userRole, setUserRole] = useState<"master" | "manager" | "creator">(
    "creator",
  );
  const [userId, setUserId] = useState<string>("");
  const [accessibleAccounts, setAccessibleAccounts] = useState<
    AccessibleAccount[]
  >([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [unassignedPage, setUnassignedPage] = useState(1);
  const [assignedPage, setAssignedPage] = useState(1);
  const [wastedPage, setWastedPage] = useState(1);

  const [, startTransition] = useTransition();
  const [supabase] = useState(() => createClient());

  const selectedAccount = accessibleAccounts.find(
    (a) => a.id === selectedAccountId,
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
    setUserRole(membership.role as "master" | "manager" | "creator");

    let accs: AccessibleAccount[] = [];
    if (membership.role === "master" || membership.role === "manager") {
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

  const loadData = useCallback(async () => {
    const accountLabel = selectedAccount?.label;
    const [{ data: clientData }, { data: workData }, { data: gens }] =
      await Promise.all([
        supabase.from("clients").select("id, name, industry").order("name"),
        supabase
          .from("works")
          .select("id, title, video_type, client_id, status")
          .order("created_at", { ascending: false }),
        (() => {
          let q = supabase
            .from("generations")
            .select(
              "id, external_id, display_name, job_set_type, result_url, media_type, prompt, credits, hf_created_at, client_id, work_id, assigned_at, assigned_by, is_waste, is_irrelevant, wasted_at, wasted_by, hf_connection_label",
            )
            .order("hf_created_at", { ascending: false })
            .limit(5000);
          if (accountLabel) {
            q = q.eq("hf_connection_label", accountLabel);
          }
          return q;
        })(),
      ]);

    setClients(clientData || []);
    setWorks((workData || []) as Work[]);
    const all = (gens || []) as Generation[];
    setUnassigned(all.filter((g) => !g.client_id && !g.is_irrelevant));
    setAssigned(all.filter((g) => g.client_id && !g.is_waste && !g.is_irrelevant));
    setWasted(all.filter((g) => g.is_waste && !g.is_irrelevant));
    setUnassignedPage(1);
    setAssignedPage(1);
    setWastedPage(1);
  }, [supabase, selectedAccount?.label]);

  useEffect(() => {
    async function init() {
      await loadAccountAccess();
    }
    init();
  }, [loadAccountAccess]);

  useEffect(() => {
    if (selectedAccountId) {
      loadData();
    }
  }, [selectedAccountId, loadData]);

  async function syncSelectedAccount(force = false) {
    if (!selectedAccountId) return;
    if (!force && isCooldownActive(selectedAccountId)) return;

    setSyncing(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/hf-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: selectedAccountId }),
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
      await loadData();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSync() {
    if (!selectedAccountId) return;
    if (isCooldownActive(selectedAccountId)) {
      await loadData();
      return;
    }
    await syncSelectedAccount();
  }

  function setRow(id: string, patch: Partial<RowChoice>) {
    setRowChoices((prev) => {
      const cur = prev[id] || { clientFilter: "", workId: "" };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }

  function rowOf(id: string): RowChoice {
    return rowChoices[id] || { clientFilter: "", workId: "" };
  }

  function worksFor(clientFilter: string): Work[] {
    return clientFilter
      ? works.filter((w) => w.client_id === clientFilter)
      : works;
  }

  async function handleRowAction(gen: Generation, mode: "assign" | "waste" | "irrelevant") {
    setRowError(null);

    if (mode === "irrelevant") {
      setRowBusy((prev) => ({ ...prev, [gen.id]: mode }));
      try {
        const res = await fetch(`/api/generations/${gen.id}/irrelevant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_irrelevant: true }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setRowError(`Failed: ${d?.error || res.statusText}`);
          return;
        }
        startTransition(() => {
          loadData();
        });
      } catch (err) {
        setRowError(err instanceof Error ? err.message : "Action failed");
      } finally {
        setRowBusy((prev) => ({ ...prev, [gen.id]: null }));
      }
      return;
    }

    const choice = rowOf(gen.id);
    if (!choice.workId) {
      setRowError("Pick a work first.");
      return;
    }
    const work = works.find((w) => w.id === choice.workId);
    if (!work) {
      setRowError("Selected work not found — refresh.");
      return;
    }
    setRowBusy((prev) => ({ ...prev, [gen.id]: mode }));

    try {
      const assignRes = await fetch(`/api/works/${work.id}/assign-generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId: gen.id,
          clientId: work.client_id,
        }),
      });
      if (!assignRes.ok) {
        const d = await assignRes.json().catch(() => ({}));
        setRowError(`Assign failed: ${d?.error || assignRes.statusText}`);
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
          setRowError(`Wastage failed: ${d?.error || wasteRes.statusText}`);
          return;
        }
      }

      startTransition(() => {
        loadData();
      });
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setRowBusy((prev) => ({ ...prev, [gen.id]: null }));
    }
  }

  const totalUnassigned = unassigned.reduce(
    (s, g) => s + parseFloat(g.credits || "0"),
    0,
  );
  const totalAssigned = assigned.reduce(
    (s, g) => s + parseFloat(g.credits || "0"),
    0,
  );
  const totalWasted = wasted.reduce(
    (s, g) => s + parseFloat(g.credits || "0"),
    0,
  );

  const uPag = paginate(unassigned, unassignedPage);
  const aPag = paginate(assigned, assignedPage);
  const wPag = paginate(wasted, wastedPage);

  const clientNameMap: Record<string, string> = {};
  clients.forEach((c) => {
    clientNameMap[c.id] = c.name;
  });
  const workTitle = (w: Work) => w.title || w.video_type || "Untitled";

  function refresh() {
    startTransition(() => {
      loadData();
    });
  }

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sync &amp; Assign</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Pull Higgsfield generations and attribute them to a work.
          </p>
        </div>
        <Button
          onClick={handleSync}
          disabled={syncing || accessibleAccounts.length === 0}
          className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
        >
          {syncing ? "Syncing…" : "⟳ Sync from Higgsfield"}
        </Button>
      </div>

      {/* ACCESSIBLE ACCOUNTS BANNER */}
      {accessibleAccounts.length > 0 ? (
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 mb-1.5">
            Syncing from {accessibleAccounts.length} Higgsfield account
            {accessibleAccounts.length === 1 ? "" : "s"} you have access to:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {accessibleAccounts.map((acc) => (
              <span
                key={acc.id}
                className="text-xs px-2 py-1 rounded border border-lime-800 bg-lime-950/30 text-lime-300"
                title={acc.hf_email || ""}
              >
                {acc.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
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
              You don&apos;t have access to any Higgsfield account yet. Ask your
              admin to grant you access from the Users page.
            </>
          )}
        </div>
      )}

      {syncMessage && (
        <div className="bg-green-950/50 border border-green-800 text-green-300 px-4 py-2 rounded text-sm">
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
          <p className="text-neutral-400 text-xs uppercase">Unassigned</p>
          <p className="text-2xl font-bold text-yellow-400 mt-1">
            {totalUnassigned.toFixed(1)}
          </p>
          <p className="text-neutral-500 text-xs mt-1">
            {unassigned.length} generations
          </p>
        </div>
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
          <p className="text-neutral-400 text-xs uppercase">Assigned</p>
          <p className="text-2xl font-bold text-green-400 mt-1">
            {totalAssigned.toFixed(1)}
          </p>
          <p className="text-neutral-500 text-xs mt-1">
            {assigned.length} generations
          </p>
        </div>
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
          <p className="text-neutral-400 text-xs uppercase">Wastage</p>
          <p className="text-2xl font-bold text-red-400 mt-1">
            {totalWasted.toFixed(1)}
          </p>
          <p className="text-neutral-500 text-xs mt-1">
            {wasted.length} generations
          </p>
        </div>
      </div>

      {/* UNASSIGNED — per-row client filter + required work + buttons */}
      <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Unassigned Generations</h2>
            <span className="text-sm font-bold text-yellow-400 font-mono">
              {totalUnassigned.toFixed(1)} cr
            </span>
          </div>
          <Badge
            variant="outline"
            className="text-yellow-400 border-yellow-700"
          >
            {unassigned.length} pending
          </Badge>
        </div>

        {/* ACCOUNT FILTER */}
        {accessibleAccounts.length > 0 && (
          <div className="px-4 py-2 border-b border-neutral-800 bg-neutral-900/50 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-neutral-500">Account:</span>
            {accessibleAccounts.map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => {
                  setSelectedAccountId(acc.id);
                  setUnassignedPage(1);
                }}
                className={`text-xs px-2 py-1 rounded transition-colors ${
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
              onClick={() => syncSelectedAccount(true)}
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
          </div>
        )}

        {unassigned.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No unassigned generations.</p>
            <p className="text-sm mt-1">Click Sync to load your history.</p>
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 text-neutral-400 w-20">
                      Preview
                    </th>
                    <th className="text-left px-3 py-2 text-neutral-400">
                      Model
                    </th>
                    <th className="text-right px-3 py-2 text-neutral-400 w-20">
                      Credits
                    </th>
                    <th className="text-left px-3 py-2 text-neutral-400 w-40">
                      Client
                    </th>
                    <th className="text-left px-3 py-2 text-neutral-400 w-56">
                      Work *
                    </th>
                    <th className="text-right px-3 py-2 text-neutral-400 w-44">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {uPag.slice.map((gen) => {
                    const choice = rowOf(gen.id);
                    const busy = rowBusy[gen.id] || null;
                    const visibleWorks = worksFor(choice.clientFilter);
                    return (
                      <tr key={gen.id} className="hover:bg-neutral-900/40">
                        <td className="px-3 py-2">
                          <MediaPreview
                            url={gen.result_url}
                            mediaType={gen.media_type}
                            name={gen.display_name}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-white text-xs">
                            {gen.display_name}
                          </div>
                          {gen.hf_connection_label && (
                            <div className="text-lime-400 text-xs mt-0.5 font-medium">
                              {gen.hf_connection_label}
                            </div>
                          )}
                          {gen.prompt && (
                            <div className="text-neutral-500 text-xs mt-0.5 line-clamp-2 max-w-[200px]">
                              {gen.prompt}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span
                            className={`font-bold text-sm ${
                              parseFloat(gen.credits) > 0
                                ? "text-orange-400"
                                : "text-neutral-500"
                            }`}
                          >
                            {parseFloat(gen.credits) > 0
                              ? parseFloat(gen.credits).toFixed(1)
                              : "free"}
                          </span>
                        </td>
                        {/* CLIENT FILTER */}
                        <td className="px-3 py-2">
                          <Select
                            value={choice.clientFilter || "__all"}
                            onValueChange={(v) => {
                              const val = v as string;
                              setRow(gen.id, {
                                clientFilter: val === "__all" ? "" : val,
                                workId: "",
                              });
                            }}
                            disabled={busy !== null}
                          >
                            <SelectTrigger className="w-36 h-7 text-xs bg-neutral-900 border-neutral-700">
                              <SelectValue>
                                {(v) => {
                                  const val = v as string | null;
                                  if (!val || val === "__all")
                                    return "All clients";
                                  return clientNameMap[val] || val;
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__all" className="text-xs">
                                All clients
                              </SelectItem>
                              {clients.map((c) => (
                                <SelectItem
                                  key={c.id}
                                  value={c.id}
                                  className="text-xs"
                                >
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        {/* WORK SELECT (required) */}
                        <td className="px-3 py-2">
                          <Select
                            value={choice.workId}
                            onValueChange={(v) =>
                              setRow(gen.id, { workId: v as string })
                            }
                            disabled={busy !== null}
                          >
                            <SelectTrigger className="w-52 h-7 text-xs bg-neutral-900 border-neutral-700">
                              <SelectValue placeholder="Pick a work…">
                                {(v) => {
                                  const val = v as string | null;
                                  if (!val) return "Pick a work…";
                                  const w = works.find((x) => x.id === val);
                                  if (!w) return "Pick a work…";
                                  const cn =
                                    clientNameMap[w.client_id] || "Unknown";
                                  return `${workTitle(w)} · ${cn}`;
                                }}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {visibleWorks.length === 0 ? (
                                <div className="px-2 py-1.5 text-xs text-neutral-500">
                                  {works.length === 0
                                    ? "No works yet — create one from a Client."
                                    : "No works for this client."}
                                </div>
                              ) : (
                                visibleWorks.map((w) => (
                                  <SelectItem
                                    key={w.id}
                                    value={w.id}
                                    className="text-xs"
                                  >
                                    <span className="truncate">
                                      {workTitle(w)}
                                    </span>
                                    <span className="text-neutral-500 ml-2">
                                      ·{" "}
                                      {clientNameMap[w.client_id] || "Unknown"}
                                    </span>
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRowAction(gen, "irrelevant")}
                              disabled={busy !== null}
                              className="h-7 text-xs px-2 text-neutral-400 border-neutral-700 hover:bg-neutral-900"
                              title="Mark as irrelevant (practice/past work)"
                            >
                              {busy === "irrelevant" ? "…" : "Irrelevant"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRowAction(gen, "waste")}
                              disabled={busy !== null || !choice.workId}
                              className="h-7 text-xs px-2 text-yellow-400 border-yellow-700 hover:bg-yellow-950"
                            >
                              {busy === "waste" ? "…" : "Wastage"}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleRowAction(gen, "assign")}
                              disabled={busy !== null || !choice.workId}
                              className="h-7 text-xs px-2 bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                            >
                              {busy === "assign" ? "…" : "Actual usage"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationButtons
              page={uPag.page}
              totalPages={uPag.totalPages}
              total={uPag.total}
              onPageChange={setUnassignedPage}
            />
          </div>
        )}
      </div>

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
              {assigned.length} generation{assigned.length === 1 ? "" : "s"}
              {selectedAccount ? ` · ${selectedAccount.label}` : ""}
            </p>
          </div>
          {assigned.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>Nothing assigned yet.</p>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden max-h-[90vh]">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-neutral-800">
                    {aPag.slice.map((g) => (
                      <tr key={g.id} className="hover:bg-neutral-900/60">
                        <td className="px-2 py-2">
                          <MediaPreview
                            url={g.result_url}
                            mediaType={g.media_type}
                            name={g.display_name}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-white">
                            {g.display_name}
                          </div>
                          <div className="text-neutral-500 text-xs mt-0.5 space-y-0.5">
                            {g.work_id &&
                              (() => {
                                const w = works.find((x) => x.id === g.work_id);
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
                                    {clientNameMap[w.client_id] || "Unknown"}
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
                            onDone={refresh}
                            onError={(msg) => setRowError(msg)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationButtons
                page={aPag.page}
                totalPages={aPag.totalPages}
                total={aPag.total}
                onPageChange={setAssignedPage}
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
                {totalWasted.toFixed(1)} cr
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Marked as not useful — Unassign within 60 s to put back in the
              unassigned pool.
              {selectedAccount ? ` · ${selectedAccount.label}` : ""}
            </p>
          </div>
          {wasted.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>No wastage yet.</p>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden max-h-[90vh]">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-neutral-800">
                    {wPag.slice.map((g) => (
                      <tr
                        key={g.id}
                        className="bg-red-950/10 hover:bg-red-950/20"
                      >
                        <td className="px-2 py-2">
                          <MediaPreview
                            url={g.result_url}
                            mediaType={g.media_type}
                            name={g.display_name}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-neutral-400 line-through">
                            {g.display_name}
                          </div>
                          <div className="text-xs text-neutral-600 mt-0.5 space-y-0.5">
                            <div>
                              Marked{" "}
                              {g.wasted_at
                                ? new Date(g.wasted_at).toLocaleTimeString()
                                : ""}
                            </div>
                            {g.work_id &&
                              (() => {
                                const w = works.find((x) => x.id === g.work_id);
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
                            onDone={refresh}
                            onError={(msg) => setRowError(msg)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationButtons
                page={wPag.page}
                totalPages={wPag.totalPages}
                total={wPag.total}
                onPageChange={setWastedPage}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
