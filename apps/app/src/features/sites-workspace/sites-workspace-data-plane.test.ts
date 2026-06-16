import type { OrganizationId } from "@ceird/identity-core";
import type { JobListItem } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type { SiteOption, SiteWriteResponse } from "@ceird/sites-core";
import { Effect, Exit } from "effect";

import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import type { runBrowserAppApiRequest } from "#/features/api/app-api-client";

import {
  createSitesWorkspaceCommandRunner,
  deriveSitesWorkspaceVisibleRows,
  getOrCreateSitesWorkspaceReadModelCollectionState,
} from "./sites-workspace-data-plane";
import type { SiteLabelAssignmentElectricRow } from "./sites-workspace-data-plane";

const appApiMock = vi.hoisted(() => ({
  runBrowserAppApiRequest:
    vi.fn<() => Effect.Effect<unknown, unknown, never>>(),
}));

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
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "33333333-3333-4333-8333-333333333333",
    name: "Urgent Access",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } as unknown as Label;
  const maintenanceLabel = {
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "88888888-8888-4888-8888-888888888888",
    name: "Maintenance",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } as unknown as Label;
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
      filter: "with-active-jobs",
      labels: [maintenanceLabel, urgentLabel],
      query: "urgent",
      relatedJobs: [corkJob, dublinJob],
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
    expect(rows[0]?.relatedJobs).toStrictEqual([dublinJob]);
  });

  it("sorts two rows by the production updatedAt boundary field", () => {
    const rows = deriveSitesWorkspaceVisibleRows({
      activeJobSummaries: [],
      filter: "all",
      labels: [],
      query: "",
      relatedJobs: [corkJob, dublinJob],
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
      filter: "needs-location",
      labels: [],
      query: "",
      relatedJobs: [corkJob, dublinJob],
      siteLabelAssignments: [],
      sites: [dublinSite, corkSite],
      sort: "name",
    });

    expect(rows.map((row) => row.site.name)).toStrictEqual(["Cork Yard"]);
  });

  it("keeps create pending until the sites collection observes the committed txid row", async () => {
    const sites = createFakeCollection<SiteOption>((site) => site.id);
    const journal = createDataPlaneMutationJournal({
      createId: () => "mutation_1",
      now: () => 100,
    });
    const response = makeSiteWriteResponse(dublinSite, 901);
    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.succeed(response)
    );

    const command = createSitesWorkspaceCommandRunner({
      collections: {
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

    sites.upsert(dublinSite);
    const exit = await command;

    expect(Exit.isSuccess(exit)).toBeTruthy();
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

  it("confirms site label assignment and removal through the assignment collection", async () => {
    const assignments = createFakeCollection<SiteLabelAssignmentElectricRow>(
      (assignment) => `${assignment.siteId}:${assignment.labelId}`
    );
    const commandRunner = createSitesWorkspaceCommandRunner({
      collections: {
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
      Effect.succeed(makeSiteWriteResponse(dublinSite, 903))
    );
    const assignCommand = commandRunner.assignSiteLabel(dublinSite.id, {
      labelId: urgentLabel.id,
    });
    assignments.upsert(assignment);
    expect(Exit.isSuccess(await assignCommand)).toBeTruthy();

    appApiMock.runBrowserAppApiRequest.mockReturnValueOnce(
      Effect.succeed(makeSiteWriteResponse(dublinSite, 904))
    );
    const removeCommand = commandRunner.removeSiteLabel(
      dublinSite.id,
      urgentLabel.id
    );
    assignments.delete(assignment);

    expect(Exit.isSuccess(await removeCommand)).toBeTruthy();
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
