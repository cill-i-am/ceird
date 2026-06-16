import {
  createJobsWorkspacePerformanceFixture,
  runJobsWorkspacePerformanceHarness,
} from "./jobs-workspace-performance-harness";

describe("jobs workspace performance harness", () => {
  it("creates the accepted TSK-200 fixture shape by default-sized contract", () => {
    const fixture = createJobsWorkspacePerformanceFixture({
      comments: 40,
      contacts: 12,
      jobs: 20,
      labels: 10,
      labelsPerJob: 3,
      memberActors: 8,
      sites: 5,
    });

    expect(fixture.jobs).toHaveLength(20);
    expect(fixture.sites).toHaveLength(5);
    expect(fixture.labels).toHaveLength(10);
    expect(fixture.jobLabelAssignments).toHaveLength(60);
    expect(fixture.comments).toHaveLength(40);
  });

  it("records list, detail, recomputation, memory, and readiness evidence", async () => {
    const result = await runJobsWorkspacePerformanceHarness({
      counts: {
        comments: 40,
        contacts: 12,
        jobs: 20,
        labels: 10,
        labelsPerJob: 3,
        memberActors: 8,
        sites: 5,
      },
      initialElectricReadyLatencyMs: 1250,
      iterations: 2,
    });

    expect(result.dataset).toMatchObject({
      comments: 40,
      jobLabelAssignments: 60,
      jobs: 20,
      labels: 10,
      labelsPerJob: 3,
      sites: 5,
    });
    expect(result.initialElectricReadyLatencyMs).toBe(1250);
    expect(result.initialElectricReadyLatencySource).toBe(
      "provided-stage-or-browser-evidence"
    );
    expect(result.memory.rssBytes).toBeGreaterThan(0);
    expect(result.cpu.userMicros).toBeGreaterThanOrEqual(0);

    for (const measuredCase of [
      ...result.cases,
      ...result.detailTransitions,
      ...result.liveQueryRecomputations,
    ]) {
      expect(measuredCase.samples).toHaveLength(2);
      expect(measuredCase.rows).toBeGreaterThan(0);
    }
  });
});
