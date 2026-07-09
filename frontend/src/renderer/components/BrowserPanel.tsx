import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Globe2, Maximize2, Minimize2, MousePointer2, RefreshCw, X } from "lucide-react";
import { apiClient, apiErrorMessage } from "../lib/api-client";
import { useBrowserView, type BrowserViewModel } from "../hooks/useBrowserView";
import { formatBrowserAnnotationMessage, type BrowserAnnotationSubmitPayload } from "../../shared/browser-annotations";
import type { WorkspaceSession } from "../types/workspace";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type BrowserPanelProps = {
	session: WorkspaceSession;
	active: boolean;
	poppedOut: boolean;
	onTogglePopOut: (next: boolean) => void;
};

type AnnotationStatus = "idle" | "picking" | "queued" | "sending" | "sent" | "error";

export function BrowserPanel({ session, active, poppedOut, onTogglePopOut }: BrowserPanelProps) {
	const browserView = useBrowserView({
		sessionId: session.id,
		active,
		poppedOut,
		previewUrl: session.previewUrl,
		previewRevision: session.previewRevision,
	});
	return (
		<BrowserPanelView
			active={active}
			browserView={browserView}
			onTogglePopOut={onTogglePopOut}
			poppedOut={poppedOut}
			session={session}
		/>
	);
}

