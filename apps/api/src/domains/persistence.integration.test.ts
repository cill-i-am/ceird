import { randomUUID } from "node:crypto";

import {
  calculateJobCostLineTotalMinor,
  JOB_COLLABORATOR_CONFLICT_ERROR_TAG,
  JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG,
  JOB_COST_SUMMARY_LIMIT_EXCEEDED_ERROR_TAG,
  OrganizationId,
  UserId,
  WorkItemId,
} from "@ceird/jobs-core";
import {
  LABEL_NAME_CONFLICT_ERROR_TAG,
  LABEL_NOT_FOUND_ERROR_TAG,
} from "@ceird/labels-core";
import {
  ServiceAreaId,
  SITE_NOT_FOUND_ERROR_TAG,
  SiteId,
} from "@ceird/sites-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Cause, ConfigProvider, Effect, Exit, Option, Schema } from "effect";

import { AppEffectSqlRuntimeLive } from "../platform/database/database.js";
import {
  member,
  organization,
  serviceArea,
  site,
  user,
  workItem,
  workItemActivity,
} from "../platform/database/schema.js";
import {
  applyAllMigrations,
  applyMigration,
  canConnect,
  createTestDatabase,
  withPool,
} from "../platform/database/test-database.js";
import { CommentsRepository } from "./comments/repository.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepositoriesLive,
  JobsRepository,
  RateCardsRepository,
  withJobsTransaction,
} from "./jobs/repositories.js";
import { LabelsRepository } from "./labels/repositories.js";
import {
  ServiceAreasRepository as ConfigurationRepository,
  SiteLabelAssignmentsRepository,
  SitesRepository,
} from "./sites/repositories.js";

