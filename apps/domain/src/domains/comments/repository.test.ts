import { randomUUID } from "node:crypto";

import { OrganizationId, UserId } from "@ceird/identity-core";
import { SiteId } from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import type { Pool } from "pg";

import { AppEffectSqlRuntimeLive } from "../../platform/database/database.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../../platform/database/test-database.js";
import {
  configProviderFromMap,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import { CommentsRepository } from "./repository.js";

const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const decodeUserId = Schema.decodeUnknownSync(UserId);

describe("comments repository", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("writes site comments to a product-safe Electric projection", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "site_comments_projection",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Comments integration database unavailable; skipping site comment projection coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`site_comment_actor_${Date.now()}`);
    const siteId = decodeSiteId(randomUUID());

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Site Comment Projection",
      });
      await seedUser(pool, {
        id: userId,
        name: "Taylor Sites",
      });
      await seedMember(pool, {
        organizationId,
        role: "member",
        userId,
      });
      await seedSite(pool, {
        id: siteId,
        name: "Projection Yard",
        organizationId,
      });
    });

    const comment = await runCommentsRepositoryEffect(
      testDatabase.url,
      CommentsRepository.addForSite({
        authorUserId: userId,
        body: "Projection body stays safe.",
        organizationId,
        siteId,
      })
    );

    expect(Option.isSome(comment)).toBeTruthy();
    if (Option.isNone(comment)) {
      throw new Error("Expected site comment insert to succeed");
    }
    expect(comment.value).not.toHaveProperty("authorUserId");
    expect(comment.value).not.toHaveProperty("updatedByUserId");

    await withPool(testDatabase.url, async (pool) => {
      const rawUserColumns = await pool.query<{ column_name: string }>(
        `select column_name
         from information_schema.columns
         where table_name = 'site_comment_bodies'
           and column_name in ('author_user_id', 'updated_by_user_id')`
      );
      const projection = await pool.query<{
        actor_id: string;
        body: string;
        id: string;
        organization_id: string;
      }>(
        `select id, organization_id, actor_id, body
         from site_comment_bodies
         where organization_id = $1
           and id = $2`,
        [organizationId, comment.value.id]
      );

      expect(rawUserColumns.rows).toStrictEqual([]);
      expect(projection.rows).toStrictEqual([
        {
          actor_id: comment.value.actorId,
          body: "Projection body stays safe.",
          id: comment.value.id,
          organization_id: organizationId,
        },
      ]);
    });
  });
});

async function seedOrganization(
  pool: Pool,
  input: { readonly id: string; readonly name: string }
) {
  await pool.query(
    `insert into organization (id, name, slug, created_at)
     values ($1, $2, $3, now())`,
    [
      input.id,
      input.name,
      `${input.name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()
        .replaceAll("-", "")
        .slice(0, 12)}`,
    ]
  );
}

async function seedUser(
  pool: Pool,
  input: { readonly id: string; readonly name: string }
) {
  await pool.query(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1, $2, $3, true, now(), now())`,
    [input.id, input.name, `${input.id}@example.com`]
  );
}

async function seedMember(
  pool: Pool,
  input: {
    readonly organizationId: string;
    readonly role: "admin" | "external" | "member" | "owner";
    readonly userId: string;
  }
) {
  await pool.query(
    `insert into member (id, organization_id, user_id, role, created_at)
     values ($1, $2, $3, $4, now())`,
    [`member_${randomUUID()}`, input.organizationId, input.userId, input.role]
  );
}

async function seedSite(
  pool: Pool,
  input: {
    readonly id: string;
    readonly name: string;
    readonly organizationId: string;
  }
) {
  await pool.query(
    `insert into sites (
       id,
       organization_id,
       name,
       display_location,
       location_status,
       created_at,
       updated_at
     )
     values ($1, $2, $3, $4, 'unverified', now(), now())`,
    [input.id, input.organizationId, input.name, input.name]
  );
}

async function runCommentsRepositoryEffect<Value, Error, Requirements>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, Requirements>
): Promise<Value> {
  return await Effect.runPromise(
    Effect.scoped(
      effect.pipe(
        Effect.provide(CommentsRepository.Default),
        Effect.provide(AppEffectSqlRuntimeLive),
        withConfigProvider(
          configProviderFromMap(new Map([["DATABASE_URL", databaseUrl]]))
        )
      ) as Effect.Effect<Value, Error, never>
    )
  );
}
