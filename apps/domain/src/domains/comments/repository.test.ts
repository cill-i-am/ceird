import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";

import { OrganizationId, UserId } from "@ceird/identity-core";
import { WorkItemId } from "@ceird/jobs-core";
import { SiteId } from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import type { Pool } from "pg";

import { AppEffectSqlRuntimeLive } from "../../platform/database/database.js";
import {
  applyAllMigrations,
  applyMigration,
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
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);
const SITE_COMMENT_BODIES_MIGRATION = "20260616111854_fat_black_bird";
const NULL_ACTOR_BACKFILL_MIGRATION = "20260616120807_wakeful_ezekiel";

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

  it("writes work item comments to a product-safe Electric projection", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "work_item_comments_projection",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Comments integration database unavailable; skipping work item comment projection coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`work_item_comment_actor_${Date.now()}`);
    const workItemId = decodeWorkItemId(randomUUID());

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Work Item Comment Projection",
      });
      await seedUser(pool, {
        id: userId,
        name: "Taylor Jobs",
      });
      await seedMember(pool, {
        organizationId,
        role: "member",
        userId,
      });
      await seedWorkItem(pool, {
        createdByUserId: userId,
        id: workItemId,
        organizationId,
        title: "Projection job",
      });
    });

    const comment = await runCommentsRepositoryEffect(
      testDatabase.url,
      CommentsRepository.addForWorkItem({
        authorUserId: userId,
        body: "Work item projection body stays safe.",
        organizationId,
        workItemId,
      })
    );

    expect(comment).not.toHaveProperty("authorUserId");
    expect(comment).not.toHaveProperty("updatedByUserId");
    expect(comment.actorId).toBe(comment.actor?.id);

    await withPool(testDatabase.url, async (pool) => {
      const rawUserColumns = await pool.query<{ column_name: string }>(
        `select column_name
         from information_schema.columns
         where table_name = 'work_item_comment_bodies'
           and column_name in ('author_user_id', 'updated_by_user_id')`
      );
      const projection = await pool.query<{
        actor_id: string;
        body: string;
        id: string;
        organization_id: string;
      }>(
        `select id, organization_id, actor_id, body
         from work_item_comment_bodies
         where organization_id = $1
           and id = $2`,
        [organizationId, comment.id]
      );

      expect(rawUserColumns.rows).toStrictEqual([]);
      expect(projection.rows).toStrictEqual([
        {
          actor_id: comment.actor?.id,
          body: "Work item projection body stays safe.",
          id: comment.id,
          organization_id: organizationId,
        },
      ]);
    });
  });

  it("backfills null-actor comments into safe site and work item projections", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "null_actor_comment_projection",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Comments integration database unavailable; skipping null actor comment backfill coverage"
      );
    }

    await applyMigrationsBefore(
      testDatabase.url,
      NULL_ACTOR_BACKFILL_MIGRATION
    );

    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`null_actor_comment_${Date.now()}`);
    const siteId = decodeSiteId(randomUUID());
    const workItemId = decodeWorkItemId(randomUUID());
    const siteCommentId = randomUUID();
    const workItemCommentId = randomUUID();

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Null Actor Projection",
      });
      await seedUser(pool, {
        id: userId,
        name: "Taylor Existing",
      });
      await seedMember(pool, {
        organizationId,
        role: "member",
        userId,
      });
      await seedSite(pool, {
        id: siteId,
        name: "Existing Site",
        organizationId,
      });
      await seedWorkItem(pool, {
        createdByUserId: userId,
        id: workItemId,
        organizationId,
        title: "Existing job",
      });
      await seedNullActorSiteComment(pool, {
        body: "Existing site comment",
        commentId: siteCommentId,
        organizationId,
        siteId,
        userId,
      });
      await seedNullActorWorkItemComment(pool, {
        body: "Existing work item comment",
        commentId: workItemCommentId,
        organizationId,
        workItemId,
        userId,
      });
    });

    await applyMigration(testDatabase.url, NULL_ACTOR_BACKFILL_MIGRATION);

    await withPool(testDatabase.url, async (pool) => {
      const comments = await pool.query<{
        actor_id: string | null;
        id: string;
      }>(
        `select id, actor_id
         from comments
         where organization_id = $1
           and id in ($2, $3)
         order by id`,
        [organizationId, siteCommentId, workItemCommentId]
      );
      const siteProjection = await pool.query<{
        actor_id: string;
        body: string;
        id: string;
      }>(
        `select id, actor_id, body
         from site_comment_bodies
         where organization_id = $1
           and id = $2`,
        [organizationId, siteCommentId]
      );
      const workItemProjection = await pool.query<{
        actor_id: string;
        body: string;
        id: string;
      }>(
        `select id, actor_id, body
         from work_item_comment_bodies
         where organization_id = $1
           and id = $2`,
        [organizationId, workItemCommentId]
      );

      expect(comments.rows).toHaveLength(2);
      expect(comments.rows.every((row) => row.actor_id !== null)).toBeTruthy();
      expect(siteProjection.rows).toStrictEqual([
        {
          actor_id: comments.rows.find((row) => row.id === siteCommentId)
            ?.actor_id,
          body: "Existing site comment",
          id: siteCommentId,
        },
      ]);
      expect(workItemProjection.rows).toStrictEqual([
        {
          actor_id: comments.rows.find((row) => row.id === workItemCommentId)
            ?.actor_id,
          body: "Existing work item comment",
          id: workItemCommentId,
        },
      ]);
    });

    const comments = await runCommentsRepositoryEffect(
      testDatabase.url,
      CommentsRepository.listForExistingSite(organizationId, siteId)
    );

    expect(Option.isSome(comments)).toBeTruthy();
    if (Option.isNone(comments)) {
      throw new Error("Expected migrated site comments to decode");
    }
    expect(comments.value).toMatchObject([
      {
        actorId: expect.any(String),
        body: "Existing site comment",
        id: siteCommentId,
      },
    ]);
  });

  it("backfills historical site comments whose author no longer has a member row", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "orphan_site_comment_actor",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Comments integration database unavailable; skipping orphaned author actor backfill coverage"
      );
    }

    await applyMigrationsBefore(
      testDatabase.url,
      NULL_ACTOR_BACKFILL_MIGRATION
    );

    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`orphan_site_comment_${Date.now()}`);
    const siteId = decodeSiteId(randomUUID());
    const siteCommentId = randomUUID();

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Orphan Site Comment Actor",
      });
      await seedUser(pool, {
        id: userId,
        name: "Taylor Former",
      });
      await seedMember(pool, {
        organizationId,
        role: "member",
        userId,
      });
      await seedSite(pool, {
        id: siteId,
        name: "Former Author Site",
        organizationId,
      });
      await seedNullActorSiteComment(pool, {
        body: "Existing comment from former member",
        commentId: siteCommentId,
        organizationId,
        siteId,
        userId,
      });

      await pool.query(
        `delete from member
         where organization_id = $1
           and user_id = $2`,
        [organizationId, userId]
      );
    });

    await applyMigration(testDatabase.url, NULL_ACTOR_BACKFILL_MIGRATION);

    await withPool(testDatabase.url, async (pool) => {
      const repaired = await pool.query<{
        actor_display_detail: string;
        actor_display_name: string;
        actor_id: string;
        actor_kind: string;
        body_actor_id: string;
        source_system_key: string;
        source_user_id: string | null;
      }>(
        `select
           comments.actor_id,
           site_comment_bodies.actor_id as body_actor_id,
           product_activity_actors.kind as actor_kind,
           product_activity_actors.display_name as actor_display_name,
           product_activity_actors.display_detail as actor_display_detail,
           product_activity_actor_sources.user_id as source_user_id,
           product_activity_actor_sources.system_key as source_system_key
         from comments
         inner join site_comment_bodies
           on site_comment_bodies.id = comments.id
           and site_comment_bodies.organization_id = comments.organization_id
         inner join product_activity_actors
           on product_activity_actors.id = comments.actor_id
           and product_activity_actors.organization_id = comments.organization_id
         inner join product_activity_actor_sources
           on product_activity_actor_sources.actor_id = comments.actor_id
           and product_activity_actor_sources.organization_id = comments.organization_id
         where comments.organization_id = $1
           and comments.id = $2`,
        [organizationId, siteCommentId]
      );

      expect(repaired.rows).toStrictEqual([
        {
          actor_display_detail: "Comment author unavailable",
          actor_display_name: "Former team member",
          actor_id: expect.any(String),
          actor_kind: "system",
          body_actor_id: repaired.rows[0]?.actor_id,
          source_system_key: "legacy-comment-author",
          source_user_id: null,
        },
      ]);
    });

    const comments = await runCommentsRepositoryEffect(
      testDatabase.url,
      CommentsRepository.listForExistingSite(organizationId, siteId)
    );

    expect(Option.isSome(comments)).toBeTruthy();
    if (Option.isNone(comments)) {
      throw new Error("Expected orphan-author site comments to decode");
    }
    expect(comments.value).toMatchObject([
      {
        actor: {
          displayDetail: "Comment author unavailable",
          displayName: "Former team member",
          kind: "system",
        },
        actorId: expect.any(String),
        body: "Existing comment from former member",
        id: siteCommentId,
      },
    ]);
  });

  it("creates the safe site projection when a preview stage missed the earlier projection migration", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "missing_site_projection_repair",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Comments integration database unavailable; skipping missing site projection repair coverage"
      );
    }

    await applyMigrationsBefore(
      testDatabase.url,
      SITE_COMMENT_BODIES_MIGRATION
    );

    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`missing_site_projection_${Date.now()}`);
    const siteId = decodeSiteId(randomUUID());
    const siteCommentId = randomUUID();

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Missing Site Projection Repair",
      });
      await seedUser(pool, {
        id: userId,
        name: "Taylor Repair",
      });
      await seedMember(pool, {
        organizationId,
        role: "member",
        userId,
      });
      await seedSite(pool, {
        id: siteId,
        name: "Repair Site",
        organizationId,
      });
      await seedNullActorSiteComment(pool, {
        body: "Repair existing site comment",
        commentId: siteCommentId,
        organizationId,
        siteId,
        userId,
      });
    });

    await applyMigration(testDatabase.url, NULL_ACTOR_BACKFILL_MIGRATION);

    await withPool(testDatabase.url, async (pool) => {
      const projection = await pool.query<{
        actor_id: string;
        body: string;
        id: string;
      }>(
        `select id, actor_id, body
         from site_comment_bodies
         where organization_id = $1
           and id = $2`,
        [organizationId, siteCommentId]
      );

      expect(projection.rows).toStrictEqual([
        {
          actor_id: expect.any(String),
          body: "Repair existing site comment",
          id: siteCommentId,
        },
      ]);
    });
  });

  it("retries the first site projection migration after partial DDL application", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "partial_site_projection_retry",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Comments integration database unavailable; skipping partial site projection retry coverage"
      );
    }

    await applyMigrationsBefore(
      testDatabase.url,
      SITE_COMMENT_BODIES_MIGRATION
    );

    const actorId = randomUUID();
    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`partial_site_projection_${Date.now()}`);
    const siteId = decodeSiteId(randomUUID());
    const siteCommentId = randomUUID();

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Partial Site Projection Retry",
      });
      await seedUser(pool, {
        id: userId,
        name: "Taylor Retry",
      });
      await seedMember(pool, {
        organizationId,
        role: "member",
        userId,
      });
      await seedSite(pool, {
        id: siteId,
        name: "Retry Site",
        organizationId,
      });
      await seedProductActivityActor(pool, {
        actorId,
        displayName: "Taylor Retry",
        organizationId,
      });
      await seedSiteComment(pool, {
        actorId,
        body: "Retry-safe projection comment",
        commentId: siteCommentId,
        organizationId,
        siteId,
        userId,
      });
      await createPartialSiteCommentBodiesTable(pool);
    });

    await applyMigration(testDatabase.url, SITE_COMMENT_BODIES_MIGRATION);

    await withPool(testDatabase.url, async (pool) => {
      const projection = await pool.query<{
        actor_id: string;
        body: string;
        id: string;
      }>(
        `select id, actor_id, body
         from site_comment_bodies
         where organization_id = $1
           and id = $2`,
        [organizationId, siteCommentId]
      );
      const indexes = await pool.query<{ indexname: string }>(
        `select indexname
         from pg_indexes
         where schemaname = current_schema()
           and tablename = 'site_comment_bodies'
           and indexname in (
             'site_comment_bodies_organization_created_at_idx',
             'site_comment_bodies_actor_id_idx'
           )
         order by indexname`
      );
      const constraints = await pool.query<{ conname: string }>(
        `select conname
         from pg_constraint
         where conrelid = 'site_comment_bodies'::regclass
           and conname in (
             'site_comment_bodies_organization_id_organization_id_fkey',
             'site_comment_bodies_comment_org_fk',
             'site_comment_bodies_actor_org_fk'
           )
         order by conname`
      );

      expect(projection.rows).toStrictEqual([
        {
          actor_id: actorId,
          body: "Retry-safe projection comment",
          id: siteCommentId,
        },
      ]);
      expect(indexes.rows.map((row) => row.indexname)).toStrictEqual([
        "site_comment_bodies_actor_id_idx",
        "site_comment_bodies_organization_created_at_idx",
      ]);
      expect(constraints.rows.map((row) => row.conname)).toStrictEqual([
        "site_comment_bodies_actor_org_fk",
        "site_comment_bodies_comment_org_fk",
        "site_comment_bodies_organization_id_organization_id_fkey",
      ]);
    });
  });
});

