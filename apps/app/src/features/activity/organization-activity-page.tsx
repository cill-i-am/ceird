"use client";
import { JOB_ACTIVITY_EVENT_TYPES } from "@ceird/jobs-core";
import type {
  JobActivityEventType,
  JobMemberOptionsResponse,
  OrganizationActivityItem,
  OrganizationActivityListResponse,
} from "@ceird/jobs-core";
import { Activity01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import type * as React from "react";
import { useState } from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { Select } from "#/components/ui/select";
import { describeJobActivity } from "#/features/activity/activity-formatting";
import {
  decodeActivityEventType,
  decodeActivityIsoDate,
} from "#/features/activity/activity-search";
import { formatJobDateTime } from "#/features/jobs/job-display";
import { createWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";
import { cn } from "#/lib/utils";

import type { ActivitySearch } from "./activity-search";

const EVENT_TYPE_LABELS: Record<JobActivityEventType, string> = {
  assignee_changed: "Assignee changed",
  blocked_reason_changed: "Blocked reason changed",
  contact_changed: "Contact changed",
  coordinator_changed: "Coordinator changed",
  job_created: "Job created",
  job_reopened: "Job reopened",
  label_added: "Label added",
  label_removed: "Label removed",
  priority_changed: "Priority changed",
  site_changed: "Site changed",
  status_changed: "Status changed",
  visit_logged: "Visit logged",
};

export function OrganizationActivityPage({
  activity,
  onSearchChange,
  options,
  search,
}: {
  readonly activity: OrganizationActivityListResponse;
  readonly options: JobMemberOptionsResponse;
  readonly search: ActivitySearch;
  readonly onSearchChange: (search: ActivitySearch) => void;
}) {
  const visibleActivityItems = activity.items.filter((item) =>
    activityItemMatchesSearch(item, search)
  );
  const hasActivity = visibleActivityItems.length > 0;
  const hasActiveFilters = hasActivitySearchFilters(search);
  const activeFilterLabels = buildActiveActivityFilterLabels(search, options);
  const emptyStateCopy = getActivityEmptyStateCopy(hasActiveFilters);
  const shouldShowFilters = activity.items.length > 0 || hasActiveFilters;
  const timelineScope = buildTimelineScopeText({
    totalCount: activity.items.length,
    visibleCount: visibleActivityItems.length,
    hasActiveFilters,
  });

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-5">
      <AppPageHeader
        title="Activity"
        leading={<HugeiconsIcon icon={Activity01Icon} strokeWidth={2} />}
      >
        {shouldShowFilters ? (
          <ActivityFilters
            options={options}
            search={search}
            onSearchChange={onSearchChange}
          />
        ) : null}
      </AppPageHeader>

      <section aria-labelledby="activity-timeline-heading" className="min-h-0">
        <div className="overflow-hidden rounded-2xl border bg-background">
          <div className="flex flex-col gap-3 border-b px-3 py-3 sm:px-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2
                  id="activity-timeline-heading"
                  className="text-sm font-medium text-foreground"
                >
                  Activity timeline
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">{timelineScope}</p>
            </div>

            {activeFilterLabels.length > 0 ? (
              <div
                aria-label="Active activity filters"
                className="flex min-w-0 flex-wrap items-center gap-2"
              >
                {activeFilterLabels.map((label) => (
                  <Badge key={label} variant="secondary">
                    {label}
                  </Badge>
                ))}
                <Button
                  size="xs"
                  type="button"
                  variant="ghost"
                  onClick={() => onSearchChange({})}
                >
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>

          {hasActivity ? (
            <div className="divide-y">
              {visibleActivityItems.map((item) => (
                <ActivityTimelineRow key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <Empty className="min-h-72 border-transparent bg-transparent p-8">
              <EmptyHeader>
                <EmptyTitle>{emptyStateCopy.title}</EmptyTitle>
                <EmptyDescription>
                  {emptyStateCopy.description}
                </EmptyDescription>
              </EmptyHeader>
              {hasActiveFilters ? null : (
                <EmptyContent>
                  <Link
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                    to="/jobs"
                  >
                    Open jobs
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      strokeWidth={2}
                      data-icon="inline-end"
                    />
                  </Link>
                </EmptyContent>
              )}
            </Empty>
          )}
        </div>
      </section>
    </main>
  );
}

function ActivityTimelineRow({
  item,
}: {
  readonly item: OrganizationActivityItem;
}) {
  const actorName = item.actor?.displayName;
  const actorLabel = actorName ?? "System";
  const summary = describeJobActivity(actorName, item.payload);

  return (
    <article className="grid gap-3 px-3 py-4 transition-colors hover:bg-muted/40 sm:px-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline">{EVENT_TYPE_LABELS[item.eventType]}</Badge>
          <span className="text-xs text-muted-foreground">
            {formatJobDateTime(item.createdAt)}
          </span>
        </div>
        <p className="text-sm font-medium text-foreground">{summary}</p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>{actorLabel}</span>
          <Link
            className="truncate font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            to="/jobs"
            search={createWorkspaceSheetSearch({
              jobId: item.workItemId,
              kind: "job.detail",
            })}
          >
            {item.jobTitle}
          </Link>
        </div>
      </div>
    </article>
  );
}

function hasActivitySearchFilters(search: ActivitySearch) {
  return (
    search.actorUserId !== undefined ||
    search.eventType !== undefined ||
    search.fromDate !== undefined ||
    search.toDate !== undefined ||
    search.jobTitle !== undefined
  );
}

function getActivityEmptyStateCopy(hasActiveFilters: boolean) {
  if (hasActiveFilters) {
    return {
      description:
        "Clear filters or adjust the actor, event, date, or job title to widen the audit trail.",
      title: "No events match these filters.",
    };
  }

  return {
    description:
      "Create or update a job and this timeline becomes the audit trail for the workspace.",
    title: "No activity recorded yet.",
  };
}

function buildTimelineScopeText({
  hasActiveFilters,
  totalCount,
  visibleCount,
}: {
  readonly hasActiveFilters: boolean;
  readonly totalCount: number;
  readonly visibleCount: number;
}) {
  const visibleEventLabel = pluralizeEventCount(visibleCount);

  if (hasActiveFilters) {
    return `${visibleCount} of ${totalCount} ${
      totalCount === 1 ? "event" : "events"
    } shown`;
  }

  return `${visibleEventLabel} shown`;
}

function pluralizeEventCount(count: number) {
  return `${count} ${count === 1 ? "event" : "events"}`;
}

function buildActiveActivityFilterLabels(
  search: ActivitySearch,
  options: JobMemberOptionsResponse
) {
  const labels: string[] = [];

  if (search.actorUserId !== undefined) {
    const actorName =
      options.members.find((member) => member.id === search.actorUserId)
        ?.name ?? search.actorUserId;

    labels.push(`Actor: ${actorName}`);
  }

  if (search.eventType !== undefined) {
    labels.push(`Event type: ${EVENT_TYPE_LABELS[search.eventType]}`);
  }

  if (search.fromDate !== undefined) {
    labels.push(`From: ${search.fromDate}`);
  }

  if (search.toDate !== undefined) {
    labels.push(`To: ${search.toDate}`);
  }

  if (search.jobTitle !== undefined) {
    labels.push(`Job title: ${search.jobTitle}`);
  }

  return labels;
}

function activityItemMatchesSearch(
  item: OrganizationActivityItem,
  search: ActivitySearch
) {
  const jobTitle = search.jobTitle?.trim().toLocaleLowerCase();

  return (
    (search.eventType === undefined || item.eventType === search.eventType) &&
    (search.fromDate === undefined ||
      item.createdAt.slice(0, 10) >= search.fromDate) &&
    (search.toDate === undefined ||
      item.createdAt.slice(0, 10) <= search.toDate) &&
    (jobTitle === undefined ||
      item.jobTitle.toLocaleLowerCase().includes(jobTitle))
  );
}

function ActivityFilters({
  onSearchChange,
  options,
  search,
}: {
  readonly options: JobMemberOptionsResponse;
  readonly search: ActivitySearch;
  readonly onSearchChange: (search: ActivitySearch) => void;
}) {
  return (
    <div
      aria-label="Activity filters"
      className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(8rem,1fr)_minmax(9rem,1fr)_8.5rem_8.5rem_minmax(10rem,1.1fr)]"
    >
      <FilterField label="Actor">
        <Select
          aria-label="Actor"
          value={search.actorUserId ?? ""}
          onChange={(event) => {
            const selectedActor = options.members.find(
              (member) => member.id === event.target.value
            );

            onSearchChange({
              ...search,
              actorUserId: selectedActor?.id,
            });
          }}
        >
          <option value="">All actors</option>
          {options.members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Event type">
        <Select
          aria-label="Event type"
          value={search.eventType ?? ""}
          onChange={(event) =>
            onSearchChange({
              ...search,
              eventType: decodeActivityEventType(event.target.value),
            })
          }
        >
          <option value="">All events</option>
          {JOB_ACTIVITY_EVENT_TYPES.map((eventType) => (
            <option key={eventType} value={eventType}>
              {EVENT_TYPE_LABELS[eventType]}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="From date">
        <Input
          aria-label="From date"
          type="date"
          value={search.fromDate ?? ""}
          onChange={(event) =>
            onSearchChange({
              ...search,
              fromDate: decodeActivityIsoDate(event.target.value),
            })
          }
        />
      </FilterField>

      <FilterField label="To date">
        <Input
          aria-label="To date"
          type="date"
          value={search.toDate ?? ""}
          onChange={(event) =>
            onSearchChange({
              ...search,
              toDate: decodeActivityIsoDate(event.target.value),
            })
          }
        />
      </FilterField>

      <JobTitleFilter
        key={`job-title:${search.jobTitle ?? ""}`}
        className="col-span-2 lg:col-span-1"
        onSearchChange={onSearchChange}
        search={search}
      />
    </div>
  );
}

function JobTitleFilter({
  className,
  onSearchChange,
  search,
}: {
  readonly className?: string;
  readonly search: ActivitySearch;
  readonly onSearchChange: (search: ActivitySearch) => void;
}) {
  const [jobTitleDraft, setJobTitleDraft] = useState(search.jobTitle ?? "");

  function commitJobTitleFilter() {
    const jobTitle = jobTitleDraft.trim() || undefined;

    if (jobTitle === search.jobTitle) {
      return;
    }

    onSearchChange({
      ...search,
      jobTitle,
    });
  }

  return (
    <FilterField label="Job title" className={className}>
      <Input
        aria-label="Job title"
        placeholder="Filter by job title"
        value={jobTitleDraft}
        onBlur={commitJobTitleFilter}
        onChange={(event) => setJobTitleDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitJobTitleFilter();
          }
        }}
      />
    </FilterField>
  );
}

function FilterField({
  children,
  className,
  label,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly label: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
