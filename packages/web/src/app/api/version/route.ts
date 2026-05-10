/**
 * GET /api/version — current AO version, latest available, and channel state.
 *
 * Backed by the same cache file that the CLI's `update-check.ts` writes to
 * (`$XDG_CACHE_HOME/ao/update-check.json` or `~/.cache/ao/update-check.json`),
 * so the dashboard banner and the CLI startup notice always agree.
 *
 * Cache-only by design — never makes a network call inside a request handler.
 * The CLI keeps the cache fresh (24 h TTL) via `scheduleBackgroundRefresh()`,
 * and `ao update --check` forces a refresh on demand.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { loadGlobalConfig, type UpdateChannel } from "@aoagents/ao-core";

export const dynamic = "force-dynamic";

interface CacheData {
  latestVersion?: string;
  checkedAt?: string;
  currentVersionAtCheck?: string;
  channel?: UpdateChannel;
}

interface VersionResponse {
  current: string;
  latest: string | null;
  channel: UpdateChannel;
  isOutdated: boolean;
  checkedAt: string | null;
}

function getCachePath(): string {
  const xdg = process.env["XDG_CACHE_HOME"];
  const base = xdg || join(homedir(), ".cache");
  return join(base, "ao", "update-check.json");
}

function readCache(): CacheData | null {
  const path = getCachePath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as CacheData;
  } catch {
    return null;
  }
}

function getCurrentVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("@aoagents/ao/package.json") as { version: string };
    return pkg.version;
  } catch {
    // Fall back to the web package's own version. The dashboard ships in lockstep
    // with `@aoagents/ao` (changeset linked group), so this is a safe proxy when
    // the wrapper isn't in node_modules (dev mode).
    try {
      const require = createRequire(import.meta.url);
      const pkg = require("@aoagents/ao-web/package.json") as { version: string };
      return pkg.version;
    } catch {
      return "0.0.0";
    }
  }
}

/**
 * Inlined here (rather than importing from CLI) so the web package doesn't
 * take a dependency on `@aoagents/ao-cli`. Same logic as `isVersionOutdated`
 * in `packages/cli/src/lib/update-check.ts` — keep them in sync if either
 * changes (covered by tests on both sides).
 */
function isVersionOutdated(current: string, latest: string): boolean {
  const parseVersion = (version: string) => {
    const [base, ...rest] = version.split("-");
    const prerelease = rest.length > 0 ? rest.join("-") : undefined;
    return {
      parts: (base ?? "").split(".").map(Number),
      prerelease,
    };
  };

  const c = parseVersion(current);
  const l = parseVersion(latest);

  for (let i = 0; i < 3; i++) {
    const cp = c.parts[i] ?? 0;
    const lp = l.parts[i] ?? 0;
    if (Number.isNaN(cp) || Number.isNaN(lp)) return false;
    if (cp < lp) return true;
    if (cp > lp) return false;
  }

  if (!c.prerelease && !l.prerelease) return false;
  if (c.prerelease && !l.prerelease) return true;
  if (!c.prerelease && l.prerelease) return false;

  const aSeg = (c.prerelease ?? "").split(".");
  const bSeg = (l.prerelease ?? "").split(".");
  const max = Math.max(aSeg.length, bSeg.length);
  for (let i = 0; i < max; i++) {
    const ax = aSeg[i];
    const bx = bSeg[i];
    if (ax === undefined) return true;
    if (bx === undefined) return false;
    const aNum = /^\d+$/.test(ax);
    const bNum = /^\d+$/.test(bx);
    if (aNum && bNum) {
      const an = Number(ax);
      const bn = Number(bx);
      if (an !== bn) return an < bn;
    } else if (aNum !== bNum) {
      return aNum;
    } else if (ax !== bx) {
      return ax < bx;
    }
  }
  return false;
}

function resolveChannel(): UpdateChannel {
  try {
    const config = loadGlobalConfig();
    return config?.updateChannel ?? "manual";
  } catch {
    return "manual";
  }
}

export async function GET() {
  const current = getCurrentVersion();
  const channel = resolveChannel();
  const cache = readCache();

  // Cache must match the active channel — otherwise we'd report a stale
  // @latest version to a user who recently switched to @nightly.
  const cacheMatchesChannel = !cache?.channel || cache.channel === channel;
  const latest = cache?.latestVersion && cacheMatchesChannel ? cache.latestVersion : null;

  const body: VersionResponse = {
    current,
    latest,
    channel,
    isOutdated: latest ? isVersionOutdated(current, latest) : false,
    checkedAt: cache?.checkedAt && cacheMatchesChannel ? cache.checkedAt : null,
  };

  return NextResponse.json(body);
}
