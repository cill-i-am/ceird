/* oxlint-disable complexity */
"use client";

import {
  Result,
  useAtomInitialValues,
  useAtomSet,
  useAtomValue,
} from "@effect-atom/atom-react";
import {
  Briefcase01Icon,
  CheckmarkCircle02Icon,
  Comment01Icon,
  Location01Icon,
  Time04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { SiteId } from "@task-tracker/jobs-core";
import type {
  JobContactDetail,
  JobContactOption,
  JobDetailResponse,
  JobSiteOption,
  JobStatus,
  SiteIdType,
} from "@task-tracker/jobs-core";
import { Exit, Schema } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
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
import { describeJobActivity } from "#/features/activity/activity-formatting";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";

import {
  formatJobDateTime,
  JOB_PRIORITY_LABELS as PRIORITY_LABELS,
  JOB_STATUS_LABELS as STATUS_LABELS,
} from "./job-display";
import { JobCostsSection } from "./jobs-detail-costs-section";
import { JobsDetailLocation } from "./jobs-detail-location";
import { DetailEmpty, DetailSection } from "./jobs-detail-section";
import {
  addJobCostLineMutationAtomFamily,
  addJobCommentMutationAtomFamily,
  addJobVisitMutationAtomFamily,
  jobDetailStateAtomFamily,
  patchJobMutationAtomFamily,
  reopenJobMutationAtomFamily,
  transitionJobMutationAtomFamily,
} from "./jobs-detail-state";
import { jobsLookupAtom } from "./jobs-state";
import {
  getAvailableJobTransitions,
  hasAssignedJobAccess,
  hasJobsElevatedAccess,
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
  const navigate = useNavigate({ from: "/jobs/$jobId" });
  const workItemId = initialDetail.job.id;

  useAtomInitialValues([
    [jobDetailStateAtomFamily(workItemId), initialDetail] as const,
  ]);

  const detailState = useAtomValue(jobDetailStateAtomFamily(workItemId));
  const detail = detailState ?? initialDetail;
  const lookup = useAtomValue(jobsLookupAtom);
  const transitionResult = useAtomValue(
    transitionJobMutationAtomFamily(workItemId)
  );
  const reopenResult = useAtomValue(reopenJobMutationAtomFamily(workItemId));
  const patchResult = useAtomValue(patchJobMutationAtomFamily(workItemId));
  const commentResult = useAtomValue(
    addJobCommentMutationAtomFamily(workItemId)
  );
  const visitResult = useAtomValue(addJobVisitMutationAtomFamily(workItemId));
  const costLineResult = useAtomValue(
    addJobCostLineMutationAtomFamily(workItemId)
  );
  const transitionJob = useAtomSet(
    transitionJobMutationAtomFamily(workItemId),
    {
      mode: "promiseExit",
    }
  );
  const reopenJob = useAtomSet(reopenJobMutationAtomFamily(workItemId), {
    mode: "promiseExit",
  });
  const patchJob = useAtomSet(patchJobMutationAtomFamily(workItemId), {
    mode: "promiseExit",
  });
  const addJobComment = useAtomSet(
    addJobCommentMutationAtomFamily(workItemId),
    {
      mode: "promiseExit",
    }
  );
  const addJobVisit = useAtomSet(addJobVisitMutationAtomFamily(workItemId), {
    mode: "promiseExit",
  });
  const addJobCostLine = useAtomSet(
    addJobCostLineMutationAtomFamily(workItemId),
    {
      mode: "promiseExit",
    }
  );
  const hasAssignmentAccess = hasAssignedJobAccess(
    viewer,
    detail.job.assigneeId
  );
  const canEditJob = hasAssignmentAccess || hasJobsElevatedAccess(viewer.role);
  const canAddVisit = hasAssignmentAccess;
  const canAddCostLine = hasAssignmentAccess;
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
  const site = detail.job.siteId
    ? lookup.siteById.get(detail.job.siteId)
    : undefined;
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
  const selectedSiteChanged =
    selectedSiteId !== (detail.job.siteId ?? NO_SITE_VALUE);

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
  }, [detail.job.siteId, detail.job.status, workItemId]);

  const closeSheet = React.useCallback(() => {
    React.startTransition(() => {
      navigate({ to: "/jobs" });
    });
  }, [navigate]);

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

  async function handleAddComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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

  async function handleAddVisit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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

  return (
    <ResponsiveDrawer
      open
      onOpenChange={(open) => {
        if (!open) {
          closeSheet();
        }
      }}
    >
      <DrawerContent className="max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-2xl">
        <DrawerHeader className="gap-3 border-b">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                detail.job.status === "blocked" ? "outline" : "secondary"
              }
            >
              {STATUS_LABELS[detail.job.status]}
            </Badge>
            <Badge
              variant={detail.job.priority === "none" ? "outline" : "secondary"}
            >
              {PRIORITY_LABELS[detail.job.priority]}
            </Badge>
          </div>
          <div className="flex flex-col gap-1.5">
            <DrawerTitle>{detail.job.title}</DrawerTitle>
            <DrawerDescription>
              Keep the queue in view while you move the status forward, add
              context, and log the site visits that matter.
            </DrawerDescription>
          </div>
          <div className="grid gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-2">
            <HeaderMetaItem
              label="Site"
              value={site?.name ?? "No site yet"}
              supporting={site?.regionName ?? "No region yet"}
            />
            <HeaderMetaItem
              label="Assignee"
              value={assignee?.name ?? "Unassigned"}
              supporting={
                coordinator
                  ? `Coordinator: ${coordinator.name}`
                  : "No coordinator"
              }
            />
            <HeaderMetaItem
              label="Contact"
              value={contact?.name ?? "No contact yet"}
              supporting={
                contact?.email ?? contact?.phone ?? "No contact details yet"
              }
            />
            <HeaderMetaItem
              label="Reference"
              value={detail.job.externalReference ?? "No external reference"}
              supporting="Optional reference from outside this workspace"
            />
            <HeaderMetaItem
              label="Updated"
              value={formatDateTime(detail.job.updatedAt)}
              supporting={`Created ${formatDate(detail.job.createdAt)}`}
            />
          </div>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col overflow-y-auto px-6">
            {detail.job.blockedReason ? (
              <Alert className="my-5">
                <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
                <AlertTitle>Blocked reason</AlertTitle>
                <AlertDescription>{detail.job.blockedReason}</AlertDescription>
              </Alert>
            ) : null}

            <DetailSection
              title="Move forward"
              description="Keep the status honest. Use blocked only when something is truly waiting on an unblock."
            >
              <div className="flex flex-col gap-4">{statusActionContent}</div>
            </DetailSection>

            <JobsDetailLocation site={site} />

            <DetailSection
              title="Contact"
              description="Useful details for the person or organization connected to this work."
            >
              <JobsDetailContact contact={contact} />
            </DetailSection>

            <DetailSection
              title="Site assignment"
              description="Move this job onto an existing site when the location becomes clear."
            >
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
                      <FieldDescription>
                        Changing the site clears the linked contact so it cannot
                        point at the wrong place.
                      </FieldDescription>
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
                    Site assignment is limited to the assignee or organization
                    admins.
                  </p>
                )}
              </div>
            </DetailSection>

            <DetailSection
              title="Comments"
              description="Keep the narrative in comments instead of hiding it in fields."
            >
              <div className="flex flex-col gap-5">
                {renderMutationError(commentResult)}
                <form
                  className="flex flex-col gap-4"
                  method="post"
                  onSubmit={handleAddComment}
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
                          onChange={(event) =>
                            setCommentBody(event.target.value)
                          }
                        />
                        <FieldDescription>
                          Capture the detail the next person will actually need.
                        </FieldDescription>
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

                <Separator />

                {detail.comments.length === 0 ? (
                  <DetailEmpty
                    title="No comments yet."
                    description="The job is ready for its first bit of real context."
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {detail.comments.map((comment) => {
                      const author = lookup.memberById.get(
                        comment.authorUserId
                      );

                      return (
                        <li
                          key={comment.id}
                          className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                        >
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {author?.name ?? "Team member"}
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
                )}
              </div>
            </DetailSection>

            <JobCostsSection
              addJobCostLine={addJobCostLine}
              canAddCostLine={canAddCostLine}
              detail={detail}
              mutationError={renderMutationError(costLineResult)}
              waiting={costLineResult.waiting}
              workItemId={workItemId}
            />

            <DetailSection
              title="Visits"
              description="Log the site visits that explain the real effort behind the work."
            >
              <div className="flex flex-col gap-5">
                {canAddVisit ? (
                  <>
                    {renderMutationError(visitResult)}
                    <form
                      className="flex flex-col gap-4"
                      method="post"
                      onSubmit={handleAddVisit}
                    >
                      <FieldGroup>
                        <div className="grid gap-4 md:grid-cols-2">
                          <Field
                            data-invalid={
                              Boolean(visitError) &&
                              visitDate.trim().length === 0
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
                                  Boolean(visitError) &&
                                  visitDate.trim().length === 0
                                    ? true
                                    : undefined
                                }
                                onChange={(event) =>
                                  setVisitDate(event.target.value)
                                }
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
                          <FieldLabel htmlFor="job-visit-note">
                            Visit note
                          </FieldLabel>
                          <FieldContent>
                            <Textarea
                              id="job-visit-note"
                              value={visitNote}
                              aria-invalid={
                                Boolean(visitError) &&
                                visitNote.trim().length === 0
                                  ? true
                                  : undefined
                              }
                              onChange={(event) =>
                                setVisitNote(event.target.value)
                              }
                            />
                            <FieldDescription>
                              Keep it short and concrete: what happened, what
                              changed, what is next.
                            </FieldDescription>
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

                <Separator />

                {detail.visits.length === 0 ? (
                  <DetailEmpty
                    title="No visits logged yet."
                    description="Add the field work once the crew starts showing up on site."
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {detail.visits.map((visit) => {
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
                              <span>
                                {formatDuration(visit.durationMinutes)}
                              </span>
                            </div>
                            <p className="text-sm leading-7 whitespace-pre-wrap">
                              {visit.note}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </DetailSection>

            <DetailSection
              title="Activity"
              description="System activity stays separate from narrative comments."
            >
              <div>
                {detail.activity.length === 0 ? (
                  <DetailEmpty
                    title="No activity yet."
                    description="The history will fill in as the job moves."
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {detail.activity.map((event) => {
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
                              {describeJobActivity(actor?.name, event.payload)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatDateTime(event.createdAt)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </DetailSection>
          </div>

          <DrawerFooter className="border-t">
            <Button type="button" variant="ghost" onClick={closeSheet}>
              Close
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function JobsDetailContact({
  contact,
}: {
  readonly contact: JobContactDetail | JobContactOption | undefined;
}) {
  if (!contact) {
    return (
      <DetailEmpty
        title="No contact yet."
        description="Add one when there is a clear related person or organization."
      />
    );
  }

  const notes = "notes" in contact ? contact.notes : undefined;

  return (
    <div className="grid gap-3 text-sm">
      <HeaderMetaItem label="Name" value={contact.name} />
      {contact.email ? (
        <HeaderMetaItem label="Email" value={contact.email} />
      ) : null}
      {contact.phone ? (
        <HeaderMetaItem label="Phone" value={contact.phone} />
      ) : null}
      {notes ? (
        <div className="min-w-0 text-left">
          <p className="text-[11px] font-medium text-muted-foreground uppercase">
            Notes
          </p>
          <p className="mt-1 text-sm leading-6 break-words whitespace-pre-wrap text-foreground">
            {notes}
          </p>
        </div>
      ) : null}
    </div>
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

function buildSiteSelectionGroups(sites: readonly JobSiteOption[]) {
  const sortedSites = getSortedSites(sites);

  return [
    {
      label: "Site",
      options: [
        { label: "No site", value: NO_SITE_VALUE },
        ...sortedSites.map((site) => ({
          label: site.regionName
            ? `${site.name} (${site.regionName})`
            : site.name,
          value: site.id,
        })),
      ],
    },
  ] satisfies readonly CommandSelectGroup[];
}

function getSortedSites(sites: readonly JobSiteOption[]) {
  let sortedSites: readonly JobSiteOption[] = [];

  for (const site of sites) {
    sortedSites = insertSortedSite(sortedSites, site);
  }

  return sortedSites;
}

function compareSiteOptions(left: JobSiteOption, right: JobSiteOption) {
  const nameOrder = left.name.localeCompare(right.name);

  return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
}

function insertSortedSite(
  sortedSites: readonly JobSiteOption[],
  site: JobSiteOption
) {
  const insertIndex = sortedSites.findIndex(
    (sortedSite) => compareSiteOptions(site, sortedSite) < 0
  );

  if (insertIndex === -1) {
    return [...sortedSites, site];
  }

  return [
    ...sortedSites.slice(0, insertIndex),
    site,
    ...sortedSites.slice(insertIndex),
  ];
}

function renderMutationError(
  result: Result.Result<unknown, { readonly message: string }>
) {
  return Result.builder(result)
    .onError((error) => (
      <Alert variant="destructive">
        <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
        <AlertTitle>That update didn&apos;t land.</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    ))
    .render();
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
