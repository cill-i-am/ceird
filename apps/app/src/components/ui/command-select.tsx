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
import { ShortcutHint } from "#/hotkeys/hotkey-display";
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
  readonly disabled?: boolean;
  readonly emptyText: string;
  readonly groups: readonly CommandSelectGroup[];
  readonly id: string;
  readonly onValueChange: (value: string) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly placeholder: string;
  readonly prefix?: React.ReactNode;
  readonly searchPlaceholder?: string;
  readonly showGroupHeadings?: boolean;
  readonly triggerRef?: React.Ref<HTMLButtonElement>;
  readonly value: string;
}

export function CommandSelect({
  "aria-describedby": ariaDescribedBy,
  ariaLabel,
  ariaInvalid,
  className,
  disabled = false,
  emptyText,
  groups,
  id,
  onValueChange,
  onOpenChange,
  open: controlledOpen,
  placeholder,
  prefix,
  searchPlaceholder = placeholder,
  showGroupHeadings = true,
  triggerRef,
  value,
}: CommandSelectProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const visibleGroups = groups.filter((group) => group.options.length > 0);
  const selectedOption =
    visibleGroups
      .flatMap((group) => group.options)
      .find((option) => option.value === value) ?? null;
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
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
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                      {option.shortcut ? (
                        <ShortcutHint
                          className="order-3 shrink-0 tabular-nums"
                          hotkey={option.shortcut}
                          label={option.label}
                        />
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