export function BrowserPanelView({
	session,
	poppedOut,
	onTogglePopOut,
	browserView,
}: BrowserPanelProps & { browserView: BrowserViewModel }) {
	const { viewId, navState, slotRef, navigate, goBack, goForward, reload, stop, annotationMode, setAnnotationMode } =
		browserView;
	const [urlInput, setUrlInput] = useState(navState.url);
	const [annotationStatus, setAnnotationStatus] = useState<AnnotationStatus>("idle");
	const [annotationError, setAnnotationError] = useState("");
	const [annotationQueuedCount, setAnnotationQueuedCount] = useState(0);
	const annotationQueueRef = useRef<BrowserAnnotationSubmitPayload[]>([]);
	const annotationSendingRef = useRef(false);
	const annotationWaitingForAgentCycleRef = useRef(false);
	const annotationSawAgentWorkingRef = useRef(false);
	const sessionBusyRef = useRef(session.status === "working");
	const sessionReadyForAnnotationRef = useRef(session.status === "needs_input");
	const showStaticPreview = !window.ao?.browser && navState.url !== "";
	const sessionBusy = session.status === "working";
	const canAnnotate = Boolean(window.ao?.browser && viewId && navState.url);

	useEffect(() => {
		setUrlInput(navState.url);
	}, [navState.url]);

	useEffect(() => {
		if (navState.url) return;
		annotationQueueRef.current = [];
		annotationWaitingForAgentCycleRef.current = false;
		annotationSawAgentWorkingRef.current = false;
		setAnnotationQueuedCount(0);
		setAnnotationStatus("idle");
		setAnnotationError("");
	}, [navState.url]);

	const setQueuedStatus = useCallback(() => {
		const count = annotationQueueRef.current.length;
		setAnnotationQueuedCount(count);
		if (count > 0) setAnnotationStatus("queued");
	}, []);

	const drainAnnotationQueue = useCallback(() => {
		if (
			annotationSendingRef.current ||
			!sessionReadyForAnnotationRef.current ||
			annotationWaitingForAgentCycleRef.current
		) {
			return;
		}

		const payload = annotationQueueRef.current.shift();
		setAnnotationQueuedCount(annotationQueueRef.current.length);
		if (!payload) return;

		annotationSendingRef.current = true;
		setAnnotationStatus("sending");
		setAnnotationError("");

		void (async () => {
			let sent = false;
			try {
				const message = formatBrowserAnnotationMessage(payload);
				const { error } = await apiClient.POST("/api/v1/sessions/{sessionId}/send", {
					params: { path: { sessionId: session.id } },
					body: { message },
				});
				if (error) {
					setAnnotationStatus("error");
					setAnnotationError(apiErrorMessage(error, "Unable to send annotation."));
					return;
				}
				sent = true;
			} catch (error) {
				setAnnotationStatus("error");
				setAnnotationError(apiErrorMessage(error, "Unable to send annotation."));
			} finally {
				annotationSendingRef.current = false;
				setAnnotationQueuedCount(annotationQueueRef.current.length);
				if (!sent) return;

				if (annotationQueueRef.current.length > 0) {
					annotationWaitingForAgentCycleRef.current = true;
					annotationSawAgentWorkingRef.current = sessionBusyRef.current;
					setAnnotationStatus("queued");
					return;
				}

				setAnnotationStatus("sent");
			}
		})();
	}, [session.id]);

	useEffect(() => {
		const nextBusy = session.status === "working";
		const nextReady = session.status === "needs_input";
		sessionBusyRef.current = nextBusy;
		sessionReadyForAnnotationRef.current = nextReady;
		if (nextBusy) {
			if (annotationWaitingForAgentCycleRef.current) {
				annotationSawAgentWorkingRef.current = true;
			}
			return;
		}
		if (!nextReady) return;
		if (annotationWaitingForAgentCycleRef.current) {
			if (!annotationSawAgentWorkingRef.current) return;
			annotationWaitingForAgentCycleRef.current = false;
			annotationSawAgentWorkingRef.current = false;
		}
		drainAnnotationQueue();
	}, [drainAnnotationQueue, session.status]);

	const enqueueAnnotation = useCallback(
		(payload: BrowserAnnotationSubmitPayload) => {
			annotationQueueRef.current.push(payload);
			setAnnotationError("");
			setQueuedStatus();
			drainAnnotationQueue();
		},
		[drainAnnotationQueue, setQueuedStatus],
	);

	useEffect(() => {
		const offSubmit = window.ao?.browser.onAnnotationSubmit((payload) => {
			if (payload.viewId !== viewId) return;
			enqueueAnnotation(payload);
		});
		const offCancel = window.ao?.browser.onAnnotationCancel((payload) => {
			if (payload.viewId !== viewId) return;
			setQueuedStatus();
			if (!annotationSendingRef.current && annotationQueueRef.current.length === 0) setAnnotationStatus("idle");
			setAnnotationError("");
		});
		return () => {
			offSubmit?.();
			offCancel?.();
		};
	}, [enqueueAnnotation, setQueuedStatus, viewId]);

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const nextURL = urlInput.trim();
		if (nextURL) void navigate(nextURL);
	};

	const toggleAnnotationMode = async () => {
		if (!canAnnotate || annotationStatus === "sending") return;
		const next = !(annotationMode || annotationStatus === "picking");
		setAnnotationError("");
		try {
			await setAnnotationMode(next);
			setAnnotationStatus(next ? "picking" : "idle");
		} catch (error) {
			setAnnotationStatus("error");
			setAnnotationError(error instanceof Error ? error.message : "Unable to start annotation.");
		}
	};

	const annotationStatusLabel =
		annotationStatus === "picking"
			? "Pick element"
			: annotationStatus === "queued"
				? annotationQueuedCount > 1
					? `Queued (${annotationQueuedCount})`
					: "Queued"
				: annotationStatus === "sending"
					? "Sending"
					: annotationStatus === "sent"
						? "Sent"
						: annotationStatus === "error"
							? annotationError
							: "";

	return (
		<div className="browser-panel" role="tabpanel">
			<form className="browser-panel__toolbar" onSubmit={submit}>
				<Button
					aria-label="Back"
					disabled={!navState.canGoBack}
					onClick={() => void goBack()}
					size="icon-sm"
					type="button"
					variant="ghost"
				>
					<ArrowLeft aria-hidden="true" className="h-4 w-4" />
				</Button>
				<Button
					aria-label="Forward"
					disabled={!navState.canGoForward}
					onClick={() => void goForward()}
					size="icon-sm"
					type="button"
					variant="ghost"
				>
					<ArrowRight aria-hidden="true" className="h-4 w-4" />
				</Button>
				<Button
					aria-label={navState.isLoading ? "Stop" : "Reload"}
					onClick={() => void (navState.isLoading ? stop() : reload())}
					size="icon-sm"
					type="button"
					variant="ghost"
				>
					{navState.isLoading ? (
						<X aria-hidden="true" className="h-4 w-4" />
					) : (
						<RefreshCw aria-hidden="true" className="h-4 w-4" />
					)}
				</Button>
				<Button
					aria-label={annotationMode || annotationStatus === "picking" ? "Cancel annotation" : "Annotate page"}
					aria-pressed={annotationMode || annotationStatus === "picking"}
					className="browser-panel__annotate-btn"
					disabled={!canAnnotate || annotationStatus === "sending"}
					onClick={() => void toggleAnnotationMode()}
					size="icon-sm"
					title="Annotate page"
					type="button"
					variant="ghost"
				>
					<MousePointer2 aria-hidden="true" className="h-4 w-4" />
				</Button>
				{annotationStatusLabel ? (
					<span
						className={
							annotationStatus === "error"
								? "browser-panel__annotation-status browser-panel__annotation-status--error"
								: "browser-panel__annotation-status"
						}
					>
						{annotationStatusLabel}
					</span>
				) : sessionBusy ? (
					<span className="browser-panel__annotation-status">Agent working</span>
				) : null}
				<div className="browser-panel__url">
					<Globe2 aria-hidden="true" className="browser-panel__url-icon" />
					<Input
						aria-label="Browser URL"
						className="browser-panel__url-input"
						onChange={(event) => setUrlInput(event.target.value)}
						placeholder="localhost:5173"
						value={urlInput}
					/>
				</div>
				<Button
					aria-label={poppedOut ? "Return to panel" : "Pop out"}
					onClick={() => onTogglePopOut(!poppedOut)}
					size="icon-sm"
					type="button"
					variant="ghost"
				>
					{poppedOut ? (
						<Minimize2 aria-hidden="true" className="h-4 w-4" />
					) : (
						<Maximize2 aria-hidden="true" className="h-4 w-4" />
					)}
				</Button>
			</form>
			<div className="browser-panel__content">
				<div className="browser-panel__slot" ref={slotRef} />
				{showStaticPreview ? <StaticPreview url={navState.url} /> : null}
				{navState.url === "" ? (
					<div className="browser-panel__overlay">
						<p>Enter a dev-server URL to preview it here.</p>
					</div>
				) : null}
				{navState.error ? <p className="browser-panel__error">{navState.error}</p> : null}
			</div>
		</div>
	);
}

