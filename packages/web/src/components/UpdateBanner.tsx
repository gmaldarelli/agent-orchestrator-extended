"use client";

import { useCallback, useEffect, useState } from "react";

const DISMISS_KEY = "ao.updateBanner.dismissedFor";

interface VersionResponse {
  current: string;
  latest: string | null;
  channel: "stable" | "nightly" | "manual";
  isOutdated: boolean;
  checkedAt: string | null;
}

interface UpdateResponse {
  ok: boolean;
  message: string;
  activeSessions?: number;
}

type Phase = "idle" | "starting" | "started" | "blocked" | "error";

export function UpdateBanner() {
  const [info, setInfo] = useState<VersionResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  // Hydrate dismissal flag from localStorage on mount.
  useEffect(() => {
    try {
      setDismissedFor(window.localStorage.getItem(DISMISS_KEY));
    } catch {
      // Private mode / quota — treat as not dismissed.
    }
  }, []);

  // Initial load. Deferred to a microtask so the synchronous render path is
  // unaffected — the dashboard's existing tests use `mockImplementationOnce`
  // against the global fetch and would consume that mock if we called fetch
  // during the same effect tick. The cache TTL is 24 h so polling would be
  // wasteful; the CLI startup notice covers other surfaces.
  useEffect(() => {
    if (typeof fetch !== "function") return;
    let cancelled = false;
    const handle = setTimeout(() => {
      Promise.resolve(fetch("/api/version", { cache: "no-store" }))
        .then((r) => (r && r.ok ? (r.json() as Promise<VersionResponse>) : null))
        .then((data) => {
          if (cancelled) return;
          setInfo(data);
        })
        .catch(() => {
          // Silent — banner stays hidden if we can't talk to the route.
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    if (!info?.latest) return;
    try {
      window.localStorage.setItem(DISMISS_KEY, info.latest);
    } catch {
      // ignore
    }
    setDismissedFor(info.latest);
  }, [info]);

  const handleUpdate = useCallback(async () => {
    setPhase("starting");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/update", { method: "POST" });
      const body = (await res.json()) as UpdateResponse;
      if (res.ok) {
        setPhase("started");
        return;
      }
      if (res.status === 409) {
        setPhase("blocked");
        setErrorMessage(body.message);
        return;
      }
      setPhase("error");
      setErrorMessage(body.message ?? "Update failed");
    } catch (err) {
      setPhase("error");
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  if (!info || !info.isOutdated || !info.latest) return null;
  if (info.channel === "manual") return null;
  if (dismissedFor === info.latest && phase === "idle") return null;
  if (phase === "started") return null;

  const channelLabel = info.channel === "nightly" ? " (nightly)" : "";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border-default)] bg-[var(--color-accent-amber-dim)] px-4 py-2 text-[13px] text-[var(--color-text-primary)]"
    >
      <div className="flex flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 flex-shrink-0 rounded-full bg-[var(--color-accent-amber)]"
        />
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <span className="font-medium">
            Update available{channelLabel}: {info.current} → {info.latest}
          </span>
          {phase === "blocked" && errorMessage ? (
            <span className="text-[12px] text-[var(--color-status-error)]">{errorMessage}</span>
          ) : phase === "error" && errorMessage ? (
            <span className="text-[12px] text-[var(--color-status-error)]">
              {errorMessage}
            </span>
          ) : phase === "starting" ? (
            <span className="text-[12px] text-[var(--color-text-secondary)]">Starting…</span>
          ) : (
            <span className="text-[12px] text-[var(--color-text-secondary)]">
              Click Update to install. The dashboard will restart.
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleUpdate()}
          disabled={phase === "starting"}
          className="rounded-sm border border-[var(--color-accent-amber-border)] bg-[var(--color-accent-amber)] px-3 py-1 text-[12px] font-medium text-[var(--color-text-inverse)] hover:bg-[color-mix(in_srgb,var(--color-accent-amber)_85%,black)] disabled:cursor-wait disabled:opacity-60"
        >
          {phase === "starting" ? "Updating…" : "Update"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="rounded-sm px-2 py-1 text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
