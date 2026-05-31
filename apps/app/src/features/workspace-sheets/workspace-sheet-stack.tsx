"use client";
import { useRouteContext } from "@tanstack/react-router";
import * as React from "react";

import type { DataPlaneSeed } from "#/data-plane/bootstrap";
import { useApplyDataPlaneSeeds } from "#/data-plane/session";
import { JobsCreateSheet } from "#/features/jobs/jobs-create-sheet";
import { isCreateJobRouteData } from "#/features/jobs/jobs-detail-route-data";
import { loadJobDetailRouteData } from "#/features/jobs/jobs-detail-route-loader";
import { JobsDetailSheet } from "#/features/jobs/jobs-detail-sheet";
import { loadJobsRouteData } from "#/features/jobs/jobs-route-loader";
import {
  JobsStateProvider,
  useJobsViewer,
  useOptionalJobsViewer,
} from "#/features/jobs/jobs-state";
import { SitesCreateSheet } from "#/features/sites/sites-create-sheet";
import { loadSiteDetailRouteData } from "#/features/sites/sites-detail-route-loader";
import { SitesDetailSheet } from "#/features/sites/sites-detail-sheet";
import { loadSitesRouteData } from "#/features/sites/sites-route-loader";
import {
  SitesStateProvider,
  useOptionalSitesViewer,
  useSitesOptions,
  useSitesViewer,
} from "#/features/sites/sites-state";

import {
  getWorkspaceSheetDrawerKind,
  getWorkspaceSheetLayer,
} from "./workspace-sheet-drawer";
import type {
  WorkspaceSheetDrawerKind,
  WorkspaceSheetLayer,
} from "./workspace-sheet-drawer";
import {
  WorkspaceSheetSkeleton,
  WorkspaceSheetUnavailable,
} from "./workspace-sheet-loading";
import { useWorkspaceSheetNavigation } from "./workspace-sheet-navigation";
import { WORKSPACE_SHEET_STACK_LIMIT } from "./workspace-sheet-search";
import type { WorkspaceSheet } from "./workspace-sheet-search";

type AsyncResource<T> =
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "loading" }
  | { readonly data: T; readonly status: "success" };
type AsyncResourceAction<T> =
  | { readonly type: "error"; readonly error: unknown }
  | { readonly type: "loading" }
  | { readonly type: "success"; readonly data: T };
type WorkspaceSheetDomainStatus = "available" | "error" | "loading";
const EMPTY_DATA_PLANE_SEEDS: readonly DataPlaneSeed<unknown>[] = [];

interface WorkspaceSheetRenderEntry {
  readonly key: string;
  readonly sheet: WorkspaceSheet;
}

export function WorkspaceSheetStack({
  stack,
}: {
  readonly stack: readonly WorkspaceSheet[];
}) {
  const { pop } = useWorkspaceSheetNavigation();
  const routeContext = useWorkspaceRouteAccess();
  const existingJobsViewer = useOptionalJobsViewer();
  const existingSitesViewer = useOptionalSitesViewer();
  const needsJobsData = stack.some(isJobSheet);
  const needsSitesData = stack.some(isSiteSheet);
  const loadJobsResource = React.useCallback(
    () => loadJobsRouteData(routeContext),
    [routeContext]
  );
  const loadSitesResource = React.useCallback(
    () => loadSitesRouteData(routeContext),
    [routeContext]
  );
  const jobsResource = useAsyncResource(
    loadJobsResource,
    existingJobsViewer === undefined && needsJobsData
  );
  const sitesResource = useAsyncResource(
    loadSitesResource,
    existingSitesViewer === undefined && needsSitesData
  );
  const jobsStatus = getDomainStatus(existingJobsViewer, jobsResource);
  const sitesStatus = getDomainStatus(existingSitesViewer, sitesResource);
  const entries = useWorkspaceSheetRenderEntries(stack);
  const renderEntries = shouldRenderOnlyTopSheet({
    canCreate: canCreateWorkspaceRecords(routeContext),
    entries,
    jobsStatus,
    sitesStatus,
  })
    ? entries.slice(-1)
    : entries;

  const content = renderWorkspaceSheetEntries({
    canCreate: canCreateWorkspaceRecords(routeContext),
    entries: renderEntries,
    existingJobsViewer,
    existingSitesViewer,
    jobsResource,
    jobsStatus,
    onClose: pop,
    routeContext,
    sitesResource,
    sitesStatus,
  });

  return content;
}

