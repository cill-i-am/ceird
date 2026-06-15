import {
  ProductActorSchema,
  UserId as UserIdSchema,
} from "@ceird/identity-core";
import type {
  OrganizationId,
  ProductActor,
  ProductActorId,
  UserId,
} from "@ceird/identity-core";
import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { generateProductActorId } from "./id-generation.js";

interface ProductActorRow {
  readonly display_detail: string | null;
  readonly display_name: string;
  readonly id: string;
  readonly kind: string;
  readonly route_href: string | null;
  readonly route_label: string | null;
}

interface MemberSourceRow extends ProductActorRow {
  readonly source_user_id: string;
}

export interface ResolveMemberActorInput {
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
}

const decodeProductActor = Schema.decodeUnknownSync(ProductActorSchema);
const decodeUserId = Schema.decodeUnknownSync(UserIdSchema);

export class ProductActivityActorsRepository extends Context.Service<ProductActivityActorsRepository>()(
  "@ceird/domains/activity/ProductActivityActorsRepository",
  {
    make: Effect.gen(function* ProductActivityActorsRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const ensureMemberActor = Effect.fn(
        "ProductActivityActorsRepository.ensureMemberActor"
      )(function* (input: ResolveMemberActorInput) {
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          input.organizationId
        );
        yield* Effect.annotateCurrentSpan("userId", input.userId);

        const actorId = generateProductActorId();
        const rows = yield* sql<MemberSourceRow>`
          with source_user as (
            select
              "user".id as source_user_id,
              coalesce(nullif(trim("user".name), ''), 'Team member') as display_name
            from "user"
            inner join member
              on member.user_id = "user".id
            where member.organization_id = ${input.organizationId}
              and member.user_id = ${input.userId}
            limit 1
          ),
          existing_actor as (
            update product_activity_actors
            set
              display_name = source_user.display_name,
              display_detail = 'Team member',
              route_href = null,
              route_label = null,
              updated_at = now()
            from product_activity_actor_sources, source_user
            where product_activity_actor_sources.organization_id = ${input.organizationId}
              and product_activity_actor_sources.kind = 'member'
              and product_activity_actor_sources.user_id = ${input.userId}
              and product_activity_actors.id = product_activity_actor_sources.actor_id
              and product_activity_actors.organization_id = product_activity_actor_sources.organization_id
            returning
              product_activity_actors.id,
              product_activity_actors.kind,
              product_activity_actors.display_name,
              product_activity_actors.display_detail,
              product_activity_actors.route_href,
              product_activity_actors.route_label,
              source_user.source_user_id
          ),
          inserted_actor as (
            insert into product_activity_actors (
              id,
              organization_id,
              kind,
              display_name,
              display_detail
            )
            select
              ${actorId},
              ${input.organizationId},
              'member',
              source_user.display_name,
              'Team member'
            from source_user
            where not exists (select 1 from existing_actor)
            returning
              id,
              kind,
              display_name,
              display_detail,
              route_href,
              route_label
          ),
          inserted_actor_with_source as (
            select
              inserted_actor.id,
              inserted_actor.kind,
              inserted_actor.display_name,
              inserted_actor.display_detail,
              inserted_actor.route_href,
              inserted_actor.route_label,
              source_user.source_user_id
            from inserted_actor
            cross join source_user
          ),
          inserted_source as (
            insert into product_activity_actor_sources (
              actor_id,
              organization_id,
              kind,
              user_id
            )
            select
              inserted_actor_with_source.id,
              ${input.organizationId},
              'member',
              inserted_actor_with_source.source_user_id
            from inserted_actor_with_source
            on conflict do nothing
            returning actor_id
          )
          select * from existing_actor
          union all
          select * from inserted_actor_with_source
        `;

        const row = yield* getRequiredRow(rows, "product activity actor");
        yield* Effect.annotateCurrentSpan("productActorId", row.id);

        return {
          actor: mapProductActorRow(row),
          sourceUserId: decodeUserId(row.source_user_id),
        };
      });

      const getById = Effect.fn("ProductActivityActorsRepository.getById")(
        function* (organizationId: OrganizationId, actorId: ProductActorId) {
          const rows = yield* sql<ProductActorRow>`
            select
              id,
              kind,
              display_name,
              display_detail,
              route_href,
              route_label
            from product_activity_actors
            where organization_id = ${organizationId}
              and id = ${actorId}
            limit 1
          `;

          return rows[0] === undefined
            ? undefined
            : mapProductActorRow(rows[0]);
        }
      );

      return {
        ensureMemberActor,
        getById,
      };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    ProductActivityActorsRepository,
    ProductActivityActorsRepository.make
  );
  static readonly Default =
    ProductActivityActorsRepository.DefaultWithoutDependencies;
}

function mapProductActorRow(row: ProductActorRow): ProductActor {
  return decodeProductActor({
    displayDetail: nullableToUndefined(row.display_detail),
    displayName: row.display_name,
    id: row.id,
    kind: row.kind,
    route:
      row.route_href === null || row.route_label === null
        ? undefined
        : {
            href: row.route_href,
            label: row.route_label,
          },
  });
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
