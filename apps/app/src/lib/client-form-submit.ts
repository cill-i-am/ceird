import type * as React from "react";

export function submitClientForm(
  event: React.FormEvent<HTMLFormElement>,
  submit: () => void | Promise<void>
) {
  event.preventDefault();
  event.stopPropagation();
  void submit();
}