function renderWorkspaceSheetEntries({
  canCreate,
  entries,
  existingJobsViewer,
  existingSitesViewer,
  jobsResource,
  jobsStatus,
  onClose,
  routeContext,
  sitesResource,
  sitesStatus,
}: {
  readonly canCreate: boolean;
  readonly entries: readonly WorkspaceSheetRenderEntry[];
  readonly existingJobsViewer: ReturnType<typeof useOptionalJobsViewer>;
  readonly existingSitesViewer: ReturnType<typeof useOptionalSitesViewer>;
  readonly jobsResource: AsyncResource<
    Awaited<ReturnType<typeof loadJobsRouteData>>
  >;
  readonly jobsStatus: WorkspaceSheetDomainStatus;
  readonly onClose: () => void;
  readonly routeContext: ReturnType<typeof useWorkspaceRouteAccess>;
  readonly sitesResource: AsyncResource<
    Awaited<ReturnType<typeof loadSitesRouteData>>
  >;
  readonly sitesStatus: WorkspaceSheetDomainStatus;
}) {
  let nestedSheet: React.ReactNode = null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    nestedSheet = (
      <WorkspaceSheetEntry
        canCreate={canCreate}
        drawerKind={getWorkspaceSheetDrawerKind(index)}
        existingJobsViewer={existingJobsViewer}
        existingSitesViewer={existingSitesViewer}
        jobsResource={jobsResource}
        jobsStatus={jobsStatus}
        key={entry.key}
        nestedSheet={nestedSheet}
        onClose={onClose}
        routeContext={routeContext}
        sheetLayer={getWorkspaceSheetLayer(index, entries.length)}
        sheet={entry.sheet}
        sitesResource={sitesResource}
        sitesStatus={sitesStatus}
      />
    );
  }

  return nestedSheet;
}

