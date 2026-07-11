import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceSession } from "../types/workspace";
import { isLoopbackPreviewURL, TerminalPane, providerScrollsByKeyboard } from "./TerminalPane";

const postMock = vi.fn();
let terminalLinkHandler: ((uri: string) => void) | undefined;

vi.mock("../lib/api-client", () => ({
	apiClient: { POST: (...args: unknown[]) => postMock(...args) },
	apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("./XtermTerminal", () => ({
	XtermTerminal: (props: { onLinkOpen?: (uri: string) => void }) => {
		terminalLinkHandler = props.onLinkOpen;
		return <div data-testid="xterm" />;
	},
}));

vi.mock("../hooks/useTerminalSession", () => ({
	useTerminalSession: () => ({
		attach: vi.fn(),
		state: "idle",
		error: undefined,
	}),
}));

const worker = {
	id: "sess-1",
	workspaceId: "proj-1",
	workspaceName: "my-app",
	title: "do the thing",
	provider: "claude-code",
	kind: "worker",
	branch: "ao/sess-1",
	status: "working",
	updatedAt: "2026-06-10T00:00:00Z",
	prs: [],
} satisfies WorkspaceSession;

const orchestrator = {
	...worker,
	id: "sess-orch",
	title: "orchestrate",
	kind: "orchestrator",
} satisfies WorkspaceSession;

beforeEach(() => {
	postMock.mockReset();
	postMock.mockResolvedValue({ data: {} });
	terminalLinkHandler = undefined;
});

function renderPane(session?: WorkspaceSession) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const previousAO = window.ao;
	window.ao = {} as typeof window.ao;
	const result = render(
		<QueryClientProvider client={queryClient}>
			<TerminalPane daemonReady fontSize={12} session={session} theme="dark" />
		</QueryClientProvider>,
	);
	return {
		...result,
		restore: () => {
			window.ao = previousAO;
		},
	};
}

describe("TerminalPane empty states", () => {
	it("shows a no-selection message when no session is selected", () => {
		const view = renderPane();
		try {
			expect(screen.getByText("Agent Orchestrator")).toBeInTheDocument();
			expect(screen.getByText("No session selected. Pick a worker to attach its terminal.")).toBeInTheDocument();
		} finally {
			view.restore();
		}
	});

	it("shows a startup message when a selected session has no terminal handle yet", () => {
		const view = renderPane(worker);
		try {
			expect(screen.getByText("Starting session")).toBeInTheDocument();
			expect(
				screen.getByText(
					"Preparing the worker terminal. This can take a moment while AO creates the worktree and starts the agent.",
				),
			).toBeInTheDocument();
			expect(screen.queryByText("No session selected. Pick a worker to attach its terminal.")).not.toBeInTheDocument();
		} finally {
			view.restore();
		}
	});

	it("shows orchestrator-specific startup copy for a pending orchestrator terminal", () => {
		const view = renderPane(orchestrator);
		try {
			expect(screen.getByText("Starting session")).toBeInTheDocument();
			expect(
				screen.getByText(
					"Preparing the orchestrator terminal. This can take a moment while AO creates the worktree and starts the agent.",
				),
			).toBeInTheDocument();
			expect(screen.queryByText(/worker terminal/i)).not.toBeInTheDocument();
		} finally {
			view.restore();
		}
	});
});

describe("providerScrollsByKeyboard", () => {
	// opencode and its fork kilocode share a TUI that scrolls its own transcript
	// by keyboard and ignores SGR wheel reports, so both must opt into the
	// PageUp/PageDown wheel routing (see XtermTerminal's paneScrollsByKeyboard).
	it("is true for keyboard-scroll TUIs (opencode and its kilocode fork)", () => {
		expect(providerScrollsByKeyboard("opencode")).toBe(true);
		expect(providerScrollsByKeyboard("kilocode")).toBe(true);
	});

	it("is false for mouse-report/native-scroll providers", () => {
		expect(providerScrollsByKeyboard("codex")).toBe(false);
		expect(providerScrollsByKeyboard("claude-code")).toBe(false);
	});

	it("is false when the provider is unknown", () => {
		expect(providerScrollsByKeyboard(undefined)).toBe(false);
	});
});

describe("isLoopbackPreviewURL", () => {
	it.each(["http://localhost:3000/simple", "https://app.localhost:5173", "http://127.0.0.1:8080", "http://[::1]:4173"])(
		"accepts local development URL %s",
		(url) => {
			expect(isLoopbackPreviewURL(url)).toBe(true);
		},
	);

	it.each(["https://example.com", "file:///tmp/index.html", "javascript:alert(1)", "not a URL"])(
		"rejects non-loopback URL %s",
		(url) => {
			expect(isLoopbackPreviewURL(url)).toBe(false);
		},
	);
});

describe("terminal link preview", () => {
	it("mirrors a localhost terminal link into the session Browser preview", async () => {
		const view = renderPane(worker);
		try {
			expect(terminalLinkHandler).toBeTypeOf("function");
			act(() => terminalLinkHandler?.("http://localhost:3000/simple"));

			await waitFor(() =>
				expect(postMock).toHaveBeenCalledWith("/api/v1/sessions/{sessionId}/preview", {
					params: { path: { sessionId: "sess-1" } },
					body: { url: "http://localhost:3000/simple" },
				}),
			);
		} finally {
			view.restore();
		}
	});

	it("does not mirror an external terminal link into the Browser preview", () => {
		const view = renderPane(worker);
		try {
			act(() => terminalLinkHandler?.("https://example.com"));
			expect(postMock).not.toHaveBeenCalled();
		} finally {
			view.restore();
		}
	});
});
