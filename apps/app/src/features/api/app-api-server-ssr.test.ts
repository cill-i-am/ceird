import { JobListCursor, WorkItemId } from "@ceird/jobs-core";
import type { JobListResponse, WorkItemIdType } from "@ceird/jobs-core";
import type { LabelIdType, LabelsResponse } from "@ceird/labels-core";
import { SiteId } from "@ceird/sites-core";
import type {
  ServiceAreaIdType,
  SiteListCursorType,
  SiteIdType,
  SitesOptionsResponse,
} from "@ceird/sites-core";
/* oxlint-disable unicorn/no-useless-undefined */
// @vitest-environment node
import { Schema } from "effect";

import {
  getCurrentServerLabelsDirect as getCurrentServerLabels,
  listAllCurrentServerSitesDirect as listAllCurrentServerSites,
  listAllCurrentServerJobsDirect as listAllCurrentServerJobs,
  listCurrentServerJobsDirect as listCurrentServerJobs,
  listCurrentServerSitesDirect as listCurrentServerSites,
} from "./app-api-server-ssr";

const { mockedGetRequestHeader } = vi.hoisted(() => ({
  mockedGetRequestHeader: vi.fn<(name: string) => string | undefined>(),
}));

vi.mock(import("@tanstack/react-start/server"), () => ({
  getRequestHeader: mockedGetRequestHeader,
}));

const decodeSiteId: (value: unknown) => SiteIdType =
  Schema.decodeUnknownSync(SiteId);
const siteNextCursor = "cursor-one" as SiteListCursorType;
const decodeWorkItemId: (value: unknown) => WorkItemIdType =
  Schema.decodeUnknownSync(WorkItemId);
const siteId = decodeSiteId("55555555-5555-4555-8555-555555555555");
const nextCursor = Schema.decodeUnknownSync(JobListCursor)("cursor-one");

const labelsResponse: LabelsResponse = {
  labels: [
    {
      id: "33333333-3333-4333-8333-333333333333" as LabelIdType,
      name: "Waiting on PO",
      createdAt: "2026-04-28T10:00:00.000Z",
      updatedAt: "2026-04-28T10:00:00.000Z",
    },
  ],
};

const sitesOptionsResponse: SitesOptionsResponse = {
  serviceAreas: [
    {
      id: "44444444-4444-4444-8444-444444444444" as ServiceAreaIdType,
      name: "North",
    },
  ],
  sites: [],
};

const firstJobsPage: JobListResponse = {
  items: [
    {
      createdAt: "2026-04-23T10:00:00.000Z",
      id: decodeWorkItemId("11111111-1111-4111-8111-111111111111"),
      kind: "job",
      labels: [],
      priority: "high",
      siteId,
      status: "in_progress",
      title: "Inspect boiler",
      updatedAt: "2026-04-23T12:00:00.000Z",
    },
  ],
  nextCursor,
};

const secondJobsPage: JobListResponse = {
  items: [
    {
      createdAt: "2026-04-24T10:00:00.000Z",
      id: decodeWorkItemId("22222222-2222-4222-8222-222222222222"),
      kind: "job",
      labels: [],
      priority: "medium",
      siteId,
      status: "new",
      title: "Replace valve",
      updatedAt: "2026-04-24T12:00:00.000Z",
    },
  ],
  nextCursor: undefined,
};

