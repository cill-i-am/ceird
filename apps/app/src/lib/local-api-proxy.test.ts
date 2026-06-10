import { proxyLocalAppApiRequest } from "./local-api-proxy";

describe("local API proxy", () => {
  it("proxies stage-scoped Portless app API requests to the configured API origin", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json(
        { ok: true },
        {
          headers: {
            "set-cookie": "better-auth.session_token=session-token; Path=/",
          },
        }
      )
    );

    const response = await proxyLocalAppApiRequest(
      new Request(
        "https://app.codex-portless.ceird.localhost/api/auth/sign-in/email?x=1",
        {
          body: JSON.stringify({ email: "user@example.com" }),
          headers: {
            "content-type": "application/json",
            cookie: "better-auth.session_token=existing",
          },
          method: "POST",
        }
      ),
      {
        apiOrigin: "https://api.codex-portless.ceird.localhost",
        fetch,
      }
    );

    expect(fetch).toHaveBeenCalledOnce();
    const forwardedRequest = fetch.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe(
      "https://api.codex-portless.ceird.localhost/api/auth/sign-in/email?x=1"
    );
    expect(forwardedRequest.headers.get("origin")).toBe(
      "https://app.codex-portless.ceird.localhost"
    );
    expect(forwardedRequest.headers.get("x-forwarded-host")).toBe(
      "api.codex-portless.ceird.localhost"
    );
    expect(forwardedRequest.headers.get("x-forwarded-proto")).toBe("https");
    expect(forwardedRequest.headers.get("cf-connecting-ip")).toBe("127.0.0.1");
    expect(forwardedRequest.headers.get("x-forwarded-for")).toBe("127.0.0.1");
    expect(forwardedRequest.headers.get("cookie")).toBe(
      "better-auth.session_token=existing"
    );
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token=session-token"
    );
  });

  it("uses the public host header when the Worker request URL is internal", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ ok: true }));

    await proxyLocalAppApiRequest(
      new Request("http://internal.local/api/jobs", {
        headers: {
          host: "app.codex-portless.ceird.localhost",
          "x-forwarded-proto": "https",
        },
      }),
      {
        apiOrigin: "https://api.codex-portless.ceird.localhost",
        fetch,
      }
    );

    const forwardedRequest = fetch.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe(
      "https://api.codex-portless.ceird.localhost/jobs"
    );
    expect(forwardedRequest.headers.get("origin")).toBe(
      "https://app.codex-portless.ceird.localhost"
    );
  });

  it("preserves an upstream client IP when one is already available", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ ok: true }));

    await proxyLocalAppApiRequest(
      new Request(
        "https://app.codex-portless.ceird.localhost/api/auth/sign-up/email",
        {
          headers: {
            "cf-connecting-ip": "203.0.113.12",
            "x-forwarded-for": "203.0.113.11",
          },
          method: "POST",
        }
      ),
      {
        apiOrigin: "https://api.codex-portless.ceird.localhost",
        fetch,
      }
    );

    const forwardedRequest = fetch.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.headers.get("cf-connecting-ip")).toBe(
      "203.0.113.12"
    );
    expect(forwardedRequest.headers.get("x-forwarded-for")).toBe(
      "203.0.113.11"
    );
  });

  it("strips the local proxy API prefix for product API requests", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ items: [] }));

    await proxyLocalAppApiRequest(
      new Request(
        "https://app.codex-portless.ceird.localhost/api/jobs?limit=25"
      ),
      {
        apiOrigin: "https://api.codex-portless.ceird.localhost",
        fetch,
      }
    );

    const forwardedRequest = fetch.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe(
      "https://api.codex-portless.ceird.localhost/jobs?limit=25"
    );
  });

  it("keeps Better Auth and public auth paths under the API prefix", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(null));

    await proxyLocalAppApiRequest(
      new Request(
        "https://app.codex-portless.ceird.localhost/api/auth/get-session"
      ),
      {
        apiOrigin: "https://api.codex-portless.ceird.localhost",
        fetch,
      }
    );
    await proxyLocalAppApiRequest(
      new Request(
        "https://app.codex-portless.ceird.localhost/api/public/invitations/inv_123/preview"
      ),
      {
        apiOrigin: "https://api.codex-portless.ceird.localhost",
        fetch,
      }
    );

    const sessionRequest = fetch.mock.calls[0]?.[0];
    const previewRequest = fetch.mock.calls[1]?.[0];

    expect(sessionRequest).toBeInstanceOf(Request);
    expect(previewRequest).toBeInstanceOf(Request);
    expect((sessionRequest as Request).url).toBe(
      "https://api.codex-portless.ceird.localhost/api/auth/get-session"
    );
    expect((previewRequest as Request).url).toBe(
      "https://api.codex-portless.ceird.localhost/api/public/invitations/inv_123/preview"
    );
  });

  it("does not expose the proxy on non-local app hosts", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const response = await proxyLocalAppApiRequest(
      new Request("https://app.ceird.example.com/api/auth/get-session"),
      {
        apiOrigin: "https://api.ceird.example.com",
        fetch,
      }
    );

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not expose the proxy on local app hosts without a stage", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const response = await proxyLocalAppApiRequest(
      new Request("https://app.ceird.localhost/api/auth/get-session"),
      {
        apiOrigin: "https://api.ceird.localhost",
        fetch,
      }
    );

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
