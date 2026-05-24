import { Briefcase01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Exit } from "effect";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";

import { getJobsAsyncErrorMessage, isJobsAsyncFailure } from "./jobs-state";
import type { JobsAsyncResult } from "./jobs-state";

export function renderMutationError(result: JobsAsyncResult) {
  return isJobsAsyncFailure(result) ? (
    <Alert variant="destructive">
      <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
      <AlertTitle>That update didn&apos;t land.</AlertTitle>
      <AlertDescription>
        {getJobsAsyncErrorMessage(result.error)}
      </AlertDescription>
    </Alert>
  ) : null;
}

export function getExitErrorMessage(exit: Exit.Exit<unknown, unknown>) {
  const cause = Exit.isFailure(exit) ? exit.cause : undefined;
  const message = cause ? String(cause) : "";

  return message && message !== "Error"
    ? message
    : "Collaborator access could not be updated.";
}
