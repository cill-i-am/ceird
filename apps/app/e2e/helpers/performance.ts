import { appendFile } from "node:fs/promises";

import { expect } from "@playwright/test";
import type { Locator, Page, Request, TestInfo } from "@playwright/test";

export interface BrowserFailedRequest {
  readonly errorText: string | null;
  readonly method: string;
  readonly resourceType: string;
  readonly url: string;
}

export interface BrowserPerformanceMetric {
  readonly dataRequestCount: number;
  readonly durationMs: number;
  readonly failedRequests: readonly BrowserFailedRequest[];
  readonly failedRequestCount: number;
  readonly name: string;
}

export async function measureVisibleInteraction({
  action,
  name,
  page,
  visible,
}: {
  readonly action: () => Promise<void>;
  readonly name: string;
  readonly page: Page;
  readonly visible: Locator;
}): Promise<BrowserPerformanceMetric> {
  const dataRequests = new Set<string>();
  const failedRequests: BrowserFailedRequest[] = [];
  const startedAt = performance.now();
  const handleRequestFinished = (request: Request) => {
    if (isDataRequest(request)) {
      dataRequests.add(request.url());
    }
  };
  const handleRequestFailed = (request: Request) => {
    if (isDataRequest(request)) {
      failedRequests.push({
        errorText: request.failure()?.errorText ?? null,
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
      });
    }
  };

  page.on("requestfinished", handleRequestFinished);
  page.on("requestfailed", handleRequestFailed);

  try {
    await action();
    await expect(visible).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {
      // Persistent app sockets and dev middleware can keep the page non-idle.
    });
  } finally {
    page.off("requestfinished", handleRequestFinished);
    page.off("requestfailed", handleRequestFailed);
  }

  return {
    dataRequestCount: dataRequests.size,
    durationMs: Math.round(performance.now() - startedAt),
    failedRequestCount: failedRequests.length,
    failedRequests,
    name,
  };
}

export async function attachPerformanceMetrics(
  testInfo: TestInfo,
  metrics: readonly BrowserPerformanceMetric[]
) {
  await testInfo.attach("data-plane-performance.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });

  if (process.env.DATA_PLANE_PERF_OUTPUT) {
    await appendFile(
      process.env.DATA_PLANE_PERF_OUTPUT,
      `${JSON.stringify({
        metrics,
        projectName: testInfo.project.name,
        repeatEachIndex: testInfo.repeatEachIndex,
        retry: testInfo.retry,
        title: testInfo.title,
      })}\n`,
      "utf8"
    );
  }
}

export function expectNoPerformanceFailures(
  metrics: readonly BrowserPerformanceMetric[]
) {
  for (const metric of metrics) {
    expect(
      metric.failedRequests,
      `${metric.name} failed requests\n${formatFailedRequests(metric.failedRequests)}`
    ).toStrictEqual([]);
    expect(metric.durationMs, `${metric.name} duration`).toBeLessThan(30_000);
  }
}

function formatFailedRequests(requests: readonly BrowserFailedRequest[]) {
  if (requests.length === 0) {
    return "[]";
  }

  return JSON.stringify(requests, null, 2);
}

function isDataRequest(request: Request) {
  const resourceType = request.resourceType();

  if (resourceType !== "fetch" && resourceType !== "xhr") {
    return false;
  }

  const url = new URL(request.url());

  return (
    url.pathname.startsWith("/_server") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/jobs") ||
    url.pathname.includes("/sites")
  );
}
