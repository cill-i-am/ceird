"use client";
import {
  ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES,
  ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPES,
} from "@ceird/identity-core";
import type {
  OrganizationSecurityActivityActor,
  OrganizationSecurityActivityEventType,
  OrganizationSecurityActivityItem,
  OrganizationSecurityActivityListResponse,
  OrganizationSecurityActivityTargetType,
  UserId,
} from "@ceird/identity-core";
import { SecurityCheckIcon, ShieldUserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { useState } from "react";

import { AppPageHeader } from "#/components/app-page-header";
import {
  AppRowList,
  AppRowListBody,
  AppRowListItem,
  AppRowListLeading,
  AppRowListMeta,
} from "#/components/app-row-list";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { Select } from "#/components/ui/select";
import { cn } from "#/lib/utils";

import {
  decodeIsoDate,
  decodeOrganizationSecurityActivityEventType,
  decodeOrganizationSecurityActivityTargetType,
} from "./organization-security-search";
import type { OrganizationSecurityActivitySearch } from "./organization-security-search";

const EVENT_TYPE_LABELS = {
  organization_created: "Organization created",
  organization_invitation_accepted: "Invitation accepted",
  organization_invitation_canceled: "Invitation canceled",
  organization_invitation_created: "Invitation created",
  organization_invitation_resent: "Invitation resent",
  organization_member_removed: "Member removed",
  organization_member_role_updated: "Member role updated",
  organization_updated: "Organization updated",
} as const satisfies Record<OrganizationSecurityActivityEventType, string>;

const TARGET_TYPE_LABELS = {
  invitation: "Invitation",
  member: "Member",
  organization: "Organization",
} as const satisfies Record<OrganizationSecurityActivityTargetType, string>;

const SECURITY_ACTIVITY_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export function OrganizationSecurityActivityPage({
  activity,
  onSearchChange,
  search,
}: {
  readonly activity: OrganizationSecurityActivityListResponse;
  readonly search: OrganizationSecurityActivitySearch;
  readonly onSearchChange: (search: OrganizationSecurityActivitySearch) => void;
}) {
  const hasActivity = activity.items.length > 0;
  const hasActiveFilters = hasSecurityActivitySearchFilters(search);
  const actorOptions = buildActorOptions(activity.items, search.actorUserId);
  const activeFilterLabels = buildActiveFilterLabels(search, actorOptions);
  const emptyStateCopy = getSecurityActivityEmptyStateCopy(hasActiveFilters);
  const shouldShowFilters = hasActivity || hasActiveFilters;
  const activityScopeText = buildActivityScopeText({
    count: activity.items.length,
    hasNextPage: activity.nextCursor !== undefined,
  });

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-5">
      <AppPageHeader
        description="Review owner/admin-visible workspace security events. Showing recent security events; internal audit retention may be longer than this view."
        leading={<HugeiconsIcon icon={SecurityCheckIcon} strokeWidth={2} />}
        title="Security activity"
      >
        {shouldShowFilters ? (
          <SecurityActivityFilters
            actorOptions={actorOptions}
            search={search}
            onSearchChange={(nextSearch) =>
              onSearchChange(clearSecurityActivityCursor(nextSearch))
            }
          />
        ) : null}
      </AppPageHeader>

      <section aria-labelledby="security-activity-heading" className="min-h-0">
        <div className="flex flex-col gap-3 border-b border-border/60 pb-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2
                id="security-activity-heading"
                className="text-sm font-medium text-foreground"
              >
                Audit trail
              </h2>
              <p className="text-xs text-muted-foreground">
                IP address and user agent details are retained internally and
                hidden from this workspace view.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">{activityScopeText}</p>
          </div>

          {activeFilterLabels.length > 0 ? (
            <div
              aria-label="Active security activity filters"
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
          <AppRowList aria-label="Organization security activity">
            {activity.items.map((item) => (
              <SecurityActivityRow key={item.id} item={item} />
            ))}
          </AppRowList>
        ) : (
          <Empty className="min-h-72 border-transparent bg-transparent p-8">
            <EmptyHeader>
              <EmptyTitle>{emptyStateCopy.title}</EmptyTitle>
              <EmptyDescription>{emptyStateCopy.description}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {activity.nextCursor === undefined ? null : (
          <div className="flex justify-end pt-3">
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() =>
                onSearchChange({
                  ...search,
                  cursor: activity.nextCursor,
                })
              }
            >
              Next page
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}

function SecurityActivityRow({
  item,
}: {
  readonly item: OrganizationSecurityActivityItem;
}) {
  const actorLabel = item.actor?.name ?? "System";
  const targetLabel = item.target.label ?? TARGET_TYPE_LABELS[item.target.type];

  return (
    <AppRowListItem>
      <AppRowListLeading>
        <HugeiconsIcon icon={ShieldUserIcon} size={18} strokeWidth={2} />
      </AppRowListLeading>
      <AppRowListBody
        description={
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span>Actor: {actorLabel}</span>
            <span>Target: {targetLabel}</span>
          </span>
        }
        title={item.summary}
        truncateTitle={false}
      >
        {item.roleChange ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {item.roleChange.before ? (
              <Badge variant="outline">
                From {formatRoleLabel(item.roleChange.before)}
              </Badge>
            ) : null}
            {item.roleChange.after ? (
              <Badge variant="outline">
                To {formatRoleLabel(item.roleChange.after)}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </AppRowListBody>
      <AppRowListMeta>
        <Badge variant="outline">{EVENT_TYPE_LABELS[item.eventType]}</Badge>
        <span>{formatSecurityActivityDateTime(item.createdAt)}</span>
      </AppRowListMeta>
    </AppRowListItem>
  );
}

function SecurityActivityFilters({
  actorOptions,
  onSearchChange,
  search,
}: {
  readonly actorOptions: readonly ActorFilterOption[];
  readonly search: OrganizationSecurityActivitySearch;
  readonly onSearchChange: (search: OrganizationSecurityActivitySearch) => void;
}) {
  return (
    <div
      aria-label="Security activity filters"
      className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(8rem,1fr)_minmax(10rem,1fr)_minmax(8rem,1fr)_8.5rem_8.5rem_minmax(10rem,1.1fr)]"
    >
      <FilterField label="Actor">
        <Select
          aria-label="Actor"
          value={search.actorUserId ?? ""}
          onChange={(event) => {
            const selectedActor = actorOptions.find(
              (actor) => actor.id === event.target.value
            );

            onSearchChange({
              ...search,
              actorUserId: selectedActor?.id,
            });
          }}
        >
          <option value="">All actors</option>
          {actorOptions.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.label}
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
              eventType: decodeOrganizationSecurityActivityEventType(
                event.target.value
              ),
            })
          }
        >
          <option value="">All events</option>
          {ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES.map((eventType) => (
            <option key={eventType} value={eventType}>
              {EVENT_TYPE_LABELS[eventType]}
            </option>
          ))}
        </Select>
      </FilterField>

      <FilterField label="Target">
        <Select
          aria-label="Target type"
          value={search.targetType ?? ""}
          onChange={(event) =>
            onSearchChange({
              ...search,
              targetType: decodeOrganizationSecurityActivityTargetType(
                event.target.value
              ),
            })
          }
        >
          <option value="">All targets</option>
          {ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPES.map((targetType) => (
            <option key={targetType} value={targetType}>
              {TARGET_TYPE_LABELS[targetType]}
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
              fromDate: decodeIsoDate(event.target.value),
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
              toDate: decodeIsoDate(event.target.value),
            })
          }
        />
      </FilterField>

      <TargetSearchFilter
        key={`target-search:${search.targetSearch ?? ""}`}
        className="col-span-2 lg:col-span-1"
        search={search}
        onSearchChange={onSearchChange}
      />
    </div>
  );
}

function TargetSearchFilter({
  className,
  onSearchChange,
  search,
}: {
  readonly className?: string;
  readonly search: OrganizationSecurityActivitySearch;
  readonly onSearchChange: (search: OrganizationSecurityActivitySearch) => void;
}) {
  const [targetSearchDraft, setTargetSearchDraft] = useState(
    search.targetSearch ?? ""
  );

  function commitTargetSearchFilter() {
    const targetSearch = targetSearchDraft.trim() || undefined;

    if (targetSearch === search.targetSearch) {
      return;
    }

    onSearchChange({
      ...search,
      targetSearch,
    });
  }

  return (
    <FilterField label="Target search" className={className}>
      <Input
        aria-label="Target search"
        placeholder="Name, email, or member ID"
        value={targetSearchDraft}
        onBlur={commitTargetSearchFilter}
        onChange={(event) => setTargetSearchDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitTargetSearchFilter();
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

interface ActorFilterOption {
  readonly id: UserId;
  readonly label: string;
}

function buildActorOptions(
  items: readonly OrganizationSecurityActivityItem[],
  selectedActorId: UserId | undefined
) {
  const actorsById = new Map<UserId, OrganizationSecurityActivityActor>();

  for (const item of items) {
    if (item.actor) {
      actorsById.set(item.actor.id, item.actor);
    }
  }

  if (selectedActorId !== undefined && !actorsById.has(selectedActorId)) {
    actorsById.set(selectedActorId, {
      email: "",
      id: selectedActorId,
      name: selectedActorId,
    });
  }

  return [...actorsById.values()]
    .map((actor) => ({
      id: actor.id,
      label: actor.name || actor.email || actor.id,
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label));
}

function hasSecurityActivitySearchFilters(
  search: OrganizationSecurityActivitySearch
) {
  return (
    search.actorUserId !== undefined ||
    search.eventType !== undefined ||
    search.fromDate !== undefined ||
    search.targetSearch !== undefined ||
    search.targetType !== undefined ||
    search.toDate !== undefined
  );
}

function clearSecurityActivityCursor(
  search: OrganizationSecurityActivitySearch
) {
  return {
    ...search,
    cursor: undefined,
  };
}

function buildActiveFilterLabels(
  search: OrganizationSecurityActivitySearch,
  actorOptions: readonly ActorFilterOption[]
) {
  const labels: string[] = [];

  if (search.actorUserId !== undefined) {
    const actorLabel =
      actorOptions.find((actor) => actor.id === search.actorUserId)?.label ??
      search.actorUserId;

    labels.push(`Actor: ${actorLabel}`);
  }

  if (search.eventType !== undefined) {
    labels.push(`Event type: ${EVENT_TYPE_LABELS[search.eventType]}`);
  }

  if (search.targetType !== undefined) {
    labels.push(`Target: ${TARGET_TYPE_LABELS[search.targetType]}`);
  }

  if (search.fromDate !== undefined) {
    labels.push(`From: ${search.fromDate}`);
  }

  if (search.toDate !== undefined) {
    labels.push(`To: ${search.toDate}`);
  }

  if (search.targetSearch !== undefined) {
    labels.push(`Target search: ${search.targetSearch}`);
  }

  return labels;
}

function getSecurityActivityEmptyStateCopy(hasActiveFilters: boolean) {
  if (hasActiveFilters) {
    return {
      description:
        "Clear filters or adjust the actor, event, target, date, or target search to widen the audit trail.",
      title: "No security events match these filters.",
    };
  }

  return {
    description:
      "Organization changes, invitations, and member access updates will appear here.",
    title: "No security activity recorded yet.",
  };
}

function buildActivityScopeText({
  count,
  hasNextPage,
}: {
  readonly count: number;
  readonly hasNextPage: boolean;
}) {
  const eventCount = `${count} ${count === 1 ? "event" : "events"}`;

  return hasNextPage
    ? `${count} recent ${count === 1 ? "event" : "events"} shown`
    : `${eventCount} shown`;
}

function formatSecurityActivityDateTime(value: string) {
  return SECURITY_ACTIVITY_DATE_TIME_FORMATTER.format(new Date(value));
}

function formatRoleLabel(role: string) {
  return role.slice(0, 1).toUpperCase() + role.slice(1);
}
