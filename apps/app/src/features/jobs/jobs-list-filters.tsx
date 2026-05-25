import { JOB_PRIORITIES, JOB_STATUSES } from "@ceird/jobs-core";
import type { UserIdType } from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import type { ServiceAreaIdType, SiteIdType } from "@ceird/sites-core";
import {
  Cancel01Icon,
  FilterHorizontalIcon,
  LeftToRightListBulletIcon,
  MapsSquare01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "#/components/ui/command";
import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#/components/ui/input-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import { cn } from "#/lib/utils";

import {
  JOB_PRIORITY_LABELS as PRIORITY_LABELS,
  JOB_STATUS_LABELS as STATUS_LABELS,
} from "./job-display";
import type { JobSavedView } from "./jobs-saved-views";
import {
  defaultJobsListFilters,
  isJobsAssigneeFilterEqual,
} from "./jobs-state";
import type { JobsAssigneeFilter, JobsListFilters } from "./jobs-state";
export type JobsViewMode = "list" | "map";

const SYNTHETIC_STATUS_FILTER_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "All jobs", value: "all" },
] as const;
const STATUS_FILTER_OPTIONS: readonly {
  readonly label: string;
  readonly value: JobsListFilters["status"];
}[] = [
  ...SYNTHETIC_STATUS_FILTER_OPTIONS,
  ...JOB_STATUSES.map((status) => ({
    label: STATUS_LABELS[status],
    value: status,
  })),
];

