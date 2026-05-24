import type { JobDetailResponse, UserIdType } from "@ceird/jobs-core";

import { describeJobActivity } from "#/features/activity/activity-formatting";

import { formatDetailDateTime } from "./jobs-detail-formatting";
import { DetailEmpty } from "./jobs-detail-section";

export function JobActivityList({
  activity,
  lookup,
}: {
  readonly activity: JobDetailResponse["activity"];
  readonly lookup: {
    readonly memberById: ReadonlyMap<UserIdType, { readonly name: string }>;
  };
}) {
  if (activity.length === 0) {
    return <DetailEmpty title="No activity yet." />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {activity.map((event) => {
        const actor = event.actorUserId
          ? lookup.memberById.get(event.actorUserId)
          : undefined;

        return (
          <li
            key={event.id}
            className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-7">
                {describeJobDetailActivity(actor?.name, event.payload)}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDetailDateTime(event.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function describeJobDetailActivity(
  actorName: string | undefined,
  payload: JobDetailResponse["activity"][number]["payload"]
) {
  const actorPrefix = actorName ? `${actorName} ` : "";

  switch (payload.eventType) {
    case "label_added": {
      return `${actorPrefix}added the ${payload.labelName} label.`;
    }
    case "label_removed": {
      return `${actorPrefix}removed the ${payload.labelName} label.`;
    }
    default: {
      return describeJobActivity(actorName, payload);
    }
  }
}