async function applyMigrationsBefore(
  databaseUrl: string,
  stopMigration: string
) {
  const entries = await readdir("drizzle", { withFileTypes: true });
  const migrations = entries
    .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
    .map((entry) => entry.name)
    .toSorted();

  for (const migration of migrations) {
    if (migration === stopMigration) {
      return;
    }

    await applyMigration(databaseUrl, migration);
  }

  throw new Error(`Expected to find migration ${stopMigration}`);
}

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
      `org-${randomUUID().replaceAll("-", "").slice(0, 24)}`,
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

async function seedWorkItem(
  pool: Pool,
  input: {
    readonly createdByUserId: string;
    readonly id: string;
    readonly organizationId: string;
    readonly title: string;
  }
) {
  await pool.query(
    `insert into work_items (
       id,
       organization_id,
       kind,
       title,
       status,
       priority,
       created_by_user_id,
       created_at,
       updated_at
     )
     values ($1, $2, 'job', $3, 'new', 'none', $4, now(), now())`,
    [input.id, input.organizationId, input.title, input.createdByUserId]
  );
}

async function seedNullActorSiteComment(
  pool: Pool,
  input: {
    readonly body: string;
    readonly commentId: string;
    readonly organizationId: string;
    readonly siteId: string;
    readonly userId: string;
  }
) {
  await withCommentOwnershipSeedTransaction(pool, async () => {
    await insertNullActorComment(pool, input);
    await pool.query(
      `insert into site_comments (
         comment_id,
         organization_id,
         site_id,
         created_at
       )
       values ($1, $2, $3, now())`,
      [input.commentId, input.organizationId, input.siteId]
    );
  });
}

