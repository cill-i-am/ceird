import type { JobDetailResponse, UserIdType } from "@ceird/jobs-core";

import { formatDetailDateTime } from "./jobs-detail-formatting";

export function JobCommentsList({
  comments,
  lookup,
}: {
  readonly comments: JobDetailResponse["comments"];
  readonly lookup: {
    readonly memberById: ReadonlyMap<UserIdType, { readonly name: string }>;
  };
}) {
  return (
    <ul className="flex flex-col gap-3">
      {comments.map((comment) => {
        const author = lookup.memberById.get(comment.authorUserId);

        return (
          <li
            key={comment.id}
            className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {comment.authorName ?? author?.name ?? "Team member"}
                </span>
                <span>{formatDetailDateTime(comment.createdAt)}</span>
              </div>
              <p className="text-sm leading-7 whitespace-pre-wrap">
                {comment.body}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
