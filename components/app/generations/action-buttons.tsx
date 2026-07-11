"use client";

import { useEffect, useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isManagerLikeRole } from "@/lib/roles";

export const UNDO_WINDOW_MS = 60000;

export function isUnassignAllowed({
  userRole,
  userId,
  assignedAt,
  assignedBy,
}: {
  userRole: string;
  userId: string;
  assignedAt: string | null;
  assignedBy: string | null;
}) {
  const isMasterOrManager =
    userRole === "master" || isManagerLikeRole(userRole);
  if (isMasterOrManager) return true;
  if (assignedBy !== userId || !assignedAt) return false;
  const assignedTime = new Date(assignedAt).getTime();
  return Date.now() - assignedTime < UNDO_WINDOW_MS;
}

export function UnassignButton({
  generationId,
  assignedAt,
  assignedBy,
  userRole,
  userId,
  onDone,
  onError,
}: {
  generationId: string;
  assignedAt: string | null;
  assignedBy: string | null;
  userRole: string;
  userId: string;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const isMasterOrManager =
    userRole === "master" || isManagerLikeRole(userRole);
  const isAssigner = assignedBy === userId;

  useEffect(() => {
    if (isMasterOrManager) return;
    if (!isAssigner || !assignedAt) return;

    const assignedTime = new Date(assignedAt).getTime();
    function check() {
      const remaining = UNDO_WINDOW_MS - (Date.now() - assignedTime);
      setTimeLeft(remaining <= 0 ? 0 : Math.ceil(remaining / 1000));
    }
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [isMasterOrManager, isAssigner, assignedAt]);

  if (!isMasterOrManager) {
    if (!isAssigner || timeLeft === 0 || timeLeft === null) return null;
  }

  async function handleUnassign() {
    setBusy(true);
    try {
      const res = await fetch(`/api/generations/${generationId}/unassign`, {
        method: "POST",
      });
      if (res.ok) {
        startTransition(() => {
          onDone();
        });
      } else {
        const data = await res.json().catch(() => ({}));
        onError(`Unassign failed: ${data.error || "unknown error"}`);
      }
    } catch (err) {
      onError(
        `Unassign failed: ${err instanceof Error ? err.message : "network error"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleUnassign}
      disabled={busy || isPending}
      className="h-6 text-xs px-2 text-red-400 border-red-900 hover:bg-red-950"
    >
      {busy || isPending
        ? "..."
        : isMasterOrManager
          ? "Unassign"
          : `Undo (${timeLeft}s)`}
    </Button>
  );
}

export function WastageButton({
  generationId,
  wastedAt,
  wastedBy,
  userRole,
  userId,
  onDone,
  onError,
}: {
  generationId: string;
  wastedAt: string | null;
  wastedBy: string | null;
  userRole: string;
  userId: string;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const isMasterOrManager =
    userRole === "master" || isManagerLikeRole(userRole);
  const isWaster = wastedBy === userId;
  const isWasted = wastedAt !== null;

  useEffect(() => {
    if (!isWasted || !wastedAt) return;
    if (isMasterOrManager) return;
    if (!isWaster) return;

    const wastedTime = new Date(wastedAt).getTime();
    function check() {
      const remaining = UNDO_WINDOW_MS - (Date.now() - wastedTime);
      setTimeLeft(remaining <= 0 ? 0 : Math.ceil(remaining / 1000));
    }
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [isWasted, wastedAt, isMasterOrManager, isWaster]);

  async function handleUnassign() {
    setBusy(true);
    try {
      const res = await fetch(`/api/generations/${generationId}/unassign`, {
        method: "POST",
      });
      if (res.ok) {
        startTransition(() => {
          onDone();
        });
      } else {
        const data = await res.json().catch(() => ({}));
        onError(`Unassign failed: ${data.error || "unknown error"}`);
      }
    } catch (err) {
      onError(
        `Unassign failed: ${err instanceof Error ? err.message : "network error"}`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!isWasted) return null;

  const isWithinWindow = isWaster && timeLeft !== null && timeLeft > 0;
  if (!isMasterOrManager && !isWithinWindow) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleUnassign}
      disabled={busy || isPending}
      className="h-6 text-xs px-2 text-lime-400 border-lime-700 hover:bg-lime-950"
    >
      {busy || isPending ? (
        "..."
      ) : (
        <>
          <Undo2 className="size-3 mr-1" />
          {isMasterOrManager && !isWithinWindow
            ? "Unassign"
            : `Unassign (${timeLeft}s)`}
        </>
      )}
    </Button>
  );
}
