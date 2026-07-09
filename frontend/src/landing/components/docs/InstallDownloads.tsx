import { Logo } from "./Logo";

const RELEASE_BASE = "https://github.com/AgentWrapper/agent-orchestrator/releases/latest";

const DOWNLOADS = [
	{
		platform: "macOS",
		detail: "Apple silicon",
		hint: "Unzip, then open Agent Orchestrator.app",
		logo: "apple",
		type: ".zip",
		href: `${RELEASE_BASE}/download/agent-orchestrator-darwin-arm64.zip`,
	},
	{
		platform: "macOS",
		detail: "Intel",
		hint: "Unzip, then open Agent Orchestrator.app",
		logo: "apple",
		type: ".zip",
		href: `${RELEASE_BASE}/download/agent-orchestrator-darwin-x64.zip`,
	},
	{
		platform: "Windows",
		detail: "x64 installer",
		hint: "Run the installer, then launch the app",
		logo: "windows",
		type: ".exe",
		href: `${RELEASE_BASE}/download/agent-orchestrator-win32-x64.exe`,
	},
	{
		platform: "Linux",
		detail: "x64 AppImage",
		hint: "Make executable if needed, then run it",
		logo: "linux",
		type: ".AppImage",
		href: `${RELEASE_BASE}/download/agent-orchestrator-linux-x64.AppImage`,
	},
];

const SETUP_STEPS = [
	{
		title: "Download the app",
		body: "Choose the release asset for your OS. This is the supported fresh-install path.",
	},
	{
		title: "Open AO",
		body: "The desktop app owns the daemon, dashboard, and project sessions.",
	},
	{
		title: "Add a repository",
		body: "Pick a local repo or paste a GitHub URL; AO prepares an isolated git worktree.",
	},
];

export function InstallDownloads() {
	return (
		<section className="ao-install-downloads" aria-label="Download Agent Orchestrator">
			<div className="ao-install-downloads__header">
				<div className="ao-install-downloads__copy">
					<div className="ao-install-downloads__eyebrow">Recommended for new installs</div>
					<div className="ao-install-downloads__title">Install the desktop app</div>
					<div className="ao-install-downloads__description">
						The desktop build is the canonical AO install. It opens your repository in the app-managed
						workspace flow; no global <code>ao</code> CLI is required.
					</div>
				</div>
				<a className="ao-install-downloads__release" href={RELEASE_BASE}>
					Latest release
				</a>
			</div>

			<ol className="ao-install-downloads__steps" aria-label="Install steps">
				{SETUP_STEPS.map((step, index) => (
					<li key={step.title} className="ao-install-downloads__step">
						<span className="ao-install-downloads__step-index">{index + 1}</span>
						<span className="ao-install-downloads__step-copy">
							<span className="ao-install-downloads__step-title">{step.title}</span>
							<span className="ao-install-downloads__step-body">{step.body}</span>
						</span>
					</li>
				))}
			</ol>

			<div className="ao-install-downloads__grid">
				{DOWNLOADS.map((download) => (
					<a key={`${download.platform}-${download.detail}`} className="ao-install-downloads__item" href={download.href}>
						<span className="ao-install-downloads__icon">
							<Logo name={download.logo} size={20} />
						</span>
						<span className="ao-install-downloads__meta">
							<span className="ao-install-downloads__platform">{download.platform}</span>
							<span className="ao-install-downloads__detail">{download.detail}</span>
							<span className="ao-install-downloads__hint">{download.hint}</span>
						</span>
						<span className="ao-install-downloads__type">{download.type}</span>
					</a>
				))}
			</div>

			<div className="ao-install-downloads__note">
				Already using the npm CLI? Keep that path under <a href="#start-ao-in-a-repo">Start AO in a repo</a>.
			</div>
		</section>
	);
}
