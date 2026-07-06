import { describe, expect, it } from "vitest";
import { isAllowedAppExternalURL } from "./external-open";

describe("isAllowedAppExternalURL", () => {
	it("allows web and mail handoff URLs from the app renderer", () => {
		expect(isAllowedAppExternalURL("https://github.com/AgentWrapper/agent-orchestrator/issues/new")).toBe(true);
		expect(isAllowedAppExternalURL("http://localhost:5173/help")).toBe(true);
		expect(isAllowedAppExternalURL("mailto:support@aoagents.dev?subject=AO%20feedback")).toBe(true);
	});

	it("blocks local, privileged, and script schemes", () => {
		expect(isAllowedAppExternalURL("file:///Users/alice/private.txt")).toBe(false);
		expect(isAllowedAppExternalURL("app://renderer/index.html")).toBe(false);
		expect(isAllowedAppExternalURL("javascript:alert(1)")).toBe(false);
	});
});