describe("domain persistence integration", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("creates aggregate job detail across jobs, comments, activity, and visits", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping repository aggregate coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const serviceAreaId = await insertServiceArea(
      databaseUrl,
      identity.organizationId,
      "Dublin"
    );

    const createdSiteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.create({
        accessNotes: "Use the south gate and reception desk.",
        addressLine1: "1 Custom House Quay",
        country: "IE",
        county: "Dublin",
        eircode: "D01 X2X2",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "google",
        name: "Docklands Campus",
        organizationId: identity.organizationId,
        serviceAreaId,
        latitude: 53.3498,
        longitude: -6.2603,
        town: "Dublin",
      })
    );
    const overflowSiteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.create({
        country: "IE",
        addressLine1: "Overflow Yard",
        county: "Dublin",
        eircode: "D01 X2X3",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "stub",
        latitude: 53.3498,
        longitude: -6.2603,
        name: "Overflow Yard",
        organizationId: identity.organizationId,
        serviceAreaId,
        town: "Dublin",
      })
    );
    const createdContactId = await runJobsEffect(
      databaseUrl,
      ContactsRepository.create({
        email: "site-contact@example.com",
        name: "Aoife Byrne",
        notes: "Prefers morning calls.",
        organizationId: identity.organizationId,
        phone: "+353871234567",
      })
    );
    const siteLabel = await runJobsEffect(
      databaseUrl,
      LabelsRepository.create({
        name: "Requires Escort",
        organizationId: identity.organizationId,
      })
    );

    await runJobsEffect(
      databaseUrl,
      SiteLabelAssignmentsRepository.assignToSite({
        labelId: siteLabel.id,
        organizationId: identity.organizationId,
        siteId: createdSiteId,
      })
    );

    await runJobsEffect(
      databaseUrl,
      JobsRepository.linkSiteContact({
        contactId: createdContactId,
        isPrimary: true,
        organizationId: identity.organizationId,
        siteId: createdSiteId,
      })
    );
    await runJobsEffect(
      databaseUrl,
      JobsRepository.linkSiteContact({
        contactId: createdContactId,
        organizationId: identity.organizationId,
        siteId: overflowSiteId,
      })
    );

    const createdJob = await runJobsEffect(
      databaseUrl,
      withJobsTransaction(
        Effect.gen(function* () {
          const job = yield* JobsRepository.create({
            contactId: createdContactId,
            createdByUserId: identity.ownerUserId,
            externalReference: "PO-4471",
            organizationId: identity.organizationId,
            priority: "high",
            siteId: createdSiteId,
            title: "Replace damaged window seal",
          });

          yield* JobsRepository.addComment({
            authorUserId: identity.ownerUserId,
            body: "Customer reported repeat water ingress by the front lobby.",
            organizationId: identity.organizationId,
            workItemId: job.id,
          });
          yield* JobsRepository.addActivity({
            actorUserId: identity.ownerUserId,
            organizationId: identity.organizationId,
            payload: {
              eventType: "job_created",
              kind: job.kind,
              priority: job.priority,
              title: job.title,
            },
            workItemId: job.id,
          });
          yield* JobsRepository.addVisit({
            authorUserId: identity.assigneeUserId,
            durationMinutes: 120,
            note: "Initial inspection completed and seal dimensions captured.",
            organizationId: identity.organizationId,
            visitDate: "2026-04-21",
            workItemId: job.id,
          });
          yield* JobsRepository.addCostLine({
            authorUserId: identity.ownerUserId,
            description: "Replacement seal kit",
            organizationId: identity.organizationId,
            quantity: 2,
            taxRateBasisPoints: 2300,
            type: "material",
            unitPriceMinor: 2599,
            workItemId: job.id,
          });

          return job;
        })
      )
    );

    const detail = await runJobsEffect(
      databaseUrl,
      JobsRepository.getDetail(identity.organizationId, createdJob.id)
    );

    const detailValue = expectSome(detail);

    expect(detailValue.job.kind).toBe("job");
    expect(detailValue.job.title).toBe("Replace damaged window seal");
    expect(detailValue.job.externalReference).toBe("PO-4471");
    expect(detailValue.job.siteId).toBe(createdSiteId);
    expect(detailValue.job.contactId).toBe(createdContactId);
    expect(detailValue.contact).toMatchObject({
      email: "site-contact@example.com",
      id: createdContactId,
      name: "Aoife Byrne",
      notes: "Prefers morning calls.",
      phone: "+353871234567",
    });
    expect(detailValue.site).toMatchObject({
      accessNotes: "Use the south gate and reception desk.",
      addressLine1: "1 Custom House Quay",
      country: "IE",
      county: "Dublin",
      eircode: "D01 X2X2",
      geocodedAt: "2026-04-27T10:00:00.000Z",
      geocodingProvider: "google",
      id: createdSiteId,
      latitude: 53.3498,
      longitude: -6.2603,
      name: "Docklands Campus",
      serviceAreaId,
      serviceAreaName: "Dublin",
      town: "Dublin",
    });
    expect(detailValue.site?.labels).toStrictEqual([siteLabel]);
    expect(detailValue.site?.addressLine2).toBeUndefined();
    expect(detailValue.comments).toHaveLength(1);
    expect(detailValue.comments[0]?.body).toContain("water ingress");
    expect(detailValue.activity).toHaveLength(1);
    expect(detailValue.activity[0]?.payload.eventType).toBe("job_created");
    expect(detailValue.visits).toHaveLength(1);
    expect(detailValue.visits[0]?.visitDate).toBe("2026-04-21");
    expect(detailValue.visits[0]?.durationMinutes).toBe(120);
    expect(detailValue.costs?.lines).toHaveLength(1);
    expect(detailValue.costs?.lines[0]).toMatchObject({
      description: "Replacement seal kit",
      lineTotalMinor: 5198,
      quantity: 2,
      taxRateBasisPoints: 2300,
      type: "material",
      unitPriceMinor: 2599,
    });
    expect(detailValue.costs?.summary).toStrictEqual({
      subtotalMinor: 5198,
    });

    const siteOptions = await runJobsEffect(
      databaseUrl,
      SitesRepository.listOptions(identity.organizationId)
    );
    const createdSiteOptionById = await runJobsEffect(
      databaseUrl,
      SitesRepository.getOptionById(identity.organizationId, createdSiteId)
    );
    const createdSiteOption = siteOptions.find(
      (siteOption) => siteOption.id === createdSiteId
    );

    expect(createdSiteOption).toBeDefined();
    expect(createdSiteOption).toMatchObject({
      accessNotes: "Use the south gate and reception desk.",
      addressLine1: "1 Custom House Quay",
      country: "IE",
      county: "Dublin",
      eircode: "D01 X2X2",
      geocodedAt: "2026-04-27T10:00:00.000Z",
      geocodingProvider: "google",
      latitude: 53.3498,
      longitude: -6.2603,
      name: "Docklands Campus",
      serviceAreaId,
      serviceAreaName: "Dublin",
      town: "Dublin",
    });
    expect(createdSiteOption?.addressLine2).toBeUndefined();
    expect(createdSiteOption?.county).toBe("Dublin");
    expect(createdSiteOption?.labels).toStrictEqual([siteLabel]);
    expect(Option.getOrUndefined(createdSiteOptionById)).toStrictEqual(
      createdSiteOption
    );

    const list = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, {})
    );
    expect(list.items).toContainEqual(
      expect.objectContaining({
        externalReference: "PO-4471",
        id: createdJob.id,
      })
    );

    const foundSiteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.findById(identity.organizationId, createdSiteId)
    );
    const contactOptions = await runJobsEffect(
      databaseUrl,
      ContactsRepository.listOptions(identity.organizationId)
    );
    const createdContactOption = contactOptions.find(
      (contactOption) => contactOption.id === createdContactId
    );
    const foundContactId = await runJobsEffect(
      databaseUrl,
      ContactsRepository.findById(identity.organizationId, createdContactId)
    );

    expect(createdContactOption).toMatchObject({
      email: "site-contact@example.com",
      id: createdContactId,
      name: "Aoife Byrne",
      phone: "+353871234567",
      siteIds: expect.arrayContaining([createdSiteId, overflowSiteId]),
    });
    expect(createdContactOption).not.toHaveProperty("notes");
    expect(Option.getOrUndefined(foundSiteId)).toBe(createdSiteId);
    expect(Option.getOrUndefined(foundContactId)).toBe(createdContactId);
  }, 30_000);

  it("persists work item and site comments through shared ownership rows", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "comments_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Comments integration database unavailable; skipping shared comments coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const serviceAreaId = await insertServiceArea(
      databaseUrl,
      identity.organizationId,
      "Dublin"
    );
    const siteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.create({
        addressLine1: "12 Shared Comment Street",
        country: "IE",
        county: "Dublin",
        eircode: "D02 X000",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "stub",
        latitude: 53.3498,
        longitude: -6.2603,
        name: "Shared Comment Site",
        organizationId: identity.organizationId,
        serviceAreaId,
        town: "Dublin",
      })
    );
    const job = await runJobsEffect(
      databaseUrl,
      JobsRepository.create({
        createdByUserId: identity.ownerUserId,
        organizationId: identity.organizationId,
        siteId,
        title: "Shared comment job",
      })
    );

    const [jobComment, siteCommentOption] = await runJobsEffect(
      databaseUrl,
      withJobsTransaction(
        Effect.all([
          CommentsRepository.addForWorkItem({
            authorUserId: identity.ownerUserId,
            body: "Job comment lives in the shared comments table.",
            organizationId: identity.organizationId,
            workItemId: job.id,
          }),
          CommentsRepository.addForSite({
            authorUserId: identity.assigneeUserId,
            body: "Site comment uses its own ownership row.",
            organizationId: identity.organizationId,
            siteId,
          }),
        ])
      )
    );
    const siteComment = expectSome(siteCommentOption);

    const [jobComments, siteComments, detail] = await runJobsEffect(
      databaseUrl,
      Effect.all([
        CommentsRepository.listForWorkItem(identity.organizationId, job.id),
        CommentsRepository.listForSite(identity.organizationId, siteId),
        JobsRepository.getDetail(identity.organizationId, job.id),
      ])
    );

    expect(jobComments).toStrictEqual([jobComment]);
    expect(siteComments).toStrictEqual([siteComment]);
    expect(expectSome(detail).comments).toStrictEqual([jobComment]);

    await withPool(databaseUrl, async (pool) => {
      const foreignIdentity = await seedIdentityRecords(databaseUrl);
      const sharedComments = await pool.query(
        `
          select
            comments.id,
            comments.organization_id,
            work_item_comments.work_item_id,
            site_comments.site_id
          from comments
          left join work_item_comments
            on work_item_comments.comment_id = comments.id
          left join site_comments
            on site_comments.comment_id = comments.id
          where comments.id = any($1::uuid[])
          order by comments.created_at asc, comments.id asc
        `,
        [[jobComment.id, siteComment.id]]
      );

      expect(sharedComments.rows).toMatchObject([
        {
          id: jobComment.id,
          organization_id: identity.organizationId,
          site_id: null,
          work_item_id: job.id,
        },
        {
          id: siteComment.id,
          organization_id: identity.organizationId,
          site_id: siteId,
          work_item_id: null,
        },
      ]);

      const crossOrgAuthorCommentId = randomUUID();
      await expect(
        pool.query(
          `
            insert into comments (
              id,
              organization_id,
              author_user_id,
              body
            )
            values ($1, $2, $3, 'Cross-org author should fail')
          `,
          [
            crossOrgAuthorCommentId,
            identity.organizationId,
            foreignIdentity.ownerUserId,
          ]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "comments_author_member_chk",
      });

      await expect(
        pool.query(
          `
            update comments
            set updated_by_user_id = $1
            where id = $2
          `,
          [foreignIdentity.ownerUserId, siteComment.id]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "comments_updated_by_member_chk",
      });

      await expect(
        pool.query(
          `
            insert into comments (
              id,
              organization_id,
              author_user_id,
              body
            )
            values ($1, $2, $3, 'Ownerless comments should fail')
          `,
          [randomUUID(), identity.organizationId, identity.ownerUserId]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "comments_ownership_chk",
      });

      await expect(
        pool.query(
          `
            delete from member
            where organization_id = $1
              and user_id = $2
          `,
          [identity.organizationId, identity.assigneeUserId]
        )
      ).resolves.toMatchObject({ rowCount: 1 });

      const commentAfterMemberRemoval = await pool.query(
        "select id from comments where id = $1",
        [siteComment.id]
      );
      expect(commentAfterMemberRemoval.rows).toStrictEqual([
        { id: siteComment.id },
      ]);

      await expect(
        pool.query(
          `
            update comments
            set updated_by_user_id = $1
            where id = $2
          `,
          [identity.ownerUserId, siteComment.id]
        )
      ).resolves.toMatchObject({ rowCount: 1 });

      const singleOwnedCommentId = randomUUID();
      await pool.query("begin");
      try {
        await pool.query(
          `
            insert into comments (
              id,
              organization_id,
              author_user_id,
              body
            )
            values ($1, $2, $3, 'Shared comment cannot have two ownership rows')
          `,
          [singleOwnedCommentId, identity.organizationId, identity.ownerUserId]
        );
        await pool.query(
          `
            insert into work_item_comments (
              comment_id,
              organization_id,
              work_item_id
            )
            values ($1, $2, $3)
          `,
          [singleOwnedCommentId, identity.organizationId, job.id]
        );
        await pool.query("commit");
      } catch (error) {
        await pool.query("rollback");
        throw error;
      }

      await pool.query("begin");
      await expect(
        pool.query(
          `
            insert into site_comments (
              comment_id,
              organization_id,
              site_id
            )
            values ($1, $2, $3)
          `,
          [singleOwnedCommentId, identity.organizationId, siteId]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "comments_single_ownership_chk",
      });
      await pool.query("rollback");

      await pool.query("delete from work_item_comments where comment_id = $1", [
        singleOwnedCommentId,
      ]);
      const noLongerOwnedSingleComment = await pool.query(
        "select id from comments where id = $1",
        [singleOwnedCommentId]
      );
      expect(noLongerOwnedSingleComment.rows).toStrictEqual([]);

      await expect(
        pool.query(
          `
            update site_comments
            set comment_id = $1
            where comment_id = $2
          `,
          [jobComment.id, siteComment.id]
        )
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "comments_ownership_identity_immutable_chk",
      });

      await pool.query("delete from work_items where id = $1", [job.id]);
      await pool.query("delete from sites where id = $1", [siteId]);

      const remainingComments = await pool.query(
        `
          select id
          from comments
          where id = any($1::uuid[])
        `,
        [[jobComment.id, siteComment.id]]
      );
      expect(remainingComments.rows).toStrictEqual([]);
    });
  }, 30_000);

  it("migrates legacy work item comments into shared comments", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "legacy_comments",
    });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Comments integration database unavailable; skipping legacy migration coverage"
      );
    }

    await applyMigrationsBeforeSharedComments(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const legacyWorkItemId = decodeWorkItemId(randomUUID());
    const newerLegacyCommentId = "00000000-0000-4000-8000-000000000001";
    const olderLegacyCommentId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const newerLegacyBody = "Newer legacy migrated comment.";
    const olderLegacyBody = "Older legacy migrated comment. ".repeat(700);
    const newerLegacyCreatedAt = new Date("2026-04-20T10:30:00.000Z");
    const olderLegacyCreatedAt = new Date("2026-04-20T09:30:00.000Z");

    await withPool(databaseUrl, async (pool) => {
      await pool.query(
        `
          insert into work_items (
            id,
            organization_id,
            kind,
            title,
            status,
            priority,
            created_by_user_id
          )
          values ($1, $2, 'job', 'Legacy comment migration', 'new', 'none', $3)
        `,
        [legacyWorkItemId, identity.organizationId, identity.ownerUserId]
      );
      await pool.query(
        `
          insert into work_item_comments (
            id,
            work_item_id,
            author_user_id,
            body,
            created_at
          )
          values
            ($1, $3, $4, $5, $7),
            ($2, $3, $4, $6, $8)
        `,
        [
          newerLegacyCommentId,
          olderLegacyCommentId,
          legacyWorkItemId,
          identity.ownerUserId,
          newerLegacyBody,
          olderLegacyBody,
          newerLegacyCreatedAt,
          olderLegacyCreatedAt,
        ]
      );
    });

    await applyMigration(databaseUrl, "0018_chilly_galactus.sql");

    await withPool(databaseUrl, async (pool) => {
      const migrated = await pool.query(
        `
          select
            comments.id,
            comments.organization_id,
            comments.author_user_id,
            comments.body,
            comments.created_at,
            comments.updated_at,
            work_item_comments.comment_id,
            work_item_comments.created_at as ownership_created_at,
            work_item_comments.work_item_id,
            work_item_comments.organization_id as ownership_organization_id
          from comments
          inner join work_item_comments
            on work_item_comments.comment_id = comments.id
            and work_item_comments.organization_id = comments.organization_id
          where comments.id = any($1::uuid[])
          order by work_item_comments.created_at asc, work_item_comments.comment_id asc
        `,
        [[newerLegacyCommentId, olderLegacyCommentId]]
      );

      expect(migrated.rows).toMatchObject([
        {
          author_user_id: identity.ownerUserId,
          body: olderLegacyBody,
          comment_id: olderLegacyCommentId,
          id: olderLegacyCommentId,
          organization_id: identity.organizationId,
          ownership_organization_id: identity.organizationId,
          work_item_id: legacyWorkItemId,
        },
        {
          author_user_id: identity.ownerUserId,
          body: newerLegacyBody,
          comment_id: newerLegacyCommentId,
          id: newerLegacyCommentId,
          organization_id: identity.organizationId,
          ownership_organization_id: identity.organizationId,
          work_item_id: legacyWorkItemId,
        },
      ]);
      expect(migrated.rows[0]?.created_at).toStrictEqual(olderLegacyCreatedAt);
      expect(migrated.rows[0]?.updated_at).toStrictEqual(olderLegacyCreatedAt);
      expect(migrated.rows[0]?.ownership_created_at).toStrictEqual(
        olderLegacyCreatedAt
      );
      expect(migrated.rows[1]?.created_at).toStrictEqual(newerLegacyCreatedAt);
      expect(migrated.rows[1]?.updated_at).toStrictEqual(newerLegacyCreatedAt);
      expect(migrated.rows[1]?.ownership_created_at).toStrictEqual(
        newerLegacyCreatedAt
      );
      expect(olderLegacyBody.length).toBeGreaterThan(10_000);
    });

    const detail = await runJobsEffect(
      databaseUrl,
      JobsRepository.getDetail(identity.organizationId, legacyWorkItemId)
    );

    expect(expectSome(detail).comments).toMatchObject([
      {
        body: olderLegacyBody,
        id: olderLegacyCommentId,
        workItemId: legacyWorkItemId,
      },
      {
        body: newerLegacyBody,
        id: newerLegacyCommentId,
        workItemId: legacyWorkItemId,
      },
    ]);
  }, 30_000);

  it("filters and paginates job lists by org-scoped fields", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping repository filter coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const northServiceAreaId = await insertServiceArea(
      databaseUrl,
      identity.organizationId,
      "North"
    );
    const southServiceAreaId = await insertServiceArea(
      databaseUrl,
      identity.organizationId,
      "South"
    );
    const northSiteId = await insertSite(
      databaseUrl,
      identity.organizationId,
      northServiceAreaId,
      "North Site"
    );
    const southSiteId = await insertSite(
      databaseUrl,
      identity.organizationId,
      southServiceAreaId,
      "South Site"
    );

    const newestJobId = decodeWorkItemId(
      "00000000-0000-4000-8000-000000000003"
    );
    const middleJobId = decodeWorkItemId(
      "00000000-0000-4000-8000-000000000002"
    );
    const oldestJobId = decodeWorkItemId(
      "00000000-0000-4000-8000-000000000001"
    );

    await withPool(databaseUrl, async (pool) => {
      const db = drizzle(pool);

      await db.insert(workItem).values([
        {
          assigneeId: identity.assigneeUserId,
          completedAt: null,
          completedByUserId: null,
          contactId: null,
          coordinatorId: identity.coordinatorUserId,
          createdAt: new Date("2026-04-21T10:00:00.000Z"),
          createdByUserId: identity.ownerUserId,
          id: newestJobId,
          kind: "job",
          organizationId: identity.organizationId,
          priority: "urgent",
          siteId: northSiteId,
          status: "in_progress",
          title: "Newest north job",
          updatedAt: new Date("2026-04-21T10:00:00.000Z"),
          blockedReason: null,
        },
        {
          assigneeId: identity.assigneeUserId,
          completedAt: null,
          completedByUserId: null,
          contactId: null,
          coordinatorId: null,
          createdAt: new Date("2026-04-20T09:00:00.000Z"),
          createdByUserId: identity.ownerUserId,
          id: middleJobId,
          kind: "job",
          organizationId: identity.organizationId,
          priority: "medium",
          siteId: southSiteId,
          status: "blocked",
          title: "Blocked south job",
          updatedAt: new Date("2026-04-20T09:00:00.000Z"),
          blockedReason: "Awaiting access materials",
        },
        {
          assigneeId: null,
          completedAt: null,
          completedByUserId: null,
          contactId: null,
          coordinatorId: identity.coordinatorUserId,
          createdAt: new Date("2026-04-19T08:00:00.000Z"),
          createdByUserId: identity.ownerUserId,
          id: oldestJobId,
          kind: "job",
          organizationId: identity.organizationId,
          priority: "low",
          siteId: northSiteId,
          status: "triaged",
          title: "Oldest north job",
          updatedAt: new Date("2026-04-20T09:00:00.000Z"),
          blockedReason: null,
        },
      ]);
    });

    const firstPage = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, { limit: 2 })
    );

    expect(firstPage.items.map((item) => item.id)).toStrictEqual([
      newestJobId,
      middleJobId,
    ]);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, {
        cursor: firstPage.nextCursor,
        limit: 2,
      })
    );

    expect(secondPage.items.map((item) => item.id)).toStrictEqual([
      oldestJobId,
    ]);
    expect(secondPage.nextCursor).toBeUndefined();

    const byServiceArea = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, {
        serviceAreaId: northServiceAreaId,
      })
    );
    const byAssignee = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, {
        assigneeId: identity.assigneeUserId,
      })
    );
    const byCoordinator = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, {
        coordinatorId: identity.coordinatorUserId,
      })
    );
    const byPriority = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, { priority: "urgent" })
    );
    const bySite = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, { siteId: southSiteId })
    );
    const byStatus = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, { status: "blocked" })
    );

    expect(byServiceArea.items.map((item) => item.id)).toStrictEqual([
      newestJobId,
      oldestJobId,
    ]);
    expect(byAssignee.items.map((item) => item.id)).toStrictEqual([
      newestJobId,
      middleJobId,
    ]);
    expect(byCoordinator.items.map((item) => item.id)).toStrictEqual([
      newestJobId,
      oldestJobId,
    ]);
    expect(byPriority.items.map((item) => item.id)).toStrictEqual([
      newestJobId,
    ]);
    expect(bySite.items.map((item) => item.id)).toStrictEqual([middleJobId]);
    expect(byStatus.items.map((item) => item.id)).toStrictEqual([middleJobId]);
  }, 30_000);

  it("filters and paginates site lists by org-scoped fields", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "sites_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Sites integration database unavailable; skipping repository pagination coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const otherOrganizationId =
      Schema.decodeUnknownSync(OrganizationId)("org_cursor_other");
    const northServiceAreaId = await insertServiceArea(
      databaseUrl,
      identity.organizationId,
      "North"
    );
    const southServiceAreaId = await insertServiceArea(
      databaseUrl,
      identity.organizationId,
      "South"
    );

    await withPool(databaseUrl, async (pool) => {
      const db = drizzle(pool);

      await db.insert(site).values([
        {
          addressLine1: "Alpha House",
          country: "IE",
          county: "Dublin",
          createdAt: new Date("2026-04-20T09:00:00.000Z"),
          eircode: "D01 X2X2",
          geocodedAt: new Date("2026-04-27T10:00:00.000Z"),
          geocodingProvider: "stub",
          id: decodeSiteId("10000000-0000-4000-8000-000000000001"),
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Alpha House",
          organizationId: identity.organizationId,
          serviceAreaId: northServiceAreaId,
          updatedAt: new Date("2026-04-20T09:00:00.000Z"),
        },
        {
          addressLine1: "Beta Yard",
          country: "IE",
          county: "Dublin",
          createdAt: new Date("2026-04-20T10:00:00.000Z"),
          eircode: "D02 X2X2",
          geocodedAt: new Date("2026-04-27T10:00:00.000Z"),
          geocodingProvider: "stub",
          id: decodeSiteId("10000000-0000-4000-8000-000000000002"),
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Beta Yard",
          organizationId: identity.organizationId,
          serviceAreaId: southServiceAreaId,
          updatedAt: new Date("2026-04-20T10:00:00.000Z"),
        },
        {
          addressLine1: "Alpha House Annexe",
          country: "IE",
          county: "Dublin",
          createdAt: new Date("2026-04-20T09:00:00.000Z"),
          eircode: "D01 Y2Y2",
          geocodedAt: new Date("2026-04-27T10:00:00.000Z"),
          geocodingProvider: "stub",
          id: decodeSiteId("10000000-0000-4000-8000-000000000004"),
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Alpha House",
          organizationId: identity.organizationId,
          serviceAreaId: northServiceAreaId,
          updatedAt: new Date("2026-04-20T09:00:00.000Z"),
        },
        {
          addressLine1: "Charlie Depot",
          country: "IE",
          county: "Dublin",
          createdAt: new Date("2026-04-20T11:00:00.000Z"),
          eircode: "D03 X2X2",
          geocodedAt: new Date("2026-04-27T10:00:00.000Z"),
          geocodingProvider: "stub",
          id: decodeSiteId("10000000-0000-4000-8000-000000000003"),
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Charlie Depot",
          organizationId: identity.organizationId,
          serviceAreaId: northServiceAreaId,
          updatedAt: new Date("2026-04-20T11:00:00.000Z"),
        },
      ]);
    });

    const firstPage = await runJobsEffect(
      databaseUrl,
      SitesRepository.list(identity.organizationId, { limit: 1 })
    );

    expect(firstPage.items.map((item) => item.id)).toStrictEqual([
      decodeSiteId("10000000-0000-4000-8000-000000000001"),
    ]);
    expect(firstPage.nextCursor).toBeDefined();

    const secondPage = await runJobsEffect(
      databaseUrl,
      SitesRepository.list(identity.organizationId, {
        cursor: firstPage.nextCursor,
        limit: 1,
      })
    );

    expect(secondPage.items.map((item) => item.id)).toStrictEqual([
      decodeSiteId("10000000-0000-4000-8000-000000000004"),
    ]);
    expect(secondPage.nextCursor).toBeDefined();

    const remainingPage = await runJobsEffect(
      databaseUrl,
      SitesRepository.list(identity.organizationId, {
        cursor: secondPage.nextCursor,
        limit: 2,
      })
    );

    expect(remainingPage.items.map((item) => item.name)).toStrictEqual([
      "Beta Yard",
      "Charlie Depot",
    ]);
    expect(remainingPage.nextCursor).toBeUndefined();

    const firstNorthPage = await runJobsEffect(
      databaseUrl,
      SitesRepository.list(identity.organizationId, {
        limit: 1,
        serviceAreaId: northServiceAreaId,
      })
    );

    expect(firstNorthPage.items.map((item) => item.id)).toStrictEqual([
      decodeSiteId("10000000-0000-4000-8000-000000000001"),
    ]);
    expect(firstNorthPage.nextCursor).toBeDefined();

    const secondNorthPage = await runJobsEffect(
      databaseUrl,
      SitesRepository.list(identity.organizationId, {
        cursor: firstNorthPage.nextCursor,
        limit: 2,
        serviceAreaId: northServiceAreaId,
      })
    );

    expect(secondNorthPage.items.map((item) => item.id)).toStrictEqual([
      decodeSiteId("10000000-0000-4000-8000-000000000004"),
      decodeSiteId("10000000-0000-4000-8000-000000000003"),
    ]);
    expect(secondNorthPage.nextCursor).toBeUndefined();

    await expect(
      runJobsEffect(
        databaseUrl,
        SitesRepository.list(identity.organizationId, {
          cursor: firstPage.nextCursor,
          serviceAreaId: northServiceAreaId,
        })
      )
    ).rejects.toMatchObject({
      _tag: "@ceird/sites-core/SiteListCursorInvalidError",
    });

    await expect(
      runJobsEffect(
        databaseUrl,
        SitesRepository.list(otherOrganizationId, {
          cursor: firstPage.nextCursor,
        })
      )
    ).rejects.toMatchObject({
      _tag: "@ceird/sites-core/SiteListCursorInvalidError",
    });
  }, 30_000);

  it("manages collaborators and scopes external repository access to grants", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_collab" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping repository collaborator coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const serviceAreaId = await insertServiceArea(
      databaseUrl,
      identity.organizationId,
      "External collaboration area"
    );
    const siteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.create({
        addressLine1: "12 External Street",
        country: "IE",
        county: "Dublin",
        eircode: "D02 X2X2",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "stub",
        latitude: 53.345,
        longitude: -6.267,
        name: "External Tenant Site",
        organizationId: identity.organizationId,
        serviceAreaId,
        town: "Dublin",
      })
    );
    const contactId = await runJobsEffect(
      databaseUrl,
      ContactsRepository.create({
        email: "external-contact@example.com",
        name: "External Contact",
        organizationId: identity.organizationId,
        phone: "+353871111111",
      })
    );
    const externalUserId = await insertMember(
      databaseUrl,
      identity.organizationId,
      "external"
    );

    const grantedJob = await runJobsEffect(
      databaseUrl,
      JobsRepository.create({
        contactId,
        createdByUserId: identity.ownerUserId,
        organizationId: identity.organizationId,
        siteId,
        title: "Repair front door closer",
      })
    );
    const hiddenJob = await runJobsEffect(
      databaseUrl,
      JobsRepository.create({
        createdByUserId: identity.ownerUserId,
        organizationId: identity.organizationId,
        title: "Replace roof hatch seal",
      })
    );
    await runJobsEffect(
      databaseUrl,
      JobsRepository.addCostLine({
        authorUserId: identity.ownerUserId,
        description: "Closer kit",
        organizationId: identity.organizationId,
        quantity: 1,
        type: "material",
        unitPriceMinor: 4200,
        workItemId: grantedJob.id,
      })
    );
    await runJobsEffect(
      databaseUrl,
      JobsRepository.addActivity({
        actorUserId: identity.ownerUserId,
        organizationId: identity.organizationId,
        payload: {
          eventType: "job_created",
          kind: grantedJob.kind,
          priority: grantedJob.priority,
          title: grantedJob.title,
        },
        workItemId: grantedJob.id,
      })
    );
    await runJobsEffect(
      databaseUrl,
      JobsRepository.addVisit({
        authorUserId: identity.ownerUserId,
        durationMinutes: 60,
        note: "Internal collaborator visit.",
        organizationId: identity.organizationId,
        visitDate: "2026-04-21",
        workItemId: grantedJob.id,
      })
    );
    const collaborator = await runJobsEffect(
      databaseUrl,
      JobsRepository.attachCollaborator({
        accessLevel: "comment",
        createdByUserId: identity.ownerUserId,
        organizationId: identity.organizationId,
        roleLabel: "Tenant contact",
        userId: externalUserId,
        workItemId: grantedJob.id,
      })
    );

    expect(collaborator).toMatchObject({
      accessLevel: "comment",
      roleLabel: "Tenant contact",
      userId: externalUserId,
      workItemId: grantedJob.id,
    });
    await runJobsEffect(
      databaseUrl,
      JobsRepository.addComment({
        authorUserId: externalUserId,
        body: "I can meet the technician at reception.",
        organizationId: identity.organizationId,
        workItemId: grantedJob.id,
      })
    );

    const duplicateExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.attachCollaborator({
        accessLevel: "read",
        createdByUserId: identity.ownerUserId,
        organizationId: identity.organizationId,
        roleLabel: "Duplicate",
        userId: externalUserId,
        workItemId: grantedJob.id,
      })
    );
    expectFailureTag(duplicateExit, JOB_COLLABORATOR_CONFLICT_ERROR_TAG);

    const grant = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.findUserCollaboratorGrant(
          identity.organizationId,
          grantedJob.id,
          externalUserId
        )
      )
    );
    expect(grant.accessLevel).toBe("comment");

    const externalList = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(
        identity.organizationId,
        {},
        {
          userId: externalUserId,
          visibility: "external",
        }
      )
    );
    expect(externalList.items.map((item) => item.id)).toStrictEqual([
      grantedJob.id,
    ]);

    const accessibleIds = await runJobsEffect(
      databaseUrl,
      JobsRepository.listAccessibleWorkItemIdsForUser(
        identity.organizationId,
        externalUserId
      )
    );
    expect(accessibleIds).toStrictEqual([grantedJob.id]);

    const internalDetail = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.getDetail(identity.organizationId, grantedJob.id)
      )
    );
    expect(internalDetail.activity).toHaveLength(1);
    expect(internalDetail.visits).toHaveLength(1);
    expect(internalDetail.costs?.lines).toHaveLength(1);

    const grantedDetail = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.getDetail(identity.organizationId, grantedJob.id, {
          userId: externalUserId,
          visibility: "external",
        })
      )
    );
    expect(grantedDetail.costs).toBeUndefined();
    expect(grantedDetail.activity).toStrictEqual([]);
    expect(grantedDetail.visits).toStrictEqual([]);
    expect(grantedDetail.site).toMatchObject({
      id: siteId,
      name: "External Tenant Site",
    });
    expect(grantedDetail.contact).toMatchObject({
      email: "external-contact@example.com",
      id: contactId,
      name: "External Contact",
      phone: "+353871111111",
    });
    expect(grantedDetail.viewerAccess).toStrictEqual({
      canComment: true,
      visibility: "external",
    });
    expect(grantedDetail.comments).toMatchObject([
      {
        authorName: "external user",
        authorUserId: externalUserId,
        body: "I can meet the technician at reception.",
      },
    ]);

    const hiddenDetail = await runJobsEffect(
      databaseUrl,
      JobsRepository.getDetail(identity.organizationId, hiddenJob.id, {
        userId: externalUserId,
        visibility: "external",
      })
    );
    expect(Option.isNone(hiddenDetail) ? "none" : "some").toBe("none");

    const updated = await runJobsEffect(
      databaseUrl,
      JobsRepository.updateCollaborator(
        identity.organizationId,
        grantedJob.id,
        collaborator.id,
        {
          accessLevel: "read",
          roleLabel: "Read-only contact",
        }
      )
    );
    expect(updated.accessLevel).toBe("read");

    const updatedGrantDetail = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.getDetail(identity.organizationId, grantedJob.id, {
          userId: externalUserId,
          visibility: "external",
        })
      )
    );
    expect(updatedGrantDetail.viewerAccess).toStrictEqual({
      canComment: true,
      visibility: "external",
    });

    const wrongJobUpdateExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.updateCollaborator(
        identity.organizationId,
        hiddenJob.id,
        collaborator.id,
        {
          roleLabel: "Wrong job update",
        }
      )
    );
    expectFailureTag(wrongJobUpdateExit, JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG);

    const wrongJobRemoveExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.removeCollaborator(
        identity.organizationId,
        hiddenJob.id,
        collaborator.id
      )
    );
    expectFailureTag(wrongJobRemoveExit, JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG);

    const removed = await runJobsEffect(
      databaseUrl,
      JobsRepository.removeCollaborator(
        identity.organizationId,
        grantedJob.id,
        collaborator.id
      )
    );
    expect(removed.roleLabel).toBe("Read-only contact");

    const missingRemoveExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.removeCollaborator(
        identity.organizationId,
        grantedJob.id,
        collaborator.id
      )
    );
    expectFailureTag(missingRemoveExit, JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG);
  }, 30_000);

  it("creates, assigns, removes, archives, and filters organization labels", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_labels" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping label coverage"
      );
    }

    await applyAllMigrations(databaseUrl);
    const identity = await seedIdentityRecords(databaseUrl);
    const foreignIdentity = await seedIdentityRecords(databaseUrl);

    const createdJob = await runJobsEffect(
      databaseUrl,
      JobsRepository.create({
        createdByUserId: identity.ownerUserId,
        organizationId: identity.organizationId,
        title: "Replace lock cylinder",
      })
    );

    const label = await runJobsEffect(
      databaseUrl,
      LabelsRepository.create({
        name: "Waiting on PO",
        organizationId: identity.organizationId,
      })
    );

    const sameNameInOtherOrg = await runJobsEffect(
      databaseUrl,
      LabelsRepository.create({
        name: "Waiting on PO",
        organizationId: foreignIdentity.organizationId,
      })
    );

    expect(label.name).toBe("Waiting on PO");
    expect(sameNameInOtherOrg.name).toBe("Waiting on PO");

    const conflictingLabel = await runJobsEffect(
      databaseUrl,
      LabelsRepository.create({
        name: "Needs Review",
        organizationId: identity.organizationId,
      })
    );

    const duplicateLabelExit = await runJobsEffectExit(
      databaseUrl,
      LabelsRepository.create({
        name: " waiting on po ",
        organizationId: identity.organizationId,
      })
    );

    expectFailureTag(duplicateLabelExit, LABEL_NAME_CONFLICT_ERROR_TAG);

    const updatedLabel = expectSome(
      await runJobsEffect(
        databaseUrl,
        LabelsRepository.update(identity.organizationId, label.id, {
          name: "Awaiting PO",
        })
      )
    );
    expect(updatedLabel).toMatchObject({
      id: label.id,
      name: "Awaiting PO",
    });

    const updateConflictExit = await runJobsEffectExit(
      databaseUrl,
      LabelsRepository.update(identity.organizationId, conflictingLabel.id, {
        name: " awaiting po ",
      })
    );

    expectFailureTag(updateConflictExit, LABEL_NAME_CONFLICT_ERROR_TAG);

    const activeLabels = await runJobsEffect(
      databaseUrl,
      LabelsRepository.list(identity.organizationId)
    );
    expect(activeLabels.map((jobLabel) => jobLabel.name)).toStrictEqual([
      "Awaiting PO",
      "Needs Review",
    ]);

    const assigned = await runJobsEffect(
      databaseUrl,
      JobLabelAssignmentsRepository.assignToJob({
        labelId: updatedLabel.id,
        organizationId: identity.organizationId,
        workItemId: createdJob.id,
      })
    );

    expect(assigned).toStrictEqual({
      changed: true,
      label: updatedLabel,
    });

    const duplicateAssigned = await runJobsEffect(
      databaseUrl,
      JobLabelAssignmentsRepository.assignToJob({
        labelId: updatedLabel.id,
        organizationId: identity.organizationId,
        workItemId: createdJob.id,
      })
    );

    expect(duplicateAssigned).toStrictEqual({
      changed: false,
      label: updatedLabel,
    });

    const detail = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.getDetail(identity.organizationId, createdJob.id)
      )
    );
    expect(detail.job.labels.map((jobLabel) => jobLabel.name)).toStrictEqual([
      "Awaiting PO",
    ]);

    const patchedJob = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.patch(identity.organizationId, createdJob.id, {
          title: "Replace lock cylinder after PO approval",
        })
      )
    );
    expect(patchedJob.labels.map((jobLabel) => jobLabel.name)).toStrictEqual([
      "Awaiting PO",
    ]);

    const transitionedJob = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.transition(identity.organizationId, createdJob.id, {
          completedByUserId: identity.ownerUserId,
          status: "completed",
        })
      )
    );
    expect(
      transitionedJob.labels.map((jobLabel) => jobLabel.name)
    ).toStrictEqual(["Awaiting PO"]);

    const reopenedJob = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.reopen(identity.organizationId, createdJob.id)
      )
    );
    expect(reopenedJob.labels.map((jobLabel) => jobLabel.name)).toStrictEqual([
      "Awaiting PO",
    ]);

    const filtered = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, {
        labelId: updatedLabel.id,
      })
    );
    expect(filtered.items.map((item) => item.id)).toStrictEqual([
      createdJob.id,
    ]);

    const removed = await runJobsEffect(
      databaseUrl,
      JobLabelAssignmentsRepository.removeFromJob({
        labelId: updatedLabel.id,
        organizationId: identity.organizationId,
        workItemId: createdJob.id,
      })
    );
    expect(removed).toStrictEqual({
      changed: true,
      label: updatedLabel,
    });

    const secondRemoved = await runJobsEffect(
      databaseUrl,
      JobLabelAssignmentsRepository.removeFromJob({
        labelId: updatedLabel.id,
        organizationId: identity.organizationId,
        workItemId: createdJob.id,
      })
    );
    expect(secondRemoved).toStrictEqual({
      changed: false,
      label: updatedLabel,
    });

    const detailAfterSecondRemove = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.getDetail(identity.organizationId, createdJob.id)
      )
    );
    expect(detailAfterSecondRemove.job.labels).toStrictEqual([]);

    await runJobsEffect(
      databaseUrl,
      JobLabelAssignmentsRepository.assignToJob({
        labelId: updatedLabel.id,
        organizationId: identity.organizationId,
        workItemId: createdJob.id,
      })
    );

    const archived = await runJobsEffect(
      databaseUrl,
      LabelsRepository.archive(identity.organizationId, updatedLabel.id)
    );
    expect(Option.getOrUndefined(archived)).toMatchObject({
      id: updatedLabel.id,
      name: updatedLabel.name,
    });

    const detailAfterArchive = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobsRepository.getDetail(identity.organizationId, createdJob.id)
      )
    );
    expect(detailAfterArchive.job.labels).toStrictEqual([]);

    const filteredAfterArchive = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, {
        labelId: updatedLabel.id,
      })
    );
    expect(filteredAfterArchive.items).toStrictEqual([]);

    const labelsAfterArchive = await runJobsEffect(
      databaseUrl,
      LabelsRepository.list(identity.organizationId)
    );
    expect(labelsAfterArchive.map((jobLabel) => jobLabel.id)).not.toContain(
      updatedLabel.id
    );
  }, 30_000);

  it("manages site label assignments idempotently", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "site_labels" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping site label assignment coverage"
      );
    }

    await applyAllMigrations(databaseUrl);
    const identity = await seedIdentityRecords(databaseUrl);
    const foreignIdentity = await seedIdentityRecords(databaseUrl);

    const serviceAreaId = await insertServiceArea(
      databaseUrl,
      identity.organizationId,
      "North"
    );
    const foreignServiceAreaId = await insertServiceArea(
      databaseUrl,
      foreignIdentity.organizationId,
      "Foreign"
    );
    const siteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.create({
        addressLine1: "7 Label Lane",
        country: "IE",
        county: "Dublin",
        eircode: "D07 LABL",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "stub",
        latitude: 53.35,
        longitude: -6.26,
        name: "Labelled Site",
        organizationId: identity.organizationId,
        serviceAreaId,
        town: "Dublin",
      })
    );
    const foreignSiteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.create({
        addressLine1: "1 Other Org Road",
        country: "IE",
        county: "Dublin",
        eircode: "D01 FORN",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "stub",
        latitude: 53.35,
        longitude: -6.26,
        name: "Foreign Site",
        organizationId: foreignIdentity.organizationId,
        serviceAreaId: foreignServiceAreaId,
        town: "Dublin",
      })
    );
    const label = await runJobsEffect(
      databaseUrl,
      LabelsRepository.create({
        name: "Gate Access",
        organizationId: identity.organizationId,
      })
    );
    const foreignLabel = await runJobsEffect(
      databaseUrl,
      LabelsRepository.create({
        name: "Gate Access",
        organizationId: foreignIdentity.organizationId,
      })
    );

    const assigned = await runJobsEffect(
      databaseUrl,
      SiteLabelAssignmentsRepository.assignToSite({
        labelId: label.id,
        organizationId: identity.organizationId,
        siteId,
      })
    );
    expect(assigned).toStrictEqual({
      changed: true,
      label,
    });

    const duplicateAssigned = await runJobsEffect(
      databaseUrl,
      SiteLabelAssignmentsRepository.assignToSite({
        labelId: label.id,
        organizationId: identity.organizationId,
        siteId,
      })
    );
    expect(duplicateAssigned).toStrictEqual({
      changed: false,
      label,
    });

    const option = expectSome(
      await runJobsEffect(
        databaseUrl,
        SitesRepository.getOptionById(identity.organizationId, siteId)
      )
    );
    expect(option.labels).toStrictEqual([label]);

    const options = await runJobsEffect(
      databaseUrl,
      SitesRepository.listOptions(identity.organizationId)
    );
    expect(
      options.find((siteOption) => siteOption.id === siteId)?.labels
    ).toStrictEqual([label]);

    const assignForeignLabelExit = await runJobsEffectExit(
      databaseUrl,
      SiteLabelAssignmentsRepository.assignToSite({
        labelId: foreignLabel.id,
        organizationId: identity.organizationId,
        siteId,
      })
    );
    expectFailureTag(assignForeignLabelExit, LABEL_NOT_FOUND_ERROR_TAG);

    const assignForeignSiteExit = await runJobsEffectExit(
      databaseUrl,
      SiteLabelAssignmentsRepository.assignToSite({
        labelId: label.id,
        organizationId: identity.organizationId,
        siteId: foreignSiteId,
      })
    );
    expectFailureTag(assignForeignSiteExit, SITE_NOT_FOUND_ERROR_TAG);

    const removed = await runJobsEffect(
      databaseUrl,
      SiteLabelAssignmentsRepository.removeFromSite({
        labelId: label.id,
        organizationId: identity.organizationId,
        siteId,
      })
    );
    expect(removed).toStrictEqual({
      changed: true,
      label,
    });

    const secondRemoved = await runJobsEffect(
      databaseUrl,
      SiteLabelAssignmentsRepository.removeFromSite({
        labelId: label.id,
        organizationId: identity.organizationId,
        siteId,
      })
    );
    expect(secondRemoved).toStrictEqual({
      changed: false,
      label,
    });

    const optionAfterRemove = expectSome(
      await runJobsEffect(
        databaseUrl,
        SitesRepository.getOptionById(identity.organizationId, siteId)
      )
    );
    expect(optionAfterRemove.labels).toStrictEqual([]);

    await runJobsEffect(
      databaseUrl,
      SiteLabelAssignmentsRepository.assignToSite({
        labelId: label.id,
        organizationId: identity.organizationId,
        siteId,
      })
    );
    await runJobsEffect(
      databaseUrl,
      LabelsRepository.archive(identity.organizationId, label.id)
    );

    const optionAfterArchive = expectSome(
      await runJobsEffect(
        databaseUrl,
        SitesRepository.getOptionById(identity.organizationId, siteId)
      )
    );
    expect(optionAfterArchive.labels).toStrictEqual([]);

    const optionsAfterArchive = await runJobsEffect(
      databaseUrl,
      SitesRepository.listOptions(identity.organizationId)
    );
    expect(
      optionsAfterArchive.find((siteOption) => siteOption.id === siteId)?.labels
    ).toStrictEqual([]);
  }, 30_000);

  it("rejects invalid label names at the database boundary", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping label constraint coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const oversizedLabelName = "x".repeat(49);

    await withPool(databaseUrl, async (pool) => {
      await expect(
        pool.query(
          `
            insert into labels (
              id,
              organization_id,
              name,
              normalized_name,
              created_at,
              updated_at
            )
            values ($1, $2, $3, $4, now(), now())
          `,
          [
            randomUUID(),
            identity.organizationId,
            oversizedLabelName,
            oversizedLabelName,
          ]
        )
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "labels_name_max_length_chk",
      });

      await expect(
        pool.query(
          `
            insert into labels (
              id,
              organization_id,
              name,
              normalized_name,
              created_at,
              updated_at
            )
            values ($1, $2, $3, $4, now(), now())
          `,
          [
            randomUUID(),
            identity.organizationId,
            "Valid label",
            oversizedLabelName,
          ]
        )
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "labels_normalized_name_max_length_chk",
      });
    });
  }, 30_000);

  it("enforces same-organization site label assignments at the database boundary", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "site_labels" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping site label boundary coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const primaryIdentity = await seedIdentityRecords(databaseUrl);
    const foreignIdentity = await seedIdentityRecords(databaseUrl);
    const primaryServiceAreaId = await insertServiceArea(
      databaseUrl,
      primaryIdentity.organizationId,
      "Primary site label area"
    );
    const foreignServiceAreaId = await insertServiceArea(
      databaseUrl,
      foreignIdentity.organizationId,
      "Foreign site label area"
    );
    const primarySiteId = await insertSite(
      databaseUrl,
      primaryIdentity.organizationId,
      primaryServiceAreaId,
      "Primary labelled site"
    );
    const foreignSiteId = await insertSite(
      databaseUrl,
      foreignIdentity.organizationId,
      foreignServiceAreaId,
      "Foreign labelled site"
    );
    const primaryLabelId = randomUUID();
    const foreignLabelId = randomUUID();

    await withPool(databaseUrl, async (pool) => {
      await pool.query(
        `
          insert into labels (
            id,
            organization_id,
            name,
            normalized_name,
            created_at,
            updated_at
          )
          values
            ($1, $2, 'Primary label', 'primary label', now(), now()),
            ($3, $4, 'Foreign label', 'foreign label', now(), now())
        `,
        [
          primaryLabelId,
          primaryIdentity.organizationId,
          foreignLabelId,
          foreignIdentity.organizationId,
        ]
      );

      await expect(
        pool.query(
          `
            insert into site_labels (
              site_id,
              label_id,
              organization_id,
              created_at
            )
            values ($1, $2, $3, now())
          `,
          [primarySiteId, primaryLabelId, primaryIdentity.organizationId]
        )
      ).resolves.toMatchObject({ rowCount: 1 });

      await expect(
        pool.query(
          `
            insert into site_labels (
              site_id,
              label_id,
              organization_id,
              created_at
            )
            values ($1, $2, $3, now())
          `,
          [primarySiteId, foreignLabelId, primaryIdentity.organizationId]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "site_labels_label_org_fk",
      });

      await expect(
        pool.query(
          `
            insert into site_labels (
              site_id,
              label_id,
              organization_id,
              created_at
            )
            values ($1, $2, $3, now())
          `,
          [foreignSiteId, primaryLabelId, primaryIdentity.organizationId]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "site_labels_site_org_fk",
      });
    });
  }, 30_000);

  it("lists organization activity with organization and filter boundaries", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping organization activity coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const foreignIdentity = await seedIdentityRecords(databaseUrl);

    const middleJobId = decodeWorkItemId(
      "00000000-0000-4000-8000-000000000102"
    );
    const newestJobId = decodeWorkItemId(
      "00000000-0000-4000-8000-000000000103"
    );
    const foreignJobId = decodeWorkItemId(
      "00000000-0000-4000-8000-000000000104"
    );
    const middleCreatedActivityId = "00000000-0000-4000-8000-000000000201";
    const middleStatusActivityId = "00000000-0000-4000-8000-000000000202";
    const newestActivityId = "00000000-0000-4000-8000-000000000203";

    await withPool(databaseUrl, async (pool) => {
      const db = drizzle(pool);

      await db.insert(workItem).values([
        {
          assigneeId: null,
          blockedReason: null,
          completedAt: null,
          completedByUserId: null,
          contactId: null,
          coordinatorId: null,
          createdAt: new Date("2026-04-21T10:00:00.000Z"),
          createdByUserId: identity.ownerUserId,
          id: middleJobId,
          kind: "job",
          organizationId: identity.organizationId,
          priority: "none",
          siteId: null,
          status: "in_progress",
          title: "Middle activity job",
          updatedAt: new Date("2026-04-21T10:00:00.000Z"),
        },
        {
          assigneeId: null,
          blockedReason: null,
          completedAt: null,
          completedByUserId: null,
          contactId: null,
          coordinatorId: null,
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          createdByUserId: identity.ownerUserId,
          id: newestJobId,
          kind: "job",
          organizationId: identity.organizationId,
          priority: "none",
          siteId: null,
          status: "in_progress",
          title: "Newest activity job",
          updatedAt: new Date("2026-04-22T10:00:00.000Z"),
        },
        {
          assigneeId: null,
          blockedReason: null,
          completedAt: null,
          completedByUserId: null,
          contactId: null,
          coordinatorId: null,
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          createdByUserId: foreignIdentity.ownerUserId,
          id: foreignJobId,
          kind: "job",
          organizationId: foreignIdentity.organizationId,
          priority: "none",
          siteId: null,
          status: "new",
          title: "Foreign activity job",
          updatedAt: new Date("2026-04-22T10:00:00.000Z"),
        },
      ]);

      const activityRows: (typeof workItemActivity.$inferInsert)[] = [
        {
          actorUserId: identity.ownerUserId,
          createdAt: new Date("2026-04-21T10:00:00.000Z"),
          eventType: "job_created",
          id: middleCreatedActivityId,
          organizationId: identity.organizationId,
          payload: {
            eventType: "job_created",
            kind: "job",
            priority: "none",
            title: "Middle activity job",
          },
          workItemId: middleJobId,
        },
        {
          actorUserId: identity.assigneeUserId,
          createdAt: new Date("2026-04-21T10:00:00.000Z"),
          eventType: "status_changed",
          id: middleStatusActivityId,
          organizationId: identity.organizationId,
          payload: {
            eventType: "status_changed",
            fromStatus: "new",
            toStatus: "in_progress",
          },
          workItemId: middleJobId,
        },
        {
          actorUserId: identity.ownerUserId,
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          eventType: "status_changed",
          id: newestActivityId,
          organizationId: identity.organizationId,
          payload: {
            eventType: "status_changed",
            fromStatus: "in_progress",
            toStatus: "blocked",
          },
          workItemId: newestJobId,
        },
        {
          actorUserId: foreignIdentity.ownerUserId,
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          eventType: "job_created",
          id: randomUUID(),
          organizationId: foreignIdentity.organizationId,
          payload: {
            eventType: "job_created",
            kind: "job",
            priority: "none",
            title: "Foreign activity job",
          },
          workItemId: foreignJobId,
        },
      ];

      await db.insert(workItemActivity).values(activityRows);
    });

    const firstPage = await runJobsEffect(
      databaseUrl,
      JobsRepository.listOrganizationActivity(identity.organizationId, {
        limit: 2,
      })
    );
    const secondPage = await runJobsEffect(
      databaseUrl,
      JobsRepository.listOrganizationActivity(identity.organizationId, {
        cursor: firstPage.nextCursor,
        limit: 2,
      })
    );
    const all = await runJobsEffect(
      databaseUrl,
      JobsRepository.listOrganizationActivity(identity.organizationId, {})
    );
    const byActor = await runJobsEffect(
      databaseUrl,
      JobsRepository.listOrganizationActivity(identity.organizationId, {
        actorUserId: identity.ownerUserId,
      })
    );
    const byEvent = await runJobsEffect(
      databaseUrl,
      JobsRepository.listOrganizationActivity(identity.organizationId, {
        eventType: "status_changed",
      })
    );
    const byDate = await runJobsEffect(
      databaseUrl,
      JobsRepository.listOrganizationActivity(identity.organizationId, {
        fromDate: "2026-04-21",
        toDate: "2026-04-21",
      })
    );
    const byJobTitle = await runJobsEffect(
      databaseUrl,
      JobsRepository.listOrganizationActivity(identity.organizationId, {
        jobTitle: "Middle",
      })
    );
    const malformedCursorExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.listOrganizationActivity(identity.organizationId, {
        cursor: "not-json" as never,
      })
    );
    const nonUuidCursor = Buffer.from(
      JSON.stringify({
        id: "not-a-uuid",
        createdAt: "2026-04-21T10:00:00.000Z",
      })
    ).toString("base64url");
    const nonUuidCursorExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.listOrganizationActivity(identity.organizationId, {
        cursor: nonUuidCursor as never,
      })
    );

    expect(firstPage.items.map((item) => item.id)).toStrictEqual([
      newestActivityId,
      middleStatusActivityId,
    ]);
    expect(firstPage.nextCursor).toBeDefined();
    expect(secondPage.items.map((item) => item.id)).toStrictEqual([
      middleCreatedActivityId,
    ]);
    expect(secondPage.nextCursor).toBeUndefined();
    expect(all.items.map((item) => item.id)).toStrictEqual([
      newestActivityId,
      middleStatusActivityId,
      middleCreatedActivityId,
    ]);
    expect(byActor.items).toHaveLength(2);
    expect(byEvent.items.map((item) => item.eventType)).toStrictEqual([
      "status_changed",
      "status_changed",
    ]);
    expect(byDate.items.map((item) => item.createdAt)).toStrictEqual([
      "2026-04-21T10:00:00.000Z",
      "2026-04-21T10:00:00.000Z",
    ]);
    expect(byJobTitle.items.map((item) => item.jobTitle)).toStrictEqual([
      "Middle activity job",
      "Middle activity job",
    ]);
    expectFailureTag(
      malformedCursorExit,
      "@ceird/jobs-core/OrganizationActivityCursorInvalidError"
    );
    expectFailureTag(
      nonUuidCursorExit,
      "@ceird/jobs-core/OrganizationActivityCursorInvalidError"
    );
  }, 30_000);

  it("rejects cost lines that would make the job subtotal unsafe and leaves detail decodable", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping repository cost subtotal coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const firstLine = {
      authorUserId: identity.ownerUserId,
      description: "Major equipment package",
      organizationId: identity.organizationId,
      quantity: 4_194_304,
      type: "material" as const,
      unitPriceMinor: 2_147_483_647,
    };

    const createdJob = await runJobsEffect(
      databaseUrl,
      withJobsTransaction(
        Effect.gen(function* () {
          const job = yield* JobsRepository.create({
            createdByUserId: identity.ownerUserId,
            organizationId: identity.organizationId,
            title: "Replace plant room equipment",
          });

          yield* JobsRepository.addCostLine({
            ...firstLine,
            workItemId: job.id,
          });

          return job;
        })
      )
    );

    const overflowingLineExit = await runJobsEffectExit(
      databaseUrl,
      withJobsTransaction(
        JobsRepository.addCostLine({
          authorUserId: identity.ownerUserId,
          description: "Overflowing follow-up line",
          organizationId: identity.organizationId,
          quantity: 1,
          type: "material",
          unitPriceMinor: 5_000_000,
          workItemId: createdJob.id,
        })
      )
    );

    expectFailureTag(
      overflowingLineExit,
      JOB_COST_SUMMARY_LIMIT_EXCEEDED_ERROR_TAG
    );

    const detail = await runJobsEffect(
      databaseUrl,
      JobsRepository.getDetail(identity.organizationId, createdJob.id)
    );
    const detailValue = expectSome(detail);

    expect(detailValue.costs?.lines).toHaveLength(1);
    expect(detailValue.costs?.summary).toStrictEqual({
      subtotalMinor: calculateJobCostLineTotalMinor(firstLine),
    });
  }, 30_000);

  it("uses canonical decimal line totals when checking the job subtotal limit", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping repository decimal subtotal coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);
    const createdJob = await runJobsEffect(
      databaseUrl,
      withJobsTransaction(
        Effect.gen(function* () {
          const job = yield* JobsRepository.create({
            createdByUserId: identity.ownerUserId,
            organizationId: identity.organizationId,
            title: "Replace plant room equipment",
          });

          yield* JobsRepository.addCostLine({
            authorUserId: identity.ownerUserId,
            description: "Major equipment package",
            organizationId: identity.organizationId,
            quantity: 4_194_304,
            type: "material",
            unitPriceMinor: 2_147_483_647,
            workItemId: job.id,
          });
          yield* JobsRepository.addCostLine({
            authorUserId: identity.ownerUserId,
            description: "Final safe subtotal line",
            organizationId: identity.organizationId,
            quantity: 1,
            type: "material",
            unitPriceMinor: 4_194_289,
            workItemId: job.id,
          });

          return job;
        })
      )
    );

    const fractionalOverflowExit = await runJobsEffectExit(
      databaseUrl,
      withJobsTransaction(
        JobsRepository.addCostLine({
          authorUserId: identity.ownerUserId,
          description: "Fractional line that rounds over the limit",
          organizationId: identity.organizationId,
          quantity: 0.29,
          type: "material",
          unitPriceMinor: 50,
          workItemId: createdJob.id,
        })
      )
    );

    expectFailureTag(
      fractionalOverflowExit,
      JOB_COST_SUMMARY_LIMIT_EXCEEDED_ERROR_TAG
    );

    const detail = await runJobsEffect(
      databaseUrl,
      JobsRepository.getDetail(identity.organizationId, createdJob.id)
    );
    const detailValue = expectSome(detail);

    expect(detailValue.costs?.lines).toHaveLength(2);
    expect(detailValue.costs?.summary.subtotalMinor).toBe(
      Number.MAX_SAFE_INTEGER - 14
    );
  }, 30_000);

  it("rejects foreign-organization references on writes", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping organization-boundary coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const primaryIdentity = await seedIdentityRecords(databaseUrl);
    const foreignIdentity = await seedIdentityRecords(databaseUrl);
    const primaryServiceAreaId = await insertServiceArea(
      databaseUrl,
      primaryIdentity.organizationId,
      "Primary"
    );
    const foreignServiceAreaId = await insertServiceArea(
      databaseUrl,
      foreignIdentity.organizationId,
      "Foreign"
    );
    const primarySiteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.create({
        country: "IE",
        addressLine1: "Primary Site",
        county: "Cork",
        eircode: "T12 X2X2",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "stub",
        name: "Primary Site",
        organizationId: primaryIdentity.organizationId,
        serviceAreaId: primaryServiceAreaId,
        latitude: 51.899,
        longitude: -8.475,
      })
    );
    const foreignSiteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.create({
        country: "IE",
        addressLine1: "Foreign Site",
        county: "Galway",
        eircode: "H91 X2X2",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "stub",
        name: "Foreign Site",
        organizationId: foreignIdentity.organizationId,
        serviceAreaId: foreignServiceAreaId,
        latitude: 53.2734,
        longitude: -9.0511,
      })
    );
    const foreignContactId = await runJobsEffect(
      databaseUrl,
      ContactsRepository.create({
        name: "Foreign Contact",
        organizationId: foreignIdentity.organizationId,
      })
    );
    const archivedPrimarySiteId = await runJobsEffect(
      databaseUrl,
      SitesRepository.create({
        country: "IE",
        addressLine1: "Archived Primary Site",
        county: "Cork",
        eircode: "T12 Y2Y2",
        geocodedAt: "2026-04-27T10:00:00.000Z",
        geocodingProvider: "stub",
        name: "Archived Primary Site",
        organizationId: primaryIdentity.organizationId,
        serviceAreaId: primaryServiceAreaId,
        latitude: 51.899,
        longitude: -8.475,
      })
    );
    const archivedPrimaryContactId = await runJobsEffect(
      databaseUrl,
      ContactsRepository.create({
        name: "Archived Primary Contact",
        organizationId: primaryIdentity.organizationId,
      })
    );
    const jobWithArchivedContact = await runJobsEffect(
      databaseUrl,
      JobsRepository.create({
        contactId: archivedPrimaryContactId,
        createdByUserId: primaryIdentity.ownerUserId,
        organizationId: primaryIdentity.organizationId,
        title: "Job whose contact is archived later",
      })
    );

    await withPool(databaseUrl, async (pool) => {
      await pool.query("update sites set archived_at = now() where id = $1", [
        archivedPrimarySiteId,
      ]);
      await pool.query(
        "update contacts set archived_at = now() where id = $1",
        [archivedPrimaryContactId]
      );
    });

    const primaryJob = await runJobsEffect(
      databaseUrl,
      JobsRepository.create({
        createdByUserId: primaryIdentity.ownerUserId,
        organizationId: primaryIdentity.organizationId,
        title: "Primary org job",
      })
    );
    const primaryLabel = await runJobsEffect(
      databaseUrl,
      LabelsRepository.create({
        name: "Primary label",
        organizationId: primaryIdentity.organizationId,
      })
    );
    const foreignLabel = await runJobsEffect(
      databaseUrl,
      LabelsRepository.create({
        name: "Foreign label",
        organizationId: foreignIdentity.organizationId,
      })
    );

    const archivedContactDetail = await runJobsEffect(
      databaseUrl,
      JobsRepository.getDetail(
        primaryIdentity.organizationId,
        jobWithArchivedContact.id
      )
    );
    const createWithForeignContactExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.create({
        contactId: foreignContactId,
        createdByUserId: primaryIdentity.ownerUserId,
        organizationId: primaryIdentity.organizationId,
        title: "Should fail",
      })
    );
    const createWithForeignSiteExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.create({
        createdByUserId: primaryIdentity.ownerUserId,
        organizationId: primaryIdentity.organizationId,
        siteId: foreignSiteId,
        title: "Should fail",
      })
    );
    const createWithArchivedContactExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.create({
        contactId: archivedPrimaryContactId,
        createdByUserId: primaryIdentity.ownerUserId,
        organizationId: primaryIdentity.organizationId,
        title: "Should fail",
      })
    );
    const createWithArchivedSiteExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.create({
        createdByUserId: primaryIdentity.ownerUserId,
        organizationId: primaryIdentity.organizationId,
        siteId: archivedPrimarySiteId,
        title: "Should fail",
      })
    );
    const linkForeignContactExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.linkSiteContact({
        contactId: foreignContactId,
        organizationId: primaryIdentity.organizationId,
        siteId: primarySiteId,
      })
    );
    const linkForeignSiteExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.linkSiteContact({
        contactId: foreignContactId,
        organizationId: primaryIdentity.organizationId,
        siteId: foreignSiteId,
      })
    );
    const linkArchivedContactExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.linkSiteContact({
        contactId: archivedPrimaryContactId,
        organizationId: primaryIdentity.organizationId,
        siteId: primarySiteId,
      })
    );
    const linkArchivedSiteExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.linkSiteContact({
        contactId: archivedPrimaryContactId,
        organizationId: primaryIdentity.organizationId,
        siteId: archivedPrimarySiteId,
      })
    );
    const commentFromForeignMemberExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.addComment({
        authorUserId: foreignIdentity.ownerUserId,
        body: "Cross-org comment",
        organizationId: primaryIdentity.organizationId,
        workItemId: primaryJob.id,
      })
    );
    const visitWithForeignOrganizationExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.addVisit({
        authorUserId: foreignIdentity.ownerUserId,
        durationMinutes: 60,
        note: "Cross-org visit",
        organizationId: foreignIdentity.organizationId,
        visitDate: "2026-04-21",
        workItemId: primaryJob.id,
      })
    );
    const assignForeignLabelExit = await runJobsEffectExit(
      databaseUrl,
      JobLabelAssignmentsRepository.assignToJob({
        labelId: foreignLabel.id,
        organizationId: primaryIdentity.organizationId,
        workItemId: primaryJob.id,
      })
    );

    await expect(
      withPool(databaseUrl, async (pool) => {
        await pool.query(
          `
          insert into work_item_cost_lines (
            id,
            work_item_id,
            organization_id,
            author_user_id,
            type,
            description,
            quantity,
            unit_price_minor
          )
          values ($1, $2, $3, $4, 'material', 'Cross-org material', 1, 100)
          `,
          [
            randomUUID(),
            primaryJob.id,
            foreignIdentity.organizationId,
            foreignIdentity.ownerUserId,
          ]
        );
      })
    ).rejects.toMatchObject({
      code: "23503",
      constraint: "work_item_cost_lines_work_item_organization_fk",
    });

    expectFailureTag(
      createWithForeignContactExit,
      "@ceird/jobs-core/ContactNotFoundError"
    );
    expect(expectSome(archivedContactDetail).contact).toBeUndefined();
    expectFailureTag(createWithForeignSiteExit, SITE_NOT_FOUND_ERROR_TAG);
    expectFailureTag(
      createWithArchivedContactExit,
      "@ceird/jobs-core/ContactNotFoundError"
    );
    expectFailureTag(createWithArchivedSiteExit, SITE_NOT_FOUND_ERROR_TAG);
    expectFailureTag(
      linkForeignContactExit,
      "@ceird/jobs-core/ContactNotFoundError"
    );
    expectFailureTag(linkForeignSiteExit, SITE_NOT_FOUND_ERROR_TAG);
    expectFailureTag(
      linkArchivedContactExit,
      "@ceird/jobs-core/ContactNotFoundError"
    );
    expectFailureTag(linkArchivedSiteExit, SITE_NOT_FOUND_ERROR_TAG);
    expectFailureTag(
      commentFromForeignMemberExit,
      "@ceird/jobs-core/OrganizationMemberNotFoundError"
    );
    expectFailureTag(
      visitWithForeignOrganizationExit,
      "@ceird/domains/jobs/WorkItemOrganizationMismatchError"
    );
    expectFailureTag(assignForeignLabelExit, LABEL_NOT_FOUND_ERROR_TAG);

    await withPool(databaseUrl, async (pool) => {
      await expect(
        pool.query(
          `
            insert into work_items (
              id,
              organization_id,
              kind,
              title,
              status,
              priority,
              site_id,
              created_by_user_id
            )
            values ($1, $2, 'job', 'Cross-org site raw insert', 'new', 'none', $3, $4)
          `,
          [
            randomUUID(),
            primaryIdentity.organizationId,
            foreignSiteId,
            primaryIdentity.ownerUserId,
          ]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "work_items_site_org_fk",
      });

      await expect(
        pool.query(
          `
            insert into work_items (
              id,
              organization_id,
              kind,
              title,
              status,
              priority,
              contact_id,
              created_by_user_id
            )
            values ($1, $2, 'job', 'Cross-org contact raw insert', 'new', 'none', $3, $4)
          `,
          [
            randomUUID(),
            primaryIdentity.organizationId,
            foreignContactId,
            primaryIdentity.ownerUserId,
          ]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "work_items_contact_org_fk",
      });

      await expect(
        pool.query(
          `
            insert into site_contacts (
              site_id,
              contact_id,
              organization_id
            )
            values ($1, $2, $3)
          `,
          [primarySiteId, foreignContactId, primaryIdentity.organizationId]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "site_contacts_contact_org_fk",
      });

      await expect(
        pool.query(
          `
            insert into work_item_activity (
              id,
              work_item_id,
              organization_id,
              event_type,
              payload
            )
            values ($1, $2, $3, 'job_created', '{}'::jsonb)
          `,
          [randomUUID(), primaryJob.id, foreignIdentity.organizationId]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "work_item_activity_work_item_organization_fk",
      });

      await expect(
        pool.query(
          `
            insert into work_item_visits (
              id,
              work_item_id,
              organization_id,
              author_user_id,
              visit_date,
              duration_minutes,
              note
            )
            values ($1, $2, $3, $4, '2026-04-21', 60, 'Cross-org raw visit')
          `,
          [
            randomUUID(),
            primaryJob.id,
            foreignIdentity.organizationId,
            foreignIdentity.ownerUserId,
          ]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "work_item_visits_work_item_organization_fk",
      });

      await expect(
        pool.query(
          `
            insert into work_item_labels (
              work_item_id,
              label_id,
              organization_id,
              created_at
            )
            values ($1, $2, $3, now())
          `,
          [primaryJob.id, foreignLabel.id, primaryIdentity.organizationId]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "work_item_labels_label_org_fk",
      });

      await expect(
        pool.query(
          `
            insert into work_item_labels (
              work_item_id,
              label_id,
              organization_id,
              created_at
            )
            values ($1, $2, $3, now())
          `,
          [primaryJob.id, foreignLabel.id, foreignIdentity.organizationId]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "work_item_labels_work_item_org_fk",
      });

      const crossOrgCommentId = randomUUID();

      await pool.query("begin");
      await pool.query(
        `
          insert into comments (
            id,
            organization_id,
            author_user_id,
            body
          )
          values ($1, $2, $3, 'Cross-org shared comment')
        `,
        [
          crossOrgCommentId,
          primaryIdentity.organizationId,
          primaryIdentity.ownerUserId,
        ]
      );
      await expect(
        pool.query(
          `
            insert into work_item_comments (
              comment_id,
              organization_id,
              work_item_id
            )
            values ($1, $2, $3)
          `,
          [crossOrgCommentId, foreignIdentity.organizationId, primaryJob.id]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "work_item_comments_comment_org_fk",
      });
      await pool.query("rollback");

      const crossOrgSiteCommentId = randomUUID();

      await pool.query("begin");
      await pool.query(
        `
          insert into comments (
            id,
            organization_id,
            author_user_id,
            body
          )
          values ($1, $2, $3, 'Cross-org shared site comment')
        `,
        [
          crossOrgSiteCommentId,
          primaryIdentity.organizationId,
          primaryIdentity.ownerUserId,
        ]
      );
      await expect(
        pool.query(
          `
            insert into site_comments (
              comment_id,
              organization_id,
              site_id
            )
            values ($1, $2, $3)
          `,
          [crossOrgSiteCommentId, foreignIdentity.organizationId, primarySiteId]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "site_comments_comment_org_fk",
      });
      await pool.query("rollback");

      const crossOrgTargetCommentId = randomUUID();

      await pool.query("begin");
      await pool.query(
        `
          insert into comments (
            id,
            organization_id,
            author_user_id,
            body
          )
          values ($1, $2, $3, 'Cross-org target shared comment')
        `,
        [
          crossOrgTargetCommentId,
          foreignIdentity.organizationId,
          foreignIdentity.ownerUserId,
        ]
      );
      await expect(
        pool.query(
          `
            insert into work_item_comments (
              comment_id,
              organization_id,
              work_item_id
            )
            values ($1, $2, $3)
          `,
          [
            crossOrgTargetCommentId,
            foreignIdentity.organizationId,
            primaryJob.id,
          ]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "work_item_comments_work_item_org_fk",
      });
      await pool.query("rollback");

      const crossOrgTargetSiteCommentId = randomUUID();

      await pool.query("begin");
      await pool.query(
        `
          insert into comments (
            id,
            organization_id,
            author_user_id,
            body
          )
          values ($1, $2, $3, 'Cross-org target shared site comment')
        `,
        [
          crossOrgTargetSiteCommentId,
          foreignIdentity.organizationId,
          foreignIdentity.ownerUserId,
        ]
      );
      await expect(
        pool.query(
          `
            insert into site_comments (
              comment_id,
              organization_id,
              site_id
            )
            values ($1, $2, $3)
          `,
          [
            crossOrgTargetSiteCommentId,
            foreignIdentity.organizationId,
            primarySiteId,
          ]
        )
      ).rejects.toMatchObject({
        code: "23503",
        constraint: "site_comments_site_org_fk",
      });
      await pool.query("rollback");

      await expect(
        pool.query(
          `
            insert into work_item_labels (
              work_item_id,
              label_id,
              organization_id,
              created_at
            )
            values ($1, $2, $3, now())
          `,
          [primaryJob.id, primaryLabel.id, primaryIdentity.organizationId]
        )
      ).resolves.toMatchObject({ rowCount: 1 });
    });
  }, 30_000);

  it("rejects invalid site geocoding metadata at the database boundary", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping site geocoding constraint coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);

    await withPool(databaseUrl, async (pool) => {
      const insertInvalidSite = async (
        overrides: Partial<{
          readonly country: string;
          readonly addressLine1: string | null;
          readonly county: string | null;
          readonly eircode: string | null;
          readonly geocodedAt: string | null;
          readonly geocodingProvider: string | null;
          readonly latitude: number | null;
          readonly longitude: number | null;
          readonly name: string;
        }>
      ) =>
        await pool.query(
          `
            insert into sites (
              id,
              organization_id,
              name,
              address_line_1,
              county,
              eircode,
              country,
              latitude,
              longitude,
              geocoding_provider,
              geocoded_at,
              created_at,
              updated_at
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
          `,
          [
            randomUUID(),
            identity.organizationId,
            overrides.name ?? "Invalid geocoding site",
            "addressLine1" in overrides
              ? overrides.addressLine1
              : "1 Custom House Quay",
            "county" in overrides ? overrides.county : "Dublin",
            "eircode" in overrides ? overrides.eircode : "D01 X2X2",
            overrides.country ?? "IE",
            overrides.latitude ?? null,
            overrides.longitude ?? null,
            overrides.geocodingProvider ?? null,
            overrides.geocodedAt ?? null,
          ]
        );

      await expect(
        insertInvalidSite({
          addressLine1: null,
          geocodedAt: "2026-04-27T10:00:00.000Z",
          geocodingProvider: "google",
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Missing address",
        })
      ).rejects.toMatchObject({
        code: "23502",
        column: "address_line_1",
      });

      await expect(
        insertInvalidSite({
          county: null,
          geocodedAt: "2026-04-27T10:00:00.000Z",
          geocodingProvider: "google",
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Missing county",
        })
      ).rejects.toMatchObject({
        code: "23502",
        column: "county",
      });

      await expect(
        insertInvalidSite({
          eircode: null,
          geocodedAt: "2026-04-27T10:00:00.000Z",
          geocodingProvider: "google",
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Irish site missing Eircode",
        })
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "sites_ie_eircode_required_chk",
      });

      await expect(
        insertInvalidSite({
          geocodedAt: "2026-04-27T10:00:00.000Z",
          geocodingProvider: "google",
          latitude: null,
          longitude: -6.2603,
          name: "Missing latitude",
        })
      ).rejects.toMatchObject({
        code: "23502",
        column: "latitude",
      });

      await expect(
        insertInvalidSite({
          geocodedAt: null,
          geocodingProvider: "google",
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Missing geocoded timestamp",
        })
      ).rejects.toMatchObject({
        code: "23502",
        column: "geocoded_at",
      });

      await expect(
        insertInvalidSite({
          geocodedAt: "2026-04-27T10:00:00.000Z",
          geocodingProvider: "manual",
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Invalid provider",
        })
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "sites_geocoding_provider_chk",
      });

      await expect(
        insertInvalidSite({
          country: "US",
          geocodedAt: "2026-04-27T10:00:00.000Z",
          geocodingProvider: "google",
          latitude: 53.3498,
          longitude: -6.2603,
          name: "Invalid country",
        })
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "sites_country_chk",
      });

      await expect(
        insertInvalidSite({
          geocodedAt: "2026-04-27T10:00:00.000Z",
          geocodingProvider: "google",
          latitude: 91,
          longitude: -6.2603,
          name: "Invalid latitude",
        })
      ).rejects.toMatchObject({
        code: "23514",
        constraint: "sites_latitude_range_check",
      });
    });
  }, 30_000);

  it("rolls back multi-step writes wrapped in a repository transaction", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping transaction rollback coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);

    const exit = await runJobsEffectExit(
      databaseUrl,
      withJobsTransaction(
        Effect.gen(function* () {
          const job = yield* JobsRepository.create({
            createdByUserId: identity.ownerUserId,
            organizationId: identity.organizationId,
            title: "Should never persist",
          });

          yield* JobsRepository.addComment({
            authorUserId: identity.ownerUserId,
            body: "This comment should also roll back.",
            organizationId: identity.organizationId,
            workItemId: job.id,
          });

          return yield* Effect.fail("rollback");
        })
      )
    );

    expect(exit._tag).toBe("Failure");

    const jobs = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, {})
    );

    expect(jobs.items).toHaveLength(0);
  }, 30_000);

  it("manages service areas and rate cards through configuration repositories", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_repo" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping configuration repository coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    const identity = await seedIdentityRecords(databaseUrl);

    const createdServiceArea = await runJobsEffect(
      databaseUrl,
      ConfigurationRepository.create({
        description: "City centre jobs",
        name: "Dublin",
        organizationId: identity.organizationId,
      })
    );
    const updatedServiceArea = await runJobsEffect(
      databaseUrl,
      ConfigurationRepository.update(
        identity.organizationId,
        createdServiceArea.id,
        {
          description: "Updated city centre jobs",
          name: "Dublin Central",
        }
      )
    );
    const serviceAreas = await runJobsEffect(
      databaseUrl,
      ConfigurationRepository.list(identity.organizationId)
    );

    expect(updatedServiceArea).toMatchObject({
      description: "Updated city centre jobs",
      id: createdServiceArea.id,
      name: "Dublin Central",
    });
    expect(serviceAreas).toContainEqual(updatedServiceArea);

    const clearedServiceArea = await runJobsEffect(
      databaseUrl,
      ConfigurationRepository.update(
        identity.organizationId,
        createdServiceArea.id,
        {
          description: null,
        }
      )
    );

    expect(clearedServiceArea).toMatchObject({
      id: createdServiceArea.id,
      name: "Dublin Central",
    });
    expect(clearedServiceArea.description).toBeUndefined();

    const createdRateCard = await runJobsEffect(
      databaseUrl,
      RateCardsRepository.create({
        lines: [
          {
            kind: "labour",
            name: "Engineer",
            position: 2,
            unit: "hour",
            value: 95.5,
          },
          {
            kind: "callout",
            name: "Standard callout",
            position: 1,
            unit: "visit",
            value: 125,
          },
        ],
        name: "Standard",
        organizationId: identity.organizationId,
      })
    );

    expect(createdRateCard.name).toBe("Standard");
    expect(createdRateCard.lines.map((line) => line.name)).toStrictEqual([
      "Standard callout",
      "Engineer",
    ]);
    expect(createdRateCard.lines.map((line) => line.value)).toStrictEqual([
      125, 95.5,
    ]);

    const updatedRateCard = await runJobsEffect(
      databaseUrl,
      RateCardsRepository.update(identity.organizationId, createdRateCard.id, {
        lines: [
          {
            kind: "material_markup",
            name: "Filter kit",
            position: 1,
            unit: "each",
            value: 42.25,
          },
        ],
        name: "Standard 2026",
      })
    );
    const rateCards = await runJobsEffect(
      databaseUrl,
      RateCardsRepository.list(identity.organizationId)
    );

    expect(updatedRateCard).toMatchObject({
      id: createdRateCard.id,
      name: "Standard 2026",
    });
    expect(updatedRateCard.lines).toHaveLength(1);
    expect(updatedRateCard.lines[0]).toMatchObject({
      kind: "material_markup",
      name: "Filter kit",
      position: 1,
      rateCardId: createdRateCard.id,
      unit: "each",
      value: 42.25,
    });
    expect(rateCards).toContainEqual(updatedRateCard);
  }, 30_000);
});

