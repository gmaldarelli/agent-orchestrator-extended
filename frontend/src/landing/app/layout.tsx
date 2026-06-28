import type { Metadata } from "next";
import "../styles/globals.css";

export const metadata: Metadata = {
	title: "Agent Orchestrator",
	description: "Open-source platform for running parallel AI coding agents.",
};

const themeScript = `
(() => {
  document.documentElement.dataset.theme = "dark";
  document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = "dark";
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
			</head>
			<body>{children}</body>
		</html>
	);
}