function WorkspaceSheetEntry({
  canCreate,
  drawerKind,
  existingJobsViewer,
  existingSitesViewer,
  jobsResource,
  jobsStatus,
  nestedSheet,
  onClose,
  routeContext,
  sheetLayer,
  sheet,
  sitesResource,
  sitesStatus,
}: {
  readonly canCreate: boolean;
  readonly drawerKind: WorkspaceSheetDrawerKind;
  readonly existingJobsViewer: ReturnType<typeof useOptionalJobsViewer>;
  readonly existingSitesViewer: ReturnType<typeof useOptionalSitesViewer>;
  readonly jobsResource: AsyncResource<
    Awaited<ReturnType<typeof loadJobsRouteData>>
  >;
  readonly jobsStatus: WorkspaceSheetDomainStatus;
  readonly nestedSheet?: React.ReactNode;
  readonly onClose: () => void;
  readonly routeContext: ReturnType<typeof useWorkspaceRouteAccess>;
  readonly sheetLayer: WorkspaceSheetLayer;
  readonly sheet: WorkspaceSheet;
  readonly sitesResource: AsyncResource<
    Awaited<ReturnType<typeof loadSitesRouteData>>
  >;
  readonly sitesStatus: WorkspaceSheetDomainStatus;
}) {
  if (
    (sheet.kind === "job.create" || sheet.kind === "site.create") &&
    !canCreate
  ) {
    return (
      <WorkspaceSheetUnavailable
        actionLabel="Close sheet"
        active
        description="You need owner or admin access to create workspace records."
        drawerKind={drawerKind}
        nestedSheet={nestedSheet}
        onClose={onClose}
        sheetLayer={sheetLayer}
        title="Create unavailable"
      />
    );
  }

  switch (sheet.kind) {
    case "job.create": {
      if (jobsStatus !== "available") {
        return (
          <WorkspaceSheetDataFallback
            drawerKind={drawerKind}
            domainStatus={jobsStatus}
            nestedSheet={nestedSheet}
            onClose={onClose}
            sheetLayer={sheetLayer}
            title="Loading job"
            unavailableDescription="Job data could not be loaded."
            unavailableTitle="Job unavailable"
          />
        );
      }

      return (
        <WorkspaceJobsStateScope
          existingJobsViewer={existingJobsViewer}
          jobsResource={jobsResource}
          routeContext={routeContext}
        >
          <JobsCreateSheet
            active
            drawerKind={drawerKind}
            initialSiteId={sheet.siteId}
            nestedSheet={nestedSheet}
            onClose={onClose}
            sheetLayer={sheetLayer}
          />
        </WorkspaceJobsStateScope>
      );
    }
    case "job.detail": {
      if (jobsStatus !== "available") {
        return (
          <WorkspaceSheetDataFallback
            drawerKind={drawerKind}
            domainStatus={jobsStatus}
            nestedSheet={nestedSheet}
            onClose={onClose}
            sheetLayer={sheetLayer}
            title="Loading job"
            unavailableDescription="Job data could not be loaded."
            unavailableTitle="Job unavailable"
          />
        );
      }

      return (
        <WorkspaceJobsStateScope
          existingJobsViewer={existingJobsViewer}
          jobsResource={jobsResource}
          routeContext={routeContext}
        >
          <WorkspaceJobDetailSheet
            active
            drawerKind={drawerKind}
            jobId={sheet.jobId}
            nestedSheet={nestedSheet}
            onClose={onClose}
            sheetLayer={sheetLayer}
          />
        </WorkspaceJobsStateScope>
      );
    }
    case "site.create": {
      if (sitesStatus === "error") {
        return (
          <WorkspaceSheetUnavailable
            actionLabel="Close sheet"
            active
            description="Site data could not be loaded."
            drawerKind={drawerKind}
            nestedSheet={nestedSheet}
            onClose={onClose}
            sheetLayer={sheetLayer}
            title="Site unavailable"
          />
        );
      }

      return (
        <SitesCreateSheet
          active
          drawerKind={drawerKind}
          nestedSheet={nestedSheet}
          onClose={onClose}
          sheetLayer={sheetLayer}
          siteCreatedTargetId={sheet.targetSheetId}
        >
          {sitesStatus === "loading" ? (
            <SitesCreateSheet.LoadingContent />
          ) : (
            <WorkspaceSitesStateScope
              existingSitesViewer={existingSitesViewer}
              routeContext={routeContext}
              sitesResource={sitesResource}
            >
              <SitesCreateSheet.Form />
            </WorkspaceSitesStateScope>
          )}
        </SitesCreateSheet>
      );
    }
    case "site.detail": {
      if (sitesStatus !== "available") {
        return (
          <WorkspaceSheetDataFallback
            drawerKind={drawerKind}
            domainStatus={sitesStatus}
            nestedSheet={nestedSheet}
            onClose={onClose}
            sheetLayer={sheetLayer}
            title="Loading site"
            unavailableDescription="Site data could not be loaded."
            unavailableTitle="Site unavailable"
          />
        );
      }

      return (
        <WorkspaceSitesStateScope
          existingSitesViewer={existingSitesViewer}
          routeContext={routeContext}
          sitesResource={sitesResource}
        >
          <WorkspaceSiteDetailSheet
            active
            drawerKind={drawerKind}
            nestedSheet={nestedSheet}
            onClose={onClose}
            sheetLayer={sheetLayer}
            siteId={sheet.siteId}
          />
        </WorkspaceSitesStateScope>
      );
    }
    default: {
      return assertNever(sheet);
    }
  }
}