async function runJobsEffect<Value, Error, Requirements>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, Requirements>
): Promise<Value> {
  return await Effect.runPromise(
    Effect.scoped(prepareJobsEffect(databaseUrl, effect))
  );
}

async function runJobsEffectExit<Value, Error, Requirements>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, Requirements>
): Promise<Exit.Exit<Value, Error>> {
  return await Effect.runPromiseExit(
    Effect.scoped(prepareJobsEffect(databaseUrl, effect))
  );
}

function makeConfigProvider(databaseUrl: string) {
  return ConfigProvider.fromMap(
    new Map([
      ["DATABASE_URL", databaseUrl],
      ["JOBS_DEFAULT_LIST_LIMIT", "50"],
    ])
  );
}

function prepareJobsEffect<Value, Error, Requirements>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, Requirements>
) {
  return effect.pipe(
    Effect.provide(CommentsRepository.Default),
    Effect.provide(LabelsRepository.Default),
    Effect.provide(ConfigurationRepository.Default),
    Effect.provide(SitesRepository.Default),
    Effect.provide(SiteLabelAssignmentsRepository.Default),
    Effect.provide(JobsRepositoriesLive),
    Effect.provide(AppEffectSqlRuntimeLive),
    Effect.withConfigProvider(makeConfigProvider(databaseUrl))
  ) as Effect.Effect<Value, Error, never>;
}

