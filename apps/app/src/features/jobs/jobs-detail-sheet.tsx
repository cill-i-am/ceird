"use client";
import type {
  JobCollaborator,
  JobCollaboratorAccessLevel,
  JobDetailResponse,
  JobStatus,
  UserIdType,
} from "@ceird/jobs-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import { SiteId } from "@ceird/sites-core";
import type { SiteIdType, SiteOption } from "@ceird/sites-core";
/* oxlint-disable complexity */
import {
  Briefcase01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Comment01Icon,
  Location01Icon,
  Time04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { Exit, Schema } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import {
  DRAWER_CLOSE_FALLBACK_MS,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import { Separator } from "#/components/ui/separator";
import { Textarea } from "#/components/ui/textarea";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { validateLabelName } from "#/features/labels/label-name-validation";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { submitClientForm } from "#/lib/client-form-submit";

import {
  JOB_PRIORITY_LABELS as PRIORITY_LABELS,
  JOB_STATUS_LABELS as STATUS_LABELS,
} from "./job-display";
import { JobDetailActionRail } from "./jobs-detail-actions";
import { JobActivityList } from "./jobs-detail-activity";
import {
  decodeCollaboratorUserId,
  JobCollaboratorsSection,
  JobCollaboratorsSummary,
  toExternalMemberOptions,
} from "./jobs-detail-collaborators";
import { JobCommentsList } from "./jobs-detail-comments";
import { JobCostSummary } from "./jobs-detail-cost-summary";
import { JobCostsSection } from "./jobs-detail-costs-section";
import { JobDetailFactsCard } from "./jobs-detail-facts";
import {
  formatDetailDateTime,
  getLocalDateInputValue,
} from "./jobs-detail-formatting";
import { getSortedLabels, JobDetailLabels } from "./jobs-detail-labels";
import { JobsDetailLocation } from "./jobs-detail-location";
import {
  getExitErrorMessage,
  renderMutationError,
} from "./jobs-detail-mutation-errors";
import { DetailEmpty, DetailSection } from "./jobs-detail-section";
import {
  JobsDetailStateProvider,
  useJobsDetailState,
} from "./jobs-detail-state";
import type {
  ExternalMemberOption,
  JobDetailActionPanel,
} from "./jobs-detail-types";
import { JobVisitsList } from "./jobs-detail-visits";
import { getCurrentServerJobExternalMemberOptions } from "./jobs-server";
import { useJobsLookup } from "./jobs-state";
import {
  getAvailableJobTransitions,
  hasAssignedJobAccess,
  hasJobsElevatedAccess,
  isExternalJobsViewer,
} from "./jobs-viewer";
import type { JobsViewer } from "./jobs-viewer";

const VISIT_DURATION_OPTIONS = [
  { label: "1 hour", value: "60" },
  { label: "2 hours", value: "120" },
  { label: "4 hours", value: "240" },
  { label: "8 hours", value: "480" },
] as const;

const VISIT_DURATION_SELECTION_GROUPS = [
  {
    label: "Duration",
    options: VISIT_DURATION_OPTIONS,
  },
] satisfies readonly CommandSelectGroup[];

const NO_SITE_VALUE = "__none__";
const decodeSiteId = Schema.decodeUnknownSync(SiteId);

interface JobsDetailSheetProps {
  readonly initialDetail: JobDetailResponse;
  readonly viewer: JobsViewer;
}

export function JobsDetailSheet({
  initialDetail,
  viewer,
}: JobsDetailSheetProps) {
  return (
    <JobsDetailStateProvider
      key={initialDetail.job.id}
      initialDetail={initialDetail}
    >
      <JobsDetailSheetContent viewer={viewer} />
    </JobsDetailStateProvider>
  );
}

function JobsDetailSheetContent({ viewer }: { readonly viewer: JobsViewer }) {
  const navigate = useNavigate({ from: "/jobs/$jobId" });
  const {
    addJobComment,
    addJobCostLine,
    addJobVisit,
    assignJobLabel,
    attachCollaborator,
    collaborators,
    createAndAssignJobLabel,
    detachCollaborator,
    detail,
    patchJob,
    refreshCollaborators,
    removeJobLabel,
    reopenJob,
    results,
    transitionJob,
    updateCollaborator,
  } = useJobsDetailState();
  const workItemId = detail.job.id;
  const lookup = useJobsLookup();
  const refreshCollaboratorsResult = results.refreshCollaborators;
  const attachCollaboratorResult = results.attachCollaborator;
  const updateCollaboratorResult = results.updateCollaborator;
  const detachCollaboratorResult = results.detachCollaborator;
  const transitionResult = results.transition;
  const reopenResult = results.reopen;
  const patchResult = results.patch;
  const commentResult = results.addComment;
  const visitResult = results.addVisit;
  const assignLabelResult = results.assignLabel;
  const createAndAssignLabelResult = results.createAndAssignLabel;
  const removeLabelResult = results.removeLabel;
  const costLineResult = results.addCostLine;
  const hasAssignmentAccess = hasAssignedJobAccess(
    viewer,
    detail.job.assigneeId
  );
  const canManageCollaborators = hasJobsElevatedAccess(viewer.role);
  const isExternalViewer = isExternalJobsViewer(viewer);
  const canEditJob = hasAssignmentAccess || hasJobsElevatedAccess(viewer.role);
  const canAssignLabels =
    hasAssignmentAccess || hasJobsElevatedAccess(viewer.role);
  const canCreateLabels = hasJobsElevatedAccess(viewer.role);
  const canAddVisit = hasAssignmentAccess;
  const canAddCostLine = hasAssignmentAccess;
  const canAddComment = detail.viewerAccess.canComment;
  const canReopen = hasAssignmentAccess;
  const transitionOptions = getAvailableJobTransitions(viewer, detail.job);
  const transitionSelectionGroups =
    buildTransitionSelectionGroups(transitionOptions);

  const [selectedStatus, setSelectedStatus] = React.useState<JobStatus | "">(
    ""
  );
  const [blockedReason, setBlockedReason] = React.useState("");
  const [transitionError, setTransitionError] = React.useState<string | null>(
    null
  );
  const [selectedSiteId, setSelectedSiteId] = React.useState<
    SiteIdType | typeof NO_SITE_VALUE
  >(detail.job.siteId ?? NO_SITE_VALUE);
  const [siteAssignmentError, setSiteAssignmentError] = React.useState<
    string | null
  >(null);
  const [siteAssignmentMessage, setSiteAssignmentMessage] = React.useState<
    string | null
  >(null);
  const [commentBody, setCommentBody] = React.useState("");
  const [commentError, setCommentError] = React.useState<string | null>(null);
  const [visitDate, setVisitDate] = React.useState("");
  const [visitDurationMinutes, setVisitDurationMinutes] = React.useState("60");
  const [visitNote, setVisitNote] = React.useState("");
  const [visitError, setVisitError] = React.useState<string | null>(null);
  const [labelError, setLabelError] = React.useState<string | null>(null);
  const [externalMembers, setExternalMembers] = React.useState<
    readonly ExternalMemberOption[]
  >([]);
  const [collaboratorsError, setCollaboratorsError] = React.useState<
    string | null
  >(null);
  const [collaboratorsMutationError, setCollaboratorsMutationError] =
    React.useState<string | null>(null);
  const [selectedCollaboratorUserId, setSelectedCollaboratorUserId] =
    React.useState<UserIdType | "">("");
  const [collaboratorRoleLabel, setCollaboratorRoleLabel] =
    React.useState("Requester");
  const [collaboratorAccessLevel, setCollaboratorAccessLevel] =
    React.useState<JobCollaboratorAccessLevel>("read");
  const [activePanel, setActivePanel] =
    React.useState<JobDetailActionPanel | null>(null);
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const navigateAfterCloseRef = React.useRef(false);
  const closeNavigationTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const costDescriptionRef = React.useRef<HTMLInputElement>(null);
  const site =
    detail.site ??
    (detail.job.siteId ? lookup.siteById.get(detail.job.siteId) : undefined);
  const contact =
    detail.contact ??
    (detail.job.contactId
      ? lookup.contactById.get(detail.job.contactId)
      : undefined);
  const assignee = detail.job.assigneeId
    ? lookup.memberById.get(detail.job.assigneeId)
    : undefined;
  const coordinator = detail.job.coordinatorId
    ? lookup.memberById.get(detail.job.coordinatorId)
    : undefined;
  const siteSelectionGroups = React.useMemo(
    () => buildSiteSelectionGroups([...lookup.siteById.values()]),
    [lookup.siteById]
  );
  const organizationLabels = React.useMemo<readonly Label[]>(
    () => getSortedLabels([...lookup.labelById.values()]),
    [lookup.labelById]
  );
  const assignedLabelIds = React.useMemo<ReadonlySet<LabelIdType>>(
    () => new Set(detail.job.labels.map((label) => label.id)),
    [detail.job.labels]
  );
  const availableLabels = React.useMemo<readonly Label[]>(
    () => organizationLabels.filter((label) => !assignedLabelIds.has(label.id)),
    [assignedLabelIds, organizationLabels]
  );
  const selectedSiteChanged =
    selectedSiteId !== (detail.job.siteId ?? NO_SITE_VALUE);
  const hasComments = detail.comments.length > 0;
  const hasCostLines =
    detail.costs !== undefined && detail.costs.lines.length > 0;
  const hasVisits = detail.visits.length > 0;
  const hasCollaborators = collaborators.length > 0;
  const shouldLoadCollaboratorDetails =
    canManageCollaborators &&
    (activePanel === "collaborators" || hasCollaborators);
  const externalMemberById = React.useMemo(
    () =>
      new Map(
        externalMembers.map((externalMember) => [
          externalMember.userId,
          externalMember,
        ])
      ),
    [externalMembers]
  );

  React.useEffect(() => {
    setSelectedStatus("");
    setBlockedReason("");
    setTransitionError(null);
    setSelectedSiteId(detail.job.siteId ?? NO_SITE_VALUE);
    setSiteAssignmentError(null);
    setSiteAssignmentMessage(null);
    setCommentBody("");
    setCommentError(null);
    setVisitDate(getLocalDateInputValue());
    setVisitDurationMinutes("60");
    setVisitNote("");
    setVisitError(null);
    setLabelError(null);
    setActivePanel(null);
  }, [detail.job.siteId, detail.job.status, workItemId]);

  React.useEffect(() => {
    if (!shouldLoadCollaboratorDetails) {
      return;
    }

    void refreshCollaborators();
  }, [refreshCollaborators, shouldLoadCollaboratorDetails, workItemId]);

  React.useEffect(() => {
    if (!shouldLoadCollaboratorDetails) {
      return;
    }

    let ignore = false;

    async function loadExternalMembers() {
      setCollaboratorsError(null);

      try {
        const result = await getCurrentServerJobExternalMemberOptions();

        if (ignore) {
          return;
        }

        setExternalMembers(toExternalMemberOptions(result.members));
      } catch {
        if (!ignore) {
          setCollaboratorsError("External collaborators could not be loaded.");
        }
      }
    }

    void loadExternalMembers();

    return () => {
      ignore = true;
    };
  }, [shouldLoadCollaboratorDetails, workItemId]);

  React.useEffect(() => {
    setOverlayOpen(true);
  }, []);

  React.useEffect(
    () => () => {
      if (closeNavigationTimeoutRef.current) {
        clearTimeout(closeNavigationTimeoutRef.current);
      }
    },
    []
  );

  const navigateToJobs = React.useCallback(() => {
    React.startTransition(() => {
      navigate({ to: "/jobs" });
    });
  }, [navigate]);

  const finishClosedSheet = React.useCallback(() => {
    if (closeNavigationTimeoutRef.current) {
      clearTimeout(closeNavigationTimeoutRef.current);
      closeNavigationTimeoutRef.current = null;
    }

    if (navigateAfterCloseRef.current) {
      navigateAfterCloseRef.current = false;
      navigateToJobs();
    }
  }, [navigateToJobs]);

  const closeSheet = React.useCallback(() => {
    navigateAfterCloseRef.current = true;
    setOverlayOpen(false);

    if (closeNavigationTimeoutRef.current) {
      clearTimeout(closeNavigationTimeoutRef.current);
    }

    closeNavigationTimeoutRef.current = setTimeout(
      finishClosedSheet,
      DRAWER_CLOSE_FALLBACK_MS
    );
  }, [finishClosedSheet]);

  async function handleTransition() {
    if (!selectedStatus) {
      setTransitionError("Pick the next status before applying the change.");
      return;
    }

    if (selectedStatus === "blocked" && blockedReason.trim().length === 0) {
      setTransitionError(
        "Add the blocker so the next person knows what is stuck."
      );
      return;
    }

    setTransitionError(null);
    const exit = await transitionJob({
      status: selectedStatus,
      ...(selectedStatus === "blocked"
        ? { blockedReason: blockedReason.trim() }
        : {}),
    });

    if (Exit.isSuccess(exit)) {
      setBlockedReason("");
    }
  }

  const handleReopen = React.useCallback(async () => {
    await reopenJob();
  }, [reopenJob]);

  const jobDetailCommandActions = React.useMemo<
    readonly CommandAction[]
  >(() => {
    const actions: CommandAction[] = [
      {
        group: "Current job",
        icon: Briefcase01Icon,
        id: `job-${workItemId}-close`,
        priority: 100,
        run: closeSheet,
        scope: "detail",
        title: "Close job details",
      },
    ];

    if (detail.job.status === "completed" && canReopen) {
      actions.push({
        disabled: reopenResult.waiting,
        group: "Current job",
        icon: CheckmarkCircle02Icon,
        id: `job-${workItemId}-reopen`,
        priority: 90,
        run: handleReopen,
        scope: "detail",
        title: "Reopen job",
      });
    }

    if (detail.job.status !== "completed" && hasAssignmentAccess) {
      for (const status of transitionOptions) {
        actions.push({
          disabled: transitionResult.waiting,
          group: "Current job",
          icon: CheckmarkCircle02Icon,
          id: `job-${workItemId}-transition-${status}`,
          keywords: [STATUS_LABELS[status]],
          priority: status === "completed" ? 90 : 80,
          run: () => {
            setTransitionError(null);

            if (status === "blocked") {
              setActivePanel("workflow");
              setSelectedStatus("blocked");
              return;
            }

            void transitionJob({ status });
          },
          scope: "detail",
          title: getStatusCommandLabel(status),
        });
      }
    }

    return actions;
  }, [
    canReopen,
    closeSheet,
    detail.job.status,
    handleReopen,
    hasAssignmentAccess,
    reopenResult.waiting,
    transitionOptions,
    transitionJob,
    transitionResult.waiting,
    workItemId,
  ]);

  useRegisterCommandActions(jobDetailCommandActions);
  useAppHotkey("jobDetailClose", closeSheet);
  useAppHotkey("jobDetailStatus", () => setActivePanel("workflow"), {
    enabled: !isExternalViewer,
  });
  useAppHotkey("jobDetailSite", () => setActivePanel("site"), {
    enabled: !isExternalViewer,
  });
  useAppHotkey("jobDetailComment", () => setActivePanel("comments"), {
    enabled: canAddComment,
  });
  useAppHotkey(
    "jobDetailCost",
    () => {
      if (activePanel === "costs") {
        costDescriptionRef.current?.focus();
        return;
      }

      setActivePanel("costs");
    },
    {
      enabled: !isExternalViewer && canAddCostLine,
    }
  );
  useAppHotkey("jobDetailVisit", () => setActivePanel("visits"), {
    enabled: !isExternalViewer && canAddVisit,
  });

  async function handleUpdateSiteAssignment() {
    if (!canEditJob) {
      return;
    }

    const nextSiteId = selectedSiteId === NO_SITE_VALUE ? null : selectedSiteId;

    if (
      selectedSiteId !== NO_SITE_VALUE &&
      !lookup.siteById.has(selectedSiteId)
    ) {
      setSiteAssignmentError("Pick an available site, or choose no site.");
      return;
    }

    setSiteAssignmentError(null);
    setSiteAssignmentMessage(null);

    const exit = await patchJob({
      contactId: null,
      siteId: nextSiteId,
    });

    if (Exit.isSuccess(exit)) {
      setSiteAssignmentMessage(
        nextSiteId === null ? "Site removed." : "Site assignment updated."
      );
    }
  }

  async function handleAddComment() {
    if (!canAddComment) {
      return;
    }

    if (commentBody.trim().length === 0) {
      setCommentError("Add the context you want the team to see.");
      return;
    }

    setCommentError(null);
    const exit = await addJobComment({
      body: commentBody.trim(),
    });

    if (Exit.isSuccess(exit)) {
      setCommentBody("");
    }
  }

  async function handleAddVisit() {
    if (visitDate.trim().length === 0) {
      setVisitError("Pick the day the visit happened.");
      return;
    }

    if (visitNote.trim().length === 0) {
      setVisitError("Add a short note so the visit is worth keeping.");
      return;
    }

    setVisitError(null);
    const exit = await addJobVisit({
      durationMinutes: Number(visitDurationMinutes),
      note: visitNote.trim(),
      visitDate,
    });

    if (Exit.isSuccess(exit)) {
      setVisitDate(getLocalDateInputValue());
      setVisitDurationMinutes("60");
      setVisitNote("");
    }
  }

  async function handleAssignLabel(labelId: LabelIdType) {
    if (!canAssignLabels) {
      return;
    }

    setLabelError(null);
    await assignJobLabel({ labelId });
  }

  async function handleCreateAndAssignLabel(name: string) {
    if (!canAssignLabels || !canCreateLabels) {
      return;
    }

    const decodedName = validateLabelName(name);

    if (decodedName.kind === "empty") {
      setLabelError("Type a label name before creating it.");
      return;
    }

    if (decodedName.kind === "invalid") {
      setLabelError("Keep label names between 1 and 48 characters.");
      return;
    }

    setLabelError(null);
    await createAndAssignJobLabel({ name: decodedName.name });
  }

  async function handleRemoveLabel(labelId: LabelIdType) {
    if (!canAssignLabels) {
      return;
    }

    setLabelError(null);
    await removeJobLabel(labelId);
  }

  async function handleAttachCollaborator() {
    if (!canManageCollaborators) {
      return;
    }

    const roleLabel = collaboratorRoleLabel.trim();

    if (!selectedCollaboratorUserId || roleLabel.length === 0) {
      setCollaboratorsError(
        "Choose an external collaborator and add a role label."
      );
      return;
    }

    setCollaboratorsError(null);
    setCollaboratorsMutationError(null);
    const exit = await attachCollaborator({
      accessLevel: collaboratorAccessLevel,
      roleLabel,
      userId: selectedCollaboratorUserId,
    });

    if (Exit.isSuccess(exit)) {
      setSelectedCollaboratorUserId("");
      setCollaboratorRoleLabel("Requester");
      setCollaboratorAccessLevel("read");
      return;
    }

    setCollaboratorsMutationError(getExitErrorMessage(exit));
  }

  async function handleUpdateCollaborator(input: {
    readonly collaboratorId: JobCollaborator["id"];
    readonly input: {
      readonly accessLevel: JobCollaboratorAccessLevel;
      readonly roleLabel: string;
    };
  }) {
    setCollaboratorsMutationError(null);
    const exit = await updateCollaborator(input);

    if (Exit.isFailure(exit)) {
      setCollaboratorsMutationError(getExitErrorMessage(exit));
    }
  }

  async function handleDetachCollaborator(
    collaboratorId: JobCollaborator["id"]
  ) {
    setCollaboratorsMutationError(null);
    const exit = await detachCollaborator(collaboratorId);

    if (Exit.isFailure(exit)) {
      setCollaboratorsMutationError(getExitErrorMessage(exit));
    }
  }

  let transitionErrorContent: React.ReactNode = null;

  if (selectedStatus === "blocked") {
    transitionErrorContent = (
      <Field data-invalid={Boolean(transitionError)}>
        <FieldLabel htmlFor="job-blocked-reason">Why is it blocked?</FieldLabel>
        <FieldContent>
          <Textarea
            id="job-blocked-reason"
            value={blockedReason}
            aria-invalid={Boolean(transitionError) || undefined}
            onChange={(event) => setBlockedReason(event.target.value)}
          />
          <FieldDescription>
            Call out the real blocker so the next move is obvious.
          </FieldDescription>
          <FieldError>{transitionError}</FieldError>
        </FieldContent>
      </Field>
    );
  } else if (transitionError) {
    transitionErrorContent = (
      <Field data-invalid>
        <FieldContent>
          <FieldError>{transitionError}</FieldError>
        </FieldContent>
      </Field>
    );
  }

  let statusActionContent: React.ReactNode;

  if (detail.job.status === "completed") {
    statusActionContent = canReopen ? (
      <div className="flex flex-col gap-3">
        {renderMutationError(reopenResult)}
        <Button
          className="w-full sm:w-fit"
          loading={reopenResult.waiting}
          onClick={handleReopen}
        >
          {reopenResult.waiting ? (
            "Reopening..."
          ) : (
            <>
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Reopen job
            </>
          )}
        </Button>
      </div>
    ) : (
      <DetailEmpty
        title="This completed job is view-only for you."
        description="Members can only reopen completed jobs when they are assigned to them."
      />
    );
  } else if (transitionOptions.length > 0 && hasAssignmentAccess) {
    let transitionButtonLabel = "Pick a status";

    if (transitionResult.waiting) {
      transitionButtonLabel = "Updating...";
    } else if (selectedStatus) {
      transitionButtonLabel = "Apply status change";
    }

    statusActionContent = (
      <div className="flex flex-col gap-4">
        {renderMutationError(transitionResult)}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="job-transition-status">Next status</FieldLabel>
            <FieldContent>
              <CommandSelect
                id="job-transition-status"
                value={selectedStatus}
                placeholder="Choose next state"
                emptyText="No status changes available."
                groups={transitionSelectionGroups}
                onValueChange={(nextValue) => {
                  setSelectedStatus(nextValue as JobStatus | "");
                  setTransitionError(null);
                }}
              />
            </FieldContent>
          </Field>

          {transitionErrorContent}
        </FieldGroup>

        <div className="flex flex-wrap gap-3">
          <Button
            loading={transitionResult.waiting}
            disabled={!selectedStatus}
            onClick={handleTransition}
          >
            {transitionResult.waiting ? (
              transitionButtonLabel
            ) : (
              <>
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {transitionButtonLabel}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  } else {
    statusActionContent = (
      <DetailEmpty
        title={
          hasAssignmentAccess
            ? "No further status action here yet."
            : "Status changes open once this job is assigned to you."
        }
        description={
          hasAssignmentAccess
            ? "This job is already at the end of the v1 workflow."
            : "Members can comment freely, but only the assignee can move the queue forward from here."
        }
      />
    );
  }

  function renderSiteAssignmentPanel() {
    if (isExternalViewer) {
      return null;
    }

    return (
      <DetailSection title="Site assignment">
        <div className="flex flex-col gap-4">
          {renderMutationError(patchResult)}
          <FieldGroup>
            <Field data-invalid={Boolean(siteAssignmentError)}>
              <FieldLabel htmlFor="job-site-assignment">Site</FieldLabel>
              <FieldContent>
                <CommandSelect
                  id="job-site-assignment"
                  value={selectedSiteId}
                  placeholder="Pick site"
                  emptyText="No sites found."
                  groups={siteSelectionGroups}
                  disabled={!canEditJob || patchResult.waiting}
                  ariaInvalid={siteAssignmentError ? true : undefined}
                  onValueChange={(nextValue) => {
                    if (nextValue === NO_SITE_VALUE) {
                      setSelectedSiteId(NO_SITE_VALUE);
                    } else {
                      try {
                        setSelectedSiteId(decodeSiteId(nextValue));
                      } catch {
                        setSelectedSiteId(NO_SITE_VALUE);
                      }
                    }
                    setSiteAssignmentError(null);
                    setSiteAssignmentMessage(null);
                  }}
                />
                <FieldError>{siteAssignmentError}</FieldError>
              </FieldContent>
            </Field>
          </FieldGroup>
          {siteAssignmentMessage ? (
            <p role="status" className="text-sm text-muted-foreground">
              {siteAssignmentMessage}
            </p>
          ) : null}
          {canEditJob ? (
            <div className="flex">
              <Button
                type="button"
                className="w-full sm:w-fit"
                loading={patchResult.waiting}
                disabled={!selectedSiteChanged}
                onClick={handleUpdateSiteAssignment}
              >
                {patchResult.waiting ? (
                  "Saving..."
                ) : (
                  <>
                    <HugeiconsIcon
                      icon={Location01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Save site
                  </>
                )}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Site assignment is limited to the assignee or organization admins.
            </p>
          )}
        </div>
      </DetailSection>
    );
  }

  function renderCommentsPanel() {
    return (
      <DetailSection title="Comments">
        <div className="flex flex-col gap-5">
          {renderMutationError(commentResult)}
          {canAddComment ? (
            <>
              <form
                className="flex flex-col gap-4"
                method="post"
                onSubmit={(event) => submitClientForm(event, handleAddComment)}
              >
                <FieldGroup>
                  <Field data-invalid={Boolean(commentError)}>
                    <FieldLabel htmlFor="job-comment-body">
                      Add a comment
                    </FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="job-comment-body"
                        value={commentBody}
                        aria-invalid={Boolean(commentError) || undefined}
                        onChange={(event) => setCommentBody(event.target.value)}
                      />
                      <FieldError>{commentError}</FieldError>
                    </FieldContent>
                  </Field>
                </FieldGroup>
                <div className="flex">
                  <Button
                    type="submit"
                    loading={commentResult.waiting}
                    className="w-full sm:w-fit"
                  >
                    {commentResult.waiting ? (
                      "Adding..."
                    ) : (
                      <>
                        <HugeiconsIcon
                          icon={Comment01Icon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                        Add comment
                      </>
                    )}
                  </Button>
                </div>
              </form>
              {hasComments ? <Separator /> : null}
            </>
          ) : null}

          {hasComments ? (
            <JobCommentsList comments={detail.comments} lookup={lookup} />
          ) : (
            <DetailEmpty title="No comments yet." />
          )}
        </div>
      </DetailSection>
    );
  }

  function renderVisitsPanel() {
    if (isExternalViewer) {
      return null;
    }

    return (
      <DetailSection title="Visits">
        <div className="flex flex-col gap-5">
          {canAddVisit ? (
            <>
              {renderMutationError(visitResult)}
              <form
                className="flex flex-col gap-4"
                method="post"
                onSubmit={(event) => submitClientForm(event, handleAddVisit)}
              >
                <FieldGroup>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field
                      data-invalid={
                        Boolean(visitError) && visitDate.trim().length === 0
                      }
                    >
                      <FieldLabel htmlFor="job-visit-date">
                        Visit date
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id="job-visit-date"
                          type="date"
                          value={visitDate}
                          aria-invalid={
                            Boolean(visitError) && visitDate.trim().length === 0
                              ? true
                              : undefined
                          }
                          onChange={(event) => setVisitDate(event.target.value)}
                        />
                      </FieldContent>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="job-visit-duration">
                        Duration
                      </FieldLabel>
                      <FieldContent>
                        <CommandSelect
                          id="job-visit-duration"
                          value={visitDurationMinutes}
                          placeholder="Pick duration"
                          emptyText="No durations found."
                          groups={VISIT_DURATION_SELECTION_GROUPS}
                          onValueChange={setVisitDurationMinutes}
                        />
                      </FieldContent>
                    </Field>
                  </div>

                  <Field
                    data-invalid={
                      Boolean(visitError) && visitNote.trim().length === 0
                    }
                  >
                    <FieldLabel htmlFor="job-visit-note">Visit note</FieldLabel>
                    <FieldContent>
                      <Textarea
                        id="job-visit-note"
                        value={visitNote}
                        aria-invalid={
                          Boolean(visitError) && visitNote.trim().length === 0
                            ? true
                            : undefined
                        }
                        onChange={(event) => setVisitNote(event.target.value)}
                      />
                      <FieldError>{visitError}</FieldError>
                    </FieldContent>
                  </Field>
                </FieldGroup>

                <div className="flex">
                  <Button
                    type="submit"
                    loading={visitResult.waiting}
                    className="w-full sm:w-fit"
                  >
                    {visitResult.waiting ? (
                      "Logging..."
                    ) : (
                      <>
                        <HugeiconsIcon
                          icon={Time04Icon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                        Log visit
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <Alert>
              <HugeiconsIcon icon={Time04Icon} strokeWidth={2} />
              <AlertTitle>Visit logging is limited here.</AlertTitle>
              <AlertDescription>
                Members can only log visits on jobs assigned to them.
              </AlertDescription>
            </Alert>
          )}

          {hasVisits ? (
            <>
              <Separator />
              <JobVisitsList visits={detail.visits} lookup={lookup} />
            </>
          ) : (
            <DetailEmpty title="No visits logged yet." />
          )}
        </div>
      </DetailSection>
    );
  }

  const collaboratorsCount = isExternalViewer ? 0 : collaborators.length;
  const costLinesCount = isExternalViewer
    ? 0
    : (detail.costs?.lines.length ?? 0);
  const visitsCount = isExternalViewer ? 0 : detail.visits.length;

  function renderActivePanelContent() {
    if (activePanel === "workflow" && !isExternalViewer) {
      return (
        <DetailSection title="Workflow">
          <div className="flex flex-col gap-4">{statusActionContent}</div>
        </DetailSection>
      );
    }

    if (activePanel === "site") {
      return renderSiteAssignmentPanel();
    }

    if (activePanel === "collaborators" && canManageCollaborators) {
      return (
        <JobCollaboratorsSection
          collaborators={collaborators}
          detachCollaborator={handleDetachCollaborator}
          errorMessage={collaboratorsMutationError ?? collaboratorsError}
          externalMemberById={externalMemberById}
          externalMembers={externalMembers}
          isLoading={
            refreshCollaboratorsResult.waiting ||
            attachCollaboratorResult.waiting
          }
          selectedAccessLevel={collaboratorAccessLevel}
          selectedRoleLabel={collaboratorRoleLabel}
          selectedUserId={selectedCollaboratorUserId}
          updateCollaborator={handleUpdateCollaborator}
          updatingOrRemoving={
            updateCollaboratorResult.waiting || detachCollaboratorResult.waiting
          }
          onAccessLevelChange={setCollaboratorAccessLevel}
          onAttach={handleAttachCollaborator}
          onRoleLabelChange={setCollaboratorRoleLabel}
          onUserChange={(userId) =>
            setSelectedCollaboratorUserId(decodeCollaboratorUserId(userId))
          }
        />
      );
    }

    if (activePanel === "comments") {
      return renderCommentsPanel();
    }

    if (activePanel === "costs" && !isExternalViewer) {
      return (
        <JobCostsSection
          key={workItemId}
          addJobCostLine={addJobCostLine}
          canAddCostLine={canAddCostLine}
          costDescriptionRef={costDescriptionRef}
          detail={detail}
          mutationError={renderMutationError(costLineResult)}
          waiting={costLineResult.waiting}
        />
      );
    }

    if (activePanel === "visits") {
      return renderVisitsPanel();
    }

    return null;
  }

  const activePanelContent = renderActivePanelContent();

  return (
    <ResponsiveDrawer
      open={overlayOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeSheet();
        }
      }}
      onAnimationEnd={(open) => {
        if (!open) {
          finishClosedSheet();
        }
      }}
    >
      <DrawerContent
        aria-describedby={undefined}
        className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-[38rem]"
      >
        <DrawerHeader className="shrink-0 gap-4 border-b px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-3">
              <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {detail.job.externalReference ?? "Job"}
              </div>
              <DrawerTitle className="text-xl leading-tight">
                {detail.job.title}
              </DrawerTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    detail.job.status === "blocked" ? "outline" : "secondary"
                  }
                >
                  {STATUS_LABELS[detail.job.status]}
                </Badge>
                <Badge
                  variant={
                    detail.job.priority === "none" ? "outline" : "secondary"
                  }
                >
                  {PRIORITY_LABELS[detail.job.priority]}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Updated {formatDetailDateTime(detail.job.updatedAt)}
                </span>
              </div>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label="Close job details"
                className="shrink-0"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </DrawerClose>
          </div>
          <JobDetailLabels
            labels={detail.job.labels}
            availableLabels={availableLabels}
            organizationLabels={organizationLabels}
            canAssignLabels={canAssignLabels}
            canCreateLabels={canCreateLabels}
            disabled={
              assignLabelResult.waiting ||
              createAndAssignLabelResult.waiting ||
              removeLabelResult.waiting
            }
            onAssignLabel={handleAssignLabel}
            onCreateAndAssignLabel={handleCreateAndAssignLabel}
            onRemoveLabel={handleRemoveLabel}
          />
          {labelError ? (
            <p role="alert" className="text-sm text-destructive">
              {labelError}
            </p>
          ) : null}
          {renderMutationError(assignLabelResult)}
          {renderMutationError(createAndAssignLabelResult)}
          {renderMutationError(removeLabelResult)}
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          <div className="flex flex-col gap-4 py-4">
            <JobsDetailLocation site={site} />

            <JobDetailFactsCard
              assigneeName={assignee?.name}
              contact={contact}
              coordinatorName={coordinator?.name}
              createdAt={detail.job.createdAt}
              externalReference={detail.job.externalReference}
              serviceAreaName={site?.serviceAreaName}
              updatedAt={detail.job.updatedAt}
            />

            {detail.job.blockedReason ? (
              <Alert>
                <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
                <AlertTitle>Blocked reason</AlertTitle>
                <AlertDescription>{detail.job.blockedReason}</AlertDescription>
              </Alert>
            ) : null}

            <JobDetailActionRail
              activePanel={activePanel}
              capabilities={{
                addComment: canAddComment,
                addCostLine: !isExternalViewer && canAddCostLine,
                addVisit: !isExternalViewer && canAddVisit,
                manageCollaborators: canManageCollaborators,
                manageSite: !isExternalViewer,
                manageWorkflow: !isExternalViewer,
              }}
              commentsCount={detail.comments.length}
              collaboratorsCount={collaboratorsCount}
              costLinesCount={costLinesCount}
              visitsCount={visitsCount}
              onPanelChange={setActivePanel}
            />

            {activePanelContent}

            {hasComments && activePanel !== "comments" ? (
              <DetailSection title="Comments">
                <JobCommentsList comments={detail.comments} lookup={lookup} />
              </DetailSection>
            ) : null}

            {!isExternalViewer &&
            hasCollaborators &&
            activePanel !== "collaborators" ? (
              <DetailSection title="Collaborators">
                <JobCollaboratorsSummary
                  collaborators={collaborators}
                  externalMemberById={externalMemberById}
                />
              </DetailSection>
            ) : null}

            {!isExternalViewer && hasCostLines && activePanel !== "costs" ? (
              <JobCostSummary costs={detail.costs} />
            ) : null}

            {!isExternalViewer && hasVisits && activePanel !== "visits" ? (
              <DetailSection title="Visits">
                <JobVisitsList visits={detail.visits} lookup={lookup} />
              </DetailSection>
            ) : null}

            {isExternalViewer ? null : (
              <DetailSection title="Activity">
                <JobActivityList activity={detail.activity} lookup={lookup} />
              </DetailSection>
            )}
          </div>
        </div>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function buildTransitionSelectionGroups(
  transitionOptions: readonly JobStatus[]
) {
  return [
    {
      label: "Next status",
      options: [
        { label: "Choose next state", value: "" },
        ...transitionOptions.map((status) => ({
          label: STATUS_LABELS[status],
          value: status,
        })),
      ],
    },
  ] satisfies readonly CommandSelectGroup[];
}

function getStatusCommandLabel(status: JobStatus) {
  if (status === "blocked") {
    return "Prepare blocked status";
  }

  if (status === "canceled") {
    return "Cancel job";
  }

  return `Mark job ${STATUS_LABELS[status].toLowerCase()}`;
}

function buildSiteSelectionGroups(sites: readonly SiteOption[]) {
  const sortedSites = getSortedSites(sites);

  return [
    {
      label: "Site",
      options: [
        { label: "No site", value: NO_SITE_VALUE },
        ...sortedSites.map((site) => ({
          label: site.serviceAreaName
            ? `${site.name} (${site.serviceAreaName})`
            : site.name,
          value: site.id,
        })),
      ],
    },
  ] satisfies readonly CommandSelectGroup[];
}

function getSortedSites(sites: readonly SiteOption[]) {
  return sites.toSorted(compareSiteOptions);
}

function compareSiteOptions(left: SiteOption, right: SiteOption) {
  const nameOrder = left.name.localeCompare(right.name);

  return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
}
