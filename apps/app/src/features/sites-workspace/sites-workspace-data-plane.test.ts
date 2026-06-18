import { CommentId } from "@ceird/comments-core";
import type { OrganizationId } from "@ceird/identity-core";
import { ProductActorId } from "@ceird/identity-core";
import type { JobListItem } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type {
  AddSiteCommentResponse,
  SiteOption,
  SiteWriteResponse,
} from "@ceird/sites-core";
import { Effect, Exit, Schema } from "effect";

import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import type { runBrowserAppApiRequest } from "#/features/api/app-api-client";

import {
  createSitesWorkspaceCommandRunner,
  deriveSitesWorkspaceVisibleRows,
  getOrCreateSitesWorkspaceReadModelCollectionState,
  toLabelElectricRow,
  toProductActivityActorElectricRow,
  toSiteActiveJobSummaryElectricRow,
  toSiteCommentBodyElectricRow,
  toSiteCommentEdgeElectricRow,
  toSiteLabelAssignmentElectricRow,
  toSiteOptionElectricRow,
  toSiteRelatedJobElectricRow,
} from "./sites-workspace-data-plane";
import type {
  SiteCommentBodyRow,
  SiteCommentEdgeRow,
  SiteLabelAssignmentElectricRow,
  SitesWorkspaceProductActorRow,
} from "./sites-workspace-data-plane";

const appApiMock = vi.hoisted(() => ({
  runBrowserAppApiRequest:
    vi.fn<() => Effect.Effect<unknown, unknown, never>>(),
}));

const decodeCommentId = Schema.decodeUnknownSync(CommentId);
const decodeProductActorId = Schema.decodeUnknownSync(ProductActorId);

vi.mock(import("#/features/api/app-api-client"), () => ({
  runBrowserAppApiRequest:
    appApiMock.runBrowserAppApiRequest as unknown as typeof runBrowserAppApiRequest,
}));

