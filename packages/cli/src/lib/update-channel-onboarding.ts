/**
 * Update-channel onboarding helpers.
 *
 * On first `ao start`, prompt the user once for an `updateChannel` and persist
 * it to ~/.agent-orchestrator/config.yaml. Never re-prompt — if they dismiss
 * (Ctrl+C / Esc), default to `manual` so we don't surprise-install anything.
 *
 * Spec: release-process.html §08 (Onboarding integration).
 */

import { existsSync } from "node:fs";
import chalk from "chalk";
import {
  getGlobalConfigPath,
  loadGlobalConfig,
  saveGlobalConfig,
  type GlobalConfig,
  type UpdateChannel,
} from "@aoagents/ao-core";
import { promptSelect } from "./prompts.js";
import { isHumanCaller } from "./caller-context.js";

interface PromptDeps {
  /** Test seam — defaults to the real prompt. */
  prompt?: (
    message: string,
    options: { value: UpdateChannel | "skip"; label: string; hint?: string }[],
  ) => Promise<UpdateChannel | "skip">;
  /** Test seam — defaults to `isHumanCaller()`. */
  isInteractive?: () => boolean;
}

/**
 * Has the user already been asked about update channels?
 *
 * True when:
 *   - The global config exists AND has `updateChannel` set, OR
 *   - The global config does not exist yet (we'll ask after it's created).
 *
 * Returns `false` only when the file exists but the field is unset — that's
 * the one window where we want to ask.
 */
export function hasChosenUpdateChannel(): boolean {
  if (!existsSync(getGlobalConfigPath())) return false;
  try {
    const config = loadGlobalConfig();
    return Boolean(config?.updateChannel);
  } catch {
    return true; // Don't pester users when config can't be read.
  }
}

/**
 * Persist the chosen channel to the global config.
 * Loads existing config (or creates a new one) and writes the field.
 */
export function persistUpdateChannel(channel: UpdateChannel): void {
  const path = getGlobalConfigPath();
  const existing = existsSync(path) ? loadGlobalConfig(path) : null;
  const next: GlobalConfig = existing
    ? { ...existing, updateChannel: channel }
    : ({
        port: 3000,
        readyThresholdMs: 300_000,
        defaults: {
          runtime: "tmux",
          agent: "claude-code",
          workspace: "worktree",
          notifiers: ["composio", "desktop"],
        },
        projects: {},
        notifiers: {},
        notificationRouting: {
          urgent: ["desktop", "composio"],
          action: ["desktop", "composio"],
          warning: ["composio"],
          info: ["composio"],
        },
        reactions: {},
        updateChannel: channel,
      } as GlobalConfig);
  saveGlobalConfig(next, path);
}

/**
 * Prompt the user once and persist the chosen channel.
 *
 * Skipped silently when:
 *   - The choice was already made (idempotent — never re-prompts).
 *   - The caller is not interactive (CI, scripted ao start).
 *
 * On dismissal, persists `manual` so we don't ask again — surprise auto-installs
 * are worse than a quiet manual default.
 */
export async function maybePromptForUpdateChannel(deps: PromptDeps = {}): Promise<void> {
  const isInteractive = deps.isInteractive ?? isHumanCaller;
  if (!isInteractive()) return;
  if (hasChosenUpdateChannel()) return;

  console.log(chalk.bold("\nHow do you want to receive updates?"));
  console.log(
    chalk.dim(
      "  Stable ships every Thursday. Nightly ships daily Fri–Tue. Manual stays put.\n",
    ),
  );

  const promptFn = deps.prompt ?? defaultPrompt;
  let choice: UpdateChannel | "skip";
  try {
    choice = await promptFn("Update channel:", [
      { value: "stable", label: "Stable — weekly releases. Recommended for most users.", hint: "@latest" },
      { value: "nightly", label: "Nightly — daily builds. Bleeding edge.", hint: "@nightly" },
      { value: "manual", label: "Manual — no checks. Run `ao update` yourself.", hint: "default if dismissed" },
    ]);
  } catch {
    choice = "manual";
  }

  // Never re-prompt: the absence of `updateChannel` is the signal we use to
  // know we haven't asked yet, so even on dismissal we must persist *something*.
  const channel: UpdateChannel = choice === "skip" ? "manual" : choice;
  persistUpdateChannel(channel);
  console.log(chalk.green(`  ✓ Update channel set to ${chalk.bold(channel)}`));
  console.log(
    chalk.dim(`  Change it later with: ao config set updateChannel <stable|nightly|manual>\n`),
  );
}

async function defaultPrompt(
  message: string,
  options: { value: UpdateChannel | "skip"; label: string; hint?: string }[],
): Promise<UpdateChannel | "skip"> {
  return promptSelect<UpdateChannel | "skip">(message, options);
}
