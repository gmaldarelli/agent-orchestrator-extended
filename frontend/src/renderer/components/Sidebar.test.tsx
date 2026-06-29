import { SidebarProvider } from "@/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { WorkspaceSummary } from "../types/workspace";

const { navigateMock, mockParams } = vi.hoisted(() => ({
	navigateMock: vi.fn(),
	mockParams: { projectId: undefined as string | undefined },
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@tanstack/react-router")>();
	return {
		...actual,
		useNavigate: () => navigateMock,
		useParams: () => mockParams,
		useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
			select({ location: { pathname: "/" } }),
	};
});

const workspace: WorkspaceSummary = {
	id: "proj-1",
	name: "Project One",
	path: "/repo/project-one",
	sessions: [],
};

type ImportProjectHandler = (input: {
	path: string;
	workerAgent?: string;
	orchestratorAgent?: string;
	asWorkspace?: boolean;
}) => Promise<void>;
type RemoveProjectHandler = (projectId: string) => Promise<void>;

function renderSidebar({
	onCreateProject = vi.fn().mockResolvedValue(undefined) as ImportProjectHandler,
	onRemoveProject = vi.fn().mockResolvedValue(undefined) as RemoveProjectHandler,
}: {
	onCreateProject?: ImportProjectHandler;
	onRemoveProject?: RemoveProjectHandler;
} = {}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	render(
		<QueryClientProvider client={queryClient}>
			<SidebarProvider>
				<Sidebar
					daemonStatus={{ state: "running" }}
					onCreateProject={onCreateProject}
					onRemoveProject={onRemoveProject}
					workspaces={[workspace]}
				/>
			</SidebarProvider>
		</QueryClientProvider>,
	);
	return onRemoveProject;
}

async function chooseOption(trigger: HTMLElement, optionName: string) {
	await userEvent.click(trigger);
	await userEvent.click(await screen.findByRole("option", { name: optionName }));
}

beforeEach(() => {
	navigateMock.mockReset();
	mockParams.projectId = undefined;
	vi.spyOn(window, "confirm").mockReturnValue(true);
	vi.spyOn(window, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Sidebar", () => {
	it("confirms project removal before calling the remove handler", async () => {
		const user = userEvent.setup();
		const onRemoveProject = renderSidebar();

		await user.click(screen.getByLabelText("Project actions for Project One"));
		await user.click(await screen.findByRole("menuitem", { name: "Remove project" }));

		expect(window.confirm).toHaveBeenCalledWith(
			"Remove project Project One? This stops its live sessions and removes it from the sidebar, but keeps the repository folder and stored history on disk.",
		);
		await waitFor(() => expect(onRemoveProject).toHaveBeenCalledTimes(1));
	});

	it("does not remove the project when confirmation is cancelled", async () => {
		vi.mocked(window.confirm).mockReturnValue(false);
		const user = userEvent.setup();
		const onRemoveProject = renderSidebar();

		await user.click(screen.getByLabelText("Project actions for Project One"));
		await user.click(await screen.findByRole("menuitem", { name: "Remove project" }));

		expect(onRemoveProject).not.toHaveBeenCalled();
	});

	it("reveals dashboard and orchestrator buttons alongside the kebab on the project row", () => {
		renderSidebar();

		expect(screen.getByLabelText("Open Project One dashboard")).toBeInTheDocument();
		expect(screen.getByLabelText("Spawn Project One orchestrator")).toBeInTheDocument();
		expect(screen.getByLabelText("Project actions for Project One")).toBeInTheDocument();
	});

	it("navigates to the project board when the dashboard button is clicked", async () => {
		const user = userEvent.setup();
		renderSidebar();

		await user.click(screen.getByLabelText("Open Project One dashboard"));

		expect(navigateMock).toHaveBeenCalledWith({ to: "/projects/$projectId", params: { projectId: "proj-1" } });
	});

	it("requires explicit worker and orchestrator agents when creating a project", async () => {
		const user = userEvent.setup();
		const onCreateProject = vi.fn().mockResolvedValue(undefined) as ImportProjectHandler;
		window.ao!.app.chooseDirectory = vi.fn().mockResolvedValue("/repo/new-project");
		renderSidebar({ onCreateProject });

		await user.click(screen.getByLabelText("New project"));
		await user.click(await screen.findByRole("button", { name: /Project A single Git repository/i }));
		await user.click(screen.getByRole("button", { name: /Choose a project folder/i }));
		await user.click(await screen.findByRole("button", { name: "Import project" }));

		expect((await screen.findAllByText("/repo/new-project")).length).toBeGreaterThan(0);
		const dialog = screen.getByRole("dialog", { name: "Project agents" });
		expect(dialog).toHaveClass("left-1/2", "top-1/2", "-translate-x-1/2", "-translate-y-1/2");
		await chooseOption(screen.getByRole("combobox", { name: "Worker agent" }), "codex");
		await chooseOption(screen.getByRole("combobox", { name: "Orchestrator agent" }), "claude-code");
		await user.click(screen.getByRole("button", { name: "Create and start" }));

		await waitFor(() =>
			expect(onCreateProject).toHaveBeenCalledWith({
				path: "/repo/new-project",
				workerAgent: "codex",
				orchestratorAgent: "claude-code",
			}),
		);
	});

	it("imports a valid workspace without opening the agent sheet", async () => {
		const user = userEvent.setup();
		const onCreateProject = vi.fn().mockResolvedValue(undefined) as ImportProjectHandler;
		window.ao!.app.chooseDirectory = vi.fn().mockResolvedValue("/repo/workspace");
		window.ao!.app.scanWorkspaceRepos = vi.fn().mockResolvedValue([
			{
				name: "web",
				path: "/repo/workspace/web",
				branch: "main",
				remote: "https://github.com/org/web.git",
				valid: true,
			},
		]);
		renderSidebar({ onCreateProject });

		await user.click(screen.getByLabelText("New project"));
		await user.click(await screen.findByRole("button", { name: /Workspace Several Git repos/i }));
		await user.click(screen.getByRole("button", { name: /Choose a folder/i }));

		expect(await screen.findByText("web")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Import workspace" }));

		await waitFor(() => expect(onCreateProject).toHaveBeenCalledWith({ path: "/repo/workspace", asWorkspace: true }));
		expect(screen.queryByRole("dialog", { name: "Project agents" })).not.toBeInTheDocument();
	});

	it("blocks workspace import when a discovered repository has no remote", async () => {
		const user = userEvent.setup();
		const onCreateProject = vi.fn().mockResolvedValue(undefined) as ImportProjectHandler;
		window.ao!.app.chooseDirectory = vi.fn().mockResolvedValue("/repo/workspace");
		window.ao!.app.scanWorkspaceRepos = vi.fn().mockResolvedValue([
			{
				name: "web",
				path: "/repo/workspace/web",
				branch: "main",
				remote: null,
				valid: false,
				error: "No remote configured",
			},
		]);
		renderSidebar({ onCreateProject });

		await user.click(screen.getByLabelText("New project"));
		await user.click(await screen.findByRole("button", { name: /Workspace Several Git repos/i }));
		await user.click(screen.getByRole("button", { name: /Choose a folder/i }));

		expect(await screen.findByText("VALIDATION FAILED · WORKSPACE NOT REGISTERED")).toBeInTheDocument();
		expect(screen.getByText("Resolve 1 failed repository to continue")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Import workspace" })).toBeDisabled();
		expect(onCreateProject).not.toHaveBeenCalled();
	});

	it("opens global settings from the footer menu when no project is selected", async () => {
		const user = userEvent.setup();
		renderSidebar();

		await user.click(screen.getAllByLabelText("Settings")[0]);
		await user.click(await screen.findByRole("menuitem", { name: "Global settings" }));

		expect(navigateMock).toHaveBeenCalledWith({ to: "/settings" });
	});

	it("shows both project and global settings in the footer menu when a project is selected", async () => {
		mockParams.projectId = "proj-1";
		const user = userEvent.setup();
		renderSidebar();

		await user.click(screen.getAllByLabelText("Settings")[0]);
		expect(await screen.findByRole("menuitem", { name: "Project settings" })).toBeInTheDocument();
		await user.click(await screen.findByRole("menuitem", { name: "Global settings" }));

		expect(navigateMock).toHaveBeenCalledWith({ to: "/settings" });
	});

	it("always shows action icons and reserves padding for them", () => {
		renderSidebar();

		const projectRow = screen.getByText("Project One").closest("button");

		if (!projectRow) throw new Error("Project row button not found");
		// Padding is always reserved for the action cluster (not hover-gated)
		expect(projectRow).toHaveClass("pr-[84px]");
	});
});
