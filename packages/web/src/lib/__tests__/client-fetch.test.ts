import { afterEach, describe, expect, it, vi } from "vitest";
import { __clearInflightFetchesForTest, dedupFetch } from "../client-fetch";

describe("dedupFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __clearInflightFetchesForTest();
  });

  it("shares the same in-flight promise for concurrent requests with the same key", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = dedupFetch("/api/sessions/ao-187");
    const second = dedupFetch("/api/sessions/ao-187");

    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    resolveFetch?.(response);

    await expect(first).resolves.toBe(response);
    await expect(second).resolves.toBe(response);
  });

  it("starts a new request after the in-flight request settles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await dedupFetch("/api/sessions/ao-187");
    await dedupFetch("/api/sessions/ao-187");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