function WorkspaceJobsStateScope({
  children,
  existingJobsViewer,
  jobsResource,
  routeContext,
}: {
  readonly children: React.ReactNode;
  readonly existingJobsViewer: ReturnType<typeof useOptionalJobsViewer>;
  readonly jobsResource: AsyncResource<
    Awaited<ReturnType<typeof loadJobsRouteData>>
  >;
  readonly routeContext: ReturnType<typeof useWorkspaceRouteAccess>;
}) {
  useApplyDataPlaneSeeds(
    jobsResource.status === "success"
      ? jobsResource.data.dataPlaneSeeds
      : EMPTY_DATA_PLANE_SEEDS
  );

  if (existingJobsViewer !== undefined || jobsResource.status !== "success") {
    return children;
  }

  const dataPlaneScopeKey = `${routeContext.activeOrganizationId}:${jobsResource.data.viewer.userId}:${jobsResource.data.viewer.role}`;

  return (
    <JobsStateProvider
      key={dataPlaneScopeKey}
      activeOrganizationId={routeContext.activeOrganizationId}
      list={jobsResource.data.list}
      options={jobsResource.data.options}
      queryClient={routeContext.queryClient}
      viewer={jobsResource.data.viewer}
    >
      {children}
    </JobsStateProvider>
  );
}

function WorkspaceSitesStateScope({
  children,
  existingSitesViewer,
  routeContext,
  sitesResource,
}: {
  readonly children: React.ReactNode;
  readonly existingSitesViewer: ReturnType<typeof useOptionalSitesViewer>;
  readonly routeContext: ReturnType<typeof useWorkspaceRouteAccess>;
  readonly sitesResource: AsyncResource<
    Awaited<ReturnType<typeof loadSitesRouteData>>
  >;
}) {
  useApplyDataPlaneSeeds(
    sitesResource.status === "success"
      ? sitesResource.data.dataPlaneSeeds
      : EMPTY_DATA_PLANE_SEEDS
  );

  if (existingSitesViewer !== undefined || sitesResource.status !== "success") {
    return children;
  }

  const dataPlaneScopeKey = `${routeContext.activeOrganizationId}:${sitesResource.data.viewer.userId}:${sitesResource.data.viewer.role}`;

  return (
    <SitesStateProvider
      key={dataPlaneScopeKey}
      activeOrganizationId={routeContext.activeOrganizationId}
      options={sitesResource.data.options}
      queryClient={routeContext.queryClient}
      viewer={sitesResource.data.viewer}
    >
      {children}
    </SitesStateProvider>
  );
}

function WorkspaceSheetDataFallback({
  drawerKind,
  domainStatus,
  nestedSheet,
  onClose,
  sheetLayer,
  title,
  unavailableDescription,
  unavailableTitle,
}: {
  readonly drawerKind: WorkspaceSheetDrawerKind;
  readonly domainStatus: Exclude<WorkspaceSheetDomainStatus, "available">;
  readonly nestedSheet?: React.ReactNode;
  readonly onClose: () => void;
  readonly sheetLayer: WorkspaceSheetLayer;
  readonly title: string;
  readonly unavailableDescription: string;
  readonly unavailableTitle: string;
}) {
  if (domainStatus === "loading") {
    return (
      <WorkspaceSheetSkeleton
        active
        drawerKind={drawerKind}
        nestedSheet={nestedSheet}
        sheetLayer={sheetLayer}
        title={title}
      />
    );
  }

  return (
    <WorkspaceSheetUnavailable
      actionLabel="Close sheet"
      active
      description={unavailableDescription}
      drawerKind={drawerKind}
      nestedSheet={nestedSheet}
      onClose={onClose}
      sheetLayer={sheetLayer}
      title={unavailableTitle}
    />
  );
}

