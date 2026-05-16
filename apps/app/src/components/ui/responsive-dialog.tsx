"use client";
import * as React from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { useIsMobile } from "#/hooks/use-mobile";
import { cn } from "#/lib/utils";

const ResponsiveDialogModeContext = React.createContext(false);

interface ResponsiveDialogProps {
  readonly children?: React.ReactNode;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
}

function ResponsiveDialog({ children, ...props }: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  const content = isMobile ? (
    <Drawer direction="bottom" {...props}>
      {children}
    </Drawer>
  ) : (
    <Dialog {...props}>{children}</Dialog>
  );

  return (
    <ResponsiveDialogModeContext.Provider value={isMobile}>
      {content}
    </ResponsiveDialogModeContext.Provider>
  );
}

function useResponsiveDialogMode() {
  return React.use(ResponsiveDialogModeContext);
}

function ResponsiveDialogContent({
  children,
  className,
  dialogClassName,
  drawerClassName,
  initialFocus,
  ref,
  showCloseButton,
  ...props
}: ResponsiveDialogContentProps) {
  const isMobile = useResponsiveDialogMode();

  if (isMobile) {
    return (
      <DrawerContent
        className={cn("max-h-[92vh] w-full p-2", drawerClassName, className)}
        ref={ref}
        {...props}
      >
        {children}
      </DrawerContent>
    );
  }

  return (
    <DialogContent
      className={cn(dialogClassName, className)}
      initialFocus={initialFocus}
      ref={ref}
      showCloseButton={showCloseButton}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

type ResponsiveDialogContentProps = Omit<
  React.ComponentProps<"div">,
  "children"
> & {
  readonly children?: React.ReactNode;
  readonly dialogClassName?: string;
  readonly drawerClassName?: string;
  readonly initialFocus?: React.RefObject<HTMLElement | null>;
  readonly showCloseButton?: boolean;
};

function ResponsiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useResponsiveDialogMode();

  if (isMobile) {
    return (
      <DrawerHeader
        className={cn(
          "border-b px-5 py-4 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left",
          className
        )}
        {...props}
      />
    );
  }

  return <DialogHeader className={className} {...props} />;
}

function ResponsiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const isMobile = useResponsiveDialogMode();

  if (isMobile) {
    return (
      <DrawerFooter
        className={cn(
          "flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6",
          className
        )}
        {...props}
      />
    );
  }

  return <DialogFooter className={className} {...props} />;
}

function ResponsiveDialogTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  const isMobile = useResponsiveDialogMode();

  if (isMobile) {
    return <DrawerTitle className={className} {...props} />;
  }

  return <DialogTitle className={className} {...props} />;
}

function ResponsiveDialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  const isMobile = useResponsiveDialogMode();

  if (isMobile) {
    return <DrawerDescription className={className} {...props} />;
  }

  return <DialogDescription className={className} {...props} />;
}

interface ResponsiveDialogCloseProps {
  readonly children?: React.ReactNode;
  readonly render?: React.ReactElement<{ children?: React.ReactNode }>;
}

function ResponsiveDialogClose({
  children,
  render,
  ...props
}: ResponsiveDialogCloseProps) {
  const isMobile = useResponsiveDialogMode();

  if (!isMobile) {
    return (
      <DialogClose render={render} {...props}>
        {children}
      </DialogClose>
    );
  }

  if (React.isValidElement(render)) {
    return (
      <DrawerClose asChild {...props}>
        {React.cloneElement(render, undefined, children)}
      </DrawerClose>
    );
  }

  return <DrawerClose {...props}>{children}</DrawerClose>;
}

export {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
};
