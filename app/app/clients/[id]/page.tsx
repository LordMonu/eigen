// app/app/clients/[id]/page.tsx — client detail.
// Back link renders instantly; content streams via Suspense.
// Uses client_credit_summary + client_works_with_credit_totals +
// client_work_user_breakdown RPCs to skip pulling every generations row
// just to aggregate credits client-side.
import { Suspense } from "react";
import { requireActiveMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase-server";
import { can } from "@/lib/rbac";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from "@/lib/client-helpers";
import {
  WORK_STATUSES,
  WORK_STATUS_COLORS,
  WORK_STATUS_LABELS,
  type WorkStatus,
} from "@/lib/work-helpers";
import { StatusDropdown } from "./status-dropdown";
import { WorkStatusFilter } from "./work-status-filter";
import { EditClientButton } from "./edit-client-button";
import { DeleteClientButton } from "./delete-client-button";
import { CreateWorkButton } from "./create-work-button";
import { ClientGenerationsTables } from "./client-generations-tables";
import { ClientTimeFilter, type ClientRange } from "./client-time-filter";
import {
  WorkUserReport,
  type WorkReportRow,
  type WorkUserStat,
} from "./work-user-report";
import { ActivityLog } from "@/components/ui/activity-log";

const WORK_ALLOWED_STATUSES: ClientStatus[] = ["trial", "ongoing", "in_talk"];
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
// Cap on rows passed to ClientGenerationsTables (paginates client-side @ 50/page).
// 500 = 10 pages of history. Aggregates come from RPCs so they stay accurate.
const GENERATIONS_DISPLAY_LIMIT = 500;

const RANGE_DAYS: Record<ClientRange, number | null> = {
  all: null,
  week: 7,
  month: 30,
  year: 365,
};
const RANGE_LABEL: Record<ClientRange, string> = {
  all: "All time",
  week: "Last 7 days",
  month: "Last 30 days",
  year: "Last 365 days",
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; wstatus?: string }>;
}

interface ClientWorkRpcRow {
  id: string;
  title: string | null;
  video_type: string | null;
  status: string;
  end_date: string | null;
  max_credits: string | null;
  creator_id: string;
  credit_sum: string | number;
  created_at: string;
}

interface ClientSummaryRpcRow {
  total_credits: string | number;
  generation_count: string | number;
}

interface WorkUserBreakdownRpcRow {
  work_id: string;
  assigned_by: string;
  actual_credits: string | number;
  wastage_credits: string | number;
  rework_credits: string | number;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const rawRange = (sp.range as ClientRange | undefined) || "all";
  const range: ClientRange = (
    ["all", "week", "month", "year"] as const
  ).includes(rawRange as ClientRange)
    ? (rawRange as ClientRange)
    : "all";
  const wstatus: WorkStatus | "all" = WORK_STATUSES.includes(
    sp.wstatus as WorkStatus,
  )
    ? (sp.wstatus as WorkStatus)
    : "all";

  return (
    <div className="p-6 max-w-5xl mx-auto text-neutral-100">
      <Link
        href="/app/clients"
        className="text-neutral-400 hover:text-white text-sm inline-flex items-center gap-1 mb-4"
      >
        ← Back to Clients
      </Link>
      <Suspense fallback={<ClientDetailSkeleton />}>
        <ClientDetailContent id={id} range={range} workStatusFilter={wstatus} />
      </Suspense>
    </div>
  );
}

