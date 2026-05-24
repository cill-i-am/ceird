import { formatJobDateTime } from "./job-display";

export function getLocalDateInputValue(reference = new Date()) {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function formatDetailDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDetailDateTime(value: string) {
  return formatJobDateTime(value);
}

export function formatVisitDuration(durationMinutes: number) {
  const hours = durationMinutes / 60;
  return `${hours}h logged`;
}
