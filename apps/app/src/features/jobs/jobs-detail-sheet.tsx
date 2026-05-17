"use client";
import {
  JOB_COLLABORATOR_ACCESS_LEVELS,
  JobCollaboratorAccessLevelSchema,
  UserId,
} from "@ceird/jobs-core";
import type {
  JobCollaborator,
  JobCollaboratorAccessLevel,
  JobContactDetail,
  JobContactOption,
  JobDetailResponse,
  JobStatus,
  UserIdType,
} from "@ceird/jobs-core";
import { normalizeLabelName } from "@ceird/labels-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import { SiteId } from "@ceird/sites-core";
import type { SiteIdType, SiteOption } from "@ceird/sites-core";
/* oxlint-disable complexity */
import {
  Add01Icon,
  ArrowDown01Icon,
  Briefcase01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Comment01Icon,
  Location01Icon,
  Time04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { Exit, Option, Schema } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "#/components/ui/command";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import { Separator } from "#/components/ui/separator";
import { Textarea } from "#/components/ui/textarea";
import { describeJobActivity } from "#/features/activity/activity-formatting";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { validateLabelName } from "#/features/labels/label-name-validation";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { submitClientForm } from "#/lib/client-form-submit";
import { cn } from "#/lib/utils";

import {
  formatJobDateTime,
  JOB_PRIORITY_LABELS as PRIORITY_LABELS,
  JOB_STATUS_LABELS as STATUS_LABELS,
} from "./job-display";
import {
  formatJobMoneyMinor,
  JobCostsSection,
} from "./jobs-detail-costs-section";
import { JobsDetailLocation } from "./jobs-detail-location";
import { DetailEmpty, DetailSection } from "./jobs-detail-section";
import {
  JobsDetailStateProvider,
  useJobsDetailState,
} from "./jobs-detail-state";
import { getCurrentServerJobExternalMemberOptions } from "./jobs-server";
import {
  getJobsAsyncErrorMessage,
  isJobsAsyncFailure,
  useJobsLookup,
} from "./jobs-state";
import type { JobsAsyncResult } from "./jobs-state";
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
const COLLABORATOR_ACCESS_LEVEL_LABELS = {
  comment: "Comment-only",
  read: "Read-only",
} satisfies Record<JobCollaboratorAccessLevel, string>;
type JobDetailActionPanel =
  | "collaborators"
  | "comments"
  | "costs"
  | "site"
  | "visits"
  | "workflow";
const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const decodeUserId = Schema.decodeUnknownSync(UserId);

interface ExternalMemberOption {
  readonly email: string;
  readonly name: string;
  readonly userId: UserIdType;
}

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
  useAppHotkey("jobDetailCost", () => setActivePanel("costs"), {
    enabled: !isExternalViewer && canAddCostLine,
  });
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
                  Updated {formatDateTime(detail.job.updatedAt)}
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
              canAddComment={canAddComment}
              canAddCostLine={!isExternalViewer && canAddCostLine}
              canAddVisit={!isExternalViewer && canAddVisit}
              canManageCollaborators={canManageCollaborators}
              canManageSite={!isExternalViewer}
              canManageWorkflow={!isExternalViewer}
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

function JobDetailActionRail({
  activePanel,
  canAddComment,
  canAddCostLine,
  canAddVisit,
  canManageCollaborators,
  canManageSite,
  canManageWorkflow,
  collaboratorsCount,
  commentsCount,
  costLinesCount,
  onPanelChange,
  visitsCount,
}: {
  readonly activePanel: JobDetailActionPanel | null;
  readonly canAddComment: boolean;
  readonly canAddCostLine: boolean;
  readonly canAddVisit: boolean;
  readonly canManageCollaborators: boolean;
  readonly canManageSite: boolean;
  readonly canManageWorkflow: boolean;
  readonly collaboratorsCount: number;
  readonly commentsCount: number;
  readonly costLinesCount: number;
  readonly onPanelChange: (panel: JobDetailActionPanel | null) => void;
  readonly visitsCount: number;
}) {
  const actions: {
    readonly label: string;
    readonly panel: JobDetailActionPanel;
    readonly value: number | undefined;
  }[] = [];

  if (canManageWorkflow) {
    actions.push({ label: "Status", panel: "workflow", value: undefined });
  }

  if (canManageSite) {
    actions.push({ label: "Site", panel: "site", value: undefined });
  }

  if (canAddComment || commentsCount > 0) {
    actions.push({ label: "Comment", panel: "comments", value: commentsCount });
  }

  if (canAddCostLine || costLinesCount > 0) {
    actions.push({ label: "Cost", panel: "costs", value: costLinesCount });
  }

  if (canAddVisit || visitsCount > 0) {
    actions.push({ label: "Visit", panel: "visits", value: visitsCount });
  }

  if (canManageCollaborators || collaboratorsCount > 0) {
    actions.push({
      label: "Collaborator",
      panel: "collaborators",
      value: collaboratorsCount,
    });
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border bg-background p-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const isActive = activePanel === action.panel;

          return (
            <Button
              key={action.panel}
              type="button"
              size="sm"
              aria-label={
                action.value && action.value > 0
                  ? `${action.label} ${action.value}`
                  : action.label
              }
              variant={isActive ? "secondary" : "outline"}
              onClick={() => onPanelChange(isActive ? null : action.panel)}
            >
              {action.label}
              {action.value && action.value > 0 ? (
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                  {action.value}
                </span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function JobCommentsList({
  comments,
  lookup,
}: {
  readonly comments: JobDetailResponse["comments"];
  readonly lookup: {
    readonly memberById: ReadonlyMap<UserIdType, { readonly name: string }>;
  };
}) {
  return (
    <ul className="flex flex-col gap-3">
      {comments.map((comment) => {
        const author = lookup.memberById.get(comment.authorUserId);

        return (
          <li
            key={comment.id}
            className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {comment.authorName ?? author?.name ?? "Team member"}
                </span>
                <span>{formatDateTime(comment.createdAt)}</span>
              </div>
              <p className="text-sm leading-7 whitespace-pre-wrap">
                {comment.body}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function JobVisitsList({
  lookup,
  visits,
}: {
  readonly lookup: {
    readonly memberById: ReadonlyMap<UserIdType, { readonly name: string }>;
  };
  readonly visits: JobDetailResponse["visits"];
}) {
  return (
    <ul className="flex flex-col gap-3">
      {visits.map((visit) => {
        const author = lookup.memberById.get(visit.authorUserId);

        return (
          <li
            key={visit.id}
            className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {author?.name ?? "Team member"}
                </span>
                <span>{formatDate(visit.visitDate)}</span>
                <span>{formatDuration(visit.durationMinutes)}</span>
              </div>
              <p className="text-sm leading-7 whitespace-pre-wrap">
                {visit.note}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function JobActivityList({
  activity,
  lookup,
}: {
  readonly activity: JobDetailResponse["activity"];
  readonly lookup: {
    readonly memberById: ReadonlyMap<UserIdType, { readonly name: string }>;
  };
}) {
  if (activity.length === 0) {
    return <DetailEmpty title="No activity yet." />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {activity.map((event) => {
        const actor = event.actorUserId
          ? lookup.memberById.get(event.actorUserId)
          : undefined;

        return (
          <li
            key={event.id}
            className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-7">
                {describeJobDetailActivity(actor?.name, event.payload)}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDateTime(event.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function JobCollaboratorsSummary({
  collaborators,
  externalMemberById,
}: {
  readonly collaborators: readonly JobCollaborator[];
  readonly externalMemberById: ReadonlyMap<UserIdType, ExternalMemberOption>;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {collaborators.map((collaborator) => {
        const externalMember = collaborator.userId
          ? externalMemberById.get(collaborator.userId)
          : undefined;

        return (
          <li
            key={collaborator.id}
            className="flex items-center justify-between gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {externalMember?.name ?? "External collaborator"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {collaborator.roleLabel}
              </p>
            </div>
            <Badge variant="secondary">
              {COLLABORATOR_ACCESS_LEVEL_LABELS[collaborator.accessLevel]}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

function JobCostSummary({
  costs,
}: {
  readonly costs: NonNullable<JobDetailResponse["costs"]>;
}) {
  return (
    <DetailSection title="Costs">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/30 px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">
            Cost total
          </span>
          <span className="text-lg font-semibold text-foreground">
            {formatJobMoneyMinor(costs.summary.subtotalMinor)}
          </span>
        </div>
        <ul className="flex flex-col gap-3">
          {costs.lines.map((costLine) => (
            <li
              key={costLine.id}
              className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {costLine.description}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatJobMoneyMinor(costLine.lineTotalMinor)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DetailSection>
  );
}

function JobDetailFactsCard({
  assigneeName,
  contact,
  coordinatorName,
  createdAt,
  externalReference,
  serviceAreaName,
  updatedAt,
}: {
  readonly assigneeName?: string;
  readonly contact?: JobContactDetail | JobContactOption;
  readonly coordinatorName?: string;
  readonly createdAt: string;
  readonly externalReference?: string;
  readonly serviceAreaName?: string;
  readonly updatedAt: string;
}) {
  const contactSupporting = getContactSupportingText(contact);
  const contactNotes =
    contact && "notes" in contact ? contact.notes : undefined;

  return (
    <section className="rounded-lg border bg-background">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">Job details</h3>
      </div>
      <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
        <HeaderMetaItem
          label="Assignee"
          value={assigneeName ?? "Unassigned"}
          supporting={coordinatorName ? `Coordinator: ${coordinatorName}` : ""}
        />
        <HeaderMetaItem
          label="Contact"
          value={contact?.name ?? "No contact yet"}
          supporting={contactSupporting}
        />
        <HeaderMetaItem
          label="Service area"
          value={serviceAreaName ?? "No service area yet"}
        />
        <HeaderMetaItem
          label="Reference"
          value={externalReference ?? "No external reference"}
        />
        <HeaderMetaItem label="Created" value={formatDate(createdAt)} />
        <HeaderMetaItem label="Updated" value={formatDateTime(updatedAt)} />
        {contactNotes ? (
          <div className="min-w-0 text-left sm:col-span-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase">
              Contact notes
            </p>
            <p className="mt-1 text-sm leading-6 break-words whitespace-pre-wrap text-foreground">
              {contactNotes}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function getContactSupportingText(
  contact: JobContactDetail | JobContactOption | undefined
) {
  return [contact?.email, contact?.phone].filter(Boolean).join(" · ");
}

function JobCollaboratorsSection({
  collaborators,
  detachCollaborator,
  errorMessage,
  externalMemberById,
  externalMembers,
  isLoading,
  onAccessLevelChange,
  onAttach,
  onRoleLabelChange,
  onUserChange,
  selectedAccessLevel,
  selectedRoleLabel,
  selectedUserId,
  updateCollaborator,
  updatingOrRemoving,
}: {
  readonly collaborators: readonly JobCollaborator[];
  readonly detachCollaborator: (
    collaboratorId: JobCollaborator["id"]
  ) => Promise<unknown>;
  readonly errorMessage: string | null;
  readonly externalMemberById: ReadonlyMap<UserIdType, ExternalMemberOption>;
  readonly externalMembers: readonly ExternalMemberOption[];
  readonly isLoading: boolean;
  readonly onAccessLevelChange: (value: JobCollaboratorAccessLevel) => void;
  readonly onAttach: () => void | Promise<void>;
  readonly onRoleLabelChange: (value: string) => void;
  readonly onUserChange: (value: string) => void;
  readonly selectedAccessLevel: JobCollaboratorAccessLevel;
  readonly selectedRoleLabel: string;
  readonly selectedUserId: UserIdType | "";
  readonly updateCollaborator: (input: {
    readonly collaboratorId: JobCollaborator["id"];
    readonly input: {
      readonly accessLevel: JobCollaboratorAccessLevel;
      readonly roleLabel: string;
    };
  }) => Promise<unknown>;
  readonly updatingOrRemoving: boolean;
}) {
  const collaboratorOptions = externalMembers
    .filter(
      (member) =>
        !collaborators.some(
          (collaborator) => collaborator.userId === member.userId
        )
    )
    .map((member) => ({
      label: member.name,
      value: member.userId,
    }));
  const collaboratorSelectionGroups = [
    {
      label: "External collaborators",
      options: collaboratorOptions,
    },
  ] satisfies readonly CommandSelectGroup[];
  const accessLevelGroups = getCollaboratorAccessLevelGroups();

  return (
    <DetailSection title="Collaborators">
      <div className="flex flex-col gap-5">
        {errorMessage ? (
          <Alert>
            <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
            <AlertTitle>Collaborator access could not be updated.</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => submitClientForm(event, onAttach)}
        >
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="job-collaborator-user">
                  External collaborator
                </FieldLabel>
                <FieldContent>
                  <CommandSelect
                    id="job-collaborator-user"
                    value={selectedUserId}
                    placeholder="Choose collaborator"
                    emptyText="No external collaborators available."
                    groups={collaboratorSelectionGroups}
                    disabled={isLoading || collaboratorOptions.length === 0}
                    onValueChange={onUserChange}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="job-collaborator-role-label">
                  Role label
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="job-collaborator-role-label"
                    value={selectedRoleLabel}
                    disabled={isLoading}
                    onChange={(event) => onRoleLabelChange(event.target.value)}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="job-collaborator-access-level">
                  Access level
                </FieldLabel>
                <FieldContent>
                  <CommandSelect
                    id="job-collaborator-access-level"
                    value={selectedAccessLevel}
                    placeholder="Choose access"
                    emptyText="No access levels available."
                    groups={accessLevelGroups}
                    disabled={isLoading}
                    onValueChange={(value) => {
                      const accessLevel =
                        decodeOptionalJobCollaboratorAccessLevel(value);

                      if (accessLevel !== undefined) {
                        onAccessLevelChange(accessLevel);
                      }
                    }}
                  />
                </FieldContent>
              </Field>
            </div>
          </FieldGroup>
          <div className="flex">
            <Button
              type="submit"
              loading={isLoading}
              className="w-full sm:w-fit"
            >
              Grant access
            </Button>
          </div>
        </form>

        <Separator />

        {collaborators.length === 0 ? (
          <DetailEmpty title="No external collaborators yet." />
        ) : (
          <ul className="flex flex-col gap-4">
            {collaborators.map((collaborator) => (
              <JobCollaboratorRow
                key={collaborator.id}
                collaborator={collaborator}
                disabled={updatingOrRemoving}
                externalMember={
                  collaborator.userId
                    ? externalMemberById.get(collaborator.userId)
                    : undefined
                }
                accessLevelGroups={accessLevelGroups}
                detachCollaborator={detachCollaborator}
                updateCollaborator={updateCollaborator}
              />
            ))}
          </ul>
        )}
      </div>
    </DetailSection>
  );
}

function JobCollaboratorRow({
  accessLevelGroups,
  collaborator,
  detachCollaborator,
  disabled,
  externalMember,
  updateCollaborator,
}: {
  readonly accessLevelGroups: readonly CommandSelectGroup[];
  readonly collaborator: JobCollaborator;
  readonly detachCollaborator: (
    collaboratorId: JobCollaborator["id"]
  ) => Promise<unknown>;
  readonly disabled: boolean;
  readonly externalMember: ExternalMemberOption | undefined;
  readonly updateCollaborator: (input: {
    readonly collaboratorId: JobCollaborator["id"];
    readonly input: {
      readonly accessLevel: JobCollaboratorAccessLevel;
      readonly roleLabel: string;
    };
  }) => Promise<unknown>;
}) {
  const name = externalMember?.name ?? "External collaborator";
  const [roleLabel, setRoleLabel] = React.useState(collaborator.roleLabel);
  const [accessLevel, setAccessLevel] =
    React.useState<JobCollaboratorAccessLevel>(collaborator.accessLevel);

  React.useEffect(() => {
    setRoleLabel(collaborator.roleLabel);
    setAccessLevel(collaborator.accessLevel);
  }, [collaborator.accessLevel, collaborator.roleLabel]);

  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {externalMember?.email ?? "External member"}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,180px)]">
          <Field>
            <FieldLabel htmlFor={`job-collaborator-role-${collaborator.id}`}>
              Role label for {name}
            </FieldLabel>
            <FieldContent>
              <Input
                id={`job-collaborator-role-${collaborator.id}`}
                value={roleLabel}
                disabled={disabled}
                onChange={(event) => setRoleLabel(event.target.value)}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor={`job-collaborator-access-${collaborator.id}`}>
              Access level for {name}
            </FieldLabel>
            <FieldContent>
              <CommandSelect
                id={`job-collaborator-access-${collaborator.id}`}
                value={accessLevel}
                placeholder="Choose access"
                emptyText="No access levels available."
                groups={accessLevelGroups}
                disabled={disabled}
                onValueChange={(value) => {
                  const nextAccessLevel =
                    decodeOptionalJobCollaboratorAccessLevel(value);

                  if (nextAccessLevel !== undefined) {
                    setAccessLevel(nextAccessLevel);
                  }
                }}
              />
            </FieldContent>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || roleLabel.trim().length === 0}
            onClick={() =>
              updateCollaborator({
                collaboratorId: collaborator.id,
                input: {
                  accessLevel,
                  roleLabel: roleLabel.trim(),
                },
              })
            }
          >
            Save {name} access
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => detachCollaborator(collaborator.id)}
          >
            Remove {name} access
          </Button>
        </div>
      </div>
    </li>
  );
}

function HeaderMetaItem({
  label,
  supporting,
  value,
}: {
  readonly label: string;
  readonly supporting?: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0 text-left">
      <p className="text-[11px] font-medium text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">
        {value}
      </p>
      {supporting ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {supporting}
        </p>
      ) : null}
    </div>
  );
}

function JobDetailLabels({
  availableLabels,
  canAssignLabels,
  canCreateLabels,
  disabled,
  labels,
  onAssignLabel,
  onCreateAndAssignLabel,
  onRemoveLabel,
  organizationLabels,
}: {
  readonly availableLabels: readonly Label[];
  readonly canAssignLabels: boolean;
  readonly canCreateLabels: boolean;
  readonly disabled: boolean;
  readonly labels: readonly Label[];
  readonly onAssignLabel: (labelId: LabelIdType) => void;
  readonly onCreateAndAssignLabel: (name: string) => void;
  readonly onRemoveLabel: (labelId: LabelIdType) => void;
  readonly organizationLabels: readonly Label[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {labels.length === 0 ? (
        <span className="text-sm text-muted-foreground">No labels yet</span>
      ) : (
        labels.map((label) => (
          <Badge
            key={label.id}
            variant="outline"
            className="gap-1.5 rounded-full pr-1"
          >
            <span>{label.name}</span>
            {canAssignLabels ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="size-5 rounded-full"
                aria-label={`Remove ${label.name} label`}
                title={`Remove ${label.name} label`}
                disabled={disabled}
                onClick={() => onRemoveLabel(label.id)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            ) : null}
          </Badge>
        ))
      )}

      {canAssignLabels ? (
        <LabelPicker
          availableLabels={availableLabels}
          canCreateLabels={canCreateLabels}
          disabled={disabled}
          organizationLabels={organizationLabels}
          onAssignLabel={onAssignLabel}
          onCreateAndAssignLabel={onCreateAndAssignLabel}
        />
      ) : null}
    </div>
  );
}

function LabelPicker({
  availableLabels,
  canCreateLabels,
  disabled,
  onAssignLabel,
  onCreateAndAssignLabel,
  organizationLabels,
}: {
  readonly availableLabels: readonly Label[];
  readonly canCreateLabels: boolean;
  readonly disabled: boolean;
  readonly onAssignLabel: (labelId: LabelIdType) => void;
  readonly onCreateAndAssignLabel: (name: string) => void;
  readonly organizationLabels: readonly Label[];
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const createLabelName = query.trim();
  const normalizedCreateName = normalizeLabelName(createLabelName);
  const canCreateLabelName =
    validateLabelName(createLabelName).kind === "valid";
  const hasExistingLabelName =
    normalizedCreateName.length > 0 &&
    organizationLabels.some(
      (label) => normalizeLabelName(label.name) === normalizedCreateName
    );
  const showCreate =
    canCreateLabels && canCreateLabelName && !hasExistingLabelName;

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);

        if (!nextOpen) {
          setQuery("");
        }
      }}
    >
      <PopoverTrigger
        type="button"
        id="job-label-picker"
        aria-label="Add label"
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "rounded-full bg-background"
        )}
      >
        <HugeiconsIcon
          icon={Add01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        Add label
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          data-icon="inline-end"
          className="text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] min-w-72 p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search labels"
          />
          <CommandList>
            <CommandEmpty>
              {createLabelName
                ? "No matching labels."
                : "Type a label name to create one."}
            </CommandEmpty>
            {showCreate ? (
              <CommandGroup>
                <CommandItem
                  aria-label={`Create new label: "${createLabelName}"`}
                  value={`Create new label ${createLabelName}`}
                  onSelect={() => {
                    onCreateAndAssignLabel(createLabelName);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                  <span>
                    Create new label:{" "}
                    <span className="text-muted-foreground">
                      &quot;{createLabelName}&quot;
                    </span>
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {showCreate && availableLabels.length > 0 ? (
              <CommandSeparator />
            ) : null}
            {availableLabels.length > 0 ? (
              <CommandGroup heading="Labels">
                {availableLabels.map((label) => (
                  <CommandItem
                    key={label.id}
                    aria-label={label.name}
                    value={label.name}
                    onSelect={() => {
                      onAssignLabel(label.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {label.name}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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

function getCollaboratorAccessLevelGroups() {
  return [
    {
      label: "Access",
      options: JOB_COLLABORATOR_ACCESS_LEVELS.map((accessLevel) => ({
        label: COLLABORATOR_ACCESS_LEVEL_LABELS[accessLevel],
        value: accessLevel,
      })),
    },
  ] satisfies readonly CommandSelectGroup[];
}

function decodeOptionalJobCollaboratorAccessLevel(
  input: unknown
): JobCollaboratorAccessLevel | undefined {
  const decoded = Schema.decodeUnknownOption(JobCollaboratorAccessLevelSchema)(
    input
  );

  return Option.getOrUndefined(decoded);
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

function getSortedLabels(labels: readonly Label[]) {
  return labels.toSorted(compareLabels);
}

function compareLabels(left: Label, right: Label) {
  const nameOrder = left.name.localeCompare(right.name);

  return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
}

function toExternalMemberOptions(
  members: readonly {
    readonly email: string;
    readonly id: UserIdType;
    readonly name: string;
  }[]
): readonly ExternalMemberOption[] {
  let externalMembers: readonly ExternalMemberOption[] = [];

  for (const externalMember of members.map((candidate) => ({
    email: candidate.email,
    name: candidate.name,
    userId: candidate.id,
  }))) {
    externalMembers = insertSortedExternalMember(
      externalMembers,
      externalMember
    );
  }

  return externalMembers;
}

function insertSortedExternalMember(
  members: readonly ExternalMemberOption[],
  member: ExternalMemberOption
) {
  const insertIndex = members.findIndex(
    (current) => member.name.localeCompare(current.name) < 0
  );

  if (insertIndex === -1) {
    return [...members, member];
  }

  return [
    ...members.slice(0, insertIndex),
    member,
    ...members.slice(insertIndex),
  ];
}

function renderMutationError(result: JobsAsyncResult) {
  return isJobsAsyncFailure(result) ? (
    <Alert variant="destructive">
      <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
      <AlertTitle>That update didn&apos;t land.</AlertTitle>
      <AlertDescription>
        {getJobsAsyncErrorMessage(result.error)}
      </AlertDescription>
    </Alert>
  ) : null;
}

function getExitErrorMessage(exit: Exit.Exit<unknown, unknown>) {
  const cause = Exit.isFailure(exit) ? exit.cause : undefined;
  const message = cause ? String(cause) : "";

  return message && message !== "Error"
    ? message
    : "Collaborator access could not be updated.";
}

function decodeCollaboratorUserId(value: string): UserIdType | "" {
  return value === "" ? "" : decodeUserId(value);
}

function getLocalDateInputValue(reference = new Date()) {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return formatJobDateTime(value);
}

function formatDuration(durationMinutes: number) {
  const hours = durationMinutes / 60;
  return `${hours}h logged`;
}

function describeJobDetailActivity(
  actorName: string | undefined,
  payload: JobDetailResponse["activity"][number]["payload"]
) {
  const actorPrefix = actorName ? `${actorName} ` : "";

  switch (payload.eventType) {
    case "label_added": {
      return `${actorPrefix}added the ${payload.labelName} label.`;
    }
    case "label_removed": {
      return `${actorPrefix}removed the ${payload.labelName} label.`;
    }
    default: {
      return describeJobActivity(actorName, payload);
    }
  }
}
