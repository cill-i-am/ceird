import { describe, expect, it, vi } from "@effect/vitest";

import {
  makeDomainOriginClient,
  makeDomainServiceClient,
} from "./service-binding.js";
import type { DomainServiceBinding } from "./service-binding.js";

function makeDomainService(
  fetch: (request: Request) => Promise<Response>
): DomainServiceBinding {
  return {
    connect: (() => {
      throw new Error("Service binding connect is not used by the client");
    }) as DomainServiceBinding["connect"],
    fetch: fetch as unknown as DomainServiceBinding["fetch"],
  };
}

describe("Domain service binding client", () => {
  it("forwards sanitized adapter requests to the service binding", async () => {
    const response = Response.json({ ok: true });
    const fetch = vi.fn<(request: Request) => Promise<Response>>(() =>
      Promise.resolve(response)
    );
    const binding = makeDomainService(fetch);
    const request = new Request("https://api.example.com/jobs?limit=10", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        forwarded: "for=198.51.100.1;host=evil.example",
        "x-forwarded-for": "198.51.100.1",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "http",
      },
    });

    await expect(
      makeDomainServiceClient(binding).request(request)
    ).resolves.toBe(response);

    const forwardedRequest = fetch.mock.calls[0]?.[0];

    expect(forwardedRequest).toBeInstanceOf(Request);
    expect(forwardedRequest).not.toBe(request);
    expect(forwardedRequest?.url).toBe("https://api.example.com/jobs?limit=10");
    expect(forwardedRequest?.headers.get("forwarded")).toBeNull();
    expect(forwardedRequest?.headers.get("x-forwarded-for")).toBe(
      "203.0.113.10"
    );
    expect(forwardedRequest?.headers.get("x-forwarded-host")).toBe(
      "api.example.com"
    );
    expect(forwardedRequest?.headers.get("x-forwarded-proto")).toBe("https");
  });

  it("rewrites local origin requests while preserving path, query, method, headers, and body", async () => {
    const fetcher = vi.fn<(request: Request) => Promise<Response>>((request) =>
      request.text().then(
        (body) =>
          new Response(body, {
            headers: { "x-forwarded-url": request.url },
          })
      )
    );
    const client = makeDomainOriginClient(
      "http://127.0.0.1:3002/",
      fetcher as unknown as typeof fetch
    );

    const response = await client.request(
      new Request("https://api.example.com/jobs?limit=10", {
        body: "payload",
        headers: { "content-type": "text/plain" },
        method: "POST",
      })
    );

    const forwardedRequest = fetcher.mock.calls[0]?.[0];

    expect(forwardedRequest).toBeInstanceOf(Request);
    expect(forwardedRequest?.url).toBe("http://127.0.0.1:3002/jobs?limit=10");
    expect(forwardedRequest?.method).toBe("POST");
    expect(forwardedRequest?.headers.get("content-type")).toBe("text/plain");
    expect(forwardedRequest?.headers.get("x-forwarded-host")).toBe(
      "api.example.com"
    );
    expect(forwardedRequest?.headers.get("x-forwarded-proto")).toBe("https");
    await expect(response.text()).resolves.toBe("payload");
    expect(response.headers.get("x-forwarded-url")).toBe(
      "http://127.0.0.1:3002/jobs?limit=10"
    );
  });
});
