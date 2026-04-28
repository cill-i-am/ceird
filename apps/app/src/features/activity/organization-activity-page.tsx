"use client";

import { Link } from "@tanstack/react-router";
import type {
  JobActivityEventType,
  JobOptionsResponse,
  OrganizationActivityListResponse,
  IsoDateStringType,
} from "@task-tracker/jobs-core";
import { JOB_ACTIVITY_EVENT_TYPES } from "@task-tracker/jobs-core";
import type * as React from "react";

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
import { cn } from "#/lib/utils";

import type { ActivitySearch } from "./activity-search";

const EVENT_TYPE_LABELS: Record<JobActivityEventType, string> = {
  assignee_changed: "Assignee changed",
  blocked_reason_changed: "Blocked reason changed",
  contact_changed: "Contact changed",
  coordinator_changed: "Coordinator changed",
  job_created: "Job created",
  job_reopened: "Job reopened",
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
  readonly options: JobOptionsResponse;
  readonly search: ActivitySearch;
  readonly onSearchChange: (search: ActivitySearch) => void;
}) {
  const hasActivity = activity.items.length > 0;

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
              {activity.items.map((item) => {
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
                          {formatDateTime(item.createdAt)}
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

function ActivityFilters({
  onSearchChange,
  options,
  search,
}: {
  readonly options: JobOptionsResponse;
  readonly search: ActivitySearch;
  readonly onSearchChange: (search: ActivitySearch) => void;
}) {
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
              eventType:
                (event.target.value as JobActivityEventType | "") || undefined,
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
              fromDate:
                (event.target.value as IsoDateStringType | "") || undefined,
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
              toDate:
                (event.target.value as IsoDateStringType | "") || undefined,
            })
          }
        />
      </FilterField>

      <FilterField label="Job title">
        <Input
          aria-label="Job title"
          placeholder="Filter by job title"
          value={search.jobTitle ?? ""}
          onChange={(event) =>
            onSearchChange({
              ...search,
              jobTitle: event.target.value || undefined,
            })
          }
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