function shouldRenderOnlyTopSheet({
  canCreate,
  entries,
  jobsStatus,
  sitesStatus,
}: {
  readonly canCreate: boolean;
  readonly entries: readonly WorkspaceSheetRenderEntry[];
  readonly jobsStatus: WorkspaceSheetDomainStatus;
  readonly sitesStatus: WorkspaceSheetDomainStatus;
}) {
  return entries.slice(0, -1).some(({ sheet }) =>
    isWorkspaceSheetBlockedAsStackParent(sheet, {
      canCreate,
      jobsStatus,
      sitesStatus,
    })
  );
}

function isWorkspaceSheetBlockedAsStackParent(
  sheet: WorkspaceSheet,
  {
    canCreate,
    jobsStatus,
    sitesStatus,
  }: {
    readonly canCreate: boolean;
    readonly jobsStatus: WorkspaceSheetDomainStatus;
    readonly sitesStatus: WorkspaceSheetDomainStatus;
  }
) {
  if (
    (sheet.kind === "job.create" || sheet.kind === "site.create") &&
    !canCreate
  ) {
    return true;
  }

  switch (sheet.kind) {
    case "job.create":
    case "job.detail": {
      return jobsStatus !== "available";
    }
    case "site.create": {
      return sitesStatus === "error";
    }
    case "site.detail": {
      return sitesStatus !== "available";
    }
    default: {
      return assertNever(sheet);
    }
  }
}

function canCreateWorkspaceRecords({
  currentOrganizationRole,
}: ReturnType<typeof useWorkspaceRouteAccess>) {
  return (
    currentOrganizationRole === "owner" || currentOrganizationRole === "admin"
  );
}

function getDomainStatus<TData, TViewer>(
  existingViewer: TViewer | undefined,
  resource: AsyncResource<TData>
): WorkspaceSheetDomainStatus {
  if (existingViewer !== undefined || resource.status === "success") {
    return "available";
  }

  return resource.status;
}

function isJobSheet(sheet: WorkspaceSheet) {
  return sheet.kind === "job.create" || sheet.kind === "job.detail";
}

function isSiteSheet(sheet: WorkspaceSheet) {
  return sheet.kind === "site.create" || sheet.kind === "site.detail";
}

function WorkspaceJobDetailSheet({
  active,
  drawerKind,
  jobId,
  nestedSheet,
  onClose,
  sheetLayer,
}: {
  readonly active: boolean;
  readonly drawerKind: WorkspaceSheetDrawerKind;
  readonly jobId: Extract<
    WorkspaceSheet,
    { readonly kind: "job.detail" }
  >["jobId"];
  readonly nestedSheet?: React.ReactNode;
  readonly onClose: () => void;
  readonly sheetLayer: WorkspaceSheetLayer;
}) {
  const routeContext = useWorkspaceRouteAccess();
  const viewer = useJobsViewer();
  const loadResource = React.useCallback(
    () => loadJobDetailRouteData(jobId, routeContext),
    [jobId, routeContext]
  );
  const resource = useAsyncResource(loadResource);

  if (resource.status === "loading") {
    return (
      <WorkspaceSheetSkeleton
        active={active}
        drawerKind={drawerKind}
        nestedSheet={nestedSheet}
        sheetLayer={sheetLayer}
        title="Loading job"
      />
    );
  }

  if (
    resource.status === "error" ||
    resource.data === null ||
    isCreateJobRouteData(resource.data)
  ) {
    return (
      <WorkspaceSheetUnavailable
        actionLabel="Close job"
        active={active}
        description="This job is no longer available in the current organization."
        drawerKind={drawerKind}
        nestedSheet={nestedSheet}
        onClose={onClose}
        sheetLayer={sheetLayer}
        title="Job unavailable"
      />
    );
  }

  return (
    <JobsDetailSheet
      active={active}
      drawerKind={drawerKind}
      initialDetail={resource.data}
      nestedSheet={nestedSheet}
      onClose={onClose}
      sheetLayer={sheetLayer}
      viewer={viewer}
    />
  );
}

