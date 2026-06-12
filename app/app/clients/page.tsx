// app/app/clients/page.tsx — clients list, filterable by status, fixed-order grid.
// Uses clients_with_credit_totals() RPC: 1 round-trip instead of pulling every
// generation row in the org just to sum per-client credits client-side.
import { requireActiveMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase-server";
import { can } from "@/lib/rbac";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  sortClientsByStatus,
  type ClientStatus,
} from "@/lib/client-helpers";
import { ClientCard } from "./client-card";
import { ClientsHeader } from "./clients-header";
import { SetupRdButton } from "./setup-rd-button";

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

interface ClientRpcRow {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  total_credits: string | number;
  generation_count: string | number;
  deleted_at: string | null;
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { status: filterStatus } = await searchParams;

  // SINGLE WAVE — auth + RPC in parallel. RLS validates the JWT from
  // cookies independently, so the RPC returns correct results while auth resolves.
  const [membership, { data: rows, error }, { data: rdClient }] =
    await Promise.all([
      requireActiveMembership(),
      supabase.rpc("clients_with_credit_totals"),
      supabase
        .from("clients")
        .select("id")
        .eq("is_default", true)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
  if (error) {
    console.error(
      "[clients] clients_with_credit_totals RPC failed:",
      error.message,
    );
  }

  const enrichedClients = ((rows || []) as ClientRpcRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    industry: c.industry,
    status: c.status as ClientStatus,
    totalCredits:
      typeof c.total_credits === "number"
        ? c.total_credits
        : parseFloat(c.total_credits || "0"),
    generationCount:
      typeof c.generation_count === "number"
        ? c.generation_count
        : parseInt(c.generation_count || "0", 10),
    deletedAt: c.deleted_at,
  }));

  const activeClients = enrichedClients.filter((c) => !c.deletedAt);
  const archivedClients = enrichedClients.filter((c) => !!c.deletedAt);

  const statusCounts: Record<ClientStatus, number> = {
    ongoing: 0,
    trial: 0,
    in_talk: 0,
    outreach: 0,
    paused: 0,
    ended: 0,
  };
  activeClients.forEach((c) => {
    statusCounts[c.status]++;
  });

  const visibleClients =
    filterStatus && filterStatus !== "all"
      ? activeClients.filter((c) => c.status === filterStatus)
      : activeClients;

  const sorted = sortClientsByStatus(visibleClients);
  const canCreate = can(membership.role, "clients", "create");
  const canCreateWork = can(membership.role, "works", "create");
  const showSections = !filterStatus || filterStatus === "all";
  const canSetupRd =
    ["master", "manager"].includes(membership.role) && !rdClient;

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      {canSetupRd && (
        <div className="flex items-center justify-between bg-neutral-900/50 border border-neutral-800 rounded-lg px-4 py-2.5">
          <p className="text-sm text-neutral-400">
            No R&D client exists yet. Create one to track internal practice
            work.
          </p>
          <SetupRdButton />
        </div>
      )}
      <ClientsHeader
        totalCount={activeClients.length}
        statusCounts={statusCounts}
        activeFilter={filterStatus || "all"}
        canCreate={canCreate}
      />

      {sorted.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-12 text-center">
          <p className="text-neutral-400">No clients yet.</p>
          {canCreate && (
            <p className="text-neutral-500 text-sm mt-2">
              Use the + New Client button above to create your first one.
            </p>
          )}
        </div>
      ) : showSections ? (
        <div className="space-y-8">
          {CLIENT_STATUSES.map((status) => {
            const inStatus = sorted.filter((c) => c.status === status);
            if (inStatus.length === 0) return null;
            return (
              <section key={status} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-400">
                    {CLIENT_STATUS_LABELS[status]}
                  </h2>
                  <span className="text-xs text-neutral-500">
                    ({inStatus.length})
                  </span>
                  <div className="flex-1 border-t border-neutral-800" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inStatus.map((c) => (
                    <ClientCard
                      key={c.id}
                      client={c}
                      canCreateWork={canCreateWork}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((c) => (
            <ClientCard key={c.id} client={c} canCreateWork={canCreateWork} />
          ))}
        </div>
      )}

      {archivedClients.length > 0 &&
        (!filterStatus || filterStatus === "all") && (
          <section className="space-y-3 opacity-50">
            <div className="flex items-center gap-3">
              <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-500">
                Archived
              </h2>
              <span className="text-xs text-neutral-600">
                ({archivedClients.length})
              </span>
              <div className="flex-1 border-t border-neutral-800" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {archivedClients.map((c) => (
                <ClientCard key={c.id} client={c} archived />
              ))}
            </div>
          </section>
        )}
    </div>
  );
}
