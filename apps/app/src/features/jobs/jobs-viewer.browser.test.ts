import {
  canCommentOnJob,
  canUseInternalJobOptions,
  canViewOrganizationJobs,
  hasAssignedJobAccess,
  hasJobsElevatedAccess,
  isExternalJobsViewer,
} from "./jobs-viewer";
import type { JobsViewer } from "./jobs-viewer";

const viewer = (role: JobsViewer["role"]): JobsViewer => ({
  role,
  userId: "user_123" as JobsViewer["userId"],
});

describe("jobs viewer role semantics", () => {
  it.each(["owner", "admin"] as const)(
    "keeps elevated jobs access limited to %s users",
    (role) => {
      expect([hasJobsElevatedAccess(role)]).toStrictEqual([true]);
    },
    1000
  );

  it.each(["member", "external"] as const)(
    "does not grant elevated jobs access to %s users",
    (role) => {
      expect([hasJobsElevatedAccess(role)]).toStrictEqual([false]);
    },
    1000
  );

  it("identifies external jobs viewers", () => {
    expect([
      isExternalJobsViewer(viewer("external")),
      isExternalJobsViewer(viewer("member")),
    ]).toStrictEqual([true, false]);
  }, 1000);

  it("lets every organization role view the jobs surface", () => {
    expect(
      (["owner", "admin", "member", "external"] as const).map((role) =>
        canViewOrganizationJobs(viewer(role))
      )
    ).toStrictEqual([true, true, true, true]);
  }, 1000);

  it("keeps internal job options unavailable to external users", () => {
    expect(
      (["owner", "admin", "member", "external"] as const).map((role) =>
        canUseInternalJobOptions(viewer(role))
      )
    ).toStrictEqual([true, true, true, false]);
  }, 1000);

  it("allows organization jobs viewers to comment on jobs", () => {
    expect([canCommentOnJob(viewer("external"))]).toStrictEqual([true]);
  }, 1000);

  it("does not grant assignment controls to external collaborators", () => {
    const externalViewer = viewer("external");

    expect([
      hasAssignedJobAccess(externalViewer, externalViewer.userId),
    ]).toStrictEqual([false]);
  }, 1000);

  it("keeps assignment controls available to assigned internal members", () => {
    const memberViewer = viewer("member");

    expect([
      hasAssignedJobAccess(memberViewer, memberViewer.userId),
    ]).toStrictEqual([true]);
  }, 1000);
});
