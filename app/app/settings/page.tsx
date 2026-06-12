// app/app/settings/page.tsx — settings: full for master, trimmed for others.
import { requireActiveMembership } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase-server";
import { ConnectionsList } from "./connections-list";
import { IndustriesSection } from "./industries-section";
import { VideoTypesSection } from "./video-types-section";
import { OrgSection } from "./org-section";
import { DangerSection } from "./danger-section";
import { MemberSettings } from "./member-settings";

interface ConnectionRow {
  id: string;
  label: string;
  hf_email: string | null;
  is_active: boolean;
  created_at: string;
}

interface IndustryRow {
  id: string;
  name: string;
}

interface VideoTypeRow {
  id: string;
  name: string;
  display_order: number;
}

export default async function SettingsPage() {
  const membership = await requireActiveMembership();
  const supabase = await createClient();

  // Non-master gets trimmed view
  if (membership.role !== "master") {
    return (
      <MemberSettings
        membershipId={membership.id}
        orgName={membership.org_name}
        fullName={membership.full_name}
      />
    );
  }

  // Master gets full settings
  const [
    { data: connections },
    { data: industries },
    { data: videoTypes },
    { data: org },
  ] = await Promise.all([
    supabase
      .from("hf_connections")
      .select("id, label, hf_email, is_active, created_at")
      .eq("org_id", membership.org_id)
      .order("created_at", { ascending: true }),
    supabase
      .from("industries")
      .select("id, name")
      .eq("org_id", membership.org_id)
      .order("name"),
    supabase
      .from("video_types")
      .select("id, name, display_order")
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("organizations")
      .select("id, name, description")
      .eq("id", membership.org_id)
      .maybeSingle(),
  ]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-10 text-neutral-100">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Master-only configuration for {membership.org_name}.
        </p>
      </div>

      {/* HF CONNECTIONS — existing, untouched */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Higgsfield Accounts</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Sync &amp; Assign pulls from every enabled account you have access
            to. Disable an account to keep it idle without revoking creator
            grants.
          </p>
        </div>
        <ConnectionsList
          orgId={membership.org_id}
          connections={(connections as ConnectionRow[]) || []}
        />
      </section>

      {/* VIDEO TYPES */}
      <VideoTypesSection initialTypes={(videoTypes as VideoTypeRow[]) || []} />

      {/* INDUSTRIES */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Industries</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Manage the industry dropdown used when creating works.
          </p>
        </div>
        <IndustriesSection
          orgId={membership.org_id}
          industries={(industries as IndustryRow[]) || []}
        />
      </section>

      {/* ORG SETTINGS */}
      <OrgSection
        orgId={membership.org_id}
        initialName={org?.name || ""}
        initialDescription={org?.description || ""}
      />

      {/* DANGER ZONE */}
      <DangerSection orgId={membership.org_id} orgName={membership.org_name} />
    </div>
  );
}
