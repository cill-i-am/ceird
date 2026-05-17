"use client";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerNestedRoot,
  DrawerTitle,
  DrawerTrigger,
} from "#/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import { useIsMobile } from "#/hooks/use-mobile";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { cn } from "#/lib/utils";

interface CommandSelectOption {
  readonly description?: string;
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
  readonly searchable?: boolean;
  readonly showGroupHeadings?: boolean;
  readonly triggerRef?: React.Ref<HTMLButtonElement>;
  readonly value: string;
}

export interface ResponsiveCommandSelectProps extends CommandSelectProps {
  readonly drawerTitle: string;
  readonly nestedDrawer?: boolean;
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
  searchable = true,
  showGroupHeadings = true,
  triggerRef,
  value,
}: CommandSelectProps) {
  const { open, selectedOption, setOpen, visibleGroups } =
    useCommandSelectModel({
      controlledOpen,
      groups,
      onOpenChange,
      value,
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        ref={triggerRef}
        render={
          <CommandSelectTrigger
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            aria-label={ariaLabel}
            className={className}
            disabled={disabled}
            id={id}
            placeholder={placeholder}
            prefix={prefix}
            selectedOption={selectedOption}
          />
        }
      />
      <PopoverContent
        className="w-[var(--anchor-width)] min-w-64 p-0"
        align="start"
      >
        <CommandSelectOptions
          emptyText={emptyText}
          onOpenChange={setOpen}
          onValueChange={onValueChange}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          selectedValue={selectedOption?.value}
          showGroupHeadings={showGroupHeadings}
          visibleGroups={visibleGroups}
        />
      </PopoverContent>
    </Popover>
  );
}

export function ResponsiveCommandSelect({
  drawerTitle,
  ...props
}: ResponsiveCommandSelectProps) {
  const isMobile = useIsMobile();

  if (!isMobile) {
    return <CommandSelect {...props} />;
  }

  return <DrawerCommandSelect drawerTitle={drawerTitle} {...props} />;
}

function DrawerCommandSelect({
  "aria-describedby": ariaDescribedBy,
  ariaLabel,
  ariaInvalid,
  className,
  disabled = false,
  drawerTitle,
  nestedDrawer = false,
  emptyText,
  groups,
  id,
  onValueChange,
  onOpenChange,
  open: controlledOpen,
  placeholder,
  prefix,
  searchable = true,
  searchPlaceholder = placeholder,
  showGroupHeadings = true,
  triggerRef,
  value,
}: ResponsiveCommandSelectProps) {
  const { open, selectedOption, setOpen, visibleGroups } =
    useCommandSelectModel({
      controlledOpen,
      groups,
      onOpenChange,
      value,
    });

  return (
    <CommandSelectDrawerRoot
      nested={nestedDrawer}
      open={open}
      onOpenChange={setOpen}
    >
      <DrawerTrigger asChild>
        <CommandSelectTrigger
          ref={triggerRef}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-label={ariaLabel}
          className={className}
          disabled={disabled}
          id={id}
          placeholder={placeholder}
          prefix={prefix}
          selectedOption={selectedOption}
        />
      </DrawerTrigger>
      <DrawerContent
        aria-describedby={undefined}
        className="mx-auto w-full max-w-md p-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <DrawerHeader className="items-start px-4 pt-5 pb-2 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <DrawerTitle>{drawerTitle}</DrawerTitle>
        </DrawerHeader>
        <CommandSelectOptions
          className="rounded-none bg-transparent"
          listClassName="max-h-[min(46vh,22rem)] px-2 pt-0 pb-4"
          emptyText={emptyText}
          onOpenChange={setOpen}
          onValueChange={onValueChange}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          selectedValue={selectedOption?.value}
          showGroupHeadings={showGroupHeadings}
          visibleGroups={visibleGroups}
        />
      </DrawerContent>
    </CommandSelectDrawerRoot>
  );
}

function CommandSelectDrawerRoot({
  children,
  nested,
  onOpenChange,
  open,
}: {
  readonly children: React.ReactNode;
  readonly nested: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  if (nested) {
    return (
      <DrawerNestedRoot
        open={open}
        onOpenChange={onOpenChange}
        direction="bottom"
      >
        {children}
      </DrawerNestedRoot>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      {children}
    </Drawer>
  );
}

function CommandSelectTrigger({
  className,
  placeholder,
  prefix,
  ref,
  selectedOption,
  ...props
}: Omit<React.ComponentProps<"button">, "prefix"> & {
  readonly placeholder: string;
  readonly prefix?: React.ReactNode;
  readonly selectedOption: CommandSelectOption | null;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        buttonVariants({ variant: "field" }),
        "w-full font-normal",
        className
      )}
      {...props}
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
    </button>
  );
}

function CommandSelectOptions({
  className,
  emptyText,
  listClassName,
  onOpenChange,
  onValueChange,
  searchable,
  searchPlaceholder,
  selectedValue,
  showGroupHeadings,
  visibleGroups,
}: {
  readonly className?: string;
  readonly emptyText: string;
  readonly listClassName?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onValueChange: (value: string) => void;
  readonly searchable: boolean;
  readonly searchPlaceholder: string;
  readonly selectedValue?: string;
  readonly showGroupHeadings: boolean;
  readonly visibleGroups: readonly CommandSelectGroup[];
}) {
  if (!searchable) {
    return (
      <StaticCommandSelectOptions
        className={className}
        emptyText={emptyText}
        listClassName={listClassName}
        onOpenChange={onOpenChange}
        onValueChange={onValueChange}
        selectedValue={selectedValue}
        showGroupHeadings={showGroupHeadings}
        visibleGroups={visibleGroups}
      />
    );
  }

  return (
    <Command className={className}>
      <CommandInput placeholder={searchPlaceholder} />
      <CommandList className={listClassName}>
        <CommandEmpty>{emptyText}</CommandEmpty>
        {visibleGroups.map((group, groupIndex) => (
          <React.Fragment key={group.label}>
            <CommandGroup heading={showGroupHeadings ? group.label : undefined}>
              {group.options.map((option) => (
                <CommandItem
                  key={option.value}
                  aria-label={
                    option.description
                      ? `${option.label}. ${option.description}`
                      : option.label
                  }
                  value={
                    option.description
                      ? `${option.label} ${option.description}`
                      : option.label
                  }
                  data-checked={
                    option.value === selectedValue ? "true" : undefined
                  }
                  onSelect={() => {
                    onValueChange(option.value);
                    onOpenChange(false);
                  }}
                >
                  {option.icon ? (
                    <HugeiconsIcon
                      icon={option.icon}
                      strokeWidth={2}
                      className="text-muted-foreground"
                    />
                  ) : null}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">{option.label}</span>
                    {option.description ? (
                      <span className="line-clamp-2 text-xs/5 font-normal text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
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
  );
}

function StaticCommandSelectOptions({
  className,
  emptyText,
  listClassName,
  onOpenChange,
  onValueChange,
  selectedValue,
  showGroupHeadings,
  visibleGroups,
}: {
  readonly className?: string;
  readonly emptyText: string;
  readonly listClassName?: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onValueChange: (value: string) => void;
  readonly selectedValue?: string;
  readonly showGroupHeadings: boolean;
  readonly visibleGroups: readonly CommandSelectGroup[];
}) {
  if (visibleGroups.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl bg-popover py-6 text-center text-sm text-muted-foreground",
          className
        )}
      >
        {emptyText}
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl bg-popover", className)}>
      <div
        aria-label="Suggestions"
        className={cn(
          "no-scrollbar max-h-72 overflow-x-hidden overflow-y-auto p-2 outline-none",
          listClassName
        )}
        role="listbox"
      >
        {visibleGroups.map((group, groupIndex) => (
          <React.Fragment key={group.label}>
            {showGroupHeadings ? (
              <p className="px-3 py-2 text-xs font-medium text-muted-foreground">
                {group.label}
              </p>
            ) : null}
            <div className="flex flex-col gap-1">
              {group.options.map((option) => {
                const isSelected = option.value === selectedValue;

                return (
                  <button
                    key={option.value}
                    aria-label={
                      option.description
                        ? `${option.label}. ${option.description}`
                        : option.label
                    }
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full cursor-default items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium outline-hidden transition-colors select-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30",
                      isSelected
                        ? "bg-muted text-foreground"
                        : "text-foreground"
                    )}
                    role="option"
                    type="button"
                    onClick={() => {
                      onValueChange(option.value);
                      onOpenChange(false);
                    }}
                  >
                    {option.icon ? (
                      <HugeiconsIcon
                        icon={option.icon}
                        strokeWidth={2}
                        className="text-muted-foreground"
                      />
                    ) : null}
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate">{option.label}</span>
                      {option.description ? (
                        <span className="line-clamp-2 text-xs/5 font-normal text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {option.shortcut ? (
                      <ShortcutHint
                        className="shrink-0 tabular-nums"
                        hotkey={option.shortcut}
                        label={option.label}
                      />
                    ) : null}
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      strokeWidth={2}
                      aria-hidden="true"
                      className={cn(
                        "ml-auto shrink-0",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </button>
                );
              })}
            </div>
            {groupIndex < visibleGroups.length - 1 ? (
              <div className="my-1.5 h-px bg-border/50" />
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function getVisibleCommandSelectGroups(groups: readonly CommandSelectGroup[]) {
  return groups.filter((group) => group.options.length > 0);
}

function useCommandSelectModel({
  controlledOpen,
  groups,
  onOpenChange,
  value,
}: {
  readonly controlledOpen?: boolean;
  readonly groups: readonly CommandSelectGroup[];
  readonly onOpenChange?: (open: boolean) => void;
  readonly value: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const visibleGroups = getVisibleCommandSelectGroups(groups);
  const selectedOption = getSelectedCommandSelectOption(visibleGroups, value);
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );

  return { open, selectedOption, setOpen, visibleGroups };
}

function getSelectedCommandSelectOption(
  visibleGroups: readonly CommandSelectGroup[],
  value: string
) {
  return (
    visibleGroups
      .flatMap((group) => group.options)
      .find((option) => option.value === value) ?? null
  );
}