export function JobsCommandToolbar({
  filters,
  hasCustomFilters,
  onClearFilters,
  onFiltersChange,
  savedViewsControl,
  optionsState,
  searchInputRef,
  showInternalFilters,
}: {
  readonly filters: JobsListFilters;
  readonly hasCustomFilters: boolean;
  readonly onClearFilters: () => void;
  readonly onFiltersChange: (patch: Partial<JobsListFilters>) => void;
  readonly savedViewsControl?: React.ReactNode;
  readonly optionsState: {
    readonly labels: readonly {
      readonly id: LabelIdType;
      readonly name: string;
    }[];
    readonly members: readonly {
      readonly id: UserIdType;
      readonly name: string;
    }[];
    readonly serviceAreas: readonly {
      readonly id: ServiceAreaIdType;
      readonly name: string;
    }[];
    readonly sites: readonly {
      readonly id: SiteIdType;
      readonly name: string;
      readonly serviceAreaId?: ServiceAreaIdType | undefined;
    }[];
  };
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  readonly showInternalFilters: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <InputGroup className="h-8 border-border bg-background xl:w-72">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search jobs"
            placeholder="Search jobs"
            ref={searchInputRef}
            value={filters.query}
            onChange={(event) => onFiltersChange({ query: event.target.value })}
          />
        </InputGroup>

        <div className="no-scrollbar flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto pb-1 xl:justify-end xl:pb-0">
          {savedViewsControl}
          {showInternalFilters ? (
            <>
              <CommandFilter
                label="Assignee"
                value={formatJobsAssigneeFilterValue(filters.assigneeId)}
                options={[
                  { label: "All assignees", value: "all" },
                  { label: "Unassigned", value: "unassigned" },
                  ...optionsState.members.map((member) => ({
                    label: member.name,
                    value: formatJobsAssigneeFilterValue({
                      kind: "user",
                      userId: member.id,
                    }),
                  })),
                ]}
                onValueChange={(value) =>
                  onFiltersChange({
                    assigneeId: parseJobsAssigneeFilterValue(
                      value,
                      optionsState.members
                    ),
                  })
                }
              />
              <CommandFilter
                label="Priority"
                value={filters.priority}
                options={[
                  { label: "All priorities", value: "all" },
                  ...Object.entries(PRIORITY_LABELS).map(([value, label]) => ({
                    label,
                    value,
                  })),
                ]}
                onValueChange={(value) =>
                  onFiltersChange({
                    priority: parsePriorityFilterValue(value),
                  })
                }
              />
              <CommandFilter
                label="Label"
                value={filters.labelId}
                options={[
                  { label: "All labels", value: "all" },
                  ...optionsState.labels.map((label) => ({
                    label: label.name,
                    value: label.id,
                  })),
                ]}
                onValueChange={(value) =>
                  onFiltersChange({
                    labelId: parseAllOrOptionId(
                      value,
                      optionsState.labels,
                      defaultJobsListFilters.labelId
                    ),
                  })
                }
              />
              <CommandFilter
                label="Site"
                value={filters.siteId}
                options={[
                  { label: "All sites", value: "all" },
                  ...buildSiteFilterOptions(
                    optionsState.sites,
                    filters.serviceAreaId
                  ),
                ]}
                onValueChange={(value) =>
                  onFiltersChange({
                    siteId: parseAllOrOptionId(
                      value,
                      buildSiteFilterOptions(
                        optionsState.sites,
                        filters.serviceAreaId
                      ),
                      defaultJobsListFilters.siteId
                    ),
                  })
                }
              />
              <CommandFilter
                label="More"
                value="all"
                triggerIcon={FilterHorizontalIcon}
                options={[
                  { label: "All coordinators", value: "coordinator:all" },
                  ...optionsState.members.map((member) => ({
                    label: `Coordinator: ${member.name}`,
                    value: `coordinator:${member.id}`,
                  })),
                  { label: "All service areas", value: "serviceArea:all" },
                  ...optionsState.serviceAreas.map((serviceArea) => ({
                    label: `Service area: ${serviceArea.name}`,
                    value: `serviceArea:${serviceArea.id}`,
                  })),
                ]}
                onValueChange={(value) => {
                  const parsed = parseMoreFilterValue(value);

                  if (parsed?.kind === "coordinator") {
                    onFiltersChange({
                      coordinatorId: parseAllOrOptionId(
                        parsed.value,
                        optionsState.members,
                        defaultJobsListFilters.coordinatorId
                      ),
                    });
                    return;
                  }

                  if (parsed?.kind === "serviceArea") {
                    const serviceAreaId = parseAllOrOptionId(
                      parsed.value,
                      optionsState.serviceAreas,
                      defaultJobsListFilters.serviceAreaId
                    );

                    onFiltersChange({
                      serviceAreaId,
                      siteId:
                        serviceAreaId === "all"
                          ? filters.siteId
                          : defaultJobsListFilters.siteId,
                    });
                  }
                }}
              />
            </>
          ) : null}

          {hasCustomFilters ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClearFilters}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SavedViewsControl({
  activeSavedView,
  className,
  id = "jobs-saved-view",
  onOpenChange,
  onSavedViewSelect,
  open,
  savedViews,
}: {
  readonly activeSavedView: JobSavedView | undefined;
  readonly className?: string;
  readonly id?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSavedViewSelect: (savedView: JobSavedView) => void;
  readonly open: boolean;
  readonly savedViews: readonly JobSavedView[];
}) {
  const label = activeSavedView?.label ?? "Custom view";
  const groups = React.useMemo(
    () =>
      [
        {
          label: "Saved views",
          options: savedViews.map((savedView) => ({
            label: savedView.label,
            value: savedView.id,
          })),
        },
      ] satisfies readonly CommandSelectGroup[],
    [savedViews]
  );

  return (
    <CommandSelect
      id={id}
      value={activeSavedView?.id ?? ""}
      placeholder="Custom view"
      emptyText="No views."
      groups={groups}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={(value) => {
        const savedView = savedViews.find((view) => view.id === value);

        if (savedView) {
          onSavedViewSelect(savedView);
        }
      }}
      ariaLabel={`Saved view: ${label}`}
      className={cn("h-8 w-full shrink-0 bg-background xl:w-44", className)}
      prefix={<HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} />}
      searchPlaceholder="Switch saved view"
    />
  );
}

function CommandFilter({
  label,
  onValueChange,
  options,
  triggerIcon,
  value,
}: {
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly triggerIcon?: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  readonly value: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);
  const Icon = triggerIcon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 bg-background"
            aria-label={`${label} filter: ${selected?.label ?? label}`}
          />
        }
      >
        {Icon ? (
          <HugeiconsIcon icon={Icon} strokeWidth={2} data-icon="inline-start" />
        ) : null}
        <span>{selected?.label ?? label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Filter ${label.toLowerCase()}`} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading={label}>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  data-checked={option.value === value ? "true" : undefined}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ViewModeSwitch({
  onValueChange,
  value,
}: {
  readonly onValueChange: (value: JobsViewMode) => void;
  readonly value: JobsViewMode;
}) {
  const nextView = value === "list" ? "map" : "list";
  const label = nextView === "map" ? "Map" : "List";
  const icon =
    nextView === "map" ? MapsSquare01Icon : LeftToRightListBulletIcon;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="bg-background"
      onClick={() => onValueChange(nextView)}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} data-icon="inline-start" />
      {label}
    </Button>
  );
}

type JobStatusFilterValue = JobsListFilters["status"];

type JobStatusCounts = Record<JobStatusFilterValue, number>;

export function JobStatusRail({
  counts,
  onStatusChange,
  status,
}: {
  readonly counts: JobStatusCounts;
  readonly onStatusChange: (status: JobsListFilters["status"]) => void;
  readonly status: JobsListFilters["status"];
}) {
  return (
    <div
      aria-label="Job status views"
      className="no-scrollbar flex min-w-0 items-center gap-4 overflow-x-auto border-t pt-2"
    >
      {STATUS_FILTER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn(
            "-mb-3 flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-0 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            status === option.value
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          aria-label={`${option.label} ${counts[option.value]}`}
          aria-pressed={status === option.value}
          onClick={() => onStatusChange(option.value)}
        >
          <span>{option.label}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
            {counts[option.value]}
          </span>
        </button>
      ))}
    </div>
  );
}

export function ActiveFilterBar({
  filters,
  onClearAll,
  onRemove,
}: {
  readonly filters: readonly ActiveFilterBadge[];
  readonly onClearAll: () => void;
  readonly onRemove: (key: keyof JobsListFilters) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Active filters"
    >
      {filters.map((filter) => (
        <Badge
          key={filter.label}
          variant="outline"
          className="gap-1 rounded-full"
        >
          {filter.label}
          <button
            type="button"
            className="inline-flex rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Remove ${filter.label}`}
            onClick={() => onRemove(filter.key)}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </button>
        </Badge>
      ))}
      <Button type="button" size="xs" variant="ghost" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}

