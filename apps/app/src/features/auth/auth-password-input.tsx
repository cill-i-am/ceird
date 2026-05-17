import { EyeIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#/components/ui/input-group";
import { cn } from "#/lib/utils";

type AuthPasswordInputProps = Omit<
  React.ComponentProps<typeof InputGroupInput>,
  "type"
>;

export function AuthPasswordInput({
  className,
  ...props
}: AuthPasswordInputProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const label = isVisible ? "Hide password" : "Show password";

  return (
    <InputGroup className="h-10">
      <InputGroupInput
        type={isVisible ? "text" : "password"}
        className={cn("h-full", className)}
        {...props}
      />
      <InputGroupAddon align="inline-end" className="pr-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={isVisible}
          className="size-7 text-muted-foreground hover:bg-muted hover:text-foreground"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsVisible((current) => !current)}
        >
          <HugeiconsIcon
            icon={isVisible ? ViewOffIcon : EyeIcon}
            strokeWidth={2}
          />
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
