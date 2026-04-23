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
  Time04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import type { JobDetailResponse, JobStatus } from "@task-tracker/jobs-core";
import { Exit } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
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
import { Select } from "#/components/ui/select";
import { Separator } from "#/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { Textarea } from "#/components/ui/textarea";

import { JobsDetailLocation } from "./jobs-detail-location";
import {
  addJobCommentMutationAtomFamily,
  addJobVisitMutationAtomFamily,
  jobDetailStateAtomFamily,
  reopenJobMutationAtomFamily,
  transitionJobMutationAtomFamily,
} from "./jobs-detail-state";
import { jobsLookupAtom } from "./jobs-state";
import {
  getAvailableJobTransitions,
  hasAssignedJobAccess,
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

interface JobsDetailSheetProps {
  readonly initialDetail: JobDetailResponse;
  readonly viewer: JobsViewer;
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
  const canAddVisit = hasAssignmentAccess;
  const canReopen = hasAssignmentAccess;
  const transitionOptions = getAvailableJobTransitions(viewer, detail.job);

  const [selectedStatus, setSelectedStatus] = React.useState<JobStatus | "">(
    ""
  );
  const [blockedReason, setBlockedReason] = React.useState("");
  const [transitionError, setTransitionError] = React.useState<string | null>(
    null
  );
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

  React.useEffect(() => {
    setSelectedStatus("");
    setBlockedReason("");
    setTransitionError(null);
    setCommentBody("");
    setCommentError(null);
    setVisitDate(getLocalDateInputValue());
    setVisitDurationMinutes("60");
    setVisitNote("");
    setVisitError(null);
  }, [detail.job.status, workItemId]);

  function closeSheet() {
    React.startTransition(() => {
      navigate({ to: "/jobs" });
    });
  }

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
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {reopenResult.waiting ? "Reopening..." : "Reopen job"}
        </Button>
      </div>
    ) : (
      <Empty className="min-h-[180px] bg-muted/20">
        <EmptyHeader>
          <EmptyTitle>This completed job is view-only for you.</EmptyTitle>
          <EmptyDescription>
            Members can only reopen completed jobs when they are assigned to
            them.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (transitionOptions.length > 0 && hasAssignmentAccess) {
    statusActionContent = (
      <div className="flex flex-col gap-4">
        {renderMutationError(transitionResult)}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="job-transition-status">Next status</FieldLabel>
            <FieldContent>
              <Select
                id="job-transition-status"
                value={selectedStatus}
                onChange={(event) =>
                  setSelectedStatus(event.target.value as JobStatus)
                }
              >
                <option value="">Choose the next state</option>
                {transitionOptions.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
              <FieldDescription>
                Pick the clearest next state for the queue, not the most
                optimistic one.
              </FieldDescription>
            </FieldContent>
          </Field>

          {transitionErrorContent}
        </FieldGroup>

        <div className="flex flex-wrap gap-3">
          <Button
            disabled={transitionResult.waiting}
            onClick={handleTransition}
          >
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {transitionResult.waiting ? "Updating..." : "Apply status change"}
          </Button>
        </div>
      </div>
    );
  } else {
    statusActionContent = (
      <Empty className="min-h-[180px] bg-muted/20">
        <EmptyHeader>
          <EmptyTitle>
            {hasAssignmentAccess
              ? "No further status action here yet."
              : "Status changes open once this job is assigned to you."}
          </EmptyTitle>
          <EmptyDescription>
            {hasAssignmentAccess
              ? "This job is already at the end of the v1 workflow."
              : "Members can comment freely, but only the assignee can move the queue forward from here."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) {
          closeSheet();
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader className="gap-3 border-b">
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
            <SheetTitle>{detail.job.title}</SheetTitle>
            <SheetDescription>
              Keep the queue in view while you move the status forward, add
              context, and log the site visits that matter.
            </SheetDescription>
          </div>
          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            <HeaderMetaCard
              label="Site"
              value={site?.name ?? "No site yet"}
              supporting={site?.regionName ?? "No region yet"}
            />
            <HeaderMetaCard
              label="Assignee"
              value={assignee?.name ?? "Unassigned"}
              supporting={
                coordinator
                  ? `Coordinator: ${coordinator.name}`
                  : "No coordinator"
              }
            />
            <HeaderMetaCard
              label="Contact"
              value={contact?.name ?? "No contact yet"}
              supporting={
                detail.job.siteId && contact
                  ? "Linked through the selected site"
                  : "Add one when the customer context is clear"
              }
            />
            <HeaderMetaCard
              label="Updated"
              value={formatDateTime(detail.job.updatedAt)}
              supporting={`Created ${formatDate(detail.job.createdAt)}`}
            />
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
            {detail.job.blockedReason ? (
              <Alert>
                <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
                <AlertTitle>Blocked reason</AlertTitle>
                <AlertDescription>{detail.job.blockedReason}</AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Move the job forward</CardTitle>
                <CardDescription>
                  Keep the status honest. Use blocked only when something is
                  truly waiting on an unblock.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {statusActionContent}
              </CardContent>
            </Card>

            <JobsDetailLocation site={site} />

            <Card>
              <CardHeader>
                <CardTitle>Comments</CardTitle>
                <CardDescription>
                  Keep the narrative in comments instead of hiding it in fields.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {renderMutationError(commentResult)}
                <form
                  className="flex flex-col gap-4"
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
                      disabled={commentResult.waiting}
                      className="w-full sm:w-fit"
                    >
                      <HugeiconsIcon
                        icon={Comment01Icon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      {commentResult.waiting ? "Adding..." : "Add comment"}
                    </Button>
                  </div>
                </form>

                <Separator />

                {detail.comments.length === 0 ? (
                  <Empty className="min-h-[180px] bg-muted/20">
                    <EmptyHeader>
                      <EmptyTitle>No comments yet.</EmptyTitle>
                      <EmptyDescription>
                        The job is ready for its first bit of real context.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {detail.comments.map((comment) => {
                      const author = lookup.memberById.get(
                        comment.authorUserId
                      );

                      return (
                        <li
                          key={comment.id}
                          className="rounded-3xl border bg-muted/20 p-4"
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Visits</CardTitle>
                <CardDescription>
                  Log the site visits that explain the real effort behind the
                  work.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {canAddVisit ? (
                  <>
                    {renderMutationError(visitResult)}
                    <form
                      className="flex flex-col gap-4"
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
                              <Select
                                id="job-visit-duration"
                                value={visitDurationMinutes}
                                onChange={(event) =>
                                  setVisitDurationMinutes(event.target.value)
                                }
                              >
                                {VISIT_DURATION_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
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
                          disabled={visitResult.waiting}
                          className="w-full sm:w-fit"
                        >
                          <HugeiconsIcon
                            icon={Time04Icon}
                            strokeWidth={2}
                            data-icon="inline-start"
                          />
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
                  <Empty className="min-h-[180px] bg-muted/20">
                    <EmptyHeader>
                      <EmptyTitle>No visits logged yet.</EmptyTitle>
                      <EmptyDescription>
                        Add the field work once the crew starts showing up on
                        site.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {detail.visits.map((visit) => {
                      const author = lookup.memberById.get(visit.authorUserId);

                      return (
                        <li
                          key={visit.id}
                          className="rounded-3xl border bg-muted/20 p-4"
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>
                  System activity stays separate from narrative comments.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {detail.activity.length === 0 ? (
                  <Empty className="min-h-[180px] bg-muted/20">
                    <EmptyHeader>
                      <EmptyTitle>No activity yet.</EmptyTitle>
                      <EmptyDescription>
                        The history will fill in as the job moves.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {detail.activity.map((event) => {
                      const actor = event.actorUserId
                        ? lookup.memberById.get(event.actorUserId)
                        : undefined;

                      return (
                        <li
                          key={event.id}
                          className="rounded-3xl border bg-muted/20 p-4"
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
              </CardContent>
            </Card>
          </div>

          <SheetFooter className="border-t">
            <Button
              type="button"
              variant="ghost"
              className={buttonVariants({ variant: "ghost" })}
              onClick={closeSheet}
            >
              Close
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HeaderMetaCard({
  label,
  supporting,
  value,
}: {
  readonly label: string;
  readonly supporting: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-2xl border bg-muted/15 px-3 py-3 text-left">
      <p className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
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