function buildSiteFilterOptions(
  sites: readonly {
    readonly id: SiteIdType;
    readonly name: string;
    readonly serviceAreaId?: ServiceAreaIdType;
  }[],
  serviceAreaId: JobsListFilters["serviceAreaId"]
) {
  const options: { readonly label: string; readonly value: SiteIdType }[] = [];

  for (const site of sites) {
    if (serviceAreaId !== "all" && site.serviceAreaId !== serviceAreaId) {
      continue;
    }

    options.push({
      label: site.name,
      value: site.id,
    });
  }

  return options;
}

function parsePriorityFilterValue(value: string): JobsListFilters["priority"] {
  if (value === "all") {
    return "all";
  }

  return JOB_PRIORITIES.find((priority) => priority === value) ?? "all";
}

function parseAllOrOptionId<TId extends string>(
  value: string,
  options: readonly { readonly value?: TId; readonly id?: TId }[],
  fallback: TId | "all"
): TId | "all" {
  if (value === "all") {
    return "all";
  }

  const option = options.find(
    (candidate) => (candidate.value ?? candidate.id) === value
  );

  return option ? (option.value ?? option.id ?? fallback) : fallback;
}

function parseMoreFilterValue(
  value: string
):
  | { readonly kind: "coordinator"; readonly value: string }
  | { readonly kind: "serviceArea"; readonly value: string }
  | null {
  const [kind, nextValue, ...extraParts] = value.split(":");

  if (
    nextValue === undefined ||
    extraParts.length > 0 ||
    (kind !== "coordinator" && kind !== "serviceArea")
  ) {
    return null;
  }

  return { kind, value: nextValue };
}