const migrationsBeforeSharedComments = [
  "0000_careless_anita_blake.sql",
  "0001_giant_speedball.sql",
  "0002_slippery_hulk.sql",
  "0003_organizations.sql",
  "0004_spotty_rick_jones.sql",
  "0005_add-site-coordinates.sql",
  "0006_careless_william_stryker.sql",
  "0007_organization_role_contracts.sql",
  "0008_marvelous_cloak.sql",
  "0009_slow_bloodscream.sql",
  "0010_spicy_boomerang.sql",
  "0011_mature_vertigo.sql",
  "0012_chunky_mercury.sql",
  "0013_old_cobalt_man.sql",
  "0014_peaceful_shadow_king.sql",
  "0015_steep_mojo.sql",
  "0016_work_item_collaborators.sql",
  "0017_absent_iron_fist.sql",
] as const;

async function applyMigrationsBeforeSharedComments(databaseUrl: string) {
  for (const migration of migrationsBeforeSharedComments) {
    await applyMigration(databaseUrl, migration);
  }
}

async function seedIdentityRecords(databaseUrl: string) {
  const organizationId = decodeOrganizationId(randomUUID());
  const ownerUserId = decodeUserId(randomUUID());
  const assigneeUserId = decodeUserId(randomUUID());
  const coordinatorUserId = decodeUserId(randomUUID());

  await withPool(databaseUrl, async (pool) => {
    const db = drizzle(pool);

    await db.insert(organization).values({
      id: organizationId,
      name: "Northwind Construction",
      slug: `northwind-${Date.now()}`,
    });
    await db.insert(user).values([
      {
        email: `owner-${Date.now()}@example.com`,
        emailVerified: true,
        id: ownerUserId,
        name: "Owner User",
      },
      {
        email: `assignee-${Date.now()}@example.com`,
        emailVerified: true,
        id: assigneeUserId,
        name: "Assignee User",
      },
      {
        email: `coordinator-${Date.now()}@example.com`,
        emailVerified: true,
        id: coordinatorUserId,
        name: "Coordinator User",
      },
    ]);
    await db.insert(member).values([
      {
        createdAt: new Date(),
        id: randomUUID(),
        organizationId,
        role: "owner",
        userId: ownerUserId,
      },
      {
        createdAt: new Date(),
        id: randomUUID(),
        organizationId,
        role: "member",
        userId: assigneeUserId,
      },
      {
        createdAt: new Date(),
        id: randomUUID(),
        organizationId,
        role: "member",
        userId: coordinatorUserId,
      },
    ]);
  });

  return {
    assigneeUserId,
    coordinatorUserId,
    organizationId,
    ownerUserId,
  };
}