async function seedProductActivityActor(
  pool: Pool,
  input: {
    readonly actorId: string;
    readonly displayName: string;
    readonly organizationId: string;
  }
) {
  await pool.query(
    `insert into product_activity_actors (
       id,
       organization_id,
       kind,
       display_name,
       display_detail,
       created_at,
       updated_at
     )
     values ($1, $2, 'member', $3, 'Team member', now(), now())`,
    [input.actorId, input.organizationId, input.displayName]
  );
}

async function seedSiteComment(
  pool: Pool,
  input: {
    readonly actorId: string;
    readonly body: string;
    readonly commentId: string;
    readonly organizationId: string;
    readonly siteId: string;
    readonly userId: string;
  }
) {
  await withCommentOwnershipSeedTransaction(pool, async () => {
    await pool.query(
      `insert into comments (
         id,
         organization_id,
         actor_id,
         author_user_id,
         body,
         created_at,
         updated_at
       )
       values ($1, $2, $3, $4, $5, now(), now())`,
      [
        input.commentId,
        input.organizationId,
        input.actorId,
        input.userId,
        input.body,
      ]
    );
    await pool.query(
      `insert into site_comments (
         comment_id,
         organization_id,
         site_id,
         created_at
       )
       values ($1, $2, $3, now())`,
      [input.commentId, input.organizationId, input.siteId]
    );
  });
}

