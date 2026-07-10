"use client";

import { Button } from "@/components/ui/button";
import { Check, RefreshCw, X } from "lucide-react";
import { MediaPreview } from "./assign-tables";
import { UnassignedGenerationsSkeleton } from "@/components/app/sync/unassigned-generations-skeleton";
import type { Role } from "@/lib/roles";

export interface UnassignedGeneration {
  id: string;
  external_id: string;
  display_name: string;
  result_url: string;
  media_type: string;
  credits: string;
  hf_created_at: string;
  hf_connection_label: string | null;
}

export interface Account {
  id: string;
  label: string;
}

export interface CreatorStat {
  userId: string;
  name: string;
  actual: number;
  wastage: number;
  rework: number;
}

export interface MediaPreviewProps {
  url: string;
  mediaType: string;
  name: string;
  className?: string;
}

type Props = {
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
  selectedIds: Set<string>;
  selectedAccountId: string;
  accounts: Account[];
  unassignedCredits: number;
  syncMessage: string | null;
  syncError: string | null;
  syncing: boolean;
  isPending: boolean;
  loadingUnassigned: boolean;
  loadingMoreUnassigned: boolean;
  hasMoreUnassigned: boolean;
  unassigned: UnassignedGeneration[];
  unassignedTotal: number;
  groupedUnassigned: { label: string; items: UnassignedGeneration[] }[];
  allVisibleSelected: boolean;
  toggleSelectAllVisible: () => void;
  toggleSelectDay: (items: UnassignedGeneration[]) => void;
  toggleSelect: (genId: string) => void;
  onAccountChange: (accountId: string) => void;
  onRefresh: () => void;
  onFullResync: () => void;
  onCancel: () => void;
  onOpenDestination: () => void;
  onLoadMore: () => void;
  loadPickerStats: () => Promise<void>;
  loadPickerPage: (
    page: number,
    options?: { append?: boolean; silent?: boolean },
  ) => Promise<void>;
  syncAccount: (force?: boolean, full?: boolean) => Promise<void>;
  selectedAccountLabel?: string;
  cooldownLeft: number;
  batchBusy: null | "actual" | "waste" | "irrelevant";
  batchError: string | null;
  destOpen: boolean;
  setDestOpen: (open: boolean) => void;
  destClientId: string;
  setDestClientId: (value: string) => void;
  destWorkId: string;
  setDestWorkId: (value: string) => void;
  selClients: { id: string; name: string }[];
  selWorks: { id: string; title: string | null }[];
  loadingSel: boolean;
  selectedIdCount: number;
  onRunBatch: (mode: "actual" | "waste" | "irrelevant") => void;
  onDestClose: () => void;
  userRole: Role;
};

function hfAssetUrl(externalId: string) {
  return `https://higgsfield.ai/asset/all/${externalId}`;
}

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

export function SyncPickerModal({
  pickerOpen,
  setPickerOpen,
  selectedIds,
  selectedAccountId,
  accounts,
  unassignedCredits,
  syncMessage,
  syncError,
  syncing,
  isPending,
  loadingUnassigned,
  loadingMoreUnassigned,
  hasMoreUnassigned,
  unassigned,
  unassignedTotal,
  groupedUnassigned,
  allVisibleSelected,
  toggleSelectAllVisible,
  toggleSelectDay,
  toggleSelect,
  onAccountChange,
  onRefresh,
  onFullResync,
  onCancel,
  onOpenDestination,
  onLoadMore,
  loadPickerStats,
  loadPickerPage,
  syncAccount,
  cooldownLeft,
  destOpen,
  batchBusy,
  batchError,
  destClientId,
  setDestClientId,
  destWorkId,
  setDestWorkId,
  selClients,
  selWorks,
  loadingSel,
  selectedIdCount,
  onRunBatch,
  onDestClose,
}: Props) {
  return (
    <>
      {/* MODAL A — picker */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !isPending && !syncing && setPickerOpen(false)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg w-[95vw] max-w-[95vw] max-h-[95vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
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
                        onClick={() => onAccountChange(acc.id)}
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
                      onClick={onFullResync}
                      disabled={syncing}
                      className="text-xs text-neutral-400 hover:text-neutral-200 disabled:text-neutral-600"
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
                  onClick={onCancel}
                  disabled={syncing || isPending}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={onOpenDestination}
                  disabled={selectedIds.size === 0 || syncing || isPending}
                  className="h-8 text-xs bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                >
                  Assign ({selectedIds.size})
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto">
                {syncError ? (
                  <div className="p-4">
                    <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-3 rounded text-sm flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium mb-0.5">Sync failed</div>
                        <div className="text-xs opacity-90">{syncError}</div>
                      </div>
                    </div>
                  </div>
                ) : loadingUnassigned ? (
                  <UnassignedGenerationsSkeleton rows={3} cardsPerRow={2} />
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
                          Syncing from Higgsfield — new items will appear shortly…
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
                      onClick={onLoadMore}
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
          onClick={onDestClose}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg max-w-md w-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white text-sm">
                  Assign {selectedIdCount} generation
                  {selectedIdCount === 1 ? "" : "s"}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Pick the destination client, then mark as actual usage or wastage.
                </p>
              </div>
              <button
                type="button"
                onClick={onDestClose}
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
                onClick={() => onRunBatch("irrelevant")}
                disabled={
                  batchBusy !== null || isPending || selectedIdCount === 0
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
                onClick={() => onRunBatch("waste")}
                disabled={
                  batchBusy !== null || isPending || selectedIdCount === 0
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
                onClick={() => onRunBatch("actual")}
                disabled={
                  batchBusy !== null || isPending || selectedIdCount === 0
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
