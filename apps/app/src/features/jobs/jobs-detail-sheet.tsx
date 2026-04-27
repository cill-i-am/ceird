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
import type {
  JobDetailResponse,
  JobSiteOption,
  JobStatus,
  SiteIdType,
} from "@task-tracker/jobs-core";
import { Exit } from "effect";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
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
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";

import { JobsDetailLocation } from "./jobs-detail-location";
import {
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

const PRIORITY_LABELS = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
} as const;

const STATUS_LABELS = {
  blocked: "Blocked",
  canceled: "Canceled",
  completed: "Completed",
  in_progress: "In progress",
  new: "New",
  triaged: "Triaged",
} as const;

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

interface JobsDetailSheetProps {
  readonly initialDetail: JobDetailResponse;
  readonly viewer: JobsViewer;
}

function openSelect(
  trigger: React.RefObject<HTMLButtonElement | null>,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  trigger.current?.focus();
  setOpen(true);
}

function activeElementIsInside<TElement extends HTMLElement>(
  ref: React.RefObject<TElement | null>
) {
  const { activeElement } = document;

  return (
    activeElement instanceof HTMLElement &&
    ref.current?.contains(activeElement) === true
  );
}

export function JobsDetailSheet({
  initialDetail,
  viewer,
}: JobsDetailSheetProps) {
  const navigate = useNavigate();
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
  const hasAssignmentAccess = hasAssignedJobAccess(
    viewer,
    detail.job.assigneeId
  );
  const canEditJob = hasAssignmentAccess || hasJobsElevatedAccess(viewer.role);
  const canAddVisit = hasAssignmentAccess;
  const canReopen = hasAssignmentAccess;
  const transitionOptions = getAvailableJobTransitions(viewer, detail.job);
  const transitionSelectionGroups =
    buildTransitionSelectionGroups(transitionOptions);

  const statusSelectRef = React.useRef<HTMLButtonElement | null>(null);
  const siteAssignmentSelectRef = React.useRef<HTMLButtonElement | null>(null);
  const commentFormRef = React.useRef<HTMLFormElement | null>(null);
  const commentTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const visitFormRef = React.useRef<HTMLFormElement | null>(null);
  const visitDateRef = React.useRef<HTMLInputElement | null>(null);
  const visitNoteRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [selectedStatus, setSelectedStatus] = React.useState<JobStatus | "">(
    ""
  );
  const [statusSelectOpen, setStatusSelectOpen] = React.useState(false);
  const [blockedReason, setBlockedReason] = React.useState("");
  const [transitionError, setTransitionError] = React.useState<string | null>(
    null
  );
  const [selectedSiteId, setSelectedSiteId] = React.useState(
    detail.job.siteId ?? NO_SITE_VALUE
  );
  const [siteAssignmentSelectOpen, setSiteAssignmentSelectOpen] =
    React.useState(false);
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
  const contact = detail.job.contactId
    ? lookup.contactById.get(detail.job.contactId)
    : undefined;
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

  function closeSheet() {
    React.startTransition(() => {
      navigate({ to: "/jobs" });
    });
  }

  useAppHotkey("jobDetailClose", closeSheet, { ignoreInputs: true });
  useAppHotkey(
    "jobDetailComment",
    () => {
      commentTextareaRef.current?.focus();
    },
    { ignoreInputs: true }
  );
  useAppHotkey(
    "jobDetailSubmit",
    () => {
      if (!commentResult.waiting && activeElementIsInside(commentFormRef)) {
        commentFormRef.current?.requestSubmit();
        return;
      }

      if (
        canAddVisit &&
        !visitResult.waiting &&
        activeElementIsInside(visitFormRef)
      ) {
        visitFormRef.current?.requestSubmit();
      }
    },
    { ignoreInputs: false }
  );
  useAppHotkey(
    "jobDetailStatus",
    () => openSelect(statusSelectRef, setStatusSelectOpen),
    {
      enabled:
        detail.job.status !== "completed" &&
        transitionOptions.length > 0 &&
        hasAssignmentAccess,
      ignoreInputs: true,
    }
  );
  useAppHotkey(
    "jobDetailSite",
    () => openSelect(siteAssignmentSelectRef, setSiteAssignmentSelectOpen),
    {
      enabled: canEditJob && !patchResult.waiting,
      ignoreInputs: true,
    }
  );
  useAppHotkey(
    "jobDetailVisit",
    () => {
      const visitTarget =
        visitNote.trim().length > 0
          ? visitNoteRef.current
          : visitDateRef.current;
      visitTarget?.focus();
    },
    { enabled: canAddVisit, ignoreInputs: true }
  );

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

  async function handleReopen() {
    await reopenJob();
  }

  async function handleUpdateSiteAssignment() {
    if (!canEditJob) {
      return;
    }

    const nextSiteId =
      selectedSiteId === NO_SITE_VALUE ? null : (selectedSiteId as SiteIdType);

    if (
      selectedSiteId !== NO_SITE_VALUE &&
      !lookup.siteById.has(selectedSiteId as SiteIdType)
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
          disabled={reopenResult.waiting}
          onClick={handleReopen}
        >
          {reopenResult.waiting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
          )}
          {reopenResult.waiting ? "Reopening..." : "Reopen job"}
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
                open={statusSelectOpen}
                placeholder="Choose next state"
                emptyText="No status changes available."
                groups={transitionSelectionGroups}
                triggerRef={statusSelectRef}
                onOpenChange={setStatusSelectOpen}
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
            disabled={transitionResult.waiting || !selectedStatus}
            onClick={handleTransition}
          >
            {transitionResult.waiting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
            )}
            {transitionButtonLabel}
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
                detail.job.siteId && contact
                  ? "Linked through the selected site"
                  : "Add one when the customer context is clear"
              }
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
                        open={siteAssignmentSelectOpen}
                        placeholder="Pick site"
                        emptyText="No sites found."
                        groups={siteSelectionGroups}
                        disabled={!canEditJob || patchResult.waiting}
                        ariaInvalid={siteAssignmentError ? true : undefined}
                        triggerRef={siteAssignmentSelectRef}
                        onOpenChange={setSiteAssignmentSelectOpen}
                        onValueChange={(nextValue) => {
                          setSelectedSiteId(nextValue);
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
                      disabled={!selectedSiteChanged || patchResult.waiting}
                      onClick={handleUpdateSiteAssignment}
                    >
                      {patchResult.waiting ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <HugeiconsIcon
                          icon={Location01Icon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                      )}
                      {patchResult.waiting ? "Saving..." : "Save site"}
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
                  ref={commentFormRef}
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
                          ref={commentTextareaRef}
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
                      disabled={commentResult.waiting}
                      className="w-full sm:w-fit"
                    >
                      {commentResult.waiting ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <HugeiconsIcon
                          icon={Comment01Icon}
                          strokeWidth={2}
                          data-icon="inline-start"
                        />
                      )}
                      {commentResult.waiting ? "Adding..." : "Add comment"}
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

            <DetailSection
              title="Visits"
              description="Log the site visits that explain the real effort behind the work."
            >
              <div className="flex flex-col gap-5">
                {canAddVisit ? (
                  <>
                    {renderMutationError(visitResult)}
                    <form
                      ref={visitFormRef}
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
                                ref={visitDateRef}
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
                              ref={visitNoteRef}
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
                          disabled={visitResult.waiting}
                          className="w-full sm:w-fit"
                        >
                          {visitResult.waiting ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <HugeiconsIcon
                              icon={Time04Icon}
                              strokeWidth={2}
                              data-icon="inline-start"
                            />
                          )}
                          {visitResult.waiting ? "Logging..." : "Log visit"}
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
                              {describeActivity(actor?.name, event.payload)}
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
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button type="button" variant="ghost" onClick={closeSheet}>
                    Close
                  </Button>
                }
              />
              <TooltipContent>
                <span>Close</span>
                <ShortcutHint
                  hotkey={HOTKEYS.jobDetailClose.hotkey}
                  label={HOTKEYS.jobDetailClose.label}
                />
              </TooltipContent>
            </Tooltip>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function DetailSection({
  children,
  description,
  title,
}: {
  readonly children: React.ReactNode;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <section className="border-b py-5 last:border-b-0">
      <div className="grid gap-4 md:grid-cols-[9.5rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function DetailEmpty({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <Empty className="min-h-0 items-start border-0 bg-transparent p-0 text-left">
      <EmptyHeader className="items-start text-left">
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function HeaderMetaItem({
  label,
  supporting,
  value,
}: {
  readonly label: string;
  readonly supporting: string;
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
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {supporting}
      </p>
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
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDuration(durationMinutes: number) {
  const hours = durationMinutes / 60;
  return `${hours}h logged`;
}

function describeActivity(
  actorName: string | undefined,
  payload: JobDetailResponse["activity"][number]["payload"]
) {
  const actorPrefix = actorName ? `${actorName} ` : "";

  switch (payload.eventType) {
    case "assignee_changed": {
      return `${actorPrefix}updated the assignee.`;
    }
    case "blocked_reason_changed": {
      return `${actorPrefix}updated the blocked reason.`;
    }
    case "contact_changed": {
      return `${actorPrefix}updated the contact.`;
    }
    case "coordinator_changed": {
      return `${actorPrefix}updated the coordinator.`;
    }
    case "job_created": {
      return `${actorPrefix}created the job.`;
    }
    case "job_reopened": {
      return `${actorPrefix}reopened the job.`;
    }
    case "priority_changed": {
      return `${actorPrefix}changed priority from ${PRIORITY_LABELS[payload.fromPriority]} to ${PRIORITY_LABELS[payload.toPriority]}.`;
    }
    case "site_changed": {
      return `${actorPrefix}updated the site.`;
    }
    case "status_changed": {
      return `${actorPrefix}changed status from ${STATUS_LABELS[payload.fromStatus]} to ${STATUS_LABELS[payload.toStatus]}.`;
    }
    case "visit_logged": {
      return `${actorPrefix}logged a visit.`;
    }
    default: {
      return assertNever(payload);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled job activity payload: ${JSON.stringify(value)}`);
}