async function createPartialSiteCommentBodiesTable(pool: Pool) {
  await pool.query(
    `create table site_comment_bodies (
       id uuid primary key,
       organization_id text not null,
       actor_id uuid not null,
       body text not null,
       created_at timestamp with time zone default now() not null,
       updated_at timestamp with time zone default now() not null
     )`
  );
}

async function seedNullActorWorkItemComment(
  pool: Pool,
  input: {
    readonly body: string;
    readonly commentId: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly workItemId: string;
  }
) {
  await withCommentOwnershipSeedTransaction(pool, async () => {
    await insertNullActorComment(pool, input);
    await pool.query(
      `insert into work_item_comments (
         comment_id,
         organization_id,
         work_item_id,
         created_at
       )
       values ($1, $2, $3, now())`,
      [input.commentId, input.organizationId, input.workItemId]
    );
  });
}

async function insertNullActorComment(
  pool: Pool,
  input: {
    readonly body: string;
    readonly commentId: string;
    readonly organizationId: string;
    readonly userId: string;
  }
) {
  await pool.query(
    `insert into comments (
       id,
       organization_id,
       actor_id,
       author_user_id,
       body,
       created_at,
       updated_at
     )
     values ($1, $2, null, $3, $4, now(), now())`,
    [input.commentId, input.organizationId, input.userId, input.body]
  );
}

async function withCommentOwnershipSeedTransaction(
  pool: Pool,
  seed: () => Promise<void>
) {
  await pool.query("begin");
  try {
    await pool.query("set constraints all deferred");
    await seed();
    await pool.query("commit");
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
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
