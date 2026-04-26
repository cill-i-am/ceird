import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as React from "react";

import { cn } from "#/lib/utils";

const PopoverTriggerElementContext = React.createContext<{
  readonly triggerElementRef: React.RefObject<HTMLElement | null>;
} | null>(null);

function Popover({ children, ...props }: PopoverPrimitive.Root.Props) {
  const triggerElementRef = React.useRef<HTMLElement | null>(null);
  const triggerElementContext = React.useMemo(
    () => ({ triggerElementRef }),
    []
  );

  return (
    <PopoverTriggerElementContext.Provider value={triggerElementContext}>
      <PopoverPrimitive.Root data-slot="popover" {...props}>
        {children}
      </PopoverPrimitive.Root>
    </PopoverTriggerElementContext.Provider>
  );
}

function PopoverTrigger({
  ref,
  ...props
}: PopoverPrimitive.Trigger.Props & React.RefAttributes<HTMLElement>) {
  const triggerElementContext = React.useContext(PopoverTriggerElementContext);
  const composedRef = React.useCallback(
    (element: HTMLElement | null) => {
      if (triggerElementContext) {
        triggerElementContext.triggerElementRef.current = element;
      }
      assignRef(ref, element);
    },
    [ref, triggerElementContext]
  );

  return (
    <PopoverPrimitive.Trigger
      ref={composedRef}
      data-slot="popover-trigger"
      {...props}
    />
  );
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const triggerElementContext = React.useContext(PopoverTriggerElementContext);
  const portalContainer =
    triggerElementContext?.triggerElementRef.current?.closest<HTMLElement>(
      '[data-slot="drawer-content"], [data-slot="dialog-content"]'
    ) ?? null;

  return (
    <PopoverPrimitive.Portal container={portalContainer ?? undefined}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[70]"
        style={{ zIndex: 70 }}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 flex origin-(--transform-origin) flex-col gap-4 rounded-3xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/5 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function assignRef<T>(ref: React.Ref<T> | undefined, value: T) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    ref.current = value;
  }
}

export { Popover, PopoverContent, PopoverTrigger };