async function insertServiceArea(
  databaseUrl: string,
  organizationId: Schema.Schema.Type<typeof OrganizationId>,
  name: string
) {
  const serviceAreaId = decodeServiceAreaId(randomUUID());

  await withPool(databaseUrl, async (pool) => {
    const db = drizzle(pool);

    await db.insert(serviceArea).values({
      id: serviceAreaId,
      name,
      organizationId,
      slug: name.toLowerCase(),
      updatedAt: new Date(),
      createdAt: new Date(),
    });
  });

  return serviceAreaId;
}

async function insertMember(
  databaseUrl: string,
  organizationId: Schema.Schema.Type<typeof OrganizationId>,
  role: "admin" | "external" | "member" | "owner"
) {
  const userId = decodeUserId(randomUUID());

  await withPool(databaseUrl, async (pool) => {
    const db = drizzle(pool);

    await db.insert(user).values({
      email: `${role}-${Date.now()}-${randomUUID()}@example.com`,
      emailVerified: true,
      id: userId,
      name: `${role} user`,
    });
    await db.insert(member).values({
      createdAt: new Date(),
      id: randomUUID(),
      organizationId,
      role,
      userId,
    });
  });

  return userId;
}

async function insertSite(
  databaseUrl: string,
  organizationId: Schema.Schema.Type<typeof OrganizationId>,
  serviceAreaId: Schema.Schema.Type<typeof ServiceAreaId>,
  name: string
) {
  const siteId = decodeSiteId(randomUUID());

  await withPool(databaseUrl, async (pool) => {
    const db = drizzle(pool);

    await db.insert(site).values({
      addressLine1: name,
      country: "IE",
      county: "Dublin",
      eircode: "D01 X2X2",
      geocodedAt: new Date("2026-04-27T10:00:00.000Z"),
      geocodingProvider: "stub",
      id: siteId,
      latitude: 53.3498,
      longitude: -6.2603,
      name,
      organizationId,
      serviceAreaId,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
  });

  return siteId;
}

const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeServiceAreaId = Schema.decodeUnknownSync(ServiceAreaId);
const decodeSiteId = Schema.decodeUnknownSync(SiteId);
const decodeUserId = Schema.decodeUnknownSync(UserId);
const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);

function expectFailureTag<Value, Error>(
  exit: Exit.Exit<Value, Error>,
  expectedTag: string
) {
  const failure = Exit.isFailure(exit)
    ? ((Option.getOrUndefined(Cause.failureOption(exit.cause)) as
        | { readonly _tag?: string }
        | undefined) ?? undefined)
    : undefined;

  expect(failure?._tag).toBe(expectedTag);
}

function expectSome<Value>(option: Option.Option<Value>): Value {
  const value = Option.getOrUndefined(option);

  expect(value).toBeDefined();

  if (value === undefined) {
    throw new Error("Expected Option.some value");
  }

  return value;
}
