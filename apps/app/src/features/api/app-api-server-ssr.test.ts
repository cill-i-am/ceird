import type { LabelIdType, LabelsResponse } from "@ceird/labels-core";
import type {
  ServiceAreaIdType,
  SitesOptionsResponse,
} from "@ceird/sites-core";
/* oxlint-disable unicorn/no-useless-undefined */
// @vitest-environment node

import {
  getCurrentServerLabelsDirect as getCurrentServerLabels,
  getCurrentServerSiteOptionsDirect as getCurrentServerSiteOptions,
} from "./app-api-server-ssr";

const { mockedGetRequestHeader } = vi.hoisted(() => ({
  mockedGetRequestHeader: vi.fn<(name: string) => string | undefined>(),
}));

vi.mock(import("@tanstack/react-start/server"), () => ({
  getRequestHeader: mockedGetRequestHeader,
}));

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

  it("forwards the current auth cookie when reading site options", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "http://ceird-sbx-api:4301";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(sitesOptionsResponse));

    await expect(getCurrentServerSiteOptions()).resolves.toStrictEqual(
      sitesOptionsResponse
    );

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe("http://ceird-sbx-api:4301/sites/options");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);
});
