# Onboarding

Step-by-step guide to get a new contributor up and running. Read [AGENTS.md](../AGENTS.md) for the authoritative coding rules and hard boundaries; this document is the fast-path environment setup and workflow reference.

## Prerequisites

- **Go** (backend) — install from <https://go.dev/dl/>
- **Node.js + npm** (frontend) — install from <https://nodejs.org/>
- **git**

For the desktop binary, see the **Install** section of [README.md](../README.md).

## Repository layout

- `backend/` — Go rewrite of Agent Orchestrator: Cobra `ao` CLI, loopback HTTP daemon, services, SQLite storage, lifecycle/reaper, runtime/workspace/agent/tracker adapters, terminal mux, and tests.
- `frontend/` — Electron + React supervisor wired to the daemon via the generated typed client. Treat it as a thin supervisor/UI surface; do not move daemon logic into it.
- `docs/` — current architecture/status notes. Start here before changing lifecycle, CLI, agents, storage, or daemon behavior. See [docs/README.md](README.md) for the full docs index.
- `test/` — external smoke/e2e assets, including the CLI fresh-install container check.
- `.github/workflows/` — CI definitions. Mirror these commands locally when possible.

## Environment setup

```bash
git clone https://github.com/AgentWrapper/agent-orchestrator.git
cd agent-orchestrator

# Verify backend
cd backend && go build ./...

# Verify frontend
cd ../frontend && npm install && npm run typecheck
```

Both commands should complete without errors. If either fails, resolve the dependency issue before proceeding.

## Local development workflow

From the repo root unless noted:

```bash
npm run lint                         # backend go test ./... + golangci-lint v2.12.2
npm run frontend:typecheck           # frontend TypeScript check
npm run sqlc                         # regenerate backend/internal/storage/sqlite/gen from queries/schema
npm run api                          # regenerate OpenAPI spec + frontend TS types
```

Backend-specific checks:

```bash
cd backend
go build ./...
go test ./...
go vet ./...
go run ./cmd/ao start
```

Frontend-specific checks:

```bash
cd frontend
npm run typecheck
npm run build
```

## Code entry points

- CLI commands: `backend/internal/cli/*.go`; follow nearby command/test patterns before adding a new style.
- HTTP controllers and DTOs: `backend/internal/httpd/controllers/`.
- Service read/write boundaries: `backend/internal/service/`.
- Domain vocabulary: `backend/internal/domain/`.
- Port contracts: `backend/internal/ports/`.
- SQLite queries/migrations/store: `backend/internal/storage/sqlite/`.
- Generated sqlc code: `backend/internal/storage/sqlite/gen/`.

## Coding conventions

- Keep every change surgical and directly tied to the task. Avoid drive-by cleanup, broad renames, formatting churn, speculative abstractions, and architectural refactors unless the task explicitly asks for them.
- Follow existing Go package boundaries. CLI code should call daemon HTTP routes through shared CLI client helpers; it should not open SQLite, spawn runtimes, or call adapters directly.
- Keep Cobra commands in the relevant command file and table-test them in the style of `backend/internal/cli/*_test.go`.
- Mirror existing response/request DTOs in the CLI instead of importing HTTP controller packages into CLI code, unless the package already establishes that dependency.
- Return usage errors as `usageError` so CLI misuse exits 2; runtime/daemon failures should exit 1.
- Use `context.Context` as the first argument for functions that do I/O or blocking work.
- Do not add abstractions for one-off use cases. Add helpers only when they remove duplication across real call sites.
- Tests should cover the user-visible behavior and boundary being changed: happy path, validation/missing args, daemon error envelopes, and any destructive confirmation path.

## PR process

- Branch from `main` unless explicitly continuing an existing PR.
- Keep one issue per PR. If asked for separate work, create a separate branch and PR.
- Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Explain intentional omissions in the PR body, especially when the TypeScript original had more behavior than the Go rewrite domain currently supports.
- Run the narrowest relevant tests first, then the repo/CI commands that match the touched area.

## Getting help

Join the community on Discord — see [CONTRIBUTING.md](../CONTRIBUTING.md) for the invite link and the daily **10 PM IST** contributor sync where core contributors verify issues and PRs.
