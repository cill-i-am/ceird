import { randomUUID } from "node:crypto";

import {
  ContactId,
  OrganizationId,
  UserId,
  WorkItemId,
} from "@ceird/jobs-core";
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
import { ContactsRepository, JobsRepository } from "./repositories.js";

const decodeContactId = Schema.decodeUnknownSync(ContactId);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const decodeUserId = Schema.decodeUnknownSync(UserId);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);

describe("jobs repository", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("scopes external options to collaborator-visible jobs only", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping repository coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId = decodeOrganizationId(randomUUID());
    const otherOrganizationId = decodeOrganizationId(randomUUID());
    const creatorUserId = decodeUserId(`jobs_creator_${Date.now()}`);
    const externalUserId = decodeUserId(`jobs_external_${Date.now()}`);
    const visibleSiteId = decodeSiteId(randomUUID());
    const archivedSiteId = decodeSiteId(randomUUID());
    const ungrantedSiteId = decodeSiteId(randomUUID());
    const otherOrganizationSiteId = decodeSiteId(randomUUID());
    const visibleContactId = decodeContactId(randomUUID());
    const archivedContactId = decodeContactId(randomUUID());
    const ungrantedContactId = decodeContactId(randomUUID());
    const otherOrganizationContactId = decodeContactId(randomUUID());
    const visibleLabelId = randomUUID();
    const archivedLabelId = randomUUID();
    const ungrantedLabelId = randomUUID();
    const otherOrganizationLabelId = randomUUID();
    const visibleWorkItemId = decodeWorkItemId(randomUUID());
    const archivedOptionWorkItemId = decodeWorkItemId(randomUUID());
    const ungrantedWorkItemId = decodeWorkItemId(randomUUID());
    const otherOrganizationWorkItemId = decodeWorkItemId(randomUUID());

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Jobs Scoped Options",
      });
      await seedOrganization(pool, {
        id: otherOrganizationId,
        name: "Other Jobs Scoped Options",
      });
      await seedUser(pool, {
        id: creatorUserId,
        name: "Internal Creator",
      });
      await seedUser(pool, {
        id: externalUserId,
        name: "External Viewer",
      });
      await seedMember(pool, {
        organizationId,
        role: "admin",
        userId: creatorUserId,
      });
      await seedMember(pool, {
        organizationId,
        role: "external",
        userId: externalUserId,
      });
      await seedMember(pool, {
        organizationId: otherOrganizationId,
        role: "external",
        userId: externalUserId,
      });

      await seedSite(pool, {
        id: visibleSiteId,
        name: "Visible Site",
        organizationId,
      });
      await seedSite(pool, {
        archived: true,
        id: archivedSiteId,
        name: "Archived Site",
        organizationId,
      });
      await seedSite(pool, {
        id: ungrantedSiteId,
        name: "Ungranted Site",
        organizationId,
      });
      await seedSite(pool, {
        id: otherOrganizationSiteId,
        name: "Other Organization Site",
        organizationId: otherOrganizationId,
      });
      await seedContact(pool, {
        id: visibleContactId,
        name: "Visible Contact",
        organizationId,
      });
      await seedContact(pool, {
        archived: true,
        id: archivedContactId,
        name: "Archived Contact",
        organizationId,
      });
      await seedContact(pool, {
        id: ungrantedContactId,
        name: "Ungranted Contact",
        organizationId,
      });
      await seedContact(pool, {
        id: otherOrganizationContactId,
        name: "Other Organization Contact",
        organizationId: otherOrganizationId,
      });
      await seedLabel(pool, {
        id: visibleLabelId,
        name: "Visible Label",
        organizationId,
      });
      await seedLabel(pool, {
        archived: true,
        id: archivedLabelId,
        name: "Archived Label",
        organizationId,
      });
      await seedLabel(pool, {
        id: ungrantedLabelId,
        name: "Ungranted Label",
        organizationId,
      });
      await seedLabel(pool, {
        id: otherOrganizationLabelId,
        name: "Other Organization Label",
        organizationId: otherOrganizationId,
      });

      await seedWorkItem(pool, {
        contactId: visibleContactId,
        createdByUserId: creatorUserId,
        id: visibleWorkItemId,
        organizationId,
        siteId: visibleSiteId,
        title: "Visible Job",
      });
      await seedWorkItem(pool, {
        contactId: archivedContactId,
        createdByUserId: creatorUserId,
        id: archivedOptionWorkItemId,
        organizationId,
        siteId: archivedSiteId,
        title: "Visible Job With Archived Options",
      });
      await seedWorkItem(pool, {
        contactId: ungrantedContactId,
        createdByUserId: creatorUserId,
        id: ungrantedWorkItemId,
        organizationId,
        siteId: ungrantedSiteId,
        title: "Ungranted Job",
      });
      await seedWorkItem(pool, {
        contactId: otherOrganizationContactId,
        createdByUserId: creatorUserId,
        id: otherOrganizationWorkItemId,
        organizationId: otherOrganizationId,
        siteId: otherOrganizationSiteId,
        title: "Other Organization Job",
      });
      await seedWorkItemLabel(pool, {
        labelId: visibleLabelId,
        organizationId,
        workItemId: visibleWorkItemId,
      });
      await seedWorkItemLabel(pool, {
        labelId: archivedLabelId,
        organizationId,
        workItemId: archivedOptionWorkItemId,
      });
      await seedWorkItemLabel(pool, {
        labelId: ungrantedLabelId,
        organizationId,
        workItemId: ungrantedWorkItemId,
      });
      await seedWorkItemLabel(pool, {
        labelId: otherOrganizationLabelId,
        organizationId: otherOrganizationId,
        workItemId: otherOrganizationWorkItemId,
      });
      await seedCollaborator(pool, {
        createdByUserId: creatorUserId,
        organizationId,
        userId: externalUserId,
        workItemId: visibleWorkItemId,
      });
      await seedCollaborator(pool, {
        createdByUserId: creatorUserId,
        organizationId,
        userId: externalUserId,
        workItemId: archivedOptionWorkItemId,
      });
      await seedCollaborator(pool, {
        createdByUserId: creatorUserId,
        organizationId: otherOrganizationId,
        userId: externalUserId,
        workItemId: otherOrganizationWorkItemId,
      });
    });

    const options = await runJobsRepositoryEffect(
      testDatabase.url,
      JobsRepository.listExternalScopedOptions(organizationId, externalUserId)
    );

    expect(options.members).toStrictEqual([]);
    expect(options.labels.map((item) => item.name)).toStrictEqual([
      "Visible Label",
    ]);
    expect(options.sites.map((item) => item.name)).toStrictEqual([
      "Visible Site",
    ]);
    expect(options.contacts.map((item) => item.name)).toStrictEqual([
      "Visible Contact",
    ]);
    expect(options.contacts[0]?.siteIds).toStrictEqual([visibleSiteId]);
  });

  it("keeps member, contact, and collaborator reads organization-scoped", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping repository coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId = decodeOrganizationId(randomUUID());
    const otherOrganizationId = decodeOrganizationId(randomUUID());
    const ownerUserId = decodeUserId(`jobs_owner_${Date.now()}`);
    const memberUserId = decodeUserId(`jobs_member_${Date.now()}`);
    const externalUserId = decodeUserId(`jobs_external_${Date.now()}`);
    const otherExternalUserId = decodeUserId(
      `jobs_other_external_${Date.now()}`
    );
    const siteId = decodeSiteId(randomUUID());
    const otherOrganizationSiteId = decodeSiteId(randomUUID());
    const contactId = decodeContactId(randomUUID());
    const otherOrganizationContactId = decodeContactId(randomUUID());
    const workItemId = decodeWorkItemId(randomUUID());
    const otherOrganizationWorkItemId = decodeWorkItemId(randomUUID());

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Jobs Safe Reads",
      });
      await seedOrganization(pool, {
        id: otherOrganizationId,
        name: "Other Jobs Safe Reads",
      });
      await seedUser(pool, { id: ownerUserId, name: "Owner A" });
      await seedUser(pool, { id: memberUserId, name: "Member A" });
      await seedUser(pool, { id: externalUserId, name: "External A" });
      await seedUser(pool, {
        id: otherExternalUserId,
        name: "Other External A",
      });
      await seedMember(pool, {
        organizationId,
        role: "owner",
        userId: ownerUserId,
      });
      await seedMember(pool, {
        organizationId,
        role: "member",
        userId: memberUserId,
      });
      await seedMember(pool, {
        organizationId,
        role: "external",
        userId: externalUserId,
      });
      await seedMember(pool, {
        organizationId: otherOrganizationId,
        role: "external",
        userId: otherExternalUserId,
      });
      await seedSite(pool, {
        id: siteId,
        name: "Scoped Site",
        organizationId,
      });
      await seedSite(pool, {
        id: otherOrganizationSiteId,
        name: "Other Scoped Site",
        organizationId: otherOrganizationId,
      });
      await seedContact(pool, {
        id: contactId,
        name: "Scoped Contact",
        organizationId,
      });
      await seedContact(pool, {
        id: otherOrganizationContactId,
        name: "Other Scoped Contact",
        organizationId: otherOrganizationId,
      });
      await seedSiteContact(pool, {
        contactId,
        organizationId,
        siteId,
      });
      await seedSiteContact(pool, {
        contactId: otherOrganizationContactId,
        organizationId: otherOrganizationId,
        siteId: otherOrganizationSiteId,
      });
      await seedWorkItem(pool, {
        contactId,
        createdByUserId: ownerUserId,
        id: workItemId,
        organizationId,
        siteId,
        title: "Scoped Job",
      });
      await seedWorkItem(pool, {
        contactId: otherOrganizationContactId,
        createdByUserId: ownerUserId,
        id: otherOrganizationWorkItemId,
        organizationId: otherOrganizationId,
        siteId: otherOrganizationSiteId,
        title: "Other Scoped Job",
      });
      await seedCollaborator(pool, {
        accessLevel: "comment",
        createdByUserId: ownerUserId,
        organizationId,
        userId: externalUserId,
        workItemId,
      });
      await seedCollaborator(pool, {
        createdByUserId: ownerUserId,
        organizationId: otherOrganizationId,
        userId: otherExternalUserId,
        workItemId: otherOrganizationWorkItemId,
      });
    });

    const [members, externalMembers, contacts, foundContact, otherContact] =
      await Promise.all([
        runJobsRepositoryEffect(
          testDatabase.url,
          JobsRepository.listMemberOptions(organizationId)
        ),
        runJobsRepositoryEffect(
          testDatabase.url,
          JobsRepository.listExternalMemberOptions(organizationId)
        ),
        runJobsRepositoryEffect(
          testDatabase.url,
          ContactsRepository.listOptions(organizationId)
        ),
        runJobsRepositoryEffect(
          testDatabase.url,
          ContactsRepository.findById(organizationId, contactId)
        ),
        runJobsRepositoryEffect(
          testDatabase.url,
          ContactsRepository.findById(
            organizationId,
            otherOrganizationContactId
          )
        ),
      ]);
    const collaborators = await runJobsRepositoryEffect(
      testDatabase.url,
      JobsRepository.listCollaborators(organizationId, workItemId)
    );
    const grant = await runJobsRepositoryEffect(
      testDatabase.url,
      JobsRepository.findUserCollaboratorGrant(
        organizationId,
        workItemId,
        externalUserId
      )
    );
    const accessibleWorkItemIds = await runJobsRepositoryEffect(
      testDatabase.url,
      JobsRepository.listAccessibleWorkItemIdsForUser(
        organizationId,
        externalUserId
      )
    );

    expect(members.map((item) => item.id)).toStrictEqual([
      memberUserId,
      ownerUserId,
    ]);
    expect(externalMembers.map((item) => item.id)).toStrictEqual([
      externalUserId,
    ]);
    expect(contacts.map((item) => item.id)).toStrictEqual([contactId]);
    expect(contacts[0]?.siteIds).toStrictEqual([siteId]);
    expect(Option.getOrThrow(foundContact)).toBe(contactId);
    expect(Option.isNone(otherContact)).toBe(true);
    expect(collaborators.map((item) => item.userId)).toStrictEqual([
      externalUserId,
    ]);
    expect(Option.getOrThrow(grant)).toMatchObject({
      accessLevel: "comment",
      userId: externalUserId,
      workItemId,
    });
    expect(accessibleWorkItemIds).toStrictEqual([workItemId]);
  });

  it("projects comment and activity actors through product-safe rows", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "actors_repo" });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping actor projection coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`activity_actor_${Date.now()}`);
    const workItemId = decodeWorkItemId(randomUUID());

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Actor Projection",
      });
      await seedUser(pool, {
        id: userId,
        name: "Taylor Field",
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
        title: "Inspect actor projection",
      });
    });

    const comment = await runJobsRepositoryEffect(
      testDatabase.url,
      JobsRepository.addComment({
        authorUserId: userId,
        body: "Projection is visible.",
        organizationId,
        workItemId,
      })
    );
    const activity = await runJobsRepositoryEffect(
      testDatabase.url,
      JobsRepository.addActivity({
        actorUserId: userId,
        organizationId,
        payload: {
          eventType: "job_created",
          kind: "job",
          priority: "none",
          title: "Inspect actor projection",
        },
        workItemId,
      })
    );
    const feed = await runJobsRepositoryEffect(
      testDatabase.url,
      JobsRepository.listOrganizationActivity(organizationId, {})
    );

    expect(comment.actor).toMatchObject({
      displayDetail: "Team member",
      displayName: "Taylor Field",
      kind: "member",
    });
    expect(activity.actorUserId).toBe(userId);
    expect(feed.items[0]?.actor).toMatchObject({
      displayName: "Taylor Field",
      id: comment.actor?.id,
      kind: "member",
    });

    await withPool(testDatabase.url, async (pool) => {
      const projection = await pool.query<{
        actor_user_id: string | null;
        comment_actor_id: string | null;
        source_user_id: string | null;
      }>(
        `select
           work_item_activity.actor_user_id,
           comments.actor_id as comment_actor_id,
           product_activity_actor_sources.user_id as source_user_id
         from comments
         join work_item_activity
           on work_item_activity.organization_id = comments.organization_id
         join product_activity_actors
           on product_activity_actors.id = comments.actor_id
           and product_activity_actors.organization_id = comments.organization_id
         join product_activity_actor_sources
           on product_activity_actor_sources.actor_id = product_activity_actors.id
         where comments.organization_id = $1
         limit 1`,
        [organizationId]
      );

      expect(projection.rows[0]).toMatchObject({
        actor_user_id: userId,
        comment_actor_id: comment.actor?.id,
        source_user_id: userId,
      });
    });
  });

  it("uses the canonical member actor when simultaneous first writes race", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "actors_race_repo",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping actor concurrency coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId = decodeOrganizationId(randomUUID());
    const userId = decodeUserId(`activity_actor_race_${Date.now()}`);
    const workItemId = decodeWorkItemId(randomUUID());

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Actor Race Projection",
      });
      await seedUser(pool, {
        id: userId,
        name: "Riley Source",
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
        title: "Race actor projection",
      });
      await pool.query(`
        create or replace function test_sleep_after_member_actor_insert()
        returns trigger
        language plpgsql
        as $$
        begin
          if new.kind = 'member' then
            perform pg_sleep(0.05);
          end if;

          return new;
        end;
        $$;
      `);
      await pool.query(`
        create trigger test_sleep_after_member_actor_insert
        after insert on product_activity_actors
        for each row execute function test_sleep_after_member_actor_insert();
      `);
    });

    const [commentOne, commentTwo, activityOne, activityTwo] =
      await Promise.all([
        runJobsRepositoryEffect(
          testDatabase.url,
          JobsRepository.addComment({
            authorUserId: userId,
            body: "First concurrent comment.",
            organizationId,
            workItemId,
          })
        ),
        runJobsRepositoryEffect(
          testDatabase.url,
          JobsRepository.addComment({
            authorUserId: userId,
            body: "Second concurrent comment.",
            organizationId,
            workItemId,
          })
        ),
        runJobsRepositoryEffect(
          testDatabase.url,
          JobsRepository.addActivity({
            actorUserId: userId,
            organizationId,
            payload: {
              eventType: "job_created",
              kind: "job",
              priority: "none",
              title: "Race actor projection",
            },
            workItemId,
          })
        ),
        runJobsRepositoryEffect(
          testDatabase.url,
          JobsRepository.addActivity({
            actorUserId: userId,
            organizationId,
            payload: {
              eventType: "priority_changed",
              fromPriority: "none",
              toPriority: "high",
            },
            workItemId,
          })
        ),
      ]);

    await withPool(testDatabase.url, async (pool) => {
      const beforeRefresh = await pool.query<{
        actor_id: string;
        source_count: string;
      }>(
        `select
           product_activity_actor_sources.actor_id,
           count(*) over () as source_count
         from product_activity_actor_sources
         where organization_id = $1
           and kind = 'member'
           and user_id = $2`,
        [organizationId, userId]
      );
      const canonicalActorId = beforeRefresh.rows[0]?.actor_id;

      expect(beforeRefresh.rows).toHaveLength(1);
      expect(beforeRefresh.rows[0]?.source_count).toBe("1");
      expect([commentOne.actor?.id, commentTwo.actor?.id]).toStrictEqual([
        canonicalActorId,
        canonicalActorId,
      ]);
      expect(activityOne.actorUserId).toBe(userId);
      expect(activityTwo.actorUserId).toBe(userId);

      const persistedActorIds = await pool.query<{ actor_id: string }>(
        `select actor_id
         from comments
         where organization_id = $1
         union all
         select actor_id
         from work_item_activity
         where organization_id = $1`,
        [organizationId]
      );

      expect(
        new Set(persistedActorIds.rows.map((row) => row.actor_id))
      ).toStrictEqual(new Set([canonicalActorId]));

      await pool.query(`update "user" set name = $1 where id = $2`, [
        "Riley Refreshed",
        userId,
      ]);
    });

    await runJobsRepositoryEffect(
      testDatabase.url,
      JobsRepository.addComment({
        authorUserId: userId,
        body: "Refresh the canonical actor.",
        organizationId,
        workItemId,
      })
    );

    await withPool(testDatabase.url, async (pool) => {
      const referencedActors = await pool.query<{
        actor_id: string;
        display_name: string;
      }>(
        `select distinct
           product_activity_actors.id as actor_id,
           product_activity_actors.display_name
         from product_activity_actors
         where exists (
           select 1
           from comments
           where comments.organization_id = product_activity_actors.organization_id
             and comments.actor_id = product_activity_actors.id
         ) or exists (
           select 1
           from work_item_activity
           where work_item_activity.organization_id = product_activity_actors.organization_id
             and work_item_activity.actor_id = product_activity_actors.id
         )`,
        []
      );

      expect(referencedActors.rows).toHaveLength(1);
      expect(referencedActors.rows[0]?.display_name).toBe("Riley Refreshed");
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
    readonly archived?: boolean;
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
       created_at,
       updated_at,
       archived_at
     )
     values ($1, $2, $3, $4, now(), now(), $5)`,
    [
      input.id,
      input.organizationId,
      input.name,
      `${input.name}, Dublin`,
      input.archived === true ? new Date() : null,
    ]
  );
}

async function seedContact(
  pool: Pool,
  input: {
    readonly archived?: boolean;
    readonly id: string;
    readonly name: string;
    readonly organizationId: string;
  }
) {
  await pool.query(
    `insert into contacts (
       id,
       organization_id,
       name,
       email,
       phone,
       created_at,
       updated_at,
       archived_at
     )
     values ($1, $2, $3, $4, '+353 1 555 0100', now(), now(), $5)`,
    [
      input.id,
      input.organizationId,
      input.name,
      `${input.name.toLowerCase().replaceAll(" ", ".")}@example.com`,
      input.archived === true ? new Date() : null,
    ]
  );
}

async function seedSiteContact(
  pool: Pool,
  input: {
    readonly contactId: string;
    readonly organizationId: string;
    readonly siteId: string;
  }
) {
  await pool.query(
    `insert into site_contacts (
       site_id,
       contact_id,
       organization_id,
       is_primary,
       created_at
     )
     values ($1, $2, $3, true, now())`,
    [input.siteId, input.contactId, input.organizationId]
  );
}

async function seedLabel(
  pool: Pool,
  input: {
    readonly archived?: boolean;
    readonly id: string;
    readonly name: string;
    readonly organizationId: string;
  }
) {
  await pool.query(
    `insert into labels (
       id,
       organization_id,
       name,
       normalized_name,
       created_at,
       updated_at,
       archived_at
     )
     values ($1, $2, $3, $4, now(), now(), $5)`,
    [
      input.id,
      input.organizationId,
      input.name,
      input.name.trim().toLowerCase(),
      input.archived === true ? new Date() : null,
    ]
  );
}

async function seedWorkItem(
  pool: Pool,
  input: {
    readonly contactId?: string;
    readonly createdByUserId: string;
    readonly id: string;
    readonly organizationId: string;
    readonly siteId?: string;
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
       site_id,
       contact_id,
       created_at,
       updated_at,
       created_by_user_id
     )
     values ($1, $2, 'job', $3, 'new', 'none', $4, $5, now(), now(), $6)`,
    [
      input.id,
      input.organizationId,
      input.title,
      input.siteId ?? null,
      input.contactId ?? null,
      input.createdByUserId,
    ]
  );
}

