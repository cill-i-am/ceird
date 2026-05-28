"use client";
import { useRouteContext } from "@tanstack/react-router";
import * as React from "react";

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
type WorkspaceSheetDomainStatus = "available" | "error" | "loading";

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

  let content = (
    <>
      {entries.map(({ key, sheet }, index) => (
        <WorkspaceSheetEntry
          active={index === entries.length - 1}
          canCreate={canCreateWorkspaceRecords(routeContext)}
          jobsStatus={jobsStatus}
          key={key}
          onClose={pop}
          sheet={sheet}
          sitesStatus={sitesStatus}
        />
      ))}
    </>
  );

  if (existingJobsViewer === undefined && jobsResource.status === "success") {
    content = (
      <JobsStateProvider
        activeOrganizationId={routeContext.activeOrganizationId}
        list={jobsResource.data.list}
        options={jobsResource.data.options}
        queryClient={routeContext.queryClient}
        viewer={jobsResource.data.viewer}
      >
        {content}
      </JobsStateProvider>
    );
  }

  if (existingSitesViewer === undefined && sitesResource.status === "success") {
    content = (
      <SitesStateProvider
        activeOrganizationId={routeContext.activeOrganizationId}
        options={sitesResource.data.options}
        queryClient={routeContext.queryClient}
        viewer={sitesResource.data.viewer}
      >
        {content}
      </SitesStateProvider>
    );
  }

  return content;
}

function WorkspaceSheetEntry({
  active,
  canCreate,
  jobsStatus,
  onClose,
  sheet,
  sitesStatus,
}: {
  readonly active: boolean;
  readonly canCreate: boolean;
  readonly jobsStatus: WorkspaceSheetDomainStatus;
  readonly onClose: () => void;
  readonly sheet: WorkspaceSheet;
  readonly sitesStatus: WorkspaceSheetDomainStatus;
}) {
  if (
    (sheet.kind === "job.create" || sheet.kind === "site.create") &&
    !canCreate
  ) {
    return (
      <WorkspaceSheetUnavailable
        actionLabel="Close sheet"
        active={active}
        description="You need owner or admin access to create workspace records."
        onClose={onClose}
        title="Create unavailable"
      />
    );
  }

  switch (sheet.kind) {
    case "job.create": {
      if (jobsStatus !== "available") {
        return (
          <WorkspaceSheetDataFallback
            active={active}
            domainStatus={jobsStatus}
            onClose={onClose}
            title="Loading job"
            unavailableDescription="Job data could not be loaded."
            unavailableTitle="Job unavailable"
          />
        );
      }

      return (
        <JobsCreateSheet
          active={active}
          initialSiteId={sheet.siteId}
          onClose={onClose}
        />
      );
    }
    case "job.detail": {
      if (jobsStatus !== "available") {
        return (
          <WorkspaceSheetDataFallback
            active={active}
            domainStatus={jobsStatus}
            onClose={onClose}
            title="Loading job"
            unavailableDescription="Job data could not be loaded."
            unavailableTitle="Job unavailable"
          />
        );
      }

      return (
        <WorkspaceJobDetailSheet
          active={active}
          jobId={sheet.jobId}
          onClose={onClose}
        />
      );
    }
    case "site.create": {
      if (sitesStatus !== "available") {
        return (
          <WorkspaceSheetDataFallback
            active={active}
            domainStatus={sitesStatus}
            onClose={onClose}
            title="Loading site"
            unavailableDescription="Site data could not be loaded."
            unavailableTitle="Site unavailable"
          />
        );
      }

      return (
        <SitesCreateSheet
          active={active}
          onClose={onClose}
          siteCreatedTargetId={sheet.targetSheetId}
        />
      );
    }
    case "site.detail": {
      if (sitesStatus !== "available") {
        return (
          <WorkspaceSheetDataFallback
            active={active}
            domainStatus={sitesStatus}
            onClose={onClose}
            title="Loading site"
            unavailableDescription="Site data could not be loaded."
            unavailableTitle="Site unavailable"
          />
        );
      }

      return (
        <WorkspaceSiteDetailSheet
          active={active}
          onClose={onClose}
          siteId={sheet.siteId}
        />
      );
    }
    default: {
      return assertNever(sheet);
    }
  }
}

function WorkspaceSheetDataFallback({
  active,
  domainStatus,
  onClose,
  title,
  unavailableDescription,
  unavailableTitle,
}: {
  readonly active: boolean;
  readonly domainStatus: Exclude<WorkspaceSheetDomainStatus, "available">;
  readonly onClose: () => void;
  readonly title: string;
  readonly unavailableDescription: string;
  readonly unavailableTitle: string;
}) {
  if (domainStatus === "loading") {
    return <WorkspaceSheetSkeleton active={active} title={title} />;
  }

  return (
    <WorkspaceSheetUnavailable
      actionLabel="Close sheet"
      active={active}
      description={unavailableDescription}
      onClose={onClose}
      title={unavailableTitle}
    />
  );
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
  jobId,
  onClose,
}: {
  readonly active: boolean;
  readonly jobId: Extract<
    WorkspaceSheet,
    { readonly kind: "job.detail" }
  >["jobId"];
  readonly onClose: () => void;
}) {
  const routeContext = useWorkspaceRouteAccess();
  const viewer = useJobsViewer();
  const loadResource = React.useCallback(
    () => loadJobDetailRouteData(jobId, routeContext),
    [jobId, routeContext]
  );
  const resource = useAsyncResource(loadResource);

  if (resource.status === "loading") {
    return <WorkspaceSheetSkeleton active={active} title="Loading job" />;
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
        onClose={onClose}
        title="Job unavailable"
      />
    );
  }

  return (
    <JobsDetailSheet
      active={active}
      initialDetail={resource.data}
      onClose={onClose}
      viewer={viewer}
    />
  );
}

function WorkspaceSiteDetailSheet({
  active,
  onClose,
  siteId,
}: {
  readonly active: boolean;
  readonly onClose: () => void;
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
    return <WorkspaceSheetSkeleton active={active} title="Loading site" />;
  }

  if (resource.status === "error") {
    return (
      <WorkspaceSheetUnavailable
        actionLabel="Close site"
        active={active}
        description="This site could not be loaded."
        onClose={onClose}
        title="Site unavailable"
      />
    );
  }

  return (
    <SitesDetailSheet
      active={active}
      hasMoreRelatedJobs={resource.data.hasMoreRelatedJobs}
      initialSite={options.sites.find((site) => site.id === siteId) ?? null}
      onClose={onClose}
      relatedJobs={resource.data.relatedJobs}
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
  const [resource, setResource] = React.useState<AsyncResource<T>>({
    status: "loading",
  });

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    let ignore = false;

    setResource({ status: "loading" });
    async function loadResource() {
      try {
        const data = await load();

        if (!ignore) {
          setResource({ data, status: "success" });
        }
      } catch (error) {
        if (!ignore) {
          setResource({ error, status: "error" });
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
