import { randomUUID } from "node:crypto";

import {
  calculateJobCostLineTotalMinor,
  JOB_COLLABORATOR_CONFLICT_ERROR_TAG,
  JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG,
  JOB_COST_SUMMARY_LIMIT_EXCEEDED_ERROR_TAG,
  OrganizationId,
  ServiceAreaId,
  SiteId,
  UserId,
  WorkItemId,
  JOB_LABEL_NAME_CONFLICT_ERROR_TAG,
} from "@task-tracker/jobs-core";
import { drizzle } from "drizzle-orm/node-postgres";
import { Cause, ConfigProvider, Effect, Exit, Option, Schema } from "effect";

import { AppEffectSqlRuntimeLive } from "../../platform/database/database.js";
import {
  member,
  organization,
  serviceArea,
  site,
  user,
  workItem,
  workItemActivity,
} from "../../platform/database/schema.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../../platform/database/test-database.js";
import {
  ConfigurationRepository,
  ContactsRepository,
  JobLabelsRepository,
  JobsRepositoriesLive,
  JobsRepository,
  RateCardsRepository,
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
        collaborator.id,
        {
          accessLevel: "read",
          roleLabel: "Read-only contact",
        }
      )
    );
    expect(updated.accessLevel).toBe("read");

    const removed = await runJobsEffect(
      databaseUrl,
      JobsRepository.removeCollaborator(
        identity.organizationId,
        collaborator.id
      )
    );
    expect(removed.roleLabel).toBe("Read-only contact");

    const missingRemoveExit = await runJobsEffectExit(
      databaseUrl,
      JobsRepository.removeCollaborator(
        identity.organizationId,
        collaborator.id
      )
    );
    expectFailureTag(missingRemoveExit, JOB_COLLABORATOR_NOT_FOUND_ERROR_TAG);
  }, 30_000);

  it("creates, assigns, removes, archives, and filters organization job labels", async (context: {
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
      JobLabelsRepository.create({
        name: "Waiting on PO",
        organizationId: identity.organizationId,
      })
    );

    const sameNameInOtherOrg = await runJobsEffect(
      databaseUrl,
      JobLabelsRepository.create({
        name: "Waiting on PO",
        organizationId: foreignIdentity.organizationId,
      })
    );

    expect(label.name).toBe("Waiting on PO");
    expect(sameNameInOtherOrg.name).toBe("Waiting on PO");

    const conflictingLabel = await runJobsEffect(
      databaseUrl,
      JobLabelsRepository.create({
        name: "Needs Review",
        organizationId: identity.organizationId,
      })
    );

    const duplicateLabelExit = await runJobsEffectExit(
      databaseUrl,
      JobLabelsRepository.create({
        name: " waiting on po ",
        organizationId: identity.organizationId,
      })
    );

    expectFailureTag(duplicateLabelExit, JOB_LABEL_NAME_CONFLICT_ERROR_TAG);

    const updatedLabel = expectSome(
      await runJobsEffect(
        databaseUrl,
        JobLabelsRepository.update(identity.organizationId, label.id, {
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
      JobLabelsRepository.update(identity.organizationId, conflictingLabel.id, {
        name: " awaiting po ",
      })
    );

    expectFailureTag(updateConflictExit, JOB_LABEL_NAME_CONFLICT_ERROR_TAG);

    const activeLabels = await runJobsEffect(
      databaseUrl,
      JobLabelsRepository.list(identity.organizationId)
    );
    expect(activeLabels.map((jobLabel) => jobLabel.name)).toStrictEqual([
      "Awaiting PO",
      "Needs Review",
    ]);

    const assigned = await runJobsEffect(
      databaseUrl,
      JobLabelsRepository.assignToJob({
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
      JobLabelsRepository.assignToJob({
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
      JobLabelsRepository.removeFromJob({
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
      JobLabelsRepository.removeFromJob({
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
      JobLabelsRepository.assignToJob({
        labelId: updatedLabel.id,
        organizationId: identity.organizationId,
        workItemId: createdJob.id,
      })
    );

    const archived = await runJobsEffect(
      databaseUrl,
      JobLabelsRepository.archive(identity.organizationId, updatedLabel.id)
    );
    expect(Option.getOrUndefined(archived)).toMatchObject({
      label: {
        id: updatedLabel.id,
        name: updatedLabel.name,
      },
      removedWorkItemIds: [createdJob.id],
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
      JobLabelsRepository.list(identity.organizationId)
    );
    expect(labelsAfterArchive.map((jobLabel) => jobLabel.id)).not.toContain(
      updatedLabel.id
    );
  }, 30_000);

  it("rejects invalid job label names at the database boundary", async (context: {
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
            insert into job_labels (
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
        constraint: "job_labels_name_max_length_chk",
      });

      await expect(
        pool.query(
          `
            insert into job_labels (
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
        constraint: "job_labels_normalized_name_max_length_chk",
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
      "@task-tracker/jobs-core/OrganizationActivityCursorInvalidError"
    );
    expectFailureTag(
      nonUuidCursorExit,
      "@task-tracker/jobs-core/OrganizationActivityCursorInvalidError"
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
      JobLabelsRepository.create({
        name: "Primary label",
        organizationId: primaryIdentity.organizationId,
      })
    );
    const foreignLabel = await runJobsEffect(
      databaseUrl,
      JobLabelsRepository.create({
        name: "Foreign label",
        organizationId: foreignIdentity.organizationId,
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
    const assignForeignLabelExit = await runJobsEffectExit(
      databaseUrl,
      JobLabelsRepository.assignToJob({
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
    expectFailureTag(
      assignForeignLabelExit,
      "@task-tracker/jobs-core/JobLabelNotFoundError"
    );

    await withPool(databaseUrl, async (pool) => {
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
      ConfigurationRepository.createServiceArea({
        description: "City centre jobs",
        name: "Dublin",
        organizationId: identity.organizationId,
      })
    );
    const updatedServiceArea = await runJobsEffect(
      databaseUrl,
      ConfigurationRepository.updateServiceArea(
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
      ConfigurationRepository.listServiceAreas(identity.organizationId)
    );

    expect(updatedServiceArea).toMatchObject({
      description: "Updated city centre jobs",
      id: createdServiceArea.id,
      name: "Dublin Central",
    });
    expect(serviceAreas).toContainEqual(updatedServiceArea);

    const clearedServiceArea = await runJobsEffect(
      databaseUrl,
      ConfigurationRepository.updateServiceArea(
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
