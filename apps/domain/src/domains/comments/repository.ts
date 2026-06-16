import type {
  JobComment,
  OrganizationId,
  UserId,
  WorkItemId,
} from "@ceird/jobs-core";
import { JobCommentSchema } from "@ceird/jobs-core";
import { SiteCommentSchema } from "@ceird/sites-core";
import type { SiteComment, SiteIdType as SiteId } from "@ceird/sites-core";
import { Layer, Context, Effect, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { ProductActivityActorsRepository } from "../activity/repository.js";
import { generateCommentId } from "./id-generation.js";

interface WorkItemCommentRow {
  readonly actor_display_detail: string | null;
  readonly actor_display_name: string | null;
  readonly actor_id: string | null;
  readonly actor_kind: string | null;
  readonly actor_route_href: string | null;
  readonly actor_route_label: string | null;
  readonly author_user_id: string;
  readonly body: string;
  readonly created_at: Date;
  readonly id: string;
  readonly work_item_id: string;
}

interface SiteCommentRow {
  readonly actor_display_detail: string | null;
  readonly actor_display_name: string | null;
  readonly actor_id: string | null;
  readonly actor_kind: string | null;
  readonly actor_route_href: string | null;
  readonly actor_route_label: string | null;
  readonly author_user_id: string;
  readonly body: string;
  readonly created_at: Date;
  readonly id: string;
  readonly site_id: string;
}

interface SiteCommentTargetRow {
  readonly actor_display_detail: string | null;
  readonly actor_display_name: string | null;
  readonly actor_id: string | null;
  readonly actor_kind: string | null;
  readonly actor_route_href: string | null;
  readonly actor_route_label: string | null;
  readonly author_user_id: string | null;
  readonly body: string | null;
  readonly created_at: Date | null;
  readonly id: string | null;
  readonly site_id: string | null;
  readonly target_site_id: string;
}

export interface AddWorkItemCommentInput {
  readonly authorUserId: UserId;
  readonly body: string;
  readonly organizationId: OrganizationId;
  readonly workItemId: WorkItemId;
}

export interface AddSiteCommentInput {
  readonly authorUserId: UserId;
  readonly body: string;
  readonly organizationId: OrganizationId;
  readonly siteId: SiteId;
}

const decodeJobComment = Schema.decodeUnknownSync(JobCommentSchema);
const decodeSiteComment = Schema.decodeUnknownSync(SiteCommentSchema);

export class CommentsRepository extends Context.Service<CommentsRepository>()(
  "@ceird/domains/comments/CommentsRepository",
  {
    make: Effect.gen(function* CommentsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;
      const actors = yield* ProductActivityActorsRepository;

      const withTransaction = Effect.fn("CommentsRepository.withTransaction")(
        <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => sql.withTransaction(effect)
      );

      const listForWorkItem = Effect.fn("CommentsRepository.listForWorkItem")(
        function* (organizationId: OrganizationId, workItemId: WorkItemId) {
          yield* Effect.annotateCurrentSpan("organizationId", organizationId);
          yield* Effect.annotateCurrentSpan("workItemId", workItemId);

          const rows = yield* sql<WorkItemCommentRow>`
          select
            comments.id,
            comments.author_user_id,
            comments.body,
            comments.created_at,
            work_item_comments.work_item_id,
            product_activity_actors.id as actor_id,
            product_activity_actors.kind as actor_kind,
            product_activity_actors.display_name as actor_display_name,
            product_activity_actors.display_detail as actor_display_detail,
            product_activity_actors.route_href as actor_route_href,
            product_activity_actors.route_label as actor_route_label
          from work_item_comments
          inner join comments
            on comments.id = work_item_comments.comment_id
            and comments.organization_id = work_item_comments.organization_id
          left join product_activity_actor_sources member_actor_sources
            on comments.actor_id is null
            and member_actor_sources.organization_id = comments.organization_id
            and member_actor_sources.kind = 'member'
            and member_actor_sources.user_id = comments.author_user_id
          left join product_activity_actors
            on product_activity_actors.id = coalesce(
              comments.actor_id,
              member_actor_sources.actor_id
            )
            and product_activity_actors.organization_id = comments.organization_id
          where work_item_comments.organization_id = ${organizationId}
            and work_item_comments.work_item_id = ${workItemId}
          order by work_item_comments.created_at asc, work_item_comments.comment_id asc
        `;

          yield* Effect.annotateCurrentSpan("resultCount", rows.length);

          return rows.map((row) => mapWorkItemCommentRow(row));
        }
      );

      const addForWorkItem = Effect.fn("CommentsRepository.addForWorkItem")(
        function* (input: AddWorkItemCommentInput) {
          yield* Effect.annotateCurrentSpan(
            "organizationId",
            input.organizationId
          );
          yield* Effect.annotateCurrentSpan("workItemId", input.workItemId);
          yield* Effect.annotateCurrentSpan("authorUserId", input.authorUserId);
          const { actor } = yield* actors.ensureMemberActor({
            organizationId: input.organizationId,
            userId: input.authorUserId,
          });

          const rows = yield* sql<WorkItemCommentRow>`
          with inserted_comment as (
            insert into comments ${sql
              .insert({
                actor_id: actor.id,
                author_user_id: input.authorUserId,
                body: input.body,
                id: generateCommentId(),
                organization_id: input.organizationId,
              })
              .returning("*")}
          ),
          inserted_ownership as (
            insert into work_item_comments (
              comment_id,
              organization_id,
              work_item_id
            )
            select
              inserted_comment.id,
              inserted_comment.organization_id,
              ${input.workItemId}
            from inserted_comment
            returning *
          ),
          inserted_body as (
            insert into work_item_comment_bodies (
              id,
              organization_id,
              actor_id,
              body,
              created_at,
              updated_at
            )
            select
              inserted_comment.id,
              inserted_comment.organization_id,
              inserted_comment.actor_id,
              inserted_comment.body,
              inserted_comment.created_at,
              inserted_comment.updated_at
            from inserted_comment
            returning *
          )
          select
            inserted_comment.id,
            inserted_comment.author_user_id,
            inserted_comment.body,
            inserted_comment.created_at,
            inserted_ownership.work_item_id,
            product_activity_actors.id as actor_id,
            product_activity_actors.kind as actor_kind,
            product_activity_actors.display_name as actor_display_name,
            product_activity_actors.display_detail as actor_display_detail,
            product_activity_actors.route_href as actor_route_href,
            product_activity_actors.route_label as actor_route_label
          from inserted_comment
          inner join inserted_ownership
            on inserted_ownership.comment_id = inserted_comment.id
          inner join inserted_body
            on inserted_body.id = inserted_comment.id
            and inserted_body.organization_id = inserted_comment.organization_id
          left join product_activity_actors
            on product_activity_actors.id = inserted_comment.actor_id
            and product_activity_actors.organization_id = inserted_comment.organization_id
        `;

          const row = yield* getRequiredRow(rows, "inserted work item comment");
          yield* Effect.annotateCurrentSpan("commentId", row.id);

          return mapWorkItemCommentRow(row);
        }
      );

      const listForSite = Effect.fn("CommentsRepository.listForSite")(
        function* (organizationId: OrganizationId, siteId: SiteId) {
          yield* Effect.annotateCurrentSpan("organizationId", organizationId);
          yield* Effect.annotateCurrentSpan("siteId", siteId);

          const rows = yield* sql<SiteCommentRow>`
            select
              comments.id,
              comments.author_user_id,
              comments.body,
              comments.created_at,
              site_comments.site_id,
              product_activity_actors.id as actor_id,
              product_activity_actors.kind as actor_kind,
              product_activity_actors.display_name as actor_display_name,
              product_activity_actors.display_detail as actor_display_detail,
              product_activity_actors.route_href as actor_route_href,
              product_activity_actors.route_label as actor_route_label
            from site_comments
            inner join comments
              on comments.id = site_comments.comment_id
              and comments.organization_id = site_comments.organization_id
            left join product_activity_actor_sources member_actor_sources
              on comments.actor_id is null
              and member_actor_sources.organization_id = comments.organization_id
              and member_actor_sources.kind = 'member'
              and member_actor_sources.user_id = comments.author_user_id
            left join product_activity_actors
              on product_activity_actors.id = coalesce(
                comments.actor_id,
                member_actor_sources.actor_id
              )
              and product_activity_actors.organization_id = comments.organization_id
            where site_comments.organization_id = ${organizationId}
              and site_comments.site_id = ${siteId}
            order by site_comments.created_at asc, site_comments.comment_id asc
          `;

          yield* Effect.annotateCurrentSpan("resultCount", rows.length);

          return rows.map((row) => mapSiteCommentRow(row));
        }
      );

      const listForExistingSite = Effect.fn(
        "CommentsRepository.listForExistingSite"
      )(function* (organizationId: OrganizationId, siteId: SiteId) {
        yield* Effect.annotateCurrentSpan("organizationId", organizationId);
        yield* Effect.annotateCurrentSpan("siteId", siteId);

        const rows = yield* sql<SiteCommentTargetRow>`
          with requested_site as (
            select id
            from sites
            where organization_id = ${organizationId}
              and id = ${siteId}
              and archived_at is null
          )
          select
            requested_site.id as target_site_id,
            comments.id,
            comments.author_user_id,
            comments.body,
            comments.created_at,
            site_comments.site_id,
            product_activity_actors.id as actor_id,
            product_activity_actors.kind as actor_kind,
            product_activity_actors.display_name as actor_display_name,
            product_activity_actors.display_detail as actor_display_detail,
            product_activity_actors.route_href as actor_route_href,
            product_activity_actors.route_label as actor_route_label
          from requested_site
          left join site_comments
            on site_comments.organization_id = ${organizationId}
            and site_comments.site_id = requested_site.id
          left join comments
            on comments.id = site_comments.comment_id
            and comments.organization_id = site_comments.organization_id
          left join product_activity_actor_sources member_actor_sources
            on comments.actor_id is null
            and member_actor_sources.organization_id = comments.organization_id
            and member_actor_sources.kind = 'member'
            and member_actor_sources.user_id = comments.author_user_id
          left join product_activity_actors
            on product_activity_actors.id = coalesce(
              comments.actor_id,
              member_actor_sources.actor_id
            )
            and product_activity_actors.organization_id = comments.organization_id
          order by site_comments.created_at asc nulls last,
            site_comments.comment_id asc nulls last
        `;

        if (rows[0]?.target_site_id === undefined) {
          yield* Effect.annotateCurrentSpan("targetExists", false);
          yield* Effect.annotateCurrentSpan("resultCount", 0);

          return Option.none<readonly SiteComment[]>();
        }

        const comments = rows.flatMap((row) =>
          Option.match(mapNullableSiteCommentRow(row), {
            onNone: () => [],
            onSome: (comment) => [comment],
          })
        );

        yield* Effect.annotateCurrentSpan("targetExists", true);
        yield* Effect.annotateCurrentSpan("resultCount", comments.length);

        return Option.some(comments);
      });

      const addForSite = Effect.fn("CommentsRepository.addForSite")(function* (
        input: AddSiteCommentInput
      ) {
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          input.organizationId
        );
        yield* Effect.annotateCurrentSpan("siteId", input.siteId);
        yield* Effect.annotateCurrentSpan("authorUserId", input.authorUserId);
        const { actor } = yield* actors.ensureMemberActor({
          organizationId: input.organizationId,
          userId: input.authorUserId,
        });

        const commentId = generateCommentId();
        const rows = yield* sql<SiteCommentRow>`
          with active_site as (
            select id, organization_id
            from sites
            where organization_id = ${input.organizationId}
              and id = ${input.siteId}
              and archived_at is null
            for update
          ),
          inserted_comment as (
            insert into comments (
              id,
              organization_id,
              actor_id,
              author_user_id,
              body
            )
            select
              ${commentId},
              active_site.organization_id,
              ${actor.id},
              ${input.authorUserId},
              ${input.body}
            from active_site
            returning *
          ),
          inserted_ownership as (
            insert into site_comments (
              comment_id,
              organization_id,
              site_id
            )
            select
              inserted_comment.id,
              inserted_comment.organization_id,
              ${input.siteId}
            from inserted_comment
            returning *
          ),
          inserted_body as (
            insert into site_comment_bodies (
              id,
              organization_id,
              actor_id,
              body,
              created_at,
              updated_at
            )
            select
              inserted_comment.id,
              inserted_comment.organization_id,
              inserted_comment.actor_id,
              inserted_comment.body,
              inserted_comment.created_at,
              inserted_comment.updated_at
            from inserted_comment
            returning *
          )
          select
            inserted_comment.id,
            inserted_comment.author_user_id,
            inserted_comment.body,
            inserted_comment.created_at,
            inserted_ownership.site_id,
            product_activity_actors.id as actor_id,
            product_activity_actors.kind as actor_kind,
            product_activity_actors.display_name as actor_display_name,
            product_activity_actors.display_detail as actor_display_detail,
            product_activity_actors.route_href as actor_route_href,
            product_activity_actors.route_label as actor_route_label
          from inserted_comment
          inner join inserted_ownership
            on inserted_ownership.comment_id = inserted_comment.id
          inner join inserted_body
            on inserted_body.id = inserted_comment.id
            and inserted_body.organization_id = inserted_comment.organization_id
          left join product_activity_actors
            on product_activity_actors.id = inserted_comment.actor_id
            and product_activity_actors.organization_id = inserted_comment.organization_id
        `;

        const [row] = rows;

        if (row === undefined) {
          yield* Effect.annotateCurrentSpan("targetExists", false);

          return Option.none<SiteComment>();
        }

        yield* Effect.annotateCurrentSpan("targetExists", true);
        yield* Effect.annotateCurrentSpan("commentId", row.id);

        return Option.some(mapSiteCommentRow(row));
      });

      return {
        addForSite,
        addForWorkItem,
        listForExistingSite,
        listForSite,
        listForWorkItem,
        withTransaction,
      };
    }),
  }
) {
  static readonly addForSite = (
    ...args: Parameters<
      Context.Service.Shape<typeof CommentsRepository>["addForSite"]
    >
  ) => CommentsRepository.use((service) => service.addForSite(...args));
  static readonly addForWorkItem = (
    ...args: Parameters<
      Context.Service.Shape<typeof CommentsRepository>["addForWorkItem"]
    >
  ) => CommentsRepository.use((service) => service.addForWorkItem(...args));
  static readonly listForSite = (
    ...args: Parameters<
      Context.Service.Shape<typeof CommentsRepository>["listForSite"]
    >
  ) => CommentsRepository.use((service) => service.listForSite(...args));
  static readonly listForExistingSite = (
    ...args: Parameters<
      Context.Service.Shape<typeof CommentsRepository>["listForExistingSite"]
    >
  ) =>
    CommentsRepository.use((service) => service.listForExistingSite(...args));
  static readonly listForWorkItem = (
    ...args: Parameters<
      Context.Service.Shape<typeof CommentsRepository>["listForWorkItem"]
    >
  ) => CommentsRepository.use((service) => service.listForWorkItem(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    CommentsRepository,
    CommentsRepository.make
  );
  static readonly Default = CommentsRepository.DefaultWithoutDependencies.pipe(
    Layer.provide(ProductActivityActorsRepository.Default)
  );
}

function mapWorkItemCommentRow(row: WorkItemCommentRow): JobComment {
  const actor = mapProductActorProjection(row);
  return decodeJobComment({
    actor,
    authorName: actor?.displayName,
    authorUserId: row.author_user_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    workItemId: row.work_item_id,
  });
}

function mapSiteCommentRow(row: SiteCommentRow): SiteComment {
  const actor = mapProductActorProjection(row);
  return decodeSiteComment({
    actor,
    actorId: actor?.id,
    authorName: actor?.displayName,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    siteId: row.site_id,
  });
}

function mapNullableSiteCommentRow(
  row: SiteCommentTargetRow
): Option.Option<SiteComment> {
  if (
    row.id === null ||
    row.author_user_id === null ||
    row.body === null ||
    row.created_at === null ||
    row.site_id === null
  ) {
    return Option.none();
  }

  return Option.some(
    mapSiteCommentRow({
      actor_display_detail: row.actor_display_detail,
      actor_display_name: row.actor_display_name,
      actor_id: row.actor_id,
      actor_kind: row.actor_kind,
      actor_route_href: row.actor_route_href,
      actor_route_label: row.actor_route_label,
      author_user_id: row.author_user_id,
      body: row.body,
      created_at: row.created_at,
      id: row.id,
      site_id: row.site_id,
    })
  );
}

function mapProductActorProjection(
  row:
    | Pick<
        WorkItemCommentRow,
        | "actor_display_detail"
        | "actor_display_name"
        | "actor_id"
        | "actor_kind"
        | "actor_route_href"
        | "actor_route_label"
      >
    | Pick<
        SiteCommentRow,
        | "actor_display_detail"
        | "actor_display_name"
        | "actor_id"
        | "actor_kind"
        | "actor_route_href"
        | "actor_route_label"
      >
) {
  if (
    row.actor_id === null ||
    row.actor_kind === null ||
    row.actor_display_name === null
  ) {
    return;
  }

  return {
    displayDetail: nullableToUndefined(row.actor_display_detail),
    displayName: row.actor_display_name,
    id: row.actor_id,
    kind: row.actor_kind,
    route:
      row.actor_route_href === null || row.actor_route_label === null
        ? undefined
        : {
            href: row.actor_route_href,
            label: row.actor_route_label,
          },
  };
}

function nullableToUndefined<Value>(value: Value | null): Value | undefined {
  return value === null ? undefined : value;
}

function getRequiredRow<Row>(
  rows: readonly Row[],
  label: string
): Effect.Effect<Row> {
  const [row] = rows;

  return row === undefined
    ? Effect.die(new Error(`Expected ${label}`))
    : Effect.succeed(row);
}
