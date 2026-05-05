import type { JobPriority, JobStatus } from "@ceird/jobs-core";
export const JOB_PRIORITY_LABELS: Record<JobPriority, string> = {
  high: "High",
  low: "Low",
  medium: "Medium",
  none: "No priority",
  urgent: "Urgent",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  blocked: "Blocked",
  canceled: "Canceled",
  completed: "Completed",
  in_progress: "In progress",
  new: "New",
  triaged: "Triaged",
};

const JOB_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
});

export function formatJobDateTime(value: string) {
  return JOB_DATE_TIME_FORMATTER.format(new Date(value));
}
