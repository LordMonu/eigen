// app/app/works/[id]/page.tsx — work detail.
// Back link renders instantly; content streams via Suspense.
// Uses work_credit_total + work_creator_breakdown RPCs to skip the
// "pull every generation row to compute SUM/breakdown in JS" pattern.
import { Suspense } from "react";
import { requireActiveMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import {
  WORK_STATUS_COLORS,
  WORK_STATUS_LABELS,
  type WorkStatus,
  formatDeadline,
  allowedTransitions,
} from "@/lib/work-helpers";
import { can } from "@/lib/rbac";
import { StatusActionButtons } from "./status-action-buttons";
import { AssignTables } from "./assign-tables";
import { SyncAndAssign } from "./sync-and-assign";
import { InstructionsButton } from "./instructions-button";
import { ScheduleCalendar } from "./schedule-calendar";
import { WorkActions } from "./work-actions";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
// Cap on rows passed to AssignTables (which paginates client-side at 50/page).
// 500 = 10 pages of history per work — enough for almost every real work.
// Aggregates (totals + per-creator breakdown) come from RPCs so they stay
// accurate even beyond this cap.
const GENERATIONS_DISPLAY_LIMIT = 500;

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="p-6 text-neutral-100">
      <Link
        href="/app/works"
        className="text-neutral-400 hover:text-white text-sm inline-flex items-center gap-1 mb-4"
      >
        ← Back to Works
      </Link>
      <Suspense fallback={<WorkDetailSkeleton />}>
        <WorkDetailContent id={id} />
      </Suspense>
    </div>
  );
}

