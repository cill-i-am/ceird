import * as React from "react";

import { fieldControlClassName } from "#/components/ui/field-control";
import { cn } from "#/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldControlClassName,
        "flex field-sizing-content min-h-16 w-full resize-none px-3 py-3 text-base placeholder:text-muted-foreground md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
