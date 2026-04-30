"use client";

import { Link } from "@tanstack/react-router";
import type {
  OrganizationActivityItem,
  JobMemberOptionsResponse,
  OrganizationActivityListResponse,
  JobActivityEventType,
} from "@task-tracker/jobs-core";
import { JOB_ACTIVITY_EVENT_TYPES } from "@task-tracker/jobs-core";
import type * as React from "react";
import { useCallback, useEffect, useState } from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { Badge } from "#/components/ui/badge";
import {
  Empty,
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
import { cn } from "#/lib/utils";

import type { ActivitySearch } from "./activity-search";

const EVENT_TYPE_LABELS: Record<JobActivityEventType, string> = {
  assignee_changed: "Assignee changed",
  blocked_reason_changed: "Blocked reason changed",
  contact_changed: "Contact changed",
  coordinator_changed: "Coordinator changed",
  cost_line_added: "Cost line added",
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

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-5 p-4 sm:p-6">
      <AppPageHeader title="Activity">
        <ActivityFilters
          options={options}
          search={search}
          onSearchChange={onSearchChange}
        />
      </AppPageHeader>

      {hasActivity ? (
        <section aria-label="Organization activity" className="min-h-0">
          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="divide-y">
              {visibleActivityItems.map((item) => {
                const actorName = item.actor?.name;
                const actorLabel = actorName ?? "System";
                const summary = describeJobActivity(actorName, item.payload);

                return (
                  <article
                    className="grid gap-3 p-4 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
                    key={item.id}
                  >
                    <div className="min-w-0 space-y-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {EVENT_TYPE_LABELS[item.eventType]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatJobDateTime(item.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {summary}
                      </p>
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span>{actorLabel}</span>
                        <Link
                          className="truncate font-medium text-primary underline-offset-4 hover:underline"
                          params={{ jobId: item.workItemId }}
                          to="/jobs/$jobId"
                        >
                          {item.jobTitle}
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        <Empty className="min-h-64 rounded-lg">
          <EmptyHeader>
            <EmptyTitle>No activity found</EmptyTitle>
            <EmptyDescription>
              Try changing the filters to see more organization activity.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </main>
  );
}

function activityItemMatchesSearch(
  item: OrganizationActivityItem,
  search: ActivitySearch
) {
  const jobTitle = search.jobTitle?.trim().toLocaleLowerCase();

  return (
    (search.actorUserId === undefined ||
      item.actor?.id === search.actorUserId) &&
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
  const [jobTitleDraft, setJobTitleDraft] = useState(search.jobTitle ?? "");

  useEffect(() => {
    setJobTitleDraft(search.jobTitle ?? "");
  }, [search.jobTitle]);

  const commitJobTitleFilter = useCallback(() => {
    const jobTitle = jobTitleDraft.trim() || undefined;

    if (jobTitle === search.jobTitle) {
      return;
    }

    onSearchChange({
      ...search,
      jobTitle,
    });
  }, [jobTitleDraft, onSearchChange, search]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(10rem,1fr)_minmax(11rem,1fr)_9rem_9rem_minmax(12rem,1.2fr)]">
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

      <FilterField label="Job title">
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
    </div>
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