function WorkspaceSiteDetailSheet({
  active,
  drawerKind,
  nestedSheet,
  onClose,
  sheetLayer,
  siteId,
}: {
  readonly active: boolean;
  readonly drawerKind: WorkspaceSheetDrawerKind;
  readonly nestedSheet?: React.ReactNode;
  readonly onClose: () => void;
  readonly sheetLayer: WorkspaceSheetLayer;
  readonly siteId: Extract<
    WorkspaceSheet,
    { readonly kind: "site.detail" }
  >["siteId"];
}) {
  const routeContext = useWorkspaceRouteAccess();
  const options = useSitesOptions();
  const viewer = useSitesViewer();
  const loadResource = React.useCallback(
    () => loadSiteDetailRouteData(siteId, routeContext),
    [routeContext, siteId]
  );
  const resource = useAsyncResource(loadResource);

  if (resource.status === "loading") {
    return (
      <WorkspaceSheetSkeleton
        active={active}
        drawerKind={drawerKind}
        nestedSheet={nestedSheet}
        sheetLayer={sheetLayer}
        title="Loading site"
      />
    );
  }

  if (resource.status === "error") {
    return (
      <WorkspaceSheetUnavailable
        actionLabel="Close site"
        active={active}
        description="This site could not be loaded."
        drawerKind={drawerKind}
        nestedSheet={nestedSheet}
        onClose={onClose}
        sheetLayer={sheetLayer}
        title="Site unavailable"
      />
    );
  }

  return (
    <SitesDetailSheet
      active={active}
      drawerKind={drawerKind}
      hasMoreRelatedJobs={resource.data.hasMoreRelatedJobs}
      initialSite={options.sites.find((site) => site.id === siteId) ?? null}
      initialRelatedJobs={resource.data.relatedJobs}
      nestedSheet={nestedSheet}
      onClose={onClose}
      sheetLayer={sheetLayer}
      siteId={resource.data.siteId}
      viewer={viewer}
    />
  );
}

function useWorkspaceRouteAccess() {
  const {
    activeOrganizationId,
    activeOrganizationSync,
    currentOrganizationRole,
    currentUserId,
    queryClient,
  } = useRouteContext({ from: "/_app/_org" });
  const { required, targetOrganizationId } = activeOrganizationSync;

  return React.useMemo(
    () => ({
      activeOrganizationId,
      activeOrganizationSync: {
        required,
        targetOrganizationId,
      },
      currentOrganizationRole,
      currentUserId,
      queryClient,
    }),
    [
      activeOrganizationId,
      currentOrganizationRole,
      currentUserId,
      queryClient,
      required,
      targetOrganizationId,
    ]
  );
}

function useAsyncResource<T>(
  load: () => Promise<T>,
  enabled = true
): AsyncResource<T> {
  const [resource, dispatch] = React.useReducer(
    asyncResourceReducer<T>,
    INITIAL_ASYNC_RESOURCE
  );

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    let ignore = false;

    dispatch({ type: "loading" });
    async function loadResource() {
      try {
        const data = await load();

        if (!ignore) {
          dispatch({ data, type: "success" });
        }
      } catch (error) {
        if (!ignore) {
          dispatch({ error, type: "error" });
        }
      }
    }

    void loadResource();

    return () => {
      ignore = true;
    };
  }, [enabled, load]);

  return resource;
}

const INITIAL_ASYNC_RESOURCE: AsyncResource<never> = { status: "loading" };

function asyncResourceReducer<T>(
  _state: AsyncResource<T>,
  action: AsyncResourceAction<T>
): AsyncResource<T> {
  switch (action.type) {
    case "error": {
      return { error: action.error, status: "error" };
    }
    case "loading": {
      return INITIAL_ASYNC_RESOURCE;
    }
    case "success": {
      return { data: action.data, status: "success" };
    }
    default: {
      return assertNever(action);
    }
  }
}