async function seedWorkItemLabel(
  pool: Pool,
  input: {
    readonly labelId: string;
    readonly organizationId: string;
    readonly workItemId: string;
  }
) {
  await pool.query(
    `insert into work_item_labels (
       work_item_id,
       label_id,
       organization_id,
       created_at
     )
     values ($1, $2, $3, now())`,
    [input.workItemId, input.labelId, input.organizationId]
  );
}

async function seedCollaborator(
  pool: Pool,
  input: {
    readonly accessLevel?: "comment" | "read";
    readonly createdByUserId: string;
    readonly organizationId: string;
    readonly userId: string;
    readonly workItemId: string;
  }
) {
  await pool.query(
    `insert into work_item_collaborators (
       id,
       organization_id,
       work_item_id,
       subject_type,
       user_id,
       role_label,
       access_level,
       created_by_user_id,
       created_at,
       updated_at
     )
     values ($1, $2, $3, 'user', $4, 'Site contact', $5, $6, now(), now())`,
    [
      randomUUID(),
      input.organizationId,
      input.workItemId,
      input.userId,
      input.accessLevel ?? "read",
      input.createdByUserId,
    ]
  );
}

async function runJobsRepositoryEffect<Value, Error, Requirements>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, Requirements>
): Promise<Value> {
  return await Effect.runPromise(
    Effect.scoped(
      effect.pipe(
        Effect.provide(JobsRepository.Default),
        Effect.provide(ContactsRepository.Default),
        Effect.provide(AppEffectSqlRuntimeLive),
        withConfigProvider(
          configProviderFromMap(new Map([["DATABASE_URL", databaseUrl]]))
        )
      ) as Effect.Effect<Value, Error, never>
    )
  );
}