function StaticPreview({ url }: { url: string }) {
	return (
		<div className="absolute inset-0 overflow-auto bg-[#f7f8fb] text-[#17202a]">
			<div className="border-b border-[#dfe4ea] bg-white px-4 py-3">
				<div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#687384]">AO Preview</div>
				<div className="mt-1 truncate font-mono text-[12px] text-[#2f5b9d]">{url}</div>
			</div>
			<div className="mx-auto max-w-[760px] px-5 py-6">
				<div className="rounded-[8px] border border-[#d7dee8] bg-white p-5 shadow-sm">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h1 className="text-[22px] font-semibold leading-tight tracking-normal text-[#111827]">
								Demo app preview
							</h1>
							<p className="mt-1 text-[13px] leading-5 text-[#526070]">
								The worker exposed a local Vite app with <span className="font-mono">ao preview</span>.
							</p>
						</div>
						<span className="rounded-[6px] bg-[#e7f8ed] px-2.5 py-1 text-[11px] font-semibold text-[#177245]">
							Loaded
						</span>
					</div>
					<div className="mt-5 grid grid-cols-3 gap-3">
						{[
							["Routes", "12 passing"],
							["Build", "ready"],
							["Latency", "42 ms"],
						].map(([label, value]) => (
							<div key={label} className="rounded-[7px] border border-[#e1e7ef] bg-[#fbfcfe] p-3">
								<div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#687384]">{label}</div>
								<div className="mt-1 text-[15px] font-semibold text-[#111827]">{value}</div>
							</div>
						))}
					</div>
					<div className="mt-5 rounded-[7px] border border-[#dce4ef] bg-[#0f172a] p-3 font-mono text-[12px] leading-5 text-[#cbd5e1]">
						<div>$ npm run dev -- --host 127.0.0.1</div>
						<div className="text-[#86efac]">ready in 418 ms</div>
						<div>Local: http://localhost:5173/</div>
					</div>
				</div>
			</div>
		</div>
	);
}
