import type { JobDetailResponse, UserIdType } from "@ceird/jobs-core";

import {
  formatDetailDate,
  formatVisitDuration,
} from "./jobs-detail-formatting";

export function JobVisitsList({
  lookup,
  visits,
}: {
  readonly lookup: {
    readonly memberById: ReadonlyMap<UserIdType, { readonly name: string }>;
  };
  readonly visits: JobDetailResponse["visits"];
}) {
  return (
    <ul className="flex flex-col gap-3">
      {visits.map((visit) => {
        const author = lookup.memberById.get(visit.authorUserId);

        return (
          <li
            key={visit.id}
            className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {author?.name ?? "Team member"}
                </span>
                <span>{formatDetailDate(visit.visitDate)}</span>
                <span>{formatVisitDuration(visit.durationMinutes)}</span>
              </div>
              <p className="text-sm leading-7 whitespace-pre-wrap">
                {visit.note}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
