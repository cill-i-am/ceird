import { cn } from "#/lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-full bg-muted-foreground/10 px-1.5 font-sans text-[0.6875rem] leading-none font-medium text-muted-foreground shadow-none ring-1 ring-border/10 select-none in-data-[slot=input-group]:bg-muted-foreground/10 in-data-[slot=input-group]:ring-0 in-data-[slot=kbd-group]:h-auto in-data-[slot=kbd-group]:min-w-0 in-data-[slot=kbd-group]:rounded-none in-data-[slot=kbd-group]:bg-transparent in-data-[slot=kbd-group]:px-0 in-data-[slot=kbd-group]:text-current in-data-[slot=kbd-group]:ring-0 in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background in-data-[slot=tooltip-content]:ring-background/20 dark:bg-muted/35 dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn(
        "inline-flex h-6 min-w-7 items-center justify-center gap-0.5 rounded-full bg-muted-foreground/10 px-2 font-sans text-[0.6875rem] leading-none font-medium text-muted-foreground ring-1 ring-border/10 in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background in-data-[slot=tooltip-content]:ring-background/20 dark:bg-muted/35 dark:in-data-[slot=tooltip-content]:bg-background/10",
        className
      )}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
