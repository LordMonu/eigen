"use client";

// app/onboarding/join-org/page.tsx
// Two-track onboarding:
//   1. If the master invited this email, show a banner card per pending
//      invitation so the user can accept with one click (auto-approved).
//   2. Otherwise: privacy-friendly search — no org is listed until the user
//      types ≥2 chars, then a debounced ilike returns matches.

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Check, Mail } from "lucide-react";

interface Org {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  org_id: string;
  role: string;
  org_name: string;
}

export default function JoinOrgPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  // Pending invitations for the current user's email — one-click accept.
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  // Shared name input (used for both invitation accept and search-join paths).
  const [fullName, setFullName] = useState("");

  // Search-join state.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Org[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<Org | null>(null);

  const [submitting, setSubmitting] = useState<null | "invitation" | "search">(
    null,
  );
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Load any pending invitations targeting the current user's email.
  // The new "Invitees can read own invitations" RLS policy (see
  // supabase/invitee-can-read-own-invitations.sql) makes this query work
  // for users who haven't joined any org yet.
  useEffect(() => {
    let cancelled = false;
    async function loadInvitations() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return;

      const { data } = await supabase
        .from("invitations")
        .select("id, org_id, role, organizations(name)")
        .eq("email", user.email.toLowerCase())
        .is("used_at", null);

      if (cancelled) return;

      // Flatten the foreign-key join shape (organizations can come back as
      // either an object or a single-element array depending on inference).
      const flat: Invitation[] = (data || [])
        .map((row) => {
          const orgs = (row as { organizations: unknown }).organizations;
          const org = Array.isArray(orgs) ? orgs[0] : orgs;
          const name =
            org && typeof org === "object" && "name" in org
              ? (org as { name: string }).name
              : null;
          return {
            id: row.id as string,
            org_id: row.org_id as string,
            role: row.role as string,
            org_name: name,
          };
        })
        .filter((i): i is Invitation => i.org_name !== null) as Invitation[];
      setInvitations(flat);
    }
    loadInvitations();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Debounced search — only fires when the user has typed at least 2 chars.
  // Stale error message is cleared the moment the user starts typing again.
  useEffect(() => {
    setError(null);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id, name")
        .ilike("name", `%${trimmed}%`)
        .order("name")
        .limit(20);
      setResults(data || []);
      setSearching(false);
      setSearched(true);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, supabase]);

  // If the currently-selected org no longer matches the new query, drop it.
  useEffect(() => {
    if (selected && !results.some((o) => o.id === selected.id)) {
      setSelected(null);
    }
  }, [results, selected]);

  async function callRequestJoin(
    orgId: string,
  ): Promise<"active" | "pending"> {
    const { data: membershipId, error: rpcErr } = await supabase.rpc(
      "request_join_org",
      {
        target_org_id: orgId,
        user_full_name: fullName.trim(),
      },
    );
    if (rpcErr) throw rpcErr;
    const { data: membership } = await supabase
      .from("memberships")
      .select("status")
      .eq("id", membershipId)
      .maybeSingle();
    return membership?.status === "active" ? "active" : "pending";
  }

  async function handleAcceptInvitation(inv: Invitation) {
    if (!fullName.trim()) {
      setError("Enter your name first — your admin will see it.");
      return;
    }
    setSubmitting("invitation");
    setAcceptingId(inv.id);
    setError(null);
    try {
      const status = await callRequestJoin(inv.org_id);
      startTransition(() => {
        if (status === "active") {
          router.push("/app/dashboard");
        } else {
          router.push("/onboarding/pending");
        }
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(
        message.includes("unique")
          ? "You already requested to join this org."
          : message,
      );
      setSubmitting(null);
      setAcceptingId(null);
    }
  }

  async function handleSearchJoin() {
    if (!selected || !fullName.trim()) {
      setError("Pick an organization and enter your name");
      return;
    }
    setSubmitting("search");
    setError(null);
    try {
      const status = await callRequestJoin(selected.id);
      startTransition(() => {
        if (status === "active") {
          router.push("/app/dashboard");
        } else {
          router.push("/onboarding/pending");
        }
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setError(
        message.includes("unique")
          ? "You already requested to join this org"
          : message,
      );
      setSubmitting(null);
    }
  }

  const disabled = submitting !== null || isPending;

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="max-w-md w-full space-y-6 bg-neutral-950 border border-neutral-800 rounded-lg p-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Join Organization</h1>
          <p className="text-neutral-400 text-sm mt-1">
            {invitations.length > 0
              ? "You've been invited — accept below to join instantly."
              : "Search for your organization by name. The admin will approve your request unless you were invited."}
          </p>
        </div>

        {/* Shared name input. */}
        <div>
          <Label htmlFor="fullName" className="text-neutral-300">
            Your name
          </Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Vidhi"
            className="mt-1 bg-neutral-900 border-neutral-700 text-white"
            disabled={disabled}
            autoFocus
          />
        </div>

        {/* INVITATIONS — auto-accept path. */}
        {invitations.length > 0 && (
          <div className="space-y-2">
            <Label className="text-neutral-300 flex items-center gap-1.5">
              <Mail className="size-4 text-lime-400" />
              You&apos;ve been invited
            </Label>
            <div className="space-y-2">
              {invitations.map((inv) => {
                const accepting = acceptingId === inv.id;
                return (
                  <div
                    key={inv.id}
                    className="bg-lime-950/30 border border-lime-800 rounded-lg p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {inv.org_name}
                      </div>
                      <div className="text-xs text-lime-300 capitalize">
                        invited you as {inv.role}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAcceptInvitation(inv)}
                      disabled={disabled || !fullName.trim()}
                      className="bg-lime-400 hover:bg-lime-300 text-black font-semibold shrink-0"
                    >
                      {accepting
                        ? submitting === "invitation" && !isPending
                          ? "Joining…"
                          : "Going…"
                        : "Accept"}
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-neutral-500 px-1">
              Accepting skips the approval queue — you&apos;ll land directly on
              the dashboard.
            </p>
          </div>
        )}

        {/* SEARCH — fallback for non-invited orgs. */}
        <div>
          <Label htmlFor="orgSearch" className="text-neutral-300">
            {invitations.length > 0
              ? "Or join a different organization"
              : "Search organization"}
          </Label>
          <div className="relative mt-1">
            <Search className="size-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              id="orgSearch"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type at least 2 characters…"
              className="pl-9 bg-neutral-900 border-neutral-700 text-white"
              disabled={disabled}
            />
          </div>

          {/* Results */}
          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
            {query.trim().length < 2 ? (
              <p className="text-xs text-neutral-500 px-1">
                Search hides the full directory — only orgs matching your query
                will appear.
              </p>
            ) : searching ? (
              <p className="text-xs text-neutral-500 px-1">Searching…</p>
            ) : searched && results.length === 0 ? (
              <p className="text-xs text-neutral-500 px-1">
                No organization matches &ldquo;{query.trim()}&rdquo;. Ask your
                admin to confirm the exact name, or{" "}
                <button
                  type="button"
                  onClick={() => router.push("/onboarding/create-org")}
                  className="text-lime-400 hover:underline"
                >
                  create a new one
                </button>
                .
              </p>
            ) : (
              results.map((org) => {
                const isSelected = selected?.id === org.id;
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => setSelected(org)}
                    disabled={disabled}
                    className={`w-full text-left px-3 py-2 rounded border transition-colors flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-lime-950/40 border-lime-500 text-white"
                        : "bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-600"
                    }`}
                  >
                    <span className="truncate">{org.name}</span>
                    {isSelected && (
                      <Check className="size-4 shrink-0 text-lime-400" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/onboarding")}
            disabled={disabled}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={handleSearchJoin}
            disabled={disabled || !selected || !fullName.trim()}
            className="flex-1 bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {submitting === "search"
              ? "Submitting…"
              : isPending
                ? "Going…"
                : "Request to Join"}
          </Button>
        </div>
      </div>
    </div>
  );
}