async function ClientDetailContent({
  id,
  range,
  workStatusFilter,
}: {
  id: string;
  range: ClientRange;
  workStatusFilter: WorkStatus | "all";
}) {
  const supabase = await createClient();

  const daysBack = RANGE_DAYS[range];
  const fromIso =
    daysBack === null
      ? null
      : new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  // WAVE 1 — auth + client fetch in parallel. RLS validates the JWT
  // from cookies independently, so the client query works while auth resolves.
  const [membership, { data: client }] = await Promise.all([
    requireActiveMembership(),
    supabase
      .from("clients")
      .select("id, name, industry, status, deleted_at, is_default")
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!client) notFound();

  // WAVE 2 — ALL remaining queries in parallel, including memberships.
  // Fetching all org memberships (RLS-scoped) avoids a 3rd wave to
  // resolve user IDs derived from this wave's results.
  const [
    { data: summaryRows },
    { data: workRows, error: worksRpcError },
    { data: breakdownRows },
    { data: generations },
    { data: clientWorkCreators },
    { data: allMembers },
    { data: hfConns },
    { data: activityLogEntries },
  ] = await Promise.all([
    supabase.rpc("client_credit_summary", {
      p_client_id: id,
      p_from_date: fromIso,
    }),
    supabase.rpc("client_works_with_credit_totals", {
      p_client_id: id,
      p_from_date: fromIso,
    }),
    supabase.rpc("client_work_user_breakdown", {
      p_client_id: id,
      p_from_date: fromIso,
    }),
    (() => {
      let q = supabase
        .from("generations")
        .select(
          "id, display_name, result_url, media_type, credits, hf_created_at, work_id, assigned_at, assigned_by, is_waste, is_irrelevant, wasted_at, wasted_by, hf_connection_label",
        )
        .eq("client_id", id)
        .order("hf_created_at", { ascending: false })
        .limit(GENERATIONS_DISPLAY_LIMIT);
      if (fromIso) q = q.gte("hf_created_at", fromIso);
      return q;
    })(),
    supabase
      .from("work_creators")
      .select("work_id, user_id, added_at, works!inner(client_id)")
      .eq("works.client_id", id)
      .order("added_at", { ascending: true }),
    supabase.from("memberships").select("user_id, full_name"),
    supabase
      .from("hf_connections")
      .select("id, label")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("activity_log")
      .select("id, action, from_value, to_value, actor_name, created_at")
      .eq("entity_type", "client")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (worksRpcError) {
    console.error(
      "[clients/[id]] client_works_with_credit_totals RPC failed:",
      worksRpcError.message,
    );
  }

  // Unwrap RPC totals.
  const summary = ((summaryRows as ClientSummaryRpcRow[] | null) || [])[0] ?? {
    total_credits: 0,
    generation_count: 0,
  };
  const totalCredits =
    typeof summary.total_credits === "number"
      ? summary.total_credits
      : parseFloat(String(summary.total_credits) || "0");
  const summaryGenerationCount =
    typeof summary.generation_count === "number"
      ? summary.generation_count
      : parseInt(String(summary.generation_count) || "0", 10);

  const worksFromRpc = (workRows as ClientWorkRpcRow[] | null) || [];
  const breakdown = (breakdownRows as WorkUserBreakdownRpcRow[] | null) || [];

  // creditByWork from the RPC (no JS reduce loop over generations).
  const creditByWork = new Map<string, number>();
  worksFromRpc.forEach((w) => {
    creditByWork.set(
      w.id,
      typeof w.credit_sum === "number"
        ? w.credit_sum
        : parseFloat(String(w.credit_sum) || "0"),
    );
  });

  // perWorkPerUser map from the RPC.
  const perWorkPerUser = new Map<
    string,
    Map<string, { actual: number; wastage: number; rework: number }>
  >();
  breakdown.forEach((row) => {
    let users = perWorkPerUser.get(row.work_id);
    if (!users) {
      users = new Map();
      perWorkPerUser.set(row.work_id, users);
    }
    users.set(row.assigned_by, {
      actual:
        typeof row.actual_credits === "number"
          ? row.actual_credits
          : parseFloat(String(row.actual_credits) || "0"),
      wastage:
        typeof row.wastage_credits === "number"
          ? row.wastage_credits
          : parseFloat(String(row.wastage_credits) || "0"),
      rework:
        typeof row.rework_credits === "number"
          ? row.rework_credits
          : parseFloat(String(row.rework_credits) || "0"),
    });
  });

  const userNameMap = new Map(
    (allMembers || []).map((u) => [u.user_id, u.full_name]),
  );

  const accounts = ((hfConns as { id: string; label: string }[]) || []).map((c) => ({ id: c.id, label: c.label }));

  // Build the WorkUserReport rows.
  const reportRows: WorkReportRow[] = worksFromRpc.map((w) => {
    const userMap = perWorkPerUser.get(w.id) || new Map();
    const stats: WorkUserStat[] = Array.from(userMap.entries())
      .map(([userId, b]) => ({
        userId,
        name: userNameMap.get(userId) || "Unknown",
        actual: b.actual,
        wastage: b.wastage,
        rework: b.rework,
      }))
      .sort(
        (a, b) =>
          b.actual + b.wastage + b.rework - (a.actual + a.wastage + a.rework),
      );
    return {
      workId: w.id,
      title: w.title || w.video_type || "Untitled work",
      status: w.status as WorkStatus,
      stats,
    };
  });

  const workTitles: Record<string, string> = {};
  worksFromRpc.forEach((w) => {
    workTitles[w.id] = w.title || w.video_type || "Untitled work";
  });

  const additionalCreatorsByWork = new Map<string, string[]>();
  (clientWorkCreators || []).forEach((wc) => {
    const arr = additionalCreatorsByWork.get(wc.work_id) || [];
    arr.push(wc.user_id);
    additionalCreatorsByWork.set(wc.work_id, arr);
  });
  const creatorIdsByWork = new Map<string, string[]>();
  worksFromRpc.forEach((w) => {
    const fromJoin = additionalCreatorsByWork.get(w.id) || [];
    const others = fromJoin.filter((uid) => uid !== w.creator_id);
    creatorIdsByWork.set(w.id, [w.creator_id, ...others]);
  });

  const isArchived = !!client.deleted_at;
  const status = client.status as ClientStatus;
  const canEdit = !isArchived && can(membership.role, "clients", "edit");
  const canDelete = !isArchived && can(membership.role, "clients", "delete");
  const canCreateWork = !isArchived && can(membership.role, "works", "create");
  const isWorkAllowedStatus = WORK_ALLOWED_STATUSES.includes(status);
  const showCreateWork = canCreateWork && isWorkAllowedStatus;

  const visibleWorks =
    workStatusFilter === "all"
      ? worksFromRpc
      : worksFromRpc.filter((w) => w.status === workStatusFilter);

  return (
    <>
      {isArchived && (
        <div className="bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3 mb-4 flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded border bg-neutral-800 text-neutral-400 border-neutral-700">
            Archived
          </span>
          <span className="text-sm text-neutral-400">
            This client has been archived. All data is read-only.
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className={`text-3xl font-bold ${isArchived ? 'text-neutral-500' : 'text-white'}`}>{client.name}</h1>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <StatusDropdown clientId={client.id} currentStatus={status} />
          ) : (
            <span
              className={`text-xs px-3 py-1 rounded border ${CLIENT_STATUS_COLORS[status]}`}
            >
              {CLIENT_STATUS_LABELS[status]}
            </span>
          )}
          {canEdit && (
            <EditClientButton
              client={{
                id: client.id,
                name: client.name,
                industry: client.industry,
                status,
              }}
            />
          )}
        </div>
      </div>
      <p className="text-neutral-400 mb-6">
        {client.industry || (
          <span className="text-neutral-600 italic">No industry set</span>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            Scope
          </div>
          <div className="text-sm text-white mt-0.5">{RANGE_LABEL[range]}</div>
        </div>
        <ClientTimeFilter current={range} />
      </div>

      <section className="bg-neutral-950 border border-neutral-800 rounded-lg p-6 mb-6">
        <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-400 mb-4">
          Credit usage · {RANGE_LABEL[range]}
        </h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-3xl font-bold text-white">
              {totalCredits.toFixed(1)}
            </div>
            <div className="text-sm text-neutral-500 mt-1">Total credits</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {summaryGenerationCount}
            </div>
            <div className="text-sm text-neutral-500 mt-1">Generations</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-white">
              {worksFromRpc.length}
            </div>
            <div className="text-sm text-neutral-500 mt-1">Works (total)</div>
          </div>
        </div>
      </section>

      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-white">Works</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {visibleWorks.length} of {worksFromRpc.length}{" "}
              {workStatusFilter === "all"
                ? "total"
                : WORK_STATUS_LABELS[workStatusFilter]}
            </p>
            {canCreateWork && !isWorkAllowedStatus && (
              <p className="text-xs text-neutral-500 mt-0.5">
                Move client to <span className="text-lime-400">Trial</span>,{" "}
                <span className="text-lime-400">Ongoing</span>, or{" "}
                <span className="text-lime-400">In Talks</span> to add a new
                work.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <WorkStatusFilter current={workStatusFilter} />
            {showCreateWork && (
              <CreateWorkButton
                clientId={client.id}
                clientName={client.name}
              />
            )}
          </div>
        </div>
        {worksFromRpc.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No works yet for this client.</p>
            {showCreateWork && (
              <p className="text-sm mt-1">
                Use + Create Work above to add one.
              </p>
            )}
            {canCreateWork && !isWorkAllowedStatus && (
              <p className="text-sm mt-1">
                Status is{" "}
                <span className="text-neutral-300">
                  {CLIENT_STATUS_LABELS[status]}
                </span>{" "}
                — works can only be added on Trial / Ongoing / In Talks
                clients.
              </p>
            )}
          </div>
        ) : visibleWorks.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>
              No works with status{" "}
              <span className="text-neutral-300">
                {WORK_STATUS_LABELS[workStatusFilter as WorkStatus]}
              </span>
              .
            </p>
            <p className="text-sm mt-1">
              {worksFromRpc.length} other work{worksFromRpc.length === 1 ? "" : "s"} on
              this client — clear the filter to see them.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {visibleWorks.map((w) => (
              <Link
                key={w.id}
                href={`/app/works/${w.id}`}
                className="block px-4 py-3 hover:bg-neutral-900/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-white">
                        {w.title || w.video_type || "Untitled work"}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${WORK_STATUS_COLORS[w.status as WorkStatus]}`}
                      >
                        {WORK_STATUS_LABELS[w.status as WorkStatus]}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {w.video_type && <span>{w.video_type} · </span>}
                      {(() => {
                        const ids = creatorIdsByWork.get(w.id) || [w.creator_id];
                        const names = ids.map(
                          (uid) => userNameMap.get(uid) || "Unknown",
                        );
                        const label =
                          names.length === 1
                            ? "Creator"
                            : `Creators (${names.length})`;
                        const display =
                          names.length <= 2
                            ? names.join(", ")
                            : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
                        return `${label}: ${display}`;
                      })()}
                      {w.end_date && (
                        <span>
                          {" "}
                          · Due{" "}
                          {new Date(w.end_date).toLocaleDateString("en-US")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-white">
                      {(creditByWork.get(w.id) || 0).toFixed(1)}
                      {w.max_credits && (
                        <span className="text-neutral-500 text-xs">
                          {" "}
                          / {w.max_credits}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500">
                      credits · {RANGE_LABEL[range]}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <WorkUserReport rows={reportRows} rangeLabel={RANGE_LABEL[range]} />

      <ClientGenerationsTables
        clientName={client.name}
        generations={(generations || []).map((g) => ({
          id: g.id,
          display_name: g.display_name,
          result_url: g.result_url,
          media_type: g.media_type,
          credits: g.credits,
          hf_created_at: g.hf_created_at,
          work_id: g.work_id,
          assigned_at: g.assigned_at,
          assigned_by: g.assigned_by,
          is_waste: g.is_waste,
          wasted_at: g.wasted_at,
          wasted_by: g.wasted_by,
          hf_connection_label: g.hf_connection_label,
        }))}
        workTitles={workTitles}
        userRole={membership.role as "master" | "manager" | "creator"}
        userId={membership.user_id}
        accounts={accounts}
      />

      {canDelete && (
        <section className="bg-red-950/30 border border-red-900 rounded-lg p-6">
          <h2 className="text-xs uppercase tracking-wider font-semibold text-red-400 mb-2">
            Danger zone
          </h2>
          <p className="text-neutral-400 text-sm mb-3">
            Archiving this client also archives all its works. All assigned
            credits and generations will remain allocated.
          </p>
          <DeleteClientButton clientId={client.id} clientName={client.name} isDefault={!!(client as { is_default?: boolean }).is_default} />
        </section>
      )}

      {/* ACTIVITY LOG */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mt-6">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white text-sm">Activity</h2>
        </div>
        <ActivityLog entries={(activityLogEntries || []) as { id: string; action: string; from_value: string | null; to_value: string | null; actor_name: string; created_at: string }[]} />
      </section>
    </>
  );
}

function ClientDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="h-9 w-48 rounded bg-neutral-900" />
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded bg-neutral-900" />
          <div className="h-8 w-8 rounded bg-neutral-900" />
        </div>
      </div>
      <div className="h-5 w-32 rounded bg-neutral-900" />
      <div className="h-32 rounded-lg bg-neutral-900" />
      <div className="h-64 rounded-lg bg-neutral-900" />
      <div className="h-48 rounded-lg bg-neutral-900" />
    </div>
  );
}
