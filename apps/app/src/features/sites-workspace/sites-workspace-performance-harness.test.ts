import { runSitesWorkspacePerformanceHarness } from "./sites-workspace-performance-harness";

describe("sites workspace performance harness", () => {
  it("exercises the agreed TSK-200 fixture shape", () => {
    const report = runSitesWorkspacePerformanceHarness({
      iterations: 2,
      now: () => "2026-06-16T00:00:00.000Z",
    });

    expect(report.fixture).toStrictEqual({
      activeJobSummaries: 1000,
      jobs: 5000,
      labelAssignments: 3000,
      labels: 100,
      labelsPerSite: 3,
      sites: 1000,
    });
    expect(report.recomputation).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inputRows: 10_100,
          name: "list.label-join.name-sort",
          outputRows: 1000,
        }),
        expect.objectContaining({
          name: "detail-transition.related-jobs",
          outputRows: 5,
        }),
      ])
    );
  });

  it("records each required local interaction surface with budget targets", () => {
    const report = runSitesWorkspacePerformanceHarness({
      iterations: 2,
      now: () => "2026-06-16T00:00:00.000Z",
    });

    expect(report.interactions.map((metric) => metric.name)).toStrictEqual([
      "list.label-join.name-sort",
      "search.label-and-location",
      "filter.active-jobs",
      "filter.needs-location",
      "active-job-summary-update",
      "detail-transition.related-jobs",
    ]);
    expect(
      report.interactions.every((metric) => metric.samples.length === 2)
    ).toBeTruthy();
    expect(
      report.interactions
        .filter((metric) => metric.name !== "detail-transition.related-jobs")
        .every(
          (metric) => metric.targetMs === report.budget.localInteractionTargetMs
        )
    ).toBeTruthy();
    expect(
      report.interactions.find(
        (metric) => metric.name === "detail-transition.related-jobs"
      )?.targetMs
    ).toBe(report.budget.detailOpenTargetMs);
  });

  it("keeps stage Electric ready latency explicit when unavailable locally", () => {
    const report = runSitesWorkspacePerformanceHarness({
      iterations: 1,
      now: () => "2026-06-16T00:00:00.000Z",
    });

    expect(report.electricReadyLatencyMs).toBeNull();
    expect(report.recommendations).toContain(
      "Initial Electric ready latency was not measured in the synthetic local harness; run the Playwright stage harness against the agreed seeded stage before cutover."
    );
  });

  it("flags Electric ready latency above the blocker budget", () => {
    const report = runSitesWorkspacePerformanceHarness({
      electricReadyLatencyMs: 5100,
      iterations: 1,
      now: () => "2026-06-16T00:00:00.000Z",
    });

    expect(report.recommendations).toContain(
      "Initial Electric ready latency exceeds the 5s blocker threshold; reduce shape size, add narrower projections, or defer cutover."
    );
  });
});
