"use client";

import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { buttonVariants } from "#/components/ui/button";
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
import { cn } from "#/lib/utils";

export interface CommandSelectOption {
  readonly icon?: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  readonly label: string;
  readonly shortcut?: string;
  readonly value: string;
}

export interface CommandSelectGroup {
  readonly label: string;
  readonly options: readonly CommandSelectOption[];
}

export interface CommandSelectProps {
  readonly "aria-describedby"?: string;
  readonly ariaLabel?: string;
  readonly ariaInvalid?: true | undefined;
  readonly className?: string;
  readonly emptyText: string;
  readonly groups: readonly CommandSelectGroup[];
  readonly id: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly prefix?: React.ReactNode;
  readonly searchPlaceholder?: string;
  readonly showGroupHeadings?: boolean;
  readonly value: string;
}

export function CommandSelect({
  "aria-describedby": ariaDescribedBy,
  ariaLabel,
  ariaInvalid,
  className,
  emptyText,
  groups,
  id,
  onValueChange,
  placeholder,
  prefix,
  searchPlaceholder = placeholder,
  showGroupHeadings = true,
  value,
}: CommandSelectProps) {
  const [open, setOpen] = React.useState(false);
  const visibleGroups = groups.filter((group) => group.options.length > 0);
  const selectedOption =
    visibleGroups
      .flatMap((group) => group.options)
      .find((option) => option.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-between font-normal",
          className
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {prefix ? (
            <span className="shrink-0 text-muted-foreground">{prefix}</span>
          ) : null}
          <span
            className={cn(
              "truncate",
              selectedOption ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          data-icon="inline-end"
          className="text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--anchor-width)] min-w-64 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {visibleGroups.map((group, groupIndex) => (
              <React.Fragment key={group.label}>
                <CommandGroup
                  heading={showGroupHeadings ? group.label : undefined}
                >
                  {group.options.map((option) => (
                    <CommandItem
                      key={option.value}
                      aria-label={option.label}
                      value={option.label}
                      data-checked={
                        option.value === selectedOption?.value
                          ? "true"
                          : undefined
                      }
                      onSelect={() => {
                        onValueChange(option.value);
                        setOpen(false);
                      }}
                    >
                      {option.icon ? (
                        <HugeiconsIcon
                          icon={option.icon}
                          strokeWidth={2}
                          className="text-muted-foreground"
                        />
                      ) : null}
                      <span className="truncate">{option.label}</span>
                      {option.shortcut ? (
                        <span className="order-3 text-muted-foreground tabular-nums">
                          {option.shortcut}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {groupIndex < visibleGroups.length - 1 ? (
                  <CommandSeparator />
                ) : null}
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