describe("sites workspace data plane", () => {
  const scope = createOrganizationDataScope({
    organizationId: "org_123" as OrganizationId,
    role: "owner",
    userId: "user_123",
  });

  const urgentLabel = {
    archivedAt: null,
    color: "oklch(64% 0.19 28)",
    createdAt: "2026-05-30T00:00:00.000Z",
    description: null,
    id: "33333333-3333-4333-8333-333333333333" as Label["id"],
    name: "Urgent Access",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } satisfies Label;
  const maintenanceLabel = {
    archivedAt: null,
    color: "oklch(63% 0.18 255)",
    createdAt: "2026-05-30T00:00:00.000Z",
    description: null,
    id: "88888888-8888-4888-8888-888888888888" as Label["id"],
    name: "Maintenance",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } satisfies Label;
  const dublinSite = {
    displayLocation: "Dublin Port",
    formattedAddress: "Dublin Port, Dublin",
    hasUsableCoordinates: true,
    id: "22222222-2222-4222-8222-222222222222",
    labels: [],
    locationStatus: "validated",
    name: "Dublin Port",
    updatedAt: "2026-06-02T00:00:00.000Z",
  } as unknown as SiteOption;
  const corkSite = {
    displayLocation: "Cork Yard",
    hasUsableCoordinates: false,
    id: "66666666-6666-4666-8666-666666666666",
    labels: [],
    locationStatus: "unverified",
    name: "Cork Yard",
    updatedAt: "2026-06-01T00:00:00.000Z",
  } as unknown as SiteOption;
  const dublinJob = {
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "44444444-4444-4444-8444-444444444444",
    kind: "job",
    labels: [],
    priority: "medium",
    siteId: dublinSite.id,
    status: "new",
    title: "Gate repair",
    updatedAt: "2026-05-31T00:00:00.000Z",
  } as unknown as JobListItem;
  const corkJob = {
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "55555555-5555-4555-8555-555555555555",
    kind: "job",
    labels: [],
    priority: "low",
    siteId: corkSite.id,
    status: "new",
    title: "Yard inspection",
    updatedAt: "2026-06-03T00:00:00.000Z",
  } as unknown as JobListItem;
  const productActor = {
    displayDetail: "Team member",
    displayName: "Taylor Member",
    id: decodeProductActorId("99999999-9999-4999-8999-999999999999"),
    kind: "member",
  } satisfies SitesWorkspaceProductActorRow;
  const dublinComment = {
    actorId: productActor.id,
    body: "Bring the dock gate key.",
    createdAt: "2026-06-02T09:30:00.000Z",
    id: decodeCommentId("77777777-7777-4777-8777-777777777777"),
    updatedAt: "2026-06-02T09:30:00.000Z",
  } satisfies SiteCommentBodyRow;
  const dublinCommentEdge = {
    commentId: dublinComment.id,
    createdAt: "2026-06-02T09:30:00.000Z",
    id: `${dublinSite.id}:${dublinComment.id}`,
    siteId: dublinSite.id,
  } satisfies SiteCommentEdgeRow;

  it("creates disabled Electric collections for the browser-safe workspace graph during server render", () => {
    const state = getOrCreateSitesWorkspaceReadModelCollectionState({
      scope,
    });

    expect(state.sites.collection).toBeNull();
    expect(state.sites.health.current).toMatchObject({
      collection: "sites",
      source: "electric",
      status: "disabled",
      subscriptionName: "sites",
    });
    expect(state.labels.health.current).toMatchObject({
      collection: "labels",
      source: "electric",
      status: "disabled",
      subscriptionName: "labels",
    });
    expect(state.activeJobSummaries.health.current).toMatchObject({
      collection: "site-active-job-summaries",
      source: "electric",
      status: "disabled",
      subscriptionName: "site-active-job-summaries",
    });
    expect(state.siteCommentEdges.health.current).toMatchObject({
      collection: "site-comments",
      source: "electric",
      status: "disabled",
      subscriptionName: "site-comments",
    });
    expect(state.commentBodies.health.current).toMatchObject({
      collection: "site-comment-bodies",
      source: "electric",
      status: "disabled",
      subscriptionName: "site-comment-bodies",
    });
    expect(state.actors.health.current).toMatchObject({
      collection: "product-activity-actors",
      source: "electric",
      status: "disabled",
      subscriptionName: "product-activity-actors",
    });
  });

  it("maps site comment bodies to product-safe actor rows without raw user ids", () => {
    const comment = toSiteCommentBodyElectricRow({
      actorId: productActor.id,
      body: "Bring the dock gate key.",
      createdAt: "2026-06-02T09:30:00.000Z",
      id: dublinComment.id,
      updatedAt: "2026-06-02T09:30:00.000Z",
    });

    expect(comment).toStrictEqual(dublinComment);
    expect(comment).not.toHaveProperty("authorUserId");
    expect(comment).not.toHaveProperty("updatedByUserId");
  });

  it("normalizes snake_case Electric rows from deployed Sites shapes", () => {
    const transformedSite = toSiteOptionElectricRow({
      access_notes: "Gate 2",
      address_components: null,
      display_location: "",
      id: dublinSite.id,
      latitude: null,
      location_status: "unverified",
      longitude: null,
      name: "Dublin Port",
      updated_at: "2026-06-02 00:00:00+00",
    });
    const transformedLabel = toLabelElectricRow({
      archived_at: null,
      color: urgentLabel.color,
      created_at: "2026-05-30 00:00:00+00",
      description: null,
      id: urgentLabel.id,
      name: urgentLabel.name,
      updated_at: "2026-05-30 00:00:00+00",
    });
    const transformedAssignment = toSiteLabelAssignmentElectricRow({
      created_at: "2026-05-30 00:00:00+00",
      label_id: urgentLabel.id,
      organization_id: "org_123",
      site_id: dublinSite.id,
    });
    const transformedSummary = toSiteActiveJobSummaryElectricRow({
      active_job_count: 3,
      highest_active_job_priority: "urgent",
      organization_id: "org_123",
      site_id: dublinSite.id,
      updated_at: "2026-06-02 00:00:00+00",
    });
    const transformedJob = toSiteRelatedJobElectricRow({
      created_at: "2026-05-30 00:00:00+00",
      id: dublinJob.id,
      kind: dublinJob.kind,
      priority: dublinJob.priority,
      site_id: dublinSite.id,
      status: dublinJob.status,
      title: dublinJob.title,
      updated_at: "2026-05-31 00:00:00+00",
    });
    const transformedActor = toProductActivityActorElectricRow({
      display_detail: productActor.displayDetail,
      display_name: productActor.displayName,
      id: productActor.id,
      kind: productActor.kind,
    });
    const transformedCommentEdge = toSiteCommentEdgeElectricRow({
      comment_id: dublinComment.id,
      created_at: "2026-06-02 09:30:00+00",
      site_id: dublinSite.id,
    });
    const transformedComment = toSiteCommentBodyElectricRow({
      actor_id: productActor.id,
      body: dublinComment.body,
      created_at: "2026-06-02 09:30:00+00",
      id: dublinComment.id,
      updated_at: "2026-06-02 09:30:00+00",
    });

    expect(transformedSite).toMatchObject({
      accessNotes: "Gate 2",
      displayLocation: "",
      id: dublinSite.id,
      locationStatus: "unverified",
    });
    expect(transformedLabel).toStrictEqual(urgentLabel);
    expect(transformedAssignment).toStrictEqual({
      createdAt: "2026-05-30T00:00:00.000Z",
      labelId: urgentLabel.id,
      organizationId: "org_123",
      siteId: dublinSite.id,
    });
    expect(transformedSummary).toStrictEqual({
      activeJobCount: 3,
      highestActiveJobPriority: "urgent",
      organizationId: "org_123",
      siteId: dublinSite.id,
      updatedAt: "2026-06-02T00:00:00.000Z",
    });
    expect(transformedJob).toMatchObject({
      id: dublinJob.id,
      siteId: dublinSite.id,
      title: dublinJob.title,
    });
    expect(transformedActor).toStrictEqual(productActor);
    expect(transformedCommentEdge).toStrictEqual(dublinCommentEdge);
    expect(transformedComment).toStrictEqual(dublinComment);
  });

  it("normalizes partial Electric site old_value rows without full-row validation", () => {
    expect(
      toSiteOptionElectricRow({
        access_notes: "Old gate code",
        name: "Dublin Port",
        updated_at: "2026-06-02 09:30:00+00",
      })
    ).toStrictEqual({
      accessNotes: "Old gate code",
      name: "Dublin Port",
      updatedAt: "2026-06-02T09:30:00.000Z",
    });
  });

  it("normalizes partial Electric site-label and active-job old_value rows", () => {
    expect(
      toSiteLabelAssignmentElectricRow({
        label_id: urgentLabel.id,
        site_id: dublinSite.id,
      })
    ).toStrictEqual({
      labelId: urgentLabel.id,
      siteId: dublinSite.id,
    });

    expect(
      toSiteActiveJobSummaryElectricRow({
        active_job_count: 1,
        highest_active_job_priority: "urgent",
        updated_at: "2026-06-02 09:30:00+00",
      })
    ).toStrictEqual({
      activeJobCount: 1,
      highestActiveJobPriority: "urgent",
      updatedAt: "2026-06-02T09:30:00.000Z",
    });
  });

  it("normalizes partial Electric product actor old_value rows", () => {
    expect(
      toProductActivityActorElectricRow({
        display_name: productActor.displayName,
        id: productActor.id,
      })
    ).toStrictEqual({
      displayName: productActor.displayName,
      id: productActor.id,
    });

    expect(
      toProductActivityActorElectricRow({
        id: productActor.id,
        route_href: "/members/user_taylor",
        route_label: "Taylor Member",
      })
    ).toStrictEqual({
      id: productActor.id,
      route: { href: "/members/user_taylor", label: "Taylor Member" },
    });
  });

  it("derives selection-ready visible rows from the actual Sites workspace graph inputs", () => {
    const rows = deriveSitesWorkspaceVisibleRows({
      activeJobSummaries: [
        {
          activeJobCount: 3,
          highestActiveJobPriority: "urgent",
          organizationId: "org_123",
          siteId: dublinSite.id,
          updatedAt: "2026-06-02T00:00:00.000Z",
        },
        {
          activeJobCount: 1,
          highestActiveJobPriority: "low",
          organizationId: "org_123",
          siteId: corkSite.id,
          updatedAt: "2026-06-01T00:00:00.000Z",
        },
      ],
      actors: [productActor],
      commentBodies: [dublinComment],
      filter: "with-active-jobs",
      labels: [maintenanceLabel, urgentLabel],
      query: "urgent",
      relatedJobs: [corkJob, dublinJob],
      siteCommentEdges: [dublinCommentEdge],
      siteLabelAssignments: [
        {
          createdAt: "2026-05-30T00:00:00.000Z",
          labelId: urgentLabel.id,
          organizationId: "org_123",
          siteId: dublinSite.id,
        },
        {
          createdAt: "2026-05-30T00:00:00.000Z",
          labelId: maintenanceLabel.id,
          organizationId: "org_123",
          siteId: corkSite.id,
        },
      ],
      sites: [corkSite, dublinSite],
      sort: "active-jobs",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.site).toMatchObject({
      activeJobCount: 3,
      highestActiveJobPriority: "urgent",
      labels: [urgentLabel],
      name: "Dublin Port",
    });
    expect(rows[0]?.comments).toStrictEqual([
      {
        actor: productActor,
        comment: dublinComment,
        edge: dublinCommentEdge,
      },
    ]);
    expect(rows[0]?.relatedJobs).toStrictEqual([dublinJob]);
  });

  it("sorts two rows by the production updatedAt boundary field", () => {
    const rows = deriveSitesWorkspaceVisibleRows({
      activeJobSummaries: [],
      actors: [],
      commentBodies: [],
      filter: "all",
      labels: [],
      query: "",
      relatedJobs: [corkJob, dublinJob],
      siteCommentEdges: [],
      siteLabelAssignments: [],
      sites: [dublinSite, corkSite],
      sort: "updated",
    });

    expect(rows.map((row) => row.site.name)).toStrictEqual([
      "Dublin Port",
      "Cork Yard",
    ]);
    expect(rows[0]?.relatedJobs).toStrictEqual([dublinJob]);
  });

  it("supports needs-location filters", () => {
    const rows = deriveSitesWorkspaceVisibleRows({
      activeJobSummaries: [],
      actors: [],
      commentBodies: [],
      filter: "needs-location",
      labels: [],
      query: "",
      relatedJobs: [corkJob, dublinJob],
      siteCommentEdges: [],
      siteLabelAssignments: [],
      sites: [dublinSite, corkSite],
      sort: "name",
    });

    expect(rows.map((row) => row.site.name)).toStrictEqual(["Cork Yard"]);
  });

  it("keeps create pending until the sites collection observes the server row state", async () => {
    const sites = createFakeCollection<SiteOption>((site) => site.id);
    const journal = createDataPlaneMutationJournal({
      createId: () => "mutation_1",
      now: () => 100,
    });
    const response = makeSiteWriteResponse(dublinSite, 901);
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.promise(() => Promise.resolve(response))
    );

    const command = createSitesWorkspaceCommandRunner({
      collections: {
        commentBodies: createFakeCollection<SiteCommentBodyRow>(
          (comment) => comment.id
        ),
        commentEdges: createFakeCollection<SiteCommentEdgeRow>(
          (edge) => edge.id
        ),
        siteLabelAssignments: createFakeCollection(
          (assignment) => `${assignment.siteId}:${assignment.labelId}`
        ),
        sites,
      },
      journal,
      timeoutMs: 100,
    }).createSite({ name: "Dublin Port" });

    expect(journal.entries()).toMatchObject([
      {
        affectedCollections: ["sites"],
        commandName: "sites-workspace.create",
        status: "pending",
      },
    ]);

    globalThis.setTimeout(() => {
      sites.upsert(dublinSite);
    }, 0);
    const exit = await command;

    expect(Exit.isSuccess(exit)).toBeTruthy();
    if (Exit.isFailure(exit)) {
      throw new Error("Expected create command to succeed");
    }
    expect(exit.value).toMatchObject({
      electricObservation: {
        collection: "sites",
        kind: "observed-change",
      },
      mutation: { txid: 901 },
    });
    expect(journal.entries()).toMatchObject([
      {
        commandName: "sites-workspace.create",
        output: response,
        status: "success",
      },
    ]);
  });

  it("records API command failures without waiting for Electric confirmation", async () => {
    const journal = createDataPlaneMutationJournal();
    const failure = new Error("Site access denied");
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.fail(failure)
    );

    const exit = await createSitesWorkspaceCommandRunner({
      collections: {
        commentBodies: createFakeCollection<SiteCommentBodyRow>(
          (comment) => comment.id
        ),
        commentEdges: createFakeCollection<SiteCommentEdgeRow>(
          (edge) => edge.id
        ),
        siteLabelAssignments: createFakeCollection(
          (assignment) => `${assignment.siteId}:${assignment.labelId}`
        ),
        sites: createFakeCollection<SiteOption>((site) => site.id),
      },
      journal,
    }).updateSite(dublinSite.id, { name: "Dublin Port" });

    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(journal.entries()).toMatchObject([
      {
        commandName: "sites-workspace.update",
        error: failure,
        status: "failure",
      },
    ]);
  });

  it("records Electric confirmation timeouts as command failures", async () => {
    const journal = createDataPlaneMutationJournal();
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.succeed(makeSiteWriteResponse(dublinSite, 902))
    );

    const exit = await createSitesWorkspaceCommandRunner({
      collections: {
        commentBodies: createFakeCollection<SiteCommentBodyRow>(
          (comment) => comment.id
        ),
        commentEdges: createFakeCollection<SiteCommentEdgeRow>(
          (edge) => edge.id
        ),
        siteLabelAssignments: createFakeCollection(
          (assignment) => `${assignment.siteId}:${assignment.labelId}`
        ),
        sites: createFakeCollection<SiteOption>((site) => site.id),
      },
      journal,
      timeoutMs: 1,
    }).createSite({ name: "Dublin Port" });

    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(journal.entries()[0]).toMatchObject({
      commandName: "sites-workspace.create",
      status: "failure",
    });
    expect(journal.entries()[0]?.error).toBeInstanceOf(Error);
  });

  it("keeps add-comment pending until the site comment edge and safe body projection are observed", async () => {
    const commentBodies = createFakeCollection<SiteCommentBodyRow>(
      (comment) => comment.id
    );
    const commentEdges = createFakeCollection<SiteCommentEdgeRow>(
      (edge) => edge.id
    );
    const journal = createDataPlaneMutationJournal({
      createId: () => "mutation_comment_1",
      now: () => 200,
    });
    const response = {
      actor: productActor,
      actorId: productActor.id,
      authorName: productActor.displayName,
      body: dublinComment.body,
      createdAt: dublinComment.createdAt,
      id: dublinComment.id,
      siteId: dublinSite.id,
    } satisfies AddSiteCommentResponse;
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.succeed(response)
    );

    const command = createSitesWorkspaceCommandRunner({
      collections: {
        commentBodies,
        commentEdges,
        siteLabelAssignments: createFakeCollection(
          (assignment) => `${assignment.siteId}:${assignment.labelId}`
        ),
        sites: createFakeCollection<SiteOption>((site) => site.id),
      },
      journal,
      timeoutMs: 100,
    }).addSiteComment(dublinSite.id, {
      body: "Bring the dock gate key.",
    });

    expect(journal.entries()).toMatchObject([
      {
        affectedCollections: ["site-comment-bodies", "site-comments"],
        commandName: "sites-workspace.add-comment",
        status: "pending",
      },
    ]);

    globalThis.setTimeout(() => {
      commentBodies.upsert(dublinComment);
      commentEdges.upsert(dublinCommentEdge);
    }, 0);
    const exit = await command;

    expect(Exit.isSuccess(exit)).toBeTruthy();
    if (Exit.isFailure(exit)) {
      throw new Error("Expected add-comment command to succeed");
    }
    expect(exit.value).toMatchObject({
      electricObservation: {
        commentBody: "observed-change",
        commentEdge: "observed-change",
      },
      id: dublinComment.id,
      siteId: dublinSite.id,
    });
    expect(exit.value).not.toHaveProperty("authorUserId");
    expect(journal.entries()).toMatchObject([
      {
        commandName: "sites-workspace.add-comment",
        output: response,
        status: "success",
      },
    ]);
    expect(journal.entries()[0]?.output).not.toHaveProperty("authorUserId");
  });

  it("confirms site label assignment and removal through the assignment collection", async () => {
    const assignments = createFakeCollection<SiteLabelAssignmentElectricRow>(
      (assignment) => `${assignment.siteId}:${assignment.labelId}`
    );
    const commandRunner = createSitesWorkspaceCommandRunner({
      collections: {
        commentBodies: createFakeCollection<SiteCommentBodyRow>(
          (comment) => comment.id
        ),
        commentEdges: createFakeCollection<SiteCommentEdgeRow>(
          (edge) => edge.id
        ),
        siteLabelAssignments: assignments,
        sites: createFakeCollection<SiteOption>((site) => site.id),
      },
      timeoutMs: 100,
    });
    const assignment = {
      createdAt: "2026-06-02T00:00:00.000Z",
      labelId: urgentLabel.id,
      organizationId: "org_123",
      siteId: dublinSite.id,
    } satisfies SiteLabelAssignmentElectricRow;

    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.promise(() =>
        Promise.resolve(makeSiteWriteResponse(dublinSite, 903))
      )
    );
    const assignCommand = commandRunner.assignSiteLabel(dublinSite.id, {
      labelId: urgentLabel.id,
    });
    globalThis.setTimeout(() => {
      assignments.upsert(assignment);
    }, 0);
    const assignExit = await assignCommand;
    expect(Exit.isSuccess(assignExit)).toBeTruthy();
    if (Exit.isFailure(assignExit)) {
      throw new Error("Expected label assignment command to succeed");
    }
    expect(assignExit.value).toMatchObject({
      electricObservation: {
        collection: "site-label-assignments",
        kind: "observed-change",
      },
      mutation: { txid: 903 },
    });

    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.promise(() =>
        Promise.resolve(makeSiteWriteResponse(dublinSite, 904))
      )
    );
    const removeCommand = commandRunner.removeSiteLabel(
      dublinSite.id,
      urgentLabel.id
    );
    globalThis.setTimeout(() => {
      assignments.delete(assignment);
    }, 0);

    const removeExit = await removeCommand;
    expect(Exit.isSuccess(removeExit)).toBeTruthy();
    if (Exit.isFailure(removeExit)) {
      throw new Error("Expected label removal command to succeed");
    }
    expect(removeExit.value).toMatchObject({
      electricObservation: {
        collection: "site-label-assignments",
        kind: "observed-change",
      },
      mutation: { txid: 904 },
    });
  });

  it("preserves server txid without reporting a txid match when label assignment is already reflected", async () => {
    const assignments = createFakeCollection<SiteLabelAssignmentElectricRow>(
      (assignment) => `${assignment.siteId}:${assignment.labelId}`
    );
    assignments.upsert({
      createdAt: "2026-06-02T00:00:00.000Z",
      labelId: urgentLabel.id,
      organizationId: "org_123",
      siteId: dublinSite.id,
    });
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.succeed(makeSiteWriteResponse(dublinSite, 905))
    );

    const exit = await createSitesWorkspaceCommandRunner({
      collections: {
        commentBodies: createFakeCollection<SiteCommentBodyRow>(
          (comment) => comment.id
        ),
        commentEdges: createFakeCollection<SiteCommentEdgeRow>(
          (edge) => edge.id
        ),
        siteLabelAssignments: assignments,
        sites: createFakeCollection<SiteOption>((site) => site.id),
      },
      timeoutMs: 100,
    }).assignSiteLabel(dublinSite.id, {
      labelId: urgentLabel.id,
    });

    expect(Exit.isSuccess(exit)).toBeTruthy();
    if (Exit.isFailure(exit)) {
      throw new Error("Expected already reflected assignment to succeed");
    }
    expect(exit.value).toMatchObject({
      electricObservation: {
        collection: "site-label-assignments",
        kind: "already-reflected",
      },
      mutation: { txid: 905 },
    });
  });

  it("preserves server txid without reporting a txid match when label removal is already reflected", async () => {
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.succeed(makeSiteWriteResponse(dublinSite, 906))
    );

    const exit = await createSitesWorkspaceCommandRunner({
      collections: {
        commentBodies: createFakeCollection<SiteCommentBodyRow>(
          (comment) => comment.id
        ),
        commentEdges: createFakeCollection<SiteCommentEdgeRow>(
          (edge) => edge.id
        ),
        siteLabelAssignments: createFakeCollection(
          (assignment) => `${assignment.siteId}:${assignment.labelId}`
        ),
        sites: createFakeCollection<SiteOption>((site) => site.id),
      },
      timeoutMs: 100,
    }).removeSiteLabel(dublinSite.id, urgentLabel.id);

    expect(Exit.isSuccess(exit)).toBeTruthy();
    if (Exit.isFailure(exit)) {
      throw new Error("Expected already reflected removal to succeed");
    }
    expect(exit.value).toMatchObject({
      electricObservation: {
        collection: "site-label-assignments",
        kind: "already-reflected",
      },
      mutation: { txid: 906 },
    });
  });
});

function makeSiteWriteResponse(
  site: SiteOption,
  txid: number
): SiteWriteResponse {
  return {
    mutation: { txid },
    site,
  };
}

function createFakeCollection<Item>(getKey: (item: Item) => string): {
  delete: (item: Item) => void;
  entries: () => IterableIterator<[string, Item]>;
  subscribeChanges: (callback: () => void) => {
    requestSnapshot: () => void;
    unsubscribe: () => void;
  };
  upsert: (item: Item) => void;
} {
  const rows = new Map<string, Item>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    delete: (item) => {
      rows.delete(getKey(item));
      emit();
    },
    entries: () => rows.entries(),
    subscribeChanges: (callback) => {
      listeners.add(callback);
      return {
        requestSnapshot: callback,
        unsubscribe: () => {
          listeners.delete(callback);
        },
      };
    },
    upsert: (item) => {
      rows.set(getKey(item), item);
      emit();
    },
  };
}
