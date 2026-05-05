import type { JobActivityPayload, JobCostLineType } from "@ceird/jobs-core";

import {
  JOB_PRIORITY_LABELS,
  JOB_STATUS_LABELS,
} from "#/features/jobs/job-display";

const JOB_COST_LINE_TYPE_LABELS = {
  labour: "Labour",
  material: "Material",
} satisfies Record<JobCostLineType, string>;

export function describeJobActivity(
  actorName: string | undefined,
  payload: JobActivityPayload
) {
  const actorPrefix = actorName ? `${actorName} ` : "";

  switch (payload.eventType) {
    case "assignee_changed": {
      return `${actorPrefix}updated the assignee.`;
    }
    case "blocked_reason_changed": {
      return `${actorPrefix}updated the blocked reason.`;
    }
    case "contact_changed": {
      return `${actorPrefix}updated the contact.`;
    }
    case "cost_line_added": {
      return `${actorPrefix}added a ${JOB_COST_LINE_TYPE_LABELS[payload.costLineType].toLowerCase()} cost line.`;
    }
    case "coordinator_changed": {
      return `${actorPrefix}updated the coordinator.`;
    }
    case "job_created": {
      return `${actorPrefix}created the job.`;
    }
    case "job_reopened": {
      return `${actorPrefix}reopened the job.`;
    }
    case "label_added": {
      return `${actorPrefix}added the ${payload.labelName} label.`;
    }
    case "label_removed": {
      return `${actorPrefix}removed the ${payload.labelName} label.`;
    }
    case "priority_changed": {
      return `${actorPrefix}changed priority from ${JOB_PRIORITY_LABELS[payload.fromPriority]} to ${JOB_PRIORITY_LABELS[payload.toPriority]}.`;
    }
    case "site_changed": {
      return `${actorPrefix}updated the site.`;
    }
    case "status_changed": {
      return `${actorPrefix}changed status from ${JOB_STATUS_LABELS[payload.fromStatus]} to ${JOB_STATUS_LABELS[payload.toStatus]}.`;
    }
    case "visit_logged": {
      return `${actorPrefix}logged a visit.`;
    }
    default: {
      return assertNever(payload);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled job activity payload: ${JSON.stringify(value)}`);
}
