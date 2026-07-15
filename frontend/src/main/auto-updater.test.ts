// @vitest-environment node
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeUpdateSettings } from "./update-settings";

type MockAutoUpdater = EventEmitter & {
	channel: string;
	allowPrerelease: boolean;
	allowDowngrade: boolean;
	autoDownload: boolean;
	autoInstallOnAppQuit: boolean;
	checkForUpdates: ReturnType<typeof vi.fn>;
	downloadUpdate: ReturnType<typeof vi.fn>;
	quitAndInstall: ReturnType<typeof vi.fn>;
};

const electronState = vi.hoisted(() => ({
	windows: [] as Array<{ isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } }>,
}));

vi.mock("electron", () => ({
	app: {
		isPackaged: true,
		getVersion: () => "1.0.0",
	},
	BrowserWindow: {
		getAllWindows: () => electronState.windows,
	},
	dialog: {
		showMessageBox: vi.fn(),
	},
}));

vi.mock("electron-updater", () => {
	const updater = Object.assign(new EventEmitter(), {
		channel: "",
		allowPrerelease: false,
		allowDowngrade: false,
		autoDownload: false,
		autoInstallOnAppQuit: false,
		checkForUpdates: vi.fn().mockResolvedValue(undefined),
		downloadUpdate: vi.fn().mockResolvedValue(undefined),
		quitAndInstall: vi.fn(),
	});
	return { autoUpdater: updater };
});

async function importUpdater(): Promise<{
	autoUpdaterModule: typeof import("./auto-updater");
	autoUpdater: MockAutoUpdater;
}> {
	const { autoUpdater } = (await import("electron-updater")) as unknown as { autoUpdater: MockAutoUpdater };
	autoUpdater.removeAllListeners();
	autoUpdater.channel = "";
	autoUpdater.allowPrerelease = false;
	autoUpdater.allowDowngrade = false;
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = false;
	autoUpdater.checkForUpdates.mockReset().mockResolvedValue(undefined);
	autoUpdater.downloadUpdate.mockReset().mockResolvedValue(undefined);
	autoUpdater.quitAndInstall.mockReset();

	const autoUpdaterModule = await import("./auto-updater");
	return { autoUpdaterModule, autoUpdater };
}

describe("auto-updater", () => {
	let dir: string;
	let intervalCallbacks: Array<() => void>;
	let setIntervalSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.resetModules();
		intervalCallbacks = [];
		const mockSetInterval = ((handler: TimerHandler) => {
			if (typeof handler === "function") intervalCallbacks.push(handler as () => void);
			return { unref: vi.fn() } as unknown as ReturnType<typeof setInterval>;
		}) as unknown as typeof setInterval;
		setIntervalSpy = vi.spyOn(globalThis, "setInterval").mockImplementation(mockSetInterval);
		electronState.windows = [{ isDestroyed: () => false, webContents: { send: vi.fn() } }];
		dir = await mkdtemp(path.join(os.tmpdir(), "ao-auto-updater-"));
		await writeUpdateSettings(dir, { enabled: true, channel: "latest", nightlyAck: false });
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await rm(dir, { recursive: true, force: true });
	});

	it("checks on launch and then periodically while automatic updates stay enabled", async () => {
		const { autoUpdaterModule, autoUpdater } = await importUpdater();

		await autoUpdaterModule.startAutoUpdates(dir);

		expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
		expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), autoUpdaterModule.AUTO_UPDATE_CHECK_INTERVAL_MS);

		intervalCallbacks[0]?.();
		await vi.waitFor(() => expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2));

		intervalCallbacks[0]?.();
		await vi.waitFor(() => expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(3));
	});

	it("does not start the periodic check timer when automatic updates are disabled", async () => {
		await writeUpdateSettings(dir, { enabled: false, channel: "latest", nightlyAck: false });
		const { autoUpdaterModule, autoUpdater } = await importUpdater();

		await autoUpdaterModule.startAutoUpdates(dir);

		expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
		expect(setIntervalSpy).not.toHaveBeenCalled();
	});

	it("suppresses installing an older staged update after a newer version becomes available", async () => {
		const { autoUpdaterModule, autoUpdater } = await importUpdater();
		await autoUpdaterModule.startAutoUpdates(dir);

		autoUpdater.emit("update-downloaded", { version: "1.0.1" });
		expect(autoUpdaterModule.getUpdateStatus()).toMatchObject({ state: "downloaded", version: "1.0.1" });
		expect(autoUpdater.autoInstallOnAppQuit).toBe(true);

		autoUpdater.emit("update-available", { version: "1.0.2" });

		expect(autoUpdaterModule.getUpdateStatus()).toEqual({ state: "available", version: "1.0.2" });
		expect(autoUpdater.autoInstallOnAppQuit).toBe(false);

		autoUpdater.emit("update-downloaded", { version: "1.0.2" });

		expect(autoUpdaterModule.getUpdateStatus()).toMatchObject({ state: "downloaded", version: "1.0.2" });
		expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
	});

	it("downloads the superseding update before restart install", async () => {
		const { autoUpdaterModule, autoUpdater } = await importUpdater();
		await autoUpdaterModule.startAutoUpdates(dir);
		autoUpdater.emit("update-downloaded", { version: "1.0.1" });
		autoUpdater.emit("update-available", { version: "1.0.2" });
		autoUpdater.downloadUpdate.mockImplementationOnce(async () => {
			autoUpdater.emit("update-downloaded", { version: "1.0.2" });
		});

		await autoUpdaterModule.quitAndInstallUpdate();

		expect(autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
		expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
		expect(autoUpdaterModule.getUpdateStatus()).toMatchObject({ state: "downloaded", version: "1.0.2" });
	});
});
