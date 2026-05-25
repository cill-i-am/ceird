import { normalizeLabelName } from "@ceird/labels-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import { validateLabelName } from "#/features/labels/label-name-validation";
import { cn } from "#/lib/utils";

export function JobDetailLabels({
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

export function getSortedLabels(labels: readonly Label[]) {
  return labels.toSorted(compareLabels);
}

function compareLabels(left: Label, right: Label) {
  const nameOrder = left.name.localeCompare(right.name);

  return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
}
