"use client";
import { Result } from "@effect-atom/atom-react";

export function OrganizationAsyncResultError({
  result,
}: {
  readonly result: Result.Result<unknown, unknown>;
}) {
  return Result.builder(result)
    .onError((error) => (
      <p role="alert" className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Request failed."}
      </p>
    ))
    .render();
}
