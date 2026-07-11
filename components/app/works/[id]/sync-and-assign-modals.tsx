"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";
import { UnassignedGenerationsSkeleton } from "@/components/app/sync/unassigned-generations-skeleton";
import { UnassignedGenerationsGrid } from "@/components/app/sync/unassigned-generations-grid";
import { PreviewSizeControl } from "@/components/app/generations/preview-size-control";

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
  toggleSelectDay: (items: Array<{ id: string }>) => void;
  toggleSelect: (genId: string) => void;
  onAccountChange: (accountId: string) => void;
  onRefresh: () => void;
  onFullResync: () => void;
  onCancel: () => void;
  onOpenDestination: () => void;
  onLoadMore: () => void;
  cooldownLeft: number;
  previewSize: number;
  onPreviewSizeChange: (value: number) => void;
  batchBusy: null | "actual" | "waste" | "irrelevant";
  batchError: string | null;
  destOpen: boolean;
  destClientId: string;
  setDestClientId: (value: string) => void;
  destWorkId: string;
  setDestWorkId: (value: string) => void;
  onCreateClientShortcut: () => void;
  onCreateWorkShortcut: () => void;
  selClients: { id: string; name: string }[];
  selWorks: { id: string; title: string | null }[];
  loadingSel: boolean;
  selectedIdCount: number;
  onRunBatch: (mode: "actual" | "waste" | "irrelevant") => void;
  onDestClose: () => void;
};

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
  cooldownLeft,
  previewSize,
  onPreviewSizeChange,
  destOpen,
  batchBusy,
  batchError,
  destClientId,
  setDestClientId,
  destWorkId,
  setDestWorkId,
  onCreateClientShortcut,
  onCreateWorkShortcut,
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
            className="bg-neutral-950 border border-neutral-800 rounded-lg w-[95vw] max-w-[90vw] h-[85vh] flex flex-col"
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
                      onClick={onRefresh}
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
                    <span className="text-neutral-700 mx-1">·</span>
                    <PreviewSizeControl
                      value={previewSize}
                      onChange={onPreviewSizeChange}
                    />
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
                          Syncing from Higgsfield — new items will appear
                          shortly…
                        </span>
                      </div>
                    )}
                    <UnassignedGenerationsGrid
                      groups={groupedUnassigned}
                      selectedIds={selectedIds}
                      onToggleDay={toggleSelectDay}
                      onToggle={toggleSelect}
                      sectionClassName="px-4 py-3"
                      gridClassName="grid gap-1.5"
                      tileSize={previewSize}
                    />
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
                  Pick the destination client, then mark as actual usage or
                  wastage.
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
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "__create_client__") {
                      onCreateClientShortcut();
                      return;
                    }
                    setDestClientId(value);
                  }}
                  disabled={loadingSel || batchBusy !== null || isPending}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-neutral-500"
                >
                  <option value="__create_client__">+ Add new client</option>
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
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "__create_work__") {
                      onCreateWorkShortcut();
                      return;
                    }
                    setDestWorkId(value);
                  }}
                  disabled={loadingSel || batchBusy !== null || isPending}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white disabled:opacity-50 focus:outline-none focus:border-neutral-500"
                >
                  <option value="__create_work__">+ Add new work</option>
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
