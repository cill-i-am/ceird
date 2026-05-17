import * as React from "react";

import { fieldControlClassName } from "#/components/ui/field-control";
import { cn } from "#/lib/utils";

function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        fieldControlClassName,
        "h-9 w-full min-w-0 px-3 py-1 text-base shadow-none disabled:pointer-events-none md:text-sm",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { Select };
