"use client";

interface FetchJsonOptions extends RequestInit {
  timeoutMs?: number;
  timeoutMessage?: string;
}

const inflightFetches = new Map<string, Promise<Response>>();

function getFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getFetchMethod(input: RequestInfo | URL, init: RequestInit | undefined): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function hashBody(body: BodyInit | null | undefined): string {
  if (body === null || body === undefined) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Blob) return `blob:${body.type}:${body.size}`;
  if (body instanceof ArrayBuffer) return `array-buffer:${body.byteLength}`;
  if (ArrayBuffer.isView(body)) {
    return `${body.constructor.name}:${body.byteOffset}:${body.byteLength}`;
  }
  if (body instanceof FormData) {
    return [...body.entries()]
      .map(([key, value]) =>
        typeof File !== "undefined" && value instanceof File
          ? `${key}=file:${value.name}:${value.type}:${value.size}`
          : `${key}=${value}`,
      )
      .join("&");
  }
  return body.constructor.name;
}

function getFetchKey(input: RequestInfo | URL, init: RequestInit | undefined): string {
  return `${getFetchUrl(input)}|${getFetchMethod(input, init)}|${hashBody(init?.body)}`;
}

function cloneResponse(response: Response): Response {
  return typeof response.clone === "function" ? response.clone() : response;
}

export function dedupFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const key = getFetchKey(input, init);
  const existing = inflightFetches.get(key);
  if (existing) {
    return existing;
  }

  // Per-caller AbortSignals are handled by fetchJsonWithTimeout. Passing the
  // first caller's signal to the shared fetch would let one timeout abort the
  // network request for every waiter, defeating in-flight coalescing.
  const { signal: _signal, ...sharedInit } = init ?? {};
  const request = fetch(input, sharedInit).finally(() => {
    inflightFetches.delete(key);
  });
  inflightFetches.set(key, request);
  return request;
}

export function __clearInflightFetchesForTest(): void {
  inflightFetches.clear();
}

function mergeAbortSignals(
  signals: Array<AbortSignal | null | undefined>,
): AbortSignal | undefined {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length === 0) return undefined;
  if (activeSignals.length === 1) return activeSignals[0];

  const controller = new AbortController();
  const abort = () => controller.abort();

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", abort, { once: true });
  }

  return controller.signal;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string; message?: string } | null;
    const message = payload?.error ?? payload?.message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  } catch {
    // Ignore parse failures and fall back to status text.
  }

  const statusText = typeof response.statusText === "string" ? response.statusText.trim() : "";
  if (statusText.length > 0) {
    return `${response.status} ${statusText}`;
  }

  return `HTTP ${response.status}`;
}

export async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  options: FetchJsonOptions = {},
): Promise<T> {
  const { timeoutMs = 8_000, timeoutMessage, signal, ...init } = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let removeAbortListener: () => void = () => {};
  let timedOut = false;

  try {
    const mergedSignal = mergeAbortSignals([signal]);
    const requestInit: RequestInit = { ...init };
    if (mergedSignal) {
      requestInit.signal = mergedSignal;
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new Error(timeoutMessage ?? `Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const abortPromise =
      mergedSignal === undefined
        ? null
        : new Promise<never>((_, reject) => {
            const abort = () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            };
            if (mergedSignal.aborted) {
              abort();
              return;
            }
            mergedSignal.addEventListener("abort", abort, { once: true });
            removeAbortListener = () => mergedSignal.removeEventListener("abort", abort);
          });

    const sharedResponse = await Promise.race([
      dedupFetch(input, requestInit).catch((error: unknown) => {
        if (timedOut) {
          throw new Error(timeoutMessage ?? `Request timed out after ${timeoutMs}ms`, {
            cause: error,
          });
        }
        throw error;
      }),
      timeoutPromise,
      ...(abortPromise ? [abortPromise] : []),
    ]);
    const response = cloneResponse(sharedResponse);

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return (await response.json()) as T;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    removeAbortListener();
  }
}
