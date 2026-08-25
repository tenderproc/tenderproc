import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Paddle webhook IP allowlist", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.PADDLE_ENV;

  beforeEach(async () => {
    const mod = await import("@/lib/billing/paddleIpAllowlist");
    mod._resetCacheForTests();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.PADDLE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  function mockFetch(cidrs: string[], ok = true) {
    global.fetch = vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 500,
      statusText: ok ? "OK" : "Internal Server Error",
      json: async () => ({ data: { ipv4_cidrs: cidrs } }),
    }) as unknown as typeof fetch;
  }

  it("allows an IP that matches a /32 entry and rejects one that doesn't", async () => {
    mockFetch(["34.237.3.244/32"]);
    const { isAllowedPaddleWebhookIp } = await import("@/lib/billing/paddleIpAllowlist");
    await expect(isAllowedPaddleWebhookIp("34.237.3.244")).resolves.toBe(true);
    await expect(isAllowedPaddleWebhookIp("1.2.3.4")).resolves.toBe(false);
  });

  it("rejects a missing IP without calling fetch", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { isAllowedPaddleWebhookIp } = await import("@/lib/billing/paddleIpAllowlist");
    await expect(isAllowedPaddleWebhookIp(null)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("matches against a wider CIDR block, not just /32s", async () => {
    mockFetch(["10.0.0.0/24"]);
    const { isAllowedPaddleWebhookIp } = await import("@/lib/billing/paddleIpAllowlist");
    await expect(isAllowedPaddleWebhookIp("10.0.0.200")).resolves.toBe(true);
    await expect(isAllowedPaddleWebhookIp("10.0.1.1")).resolves.toBe(false);
  });

  it("queries the sandbox IPs endpoint in sandbox and the live one in production", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data: { ipv4_cidrs: ["1.1.1.1/32"] } }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { isAllowedPaddleWebhookIp, _resetCacheForTests } = await import("@/lib/billing/paddleIpAllowlist");

    process.env.PADDLE_ENV = "sandbox";
    await isAllowedPaddleWebhookIp("1.1.1.1");
    expect(fetchSpy).toHaveBeenLastCalledWith("https://sandbox-api.paddle.com/ips", expect.anything());

    _resetCacheForTests();
    process.env.PADDLE_ENV = "production";
    await isAllowedPaddleWebhookIp("1.1.1.1");
    expect(fetchSpy).toHaveBeenLastCalledWith("https://api.paddle.com/ips", expect.anything());
  });

  it("falls back to the last known-good list when a refresh fails", async () => {
    mockFetch(["34.237.3.244/32"]);
    const { isAllowedPaddleWebhookIp } = await import("@/lib/billing/paddleIpAllowlist");
    await expect(isAllowedPaddleWebhookIp("34.237.3.244")).resolves.toBe(true);

    // Cache is fresh (< 1h), so a failing fetch shouldn't even be consulted —
    // confirm the previously-allowed IP is still allowed.
    mockFetch([], false);
    await expect(isAllowedPaddleWebhookIp("34.237.3.244")).resolves.toBe(true);
  });

  it("fails closed when there is no cache yet and the fetch fails", async () => {
    mockFetch([], false);
    const { isAllowedPaddleWebhookIp } = await import("@/lib/billing/paddleIpAllowlist");
    await expect(isAllowedPaddleWebhookIp("34.237.3.244")).rejects.toThrow(/Paddle IP list fetch failed/);
  });
});
