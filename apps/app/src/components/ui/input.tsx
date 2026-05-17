import { Input as InputPrimitive } from "@base-ui/react/input";
import * as React from "react";

import { fieldControlClassName } from "#/components/ui/field-control";
import { cn } from "#/lib/utils";

function Input({
  className,
  suppressHydrationWarning = true,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      suppressHydrationWarning={suppressHydrationWarning}
      className={cn(
        fieldControlClassName,
        "h-9 w-full min-w-0 px-3 py-1 text-base file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Input };
