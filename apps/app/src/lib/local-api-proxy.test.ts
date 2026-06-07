import { proxyLocalAppApiRequest } from "./local-api-proxy";

describe("local API proxy", () => {
  it("proxies app.localhost API requests to the configured API origin", async () => {
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
      new Request("http://app.localhost:1337/api/auth/sign-in/email?x=1", {
        body: JSON.stringify({ email: "user@example.com" }),
        headers: {
          "content-type": "application/json",
          cookie: "better-auth.session_token=existing",
        },
        method: "POST",
      }),
      {
        apiOrigin: "http://api.localhost:1337",
        fetch,
      }
    );

    expect(fetch).toHaveBeenCalledOnce();
    const forwardedRequest = fetch.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe(
      "http://api.localhost:1337/api/auth/sign-in/email?x=1"
    );
    expect(forwardedRequest.headers.get("origin")).toBe(
      "http://app.localhost:1337"
    );
    expect(forwardedRequest.headers.get("x-forwarded-host")).toBe(
      "api.localhost:1337"
    );
    expect(forwardedRequest.headers.get("x-forwarded-proto")).toBe("http");
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
          host: "app.localhost:1337",
        },
      }),
      {
        apiOrigin: "http://api.localhost:1337",
        fetch,
      }
    );

    const forwardedRequest = fetch.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe("http://api.localhost:1337/jobs");
    expect(forwardedRequest.headers.get("origin")).toBe(
      "http://app.localhost:1337"
    );
  });

  it("strips the local proxy API prefix for product API requests", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ items: [] }));

    await proxyLocalAppApiRequest(
      new Request("http://app.localhost:1337/api/jobs?limit=25"),
      {
        apiOrigin: "http://api.localhost:1337",
        fetch,
      }
    );

    const forwardedRequest = fetch.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe(
      "http://api.localhost:1337/jobs?limit=25"
    );
  });

  it("keeps Better Auth and public auth paths under the API prefix", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json(null));

    await proxyLocalAppApiRequest(
      new Request("http://app.localhost:1337/api/auth/get-session"),
      {
        apiOrigin: "http://api.localhost:1337",
        fetch,
      }
    );
    await proxyLocalAppApiRequest(
      new Request(
        "http://app.localhost:1337/api/public/invitations/inv_123/preview"
      ),
      {
        apiOrigin: "http://api.localhost:1337",
        fetch,
      }
    );

    const sessionRequest = fetch.mock.calls[0]?.[0];
    const previewRequest = fetch.mock.calls[1]?.[0];

    expect(sessionRequest).toBeInstanceOf(Request);
    expect(previewRequest).toBeInstanceOf(Request);
    expect((sessionRequest as Request).url).toBe(
      "http://api.localhost:1337/api/auth/get-session"
    );
    expect((previewRequest as Request).url).toBe(
      "http://api.localhost:1337/api/public/invitations/inv_123/preview"
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
});