interface ActiveFilterBadge {
  readonly key: keyof JobsListFilters;
  readonly label: string;
}

export function buildActiveFilterBadges(
  filters: JobsListFilters,
  lookup: {
    readonly labelById: ReadonlyMap<string, { readonly name: string }>;
    readonly memberById: ReadonlyMap<string, { readonly name: string }>;
    readonly serviceAreaById: ReadonlyMap<string, { readonly name: string }>;
    readonly siteById: ReadonlyMap<string, { readonly name: string }>;
  }
): readonly ActiveFilterBadge[] {
  const badges: ActiveFilterBadge[] = [];

  if (filters.query.trim().length > 0) {
    badges.push({ key: "query", label: `Search: ${filters.query.trim()}` });
  }

  if (filters.status !== defaultJobsListFilters.status) {
    const selectedStatus = STATUS_FILTER_OPTIONS.find(
      (option) => option.value === filters.status
    );

    badges.push({
      key: "status",
      label: `Status: ${selectedStatus?.label ?? filters.status}`,
    });
  }

  if (
    !isJobsAssigneeFilterEqual(
      filters.assigneeId,
      defaultJobsListFilters.assigneeId
    )
  ) {
    badges.push({
      key: "assigneeId",
      label: buildAssigneeFilterBadgeLabel(filters.assigneeId, lookup),
    });
  }

  if (filters.coordinatorId !== defaultJobsListFilters.coordinatorId) {
    badges.push({
      key: "coordinatorId",
      label: `Coordinator: ${lookup.memberById.get(filters.coordinatorId)?.name ?? "Unknown"}`,
    });
  }

  if (
    filters.priority !== defaultJobsListFilters.priority &&
    filters.priority !== "all"
  ) {
    badges.push({
      key: "priority",
      label: `Priority: ${PRIORITY_LABELS[filters.priority] ?? "Unknown"}`,
    });
  }

  addLookupFilterBadge(
    badges,
    "labelId",
    filters.labelId,
    defaultJobsListFilters.labelId,
    "Label",
    lookup.labelById
  );
  addLookupFilterBadge(
    badges,
    "serviceAreaId",
    filters.serviceAreaId,
    defaultJobsListFilters.serviceAreaId,
    "Service area",
    lookup.serviceAreaById
  );
  addLookupFilterBadge(
    badges,
    "siteId",
    filters.siteId,
    defaultJobsListFilters.siteId,
    "Site",
    lookup.siteById
  );

  return badges;
}

function addLookupFilterBadge(
  badges: ActiveFilterBadge[],
  key: keyof JobsListFilters,
  value: string,
  defaultValue: string,
  labelPrefix: string,
  lookup: ReadonlyMap<string, { readonly name: string }>
) {
  if (value === defaultValue) {
    return;
  }

  badges.push({
    key,
    label: `${labelPrefix}: ${lookup.get(value)?.name ?? "Unknown"}`,
  });
}

function buildAssigneeFilterBadgeLabel(
  assigneeId: JobsAssigneeFilter,
  lookup: {
    readonly memberById: ReadonlyMap<string, { readonly name: string }>;
  }
) {
  if (assigneeId.kind === "unassigned") {
    return "Assignee: Unassigned";
  }

  if (assigneeId.kind === "all") {
    return "Assignee: All";
  }

  return `Assignee: ${lookup.memberById.get(assigneeId.userId)?.name ?? "Unknown"}`;
}

function formatJobsAssigneeFilterValue(filter: JobsAssigneeFilter): string {
  if (filter.kind === "user") {
    return `user:${filter.userId}`;
  }

  return filter.kind;
}

function parseJobsAssigneeFilterValue(
  value: string,
  members: readonly { readonly id: UserIdType }[]
): JobsAssigneeFilter {
  if (value === "all") {
    return { kind: "all" };
  }

  if (value === "unassigned") {
    return { kind: "unassigned" };
  }

  const member = members.find(
    (candidate) =>
      formatJobsAssigneeFilterValue({
        kind: "user",
        userId: candidate.id,
      }) === value
  );

  return member ? { kind: "user", userId: member.id } : { kind: "all" };
}
