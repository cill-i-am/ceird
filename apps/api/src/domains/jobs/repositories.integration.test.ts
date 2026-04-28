import { randomUUID } from "node:crypto";

import {
  OrganizationId,
  RegionId,
  SiteId,
  UserId,
  WorkItemId,
} from "@task-tracker/jobs-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Cause, ConfigProvider, Effect, Exit, Option, Schema } from "effect";

import { AppEffectSqlRuntimeLive } from "../../platform/database/database.js";
import {
  member,
  organization,
  serviceRegion,
  site,
  user,
  workItem,
} from "../../platform/database/schema.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../../platform/database/test-database.js";
import {
  ContactsRepository,
  JobsRepositoriesLive,
  JobsRepository,
  SitesRepository,
  withJobsTransaction,
} from "./repositories.js";

describe("jobs repositories integration", () => {
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
    const regionId = await insertRegion(
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
        regionId,
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
        regionId,
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

    await runJobsEffect(
      databaseUrl,
      SitesRepository.linkContact({
        contactId: createdContactId,
        isPrimary: true,
        organizationId: identity.organizationId,
        siteId: createdSiteId,
      })
    );
    await runJobsEffect(
      databaseUrl,
      SitesRepository.linkContact({
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
    expect(detailValue.comments).toHaveLength(1);
    expect(detailValue.comments[0]?.body).toContain("water ingress");
    expect(detailValue.activity).toHaveLength(1);
    expect(detailValue.activity[0]?.payload.eventType).toBe("job_created");
    expect(detailValue.visits).toHaveLength(1);
    expect(detailValue.visits[0]?.visitDate).toBe("2026-04-21");
    expect(detailValue.visits[0]?.durationMinutes).toBe(120);

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
      regionId,
      town: "Dublin",
    });
    expect(createdSiteOption?.addressLine2).toBeUndefined();
    expect(createdSiteOption?.county).toBe("Dublin");
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
      notes: "Prefers morning calls.",
      phone: "+353871234567",
      siteIds: expect.arrayContaining([createdSiteId, overflowSiteId]),
    });
    expect(Option.getOrUndefined(foundSiteId)).toBe(createdSiteId);
    expect(Option.getOrUndefined(foundContactId)).toBe(createdContactId);
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
    const northRegionId = await insertRegion(
      databaseUrl,
      identity.organizationId,
      "North"
    );
    const southRegionId = await insertRegion(
      databaseUrl,
      identity.organizationId,
      "South"
    );
    const northSiteId = await insertSite(
      databaseUrl,
      identity.organizationId,
      northRegionId,
      "North Site"
    );
    const southSiteId = await insertSite(
      databaseUrl,
      identity.organizationId,
      southRegionId,
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

    const byRegion = await runJobsEffect(
      databaseUrl,
      JobsRepository.list(identity.organizationId, { regionId: northRegionId })
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

    expect(byRegion.items.map((item) => item.id)).toStrictEqual([
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
    const primaryRegionId = await insertRegion(
      databaseUrl,
      primaryIdentity.organizationId,
      "Primary"
    );
    const foreignRegionId = await insertRegion(
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
        regionId: primaryRegionId,
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
        regionId: foreignRegionId,
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
    const primaryJob = await runJobsEffect(
      databaseUrl,
      JobsRepository.create({
        createdByUserId: primaryIdentity.ownerUserId,
        organizationId: primaryIdentity.organizationId,
        title: "Primary org job",
      })
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
    const linkForeignContactExit = await runJobsEffectExit(
      databaseUrl,
      SitesRepository.linkContact({
        contactId: foreignContactId,
        organizationId: primaryIdentity.organizationId,
        siteId: primarySiteId,
      })
    );
    const linkForeignSiteExit = await runJobsEffectExit(
      databaseUrl,
      SitesRepository.linkContact({
        contactId: foreignContactId,
        organizationId: primaryIdentity.organizationId,
        siteId: foreignSiteId,
      })
    );
    const commentFromForeignMemberExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.addComment({
        authorUserId: foreignIdentity.ownerUserId,
        body: "Cross-org comment",
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

    expectFailureTag(
      createWithForeignContactExit,
      "@task-tracker/jobs-core/ContactNotFoundError"
    );
    expectFailureTag(
      linkForeignContactExit,
      "@task-tracker/jobs-core/ContactNotFoundError"
    );
    expectFailureTag(
      linkForeignSiteExit,
      "@task-tracker/jobs-core/SiteNotFoundError"
    );
    expectFailureTag(
      commentFromForeignMemberExit,
      "@task-tracker/jobs-core/OrganizationMemberNotFoundError"
    );
    expectFailureTag(
      visitWithForeignOrganizationExit,
      "@task-tracker/domains/jobs/WorkItemOrganizationMismatchError"
    );
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
    Effect.provide(JobsRepositoriesLive),
    Effect.provide(AppEffectSqlRuntimeLive),
    Effect.withConfigProvider(makeConfigProvider(databaseUrl))
  ) as Effect.Effect<Value, Error, never>;
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

async function insertRegion(
  databaseUrl: string,
  organizationId: Schema.Schema.Type<typeof OrganizationId>,
  name: string
) {
  const regionId = decodeRegionId(randomUUID());

  await withPool(databaseUrl, async (pool) => {
    const db = drizzle(pool);

    await db.insert(serviceRegion).values({
      id: regionId,
      name,
      organizationId,
      slug: name.toLowerCase(),
      updatedAt: new Date(),
      createdAt: new Date(),
    });
  });

  return regionId;
}

async function insertSite(
  databaseUrl: string,
  organizationId: Schema.Schema.Type<typeof OrganizationId>,
  regionId: Schema.Schema.Type<typeof RegionId>,
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
      regionId,
      updatedAt: new Date(),
      createdAt: new Date(),
    });
  });

  return siteId;
}

const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeRegionId = Schema.decodeUnknownSync(RegionId);
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