async function WorkDetailContent({ id }: { id: string }) {
  const supabase = await createClient();

  // WAVE 1 — auth + work fetch in parallel. RLS validates the JWT from
  // cookies independently, so the work query returns correct results
  // while auth resolves.
  const [membership, { data: work }] = await Promise.all([
    requireActiveMembership(),
    supabase
      .from("works")
      .select(
        "id, title, video_type, status, start_date, end_date, start_time, end_time, max_credits, client_id, creator_id, instructions_path, notes",
      )
      .eq("id", id)
      .maybeSingle(),
  ]);

  if (!work) notFound();

  // WAVE 2 — ALL remaining queries in parallel, including memberships.
  // Fetching all org memberships (RLS-scoped) and all client works avoids
  // a 3rd wave to resolve user IDs / work IDs derived from this wave.
  const [
    { data: client },
    { data: workCreators },
    { data: assignedToClient },
    { data: workCreditTotal },
    { data: creatorBreakdown },
    { data: instructionsBlob },
    { data: allMemberships },
    { data: clientWorks },
    { data: hfConns },
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, status")
      .eq("id", work.client_id)
      .maybeSingle(),
    supabase
      .from("work_creators")
      .select("user_id, added_at")
      .eq("work_id", work.id)
      .order("added_at", { ascending: true }),
    supabase
      .from("generations")
      .select(
        "id, display_name, result_url, media_type, credits, hf_created_at, work_id, assigned_at, assigned_by, is_waste, wasted_at, wasted_by, hf_connection_label",
      )
      .eq("client_id", work.client_id)
      .order("hf_created_at", { ascending: false })
      .limit(GENERATIONS_DISPLAY_LIMIT),
    supabase.rpc("work_credit_total", { p_work_id: work.id }),
    supabase.rpc("work_creator_breakdown", {
      p_client_id: work.client_id,
      p_work_id: work.id,
    }),
    work.instructions_path
      ? supabase.storage
          .from("work-instructions")
          .download(work.instructions_path)
      : Promise.resolve({ data: null }),
    supabase.from("memberships").select("user_id, full_name"),
    supabase.from("works").select("id, status").eq("client_id", work.client_id),
    supabase
      .from("hf_connections")
      .select("label")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
  ]);

  const additionalCreatorIds = (workCreators || [])
    .map((r) => r.user_id as string)
    .filter((uid) => uid !== work.creator_id);
  const creatorIdList = [work.creator_id, ...additionalCreatorIds];

  const nameMap = new Map(
    (allMemberships || []).map((m) => [m.user_id, m.full_name]),
  );

  const creatorRoster = creatorIdList.map((uid) => ({
    user_id: uid,
    name: nameMap.get(uid) || "Unknown",
    isPrimary: uid === work.creator_id,
  }));

  const workStatusMap: Record<string, WorkStatus> = Object.fromEntries(
    (clientWorks || []).map((w) => [w.id, w.status as WorkStatus]),
  );

  const accountLabels = (hfConns as { label: string }[] || []).map((c) => c.label);

  // creatorStats comes directly from the RPC — no JS reduce loop.
  const creatorStats = (
    (creatorBreakdown as {
      assigned_by: string;
      actual_credits: string | number;
      wastage_credits: string | number;
      rework_credits: string | number;
    }[] | null) || []
  ).map((row) => ({
    userId: row.assigned_by,
    name: nameMap.get(row.assigned_by) || "Unknown",
    actual: Number(row.actual_credits) || 0,
    wastage: Number(row.wastage_credits) || 0,
    rework: Number(row.rework_credits) || 0,
  }));

  // usedCredits comes from the RPC, not from filtering assignedToClient.
  const usedCredits = Number(workCreditTotal) || 0;

  const status = work.status as WorkStatus;
  const isOwnWork = creatorIdList.includes(membership.user_id);
  const transitions = allowedTransitions(status, membership.role, isOwnWork);
  const maxCredits = work.max_credits ? parseFloat(work.max_credits) : null;

  let instructionsFilename: string | null = null;
  let instructionsFileExt: string | null = null;
  let instructionsFileContent: string | null = null;
  if (work.instructions_path) {
    const filename =
      work.instructions_path.split("/").pop() || "instructions.txt";
    instructionsFilename = filename;
    instructionsFileExt = filename.split(".").pop()?.toLowerCase() || "txt";
    if (instructionsBlob) {
      instructionsFileContent = await (instructionsBlob as Blob).text();
    }
  }
  const canEdit = can(
    membership.role as "master" | "manager" | "creator",
    "works",
    "edit",
  );
  const canDelete = can(
    membership.role as "master" | "manager" | "creator",
    "works",
    "delete",
  );

  const clientLocked =
    client?.status === "paused" || client?.status === "ended";

  return (
    <>
      {/* CLIENT-LOCK BANNER */}
      {clientLocked && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-950/40 border border-amber-800 px-4 py-2 text-sm text-amber-300">
          <Lock className="size-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            This work is locked because client{" "}
            <Link
              href={`/app/clients/${work.client_id}`}
              className="text-amber-200 underline-offset-2 hover:underline"
            >
              {client?.name}
            </Link>{" "}
            is <span className="font-medium">{client?.status}</span>. Change
            the client status back to an active state to unlock editing.
          </p>
        </div>
      )}

      {/* HEADER */}
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-3xl font-bold text-white">
              {work.title || work.video_type || "Untitled Work"}
            </h1>
            <span
              className={`text-xs px-3 py-1 rounded border ${WORK_STATUS_COLORS[status]}`}
            >
              {WORK_STATUS_LABELS[status]}
            </span>
          </div>
          <p className="text-neutral-400">
            <Link
              href={`/app/clients/${work.client_id}`}
              className="text-lime-400 hover:underline"
            >
              {client?.name}
            </Link>
            {" · "}
            {creatorRoster.length === 1
              ? `Creator: ${creatorRoster[0].name}`
              : `Creators: ${creatorRoster
                  .slice(0, 3)
                  .map((c) => c.name)
                  .join(", ")}${
                  creatorRoster.length > 3
                    ? ` +${creatorRoster.length - 3} more`
                    : ""
                }`}
            {work.end_date &&
              ` · Due ${formatDeadline(work.end_date, work.end_time)}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <InstructionsButton
            filename={instructionsFilename}
            fileExt={instructionsFileExt}
            fileContent={instructionsFileContent}
            notes={work.notes}
          />
          {(() => {
            if (clientLocked) {
              return (
                <StatusActionButtons
                  workId={work.id}
                  transitions={[]}
                  locked
                  clientStatus={client?.status as "paused" | "ended"}
                />
              );
            }
            return transitions.length > 0 ? (
              <StatusActionButtons workId={work.id} transitions={transitions} />
            ) : null;
          })()}
          <WorkActions
            work={{
              id: work.id,
              title: work.title,
              creator_id: work.creator_id,
              video_type: work.video_type,
              max_credits: work.max_credits
                ? parseFloat(work.max_credits)
                : null,
              start_date: work.start_date,
              end_date: work.end_date,
              start_time: work.start_time,
              end_time: work.end_time,
              notes: work.notes,
            }}
            canEdit={canEdit}
            canDelete={canDelete}
          />
        </div>
      </div>

      {/* META: Type + Budget */}
      <div className="grid grid-cols-2 gap-4 mt-6 mb-6">
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            Type
          </div>
          <div className="text-sm text-white mt-1">
            {work.video_type || "—"}
          </div>
        </div>
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 uppercase tracking-wider">
            Budget
          </div>
          <div className="text-sm text-white mt-1">
            {usedCredits.toFixed(1)}
            {maxCredits !== null && (
              <span className="text-neutral-500 text-xs"> / {maxCredits}</span>
            )}
            <span className="text-neutral-500 text-xs"> cr</span>
          </div>
        </div>
      </div>

      {/* 50/50: SCHEDULE (left) + SYNC & ASSIGN (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* SCHEDULE */}
        <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white text-sm">Schedule</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                {work.start_date && work.end_date
                  ? `${new Date(work.start_date).toLocaleDateString("en-US")} → ${new Date(work.end_date).toLocaleDateString("en-US")}`
                  : work.start_date
                    ? `Starts ${new Date(work.start_date).toLocaleDateString("en-US")}`
                    : work.end_date
                      ? `Due ${new Date(work.end_date).toLocaleDateString("en-US")}`
                      : "No dates set"}
              </p>
            </div>
            {(work.start_time || work.end_time) && (
              <div className="text-xs text-neutral-500">
                {work.start_time && <span>Start {work.start_time}</span>}
                {work.start_time && work.end_time && " · "}
                {work.end_time && <span>End {work.end_time}</span>}
              </div>
            )}
          </div>
          <div className="flex-1">
            <ScheduleCalendar
              startDate={work.start_date}
              endDate={work.end_date}
            />
          </div>
        </section>

        {/* SYNC & ASSIGN */}
        <SyncAndAssign
          workId={work.id}
          workTitle={work.title || work.video_type || "Untitled work"}
          clientId={work.client_id}
          clientName={client?.name || ""}
          userRole={membership.role as "master" | "manager" | "creator"}
          creatorStats={creatorStats}
          accountLabels={accountLabels}
        />
      </div>

      {/* CREDIT PROGRESS (if max set) */}
      {maxCredits !== null && maxCredits > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-neutral-400 mb-1">
            <span>Credit usage</span>
            <span>
              {usedCredits.toFixed(1)} / {maxCredits} (
              {((usedCredits / maxCredits) * 100).toFixed(0)}%)
            </span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 transition-all ${usedCredits > maxCredits ? "bg-red-500" : "bg-lime-400"}`}
              style={{
                width: `${Math.min(100, (usedCredits / maxCredits) * 100)}%`,
              }}
            />
          </div>
          {usedCredits > maxCredits && (
            <p className="text-xs text-red-400 mt-1">⚠ Over budget</p>
          )}
        </div>
      )}

      {/* ASSIGNED + WASTAGE */}
      <AssignTables
        workId={work.id}
        clientName={client?.name || ""}
        assignedToClient={(assignedToClient || []) as never}
        workStatusMap={workStatusMap}
        userRole={membership.role as "master" | "manager" | "creator"}
        userId={membership.user_id}
        accountLabels={accountLabels}
      />
    </>
  );
}

function WorkDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-9 w-64 rounded bg-neutral-900" />
          <div className="h-5 w-48 rounded bg-neutral-900" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded bg-neutral-900" />
          <div className="h-9 w-24 rounded bg-neutral-900" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 rounded-lg bg-neutral-900" />
        <div className="h-20 rounded-lg bg-neutral-900" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-72 rounded-lg bg-neutral-900" />
        <div className="h-72 rounded-lg bg-neutral-900" />
      </div>
      <div className="h-48 rounded-lg bg-neutral-900" />
    </div>
  );
}
