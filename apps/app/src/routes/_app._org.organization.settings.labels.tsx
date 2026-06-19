import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import * as React from "react";

import { useHydratedCollectionItems } from "#/data-plane/hydrated-collection";
import { useDataPlaneSession } from "#/data-plane/session";
import {
  deriveLabelUsageCounts,
  getOrCreateSettingsLabelUsageCollectionState,
  getOrCreateSettingsLabelsCollectionState,
} from "#/features/labels/labels-data-plane";
import type {
  LabelUsageJobAssignmentRow,
  LabelUsageSiteAssignmentRow,
} from "#/features/labels/labels-data-plane";
import { OrganizationLabelsSettingsPage } from "#/features/organizations/organization-labels-settings-page";
import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-route-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-route-access";

export const Route = createFileRoute("/_app/_org/organization/settings/labels")(
  {
    staticData: {
      breadcrumb: {
        label: "Labels",
        to: "/organization/settings/labels",
      },
    },
    beforeLoad: ({ context }) => assertLabelsSettingsRouteAccess(context),
    component: LabelsSettingsRoute,
  }
);

interface LabelsSettingsRouteContext {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export function assertLabelsSettingsRouteAccess(
  context: LabelsSettingsRouteContext
) {
  if (context.activeOrganizationSync.required) {
    return;
  }

  assertOrganizationAdministrationRouteContext(context);
}

function LabelsSettingsRoute() {
  const dataPlaneSession = useDataPlaneSession();
  const { activeOrganization, currentOrganizationRole } = useRouteContext({
    from: "/_app/_org",
  });

  if (!activeOrganization) {
    throw new Error("Label settings require an active organization.");
  }

  const settingsLabelsState = React.useMemo(
    () =>
      getOrCreateSettingsLabelsCollectionState({
        scope: dataPlaneSession.scope,
        session: dataPlaneSession,
      }),
    [dataPlaneSession]
  );
  const usageCounts = useLabelUsageCounts();

  return (
    <OrganizationLabelsSettingsPage
      collectionState={settingsLabelsState}
      labelUsageCounts={usageCounts}
      mutationJournal={dataPlaneSession.mutationJournal}
      organization={activeOrganization}
      organizationRole={currentOrganizationRole}
    />
  );
}

const EMPTY_LABEL_USAGE_ITEMS: readonly never[] = [];

function useLabelUsageCounts() {
  const dataPlaneSession = useDataPlaneSession();
  const usageState = React.useMemo(
    () =>
      getOrCreateSettingsLabelUsageCollectionState({
        scope: dataPlaneSession.scope,
        session: dataPlaneSession,
      }),
    [dataPlaneSession]
  );
  const jobLabelAssignments = useHydratedCollectionItems(
    usageState.jobLabelAssignments.collection as unknown as Parameters<
      typeof useHydratedCollectionItems<LabelUsageJobAssignmentRow>
    >[0],
    EMPTY_LABEL_USAGE_ITEMS
  ) as readonly LabelUsageJobAssignmentRow[];
  const siteLabelAssignments = useHydratedCollectionItems(
    usageState.siteLabelAssignments.collection as unknown as Parameters<
      typeof useHydratedCollectionItems<LabelUsageSiteAssignmentRow>
    >[0],
    EMPTY_LABEL_USAGE_ITEMS
  ) as readonly LabelUsageSiteAssignmentRow[];

  return React.useMemo(
    () =>
      deriveLabelUsageCounts({
        jobAssignments: jobLabelAssignments.map((assignment) => ({
          labelId: assignment.labelId,
          targetId: assignment.workItemId,
        })),
        labels: [],
        siteAssignments: siteLabelAssignments.map((assignment) => ({
          labelId: assignment.labelId,
          targetId: assignment.siteId,
        })),
      }),
    [jobLabelAssignments, siteLabelAssignments]
  );
}