function useWorkspaceSheetRenderEntries(
  stack: readonly WorkspaceSheet[]
): readonly WorkspaceSheetRenderEntry[] {
  const nextKeyRef = React.useRef(0);
  const entriesRef = React.useRef<readonly WorkspaceSheetRenderEntry[]>([]);

  return React.useMemo(() => {
    const nextEntries = reconcileWorkspaceSheetRenderEntries(
      entriesRef.current,
      stack,
      () => {
        nextKeyRef.current += 1;

        return `workspace-sheet-${nextKeyRef.current}`;
      }
    );

    entriesRef.current = nextEntries;

    return nextEntries;
  }, [stack]);
}

function reconcileWorkspaceSheetRenderEntries(
  currentEntries: readonly WorkspaceSheetRenderEntry[],
  stack: readonly WorkspaceSheet[],
  createKey: () => string
): readonly WorkspaceSheetRenderEntry[] {
  const currentSheets = currentEntries.map((entry) => entry.sheet);

  if (sheetsEqual(currentSheets, stack)) {
    return currentEntries.map((entry, index) => ({
      key: entry.key,
      sheet: stack[index] as WorkspaceSheet,
    }));
  }

  if (sheetsEqual(currentSheets.slice(0, -1), stack)) {
    return currentEntries.slice(0, -1).map((entry, index) => ({
      key: entry.key,
      sheet: stack[index] as WorkspaceSheet,
    }));
  }

  if (
    stack.length === currentSheets.length + 1 &&
    sheetsEqual(currentSheets, stack.slice(0, -1))
  ) {
    return [
      ...currentEntries.map((entry, index) => ({
        key: entry.key,
        sheet: stack[index] as WorkspaceSheet,
      })),
      {
        key: createKey(),
        sheet: stack.at(-1) as WorkspaceSheet,
      },
    ];
  }

  if (
    currentSheets.length === WORKSPACE_SHEET_STACK_LIMIT &&
    stack.length === WORKSPACE_SHEET_STACK_LIMIT &&
    sheetsEqual(currentSheets.slice(1), stack.slice(0, -1))
  ) {
    return [
      ...currentEntries.slice(1).map((entry, index) => ({
        key: entry.key,
        sheet: stack[index] as WorkspaceSheet,
      })),
      {
        key: createKey(),
        sheet: stack.at(-1) as WorkspaceSheet,
      },
    ];
  }

  if (
    currentSheets.length === stack.length &&
    sheetsEqual(currentSheets.slice(0, -1), stack.slice(0, -1))
  ) {
    return [
      ...currentEntries.slice(0, -1).map((entry, index) => ({
        key: entry.key,
        sheet: stack[index] as WorkspaceSheet,
      })),
      {
        key: createKey(),
        sheet: stack.at(-1) as WorkspaceSheet,
      },
    ];
  }

  return stack.map((sheet) => ({
    key: createKey(),
    sheet,
  }));
}

function sheetsEqual(
  left: readonly WorkspaceSheet[],
  right: readonly WorkspaceSheet[]
) {
  return (
    left.length === right.length &&
    left.every((sheet, index) =>
      workspaceSheetsEqual(sheet, right[index] as WorkspaceSheet | undefined)
    )
  );
}

function workspaceSheetsEqual(
  left: WorkspaceSheet,
  right: WorkspaceSheet | undefined
) {
  if (right === undefined || left.kind !== right.kind) {
    return false;
  }

  switch (left.kind) {
    case "job.create": {
      return (
        right.kind === "job.create" &&
        left.contactId === right.contactId &&
        left.siteId === right.siteId
      );
    }
    case "job.detail": {
      return right.kind === "job.detail" && left.jobId === right.jobId;
    }
    case "site.create": {
      return (
        right.kind === "site.create" &&
        left.targetSheetId === right.targetSheetId
      );
    }
    case "site.detail": {
      return right.kind === "site.detail" && left.siteId === right.siteId;
    }
    default: {
      return assertNever(left);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled workspace sheet: ${JSON.stringify(value)}`);
}
