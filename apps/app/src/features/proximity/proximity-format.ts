import type { ProximityResultMetadata } from "@ceird/proximity-core";

export function formatRouteDuration(durationSeconds: number) {
  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${totalMinutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

export function formatRouteDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(Math.round(distanceMeters / 100) / 10).toFixed(1)} km`;
}

export function formatOriginAccuracy(accuracyMeters: number | undefined) {
  if (accuracyMeters === undefined) {
    return "current location";
  }

  return `within ${Math.round(accuracyMeters)} m`;
}

export function formatRouteComputedAt(
  computedAt: string,
  options: Intl.DateTimeFormatOptions & { readonly locale?: string } = {}
) {
  const { locale = "en-IE", ...dateTimeOptions } = options;
  const formatted = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    ...dateTimeOptions,
  }).format(new Date(computedAt));

  return `Computed at ${formatted}`;
}

export function formatCandidateCapLabel(
  meta: ProximityResultMetadata,
  noun: "jobs" | "sites",
  visibleCount: number
) {
  if (!meta.candidateLimitApplied) {
    return `Showing ${visibleCount} ${noun}`;
  }

  return `Ranked ${meta.rankedCandidateLimit} eligible ${noun}, showing ${visibleCount}`;
}