describe("shared app api server helpers", () => {
  let originalApiOrigin: string | undefined;

  beforeEach(() => {
    originalApiOrigin = process.env.API_ORIGIN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    if (originalApiOrigin === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.API_ORIGIN;
    } else {
      process.env.API_ORIGIN = originalApiOrigin;
    }
  });

  it("forwards the current auth cookie when reading labels", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(labelsResponse));

    await expect(getCurrentServerLabels()).resolves.toStrictEqual(
      labelsResponse
    );

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://ceird-sbx-api:4301/labels");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);

  it("forwards trusted sandbox origin headers when reading labels", async () => {
    mockedGetRequestHeader.mockImplementation((name) => {
      if (name === "cookie") {
        return "__Secure-better-auth.session_token=session-token";
      }

      if (name === "host") {
        return "127.0.0.1:4300";
      }

      if (name === "x-forwarded-host") {
        return "agent-one.app.ceird.localhost:1355";
      }

      if (name === "x-forwarded-proto") {
        return "https";
      }
    });
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(labelsResponse));

    await expect(getCurrentServerLabels()).resolves.toStrictEqual(
      labelsResponse
    );

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(requestInit?.headers).toMatchObject({
      cookie: "__Secure-better-auth.session_token=session-token",
      origin: "https://agent-one.app.ceird.localhost:1355",
      "x-forwarded-host": "agent-one.api.ceird.localhost:1355",
      "x-forwarded-proto": "https",
    });
  }, 1000);

  it("does not trust arbitrary forwarded hosts when reading labels", async () => {
    mockedGetRequestHeader.mockImplementation((name) => {
      if (name === "cookie") {
        return "better-auth.session_token=session-token";
      }

      if (name === "host") {
        return "app.ceird.localhost:1355";
      }

      if (name === "x-forwarded-host") {
        return "attacker.example";
      }

      if (name === "x-forwarded-proto") {
        return "https";
      }
    });
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(labelsResponse));

    await expect(getCurrentServerLabels()).resolves.toStrictEqual(
      labelsResponse
    );

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(requestInit?.headers).toMatchObject({
      origin: "https://app.ceird.localhost:1355",
      "x-forwarded-host": "api.ceird.localhost:1355",
      "x-forwarded-proto": "https",
    });
  }, 1000);

  it("forwards the incoming browser origin instead of synthesizing one", async () => {
    mockedGetRequestHeader.mockImplementation((name) => {
      if (name === "cookie") {
        return "better-auth.session_token=session-token";
      }

      if (name === "host") {
        return "app.ceird.localhost:1355";
      }

      if (name === "origin") {
        return "https://attacker.example";
      }
    });
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(labelsResponse));

    await expect(getCurrentServerLabels()).resolves.toStrictEqual(
      labelsResponse
    );

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(requestInit?.headers).toMatchObject({
      origin: "https://attacker.example",
      "x-forwarded-host": "api.ceird.localhost:1355",
      "x-forwarded-proto": "https",
    });
  }, 1000);

  it("reads one sites page without hiding the next cursor", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        items: sitesOptionsResponse.sites,
        nextCursor: siteNextCursor,
      })
    );

    await expect(listCurrentServerSites({ limit: 25 })).resolves.toStrictEqual({
      items: sitesOptionsResponse.sites,
      nextCursor: siteNextCursor,
    });

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://ceird-sbx-api:4301/sites?limit=25");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);

  it("forwards the current auth cookie while reading every sites page", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          items: sitesOptionsResponse.sites,
          nextCursor: siteNextCursor,
        })
      )
      .mockResolvedValueOnce(
        Response.json({ items: [], nextCursor: undefined })
      );

    await expect(listAllCurrentServerSites()).resolves.toStrictEqual({
      items: sitesOptionsResponse.sites,
      nextCursor: undefined,
    });

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    const [secondUrl] = fetchMock.mock.calls[1] ?? [];

    expect(String(url)).toBe("http://ceird-sbx-api:4301/sites?limit=100");
    expect(String(secondUrl)).toBe(
      "http://ceird-sbx-api:4301/sites?cursor=cursor-one&limit=100"
    );
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);

  it("rejects repeated cursors while reading every sites page", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({
          items: sitesOptionsResponse.sites,
          nextCursor: siteNextCursor,
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [],
          nextCursor: siteNextCursor,
        })
      );

    await expect(listAllCurrentServerSites()).rejects.toMatchObject({
      message: "Site pagination returned a repeated cursor.",
    });
  }, 1000);

  it("reads one filtered jobs page with auth and forwarded headers", async () => {
    mockedGetRequestHeader.mockImplementation((name) => {
      if (name === "cookie") {
        return "better-auth.session_token=session-token";
      }

      if (name === "host") {
        return "app.ceird.localhost:1355";
      }
    });
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(firstJobsPage));

    await expect(
      listCurrentServerJobs({ limit: 25, siteId })
    ).resolves.toStrictEqual(firstJobsPage);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    const requestUrl = new URL(String(url));

    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "http://ceird-sbx-api:4301/jobs"
    );
    expect(requestUrl.searchParams.get("limit")).toBe("25");
    expect(requestUrl.searchParams.get("siteId")).toBe(siteId);
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
      origin: "https://app.ceird.localhost:1355",
      "x-forwarded-host": "api.ceird.localhost:1355",
    });
  }, 1000);

  it("preserves static filters while paginating all jobs", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(firstJobsPage))
      .mockResolvedValueOnce(Response.json(secondJobsPage));

    await expect(listAllCurrentServerJobs({ siteId })).resolves.toStrictEqual({
      items: [...firstJobsPage.items, ...secondJobsPage.items],
      nextCursor: undefined,
    });

    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));

    expect(firstUrl.origin + firstUrl.pathname).toBe(
      "http://ceird-sbx-api:4301/jobs"
    );
    expect(firstUrl.searchParams.get("siteId")).toBe(siteId);
    expect(firstUrl.searchParams.has("cursor")).toBeFalsy();
    expect(secondUrl.searchParams.get("siteId")).toBe(siteId);
    expect(secondUrl.searchParams.get("cursor")).toBe("cursor-one");
  }, 1000);

  it("does not fetch jobs without the current auth cookie", async () => {
    mockedGetRequestHeader.mockReturnValue(undefined);
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(listCurrentServerJobs({ siteId })).rejects.toThrow(
      "Cannot query the Ceird API without the current auth cookie."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  }, 1000);
});
