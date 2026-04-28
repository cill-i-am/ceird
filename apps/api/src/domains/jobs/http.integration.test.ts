import { randomUUID } from "node:crypto";

import {
  CreateSiteResponseSchema,
  JobDetailResponseSchema,
  JobLabelResponseSchema,
  JobLabelsResponseSchema,
  JobListResponseSchema,
  JOB_LABEL_NAME_CONFLICT_ERROR_TAG,
  JOB_LABEL_NOT_FOUND_ERROR_TAG,
  REGION_NOT_FOUND_ERROR_TAG,
  SitesOptionsResponseSchema,
} from "@task-tracker/jobs-core";
import { ParseResult } from "effect";
import type { Pool } from "pg";

import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../../platform/database/test-database.js";
import { makeApiWebHandler } from "../../server.js";

describe("jobs http integration", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("fails closed until the request has a session, an active organization, and org membership", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_http" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping request-scoped actor coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    await withJobsEnvironment(databaseUrl, async () => {
      const api = makeApiWebHandler();
      cleanup.push(api.dispose);

      const noSessionResponse = await api.handler(makeRequest("/jobs"));
      expect(noSessionResponse.status).toBe(403);

      const ownerCookieJar = new Map<string, string>();
      const ownerEmail = `owner-${randomUUID()}@example.com`;
      await signUpUser(api, ownerCookieJar, {
        email: ownerEmail,
        name: "Owner User",
      });

      const ownerOrglessResponse = await api.handler(
        makeRequest("/jobs", {
          cookieJar: ownerCookieJar,
        })
      );
      expect(ownerOrglessResponse.status).toBe(403);

      const ownerOrgId = await createOrganization(api, ownerCookieJar, {
        organizationName: "Owner Organization",
        organizationSlug: `owner-org-${randomUUID().slice(0, 8)}`,
      });

      const listResponse = await api.handler(
        makeRequest("/jobs", {
          cookieJar: ownerCookieJar,
        })
      );
      expect(listResponse.status).toBe(200);
      const list = (await listResponse.json()) as {
        readonly items: readonly unknown[];
      };
      expect(list.items).toHaveLength(0);

      const strangerCookieJar = new Map<string, string>();
      const strangerEmail = `stranger-${randomUUID()}@example.com`;
      await signUpUser(api, strangerCookieJar, {
        email: strangerEmail,
        name: "Stranger User",
      });

      const strangerOrglessResponse = await api.handler(
        makeRequest("/jobs", {
          cookieJar: strangerCookieJar,
        })
      );
      expect(strangerOrglessResponse.status).toBe(403);

      await withPool(databaseUrl, async (pool) => {
        const strangerUserId = await queryUserIdByEmail(pool, strangerEmail);
        const strangerSessionId = await querySessionIdByUserId(
          pool,
          strangerUserId
        );

        await pool.query(
          `update session set active_organization_id = $1 where id = $2`,
          [ownerOrgId, strangerSessionId]
        );
      });

      const foreignMembershipResponse = await api.handler(
        makeRequest("/jobs", {
          cookieJar: strangerCookieJar,
        })
      );
      expect(foreignMembershipResponse.status).toBe(403);
    });
  }, 30_000);

  it("allows trusted browser origins to preflight jobs requests with credentials", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_http_cors" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping browser CORS coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    await withJobsEnvironment(databaseUrl, async () => {
      const api = makeApiWebHandler();
      cleanup.push(api.dispose);

      const response = await api.handler(
        makeRequest("/jobs", {
          headers: {
            "access-control-request-headers": "content-type",
            "access-control-request-method": "POST",
            origin: "http://localhost:4173",
          },
          method: "OPTIONS",
        })
      );

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "http://localhost:4173"
      );
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
        "true"
      );
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "POST"
      );
    });
  }, 30_000);

  it("allows the owner workflow and enforces member limits through the API", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "jobs_http" });
    cleanup.push(testDatabase.cleanup);

    const databaseUrl = testDatabase.url;
    const canReachDatabase = await withPool(
      databaseUrl,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Jobs integration database unavailable; skipping request-scoped actor coverage"
      );
    }

    await applyAllMigrations(databaseUrl);

    await withJobsEnvironment(databaseUrl, async () => {
      const api = makeApiWebHandler();
      cleanup.push(api.dispose);

      const ownerCookieJar = new Map<string, string>();
      const ownerEmail = `owner-${randomUUID()}@example.com`;
      await signUpUser(api, ownerCookieJar, {
        email: ownerEmail,
        name: "Owner User",
      });

      const ownerOrgId = await createOrganization(api, ownerCookieJar, {
        organizationName: "Owner Organization",
        organizationSlug: `owner-org-${randomUUID().slice(0, 8)}`,
      });

      const memberCookieJar = new Map<string, string>();
      const memberEmail = `member-${randomUUID()}@example.com`;
      await signUpUser(api, memberCookieJar, {
        email: memberEmail,
        name: "Member User",
      });

      let memberUserId = "";
      await withPool(databaseUrl, async (pool) => {
        memberUserId = await queryUserIdByEmail(pool, memberEmail);

        await pool.query(
          `insert into member (id, organization_id, user_id, role)
           values ($1, $2, $3, $4)`,
          [randomUUID(), ownerOrgId, memberUserId, "member"]
        );
      });

      const setActiveResponse = await api.handler(
        makeJsonRequest(
          "/api/auth/organization/set-active",
          {
            organizationId: ownerOrgId,
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      updateCookieJar(memberCookieJar, setActiveResponse);
      expect(setActiveResponse.status).toBe(200);

      const optionsResponse = await api.handler(
        makeRequest("/jobs/options", {
          cookieJar: ownerCookieJar,
        })
      );
      expect(optionsResponse.status).toBe(200);
      const options = (await optionsResponse.json()) as {
        readonly contacts: readonly unknown[];
        readonly members: readonly { name: string }[];
        readonly regions: readonly unknown[];
        readonly sites: readonly unknown[];
      };
      expect(options.members.map((member) => member.name)).toStrictEqual(
        expect.arrayContaining(["Owner User", "Member User"])
      );
      expect(options.regions).toHaveLength(0);
      expect(options.sites).toHaveLength(0);
      expect(options.contacts).toHaveLength(0);

      const createSiteResponse = await api.handler(
        makeJsonRequest(
          "/sites",
          {
            addressLine1: "1 Custom House Quay",
            country: "IE",
            county: "Dublin",
            eircode: "D01 X2X2",
            name: "Docklands Campus",
            town: "Dublin",
          },
          {
            cookieJar: ownerCookieJar,
          }
        )
      );
      expect(createSiteResponse.status).toBe(201);
      const createdSite = ParseResult.decodeUnknownSync(
        CreateSiteResponseSchema
      )(await createSiteResponse.json());
      expect(createdSite).toMatchObject({
        name: "Docklands Campus",
      });

      const siteOptionsAfterSiteResponse = await api.handler(
        makeRequest("/sites/options", {
          cookieJar: ownerCookieJar,
        })
      );
      expect(siteOptionsAfterSiteResponse.status).toBe(200);
      const siteOptionsAfterSite = ParseResult.decodeUnknownSync(
        SitesOptionsResponseSchema
      )(await siteOptionsAfterSiteResponse.json());
      expect(siteOptionsAfterSite.sites).toContainEqual(
        expect.objectContaining({
          id: createdSite.id,
          name: "Docklands Campus",
        })
      );

      const invalidSitePayloadResponse = await api.handler(
        makeJsonRequest(
          "/sites",
          {
            country: "IE",
            county: "Dublin",
            eircode: "D01 X2X2",
            name: "Missing Longitude",
          },
          {
            cookieJar: ownerCookieJar,
          }
        )
      );
      expect(invalidSitePayloadResponse.status).toBe(400);

      const missingRegionResponse = await api.handler(
        makeJsonRequest(
          "/sites",
          {
            addressLine1: "1 Custom House Quay",
            country: "IE",
            county: "Dublin",
            eircode: "D01 X2X2",
            name: "Missing Region Site",
            regionId: "55555555-5555-4555-8555-555555555555",
          },
          {
            cookieJar: ownerCookieJar,
          }
        )
      );
      expect(missingRegionResponse.status).toBe(404);
      await expect(missingRegionResponse.json()).resolves.toMatchObject({
        _tag: REGION_NOT_FOUND_ERROR_TAG,
      });

      const memberCreateSiteResponse = await api.handler(
        makeJsonRequest(
          "/sites",
          {
            addressLine1: "1 Custom House Quay",
            country: "IE",
            county: "Dublin",
            eircode: "D01 X2X2",
            name: "Member Site",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(memberCreateSiteResponse.status).toBe(403);

      const createJobResponse = await api.handler(
        makeJsonRequest(
          "/jobs",
          {
            priority: "medium",
            title: "Replace boiler expansion vessel",
          },
          {
            cookieJar: ownerCookieJar,
          }
        )
      );
      expect(createJobResponse.status).toBe(201);
      const createdJob = (await createJobResponse.json()) as {
        readonly id: string;
        readonly status: string;
      };

      const patchAssigneeResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}`,
          {
            assigneeId: memberUserId,
            priority: "high",
          },
          {
            cookieJar: ownerCookieJar,
            method: "PATCH",
          }
        )
      );
      expect(patchAssigneeResponse.status).toBe(200);

      const invalidCoordinatorResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}`,
          {
            coordinatorId: memberUserId,
          },
          {
            cookieJar: ownerCookieJar,
            method: "PATCH",
          }
        )
      );
      expect(invalidCoordinatorResponse.status).toBe(400);

      const memberCreateResponse = await api.handler(
        makeJsonRequest(
          "/jobs",
          {
            title: "Should not be created",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(memberCreateResponse.status).toBe(403);

      const memberPatchResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}`,
          {
            priority: "urgent",
          },
          {
            cookieJar: memberCookieJar,
            method: "PATCH",
          }
        )
      );
      expect(memberPatchResponse.status).toBe(403);

      const memberCreateLabelResponse = await api.handler(
        makeJsonRequest(
          "/job-labels",
          {
            name: "Member Label",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(memberCreateLabelResponse.status).toBe(403);

      const createLabelResponse = await api.handler(
        makeJsonRequest(
          "/job-labels",
          {
            name: "Waiting PO",
          },
          {
            cookieJar: ownerCookieJar,
          }
        )
      );
      expect(createLabelResponse.status).toBe(201);
      const createdLabel = ParseResult.decodeUnknownSync(
        JobLabelResponseSchema
      )(await createLabelResponse.json());

      const duplicateCreateLabelResponse = await api.handler(
        makeJsonRequest(
          "/job-labels",
          {
            name: " waiting po ",
          },
          {
            cookieJar: ownerCookieJar,
          }
        )
      );
      expect(duplicateCreateLabelResponse.status).toBe(409);
      await expect(duplicateCreateLabelResponse.json()).resolves.toMatchObject({
        _tag: JOB_LABEL_NAME_CONFLICT_ERROR_TAG,
      });

      const updateLabelResponse = await api.handler(
        makeJsonRequest(
          `/job-labels/${createdLabel.id}`,
          {
            name: "Waiting on PO",
          },
          {
            cookieJar: ownerCookieJar,
            method: "PATCH",
          }
        )
      );
      expect(updateLabelResponse.status).toBe(200);
      const updatedLabel = ParseResult.decodeUnknownSync(
        JobLabelResponseSchema
      )(await updateLabelResponse.json());
      expect(updatedLabel).toMatchObject({
        id: createdLabel.id,
        name: "Waiting on PO",
      });

      const conflictingLabelResponse = await api.handler(
        makeJsonRequest(
          "/job-labels",
          {
            name: "Callback needed",
          },
          {
            cookieJar: ownerCookieJar,
          }
        )
      );
      expect(conflictingLabelResponse.status).toBe(201);
      const conflictingLabel = ParseResult.decodeUnknownSync(
        JobLabelResponseSchema
      )(await conflictingLabelResponse.json());

      const duplicateUpdateLabelResponse = await api.handler(
        makeJsonRequest(
          `/job-labels/${conflictingLabel.id}`,
          {
            name: " waiting on po ",
          },
          {
            cookieJar: ownerCookieJar,
            method: "PATCH",
          }
        )
      );
      expect(duplicateUpdateLabelResponse.status).toBe(409);
      await expect(duplicateUpdateLabelResponse.json()).resolves.toMatchObject({
        _tag: JOB_LABEL_NAME_CONFLICT_ERROR_TAG,
      });

      const labelsResponse = await api.handler(
        makeRequest("/job-labels", {
          cookieJar: ownerCookieJar,
        })
      );
      expect(labelsResponse.status).toBe(200);
      const labels = ParseResult.decodeUnknownSync(JobLabelsResponseSchema)(
        await labelsResponse.json()
      );
      expect(labels.labels).toContainEqual(
        expect.objectContaining({
          id: updatedLabel.id,
          name: "Waiting on PO",
        })
      );

      const assignLabelResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/labels`,
          {
            labelId: updatedLabel.id,
          },
          {
            cookieJar: ownerCookieJar,
          }
        )
      );
      expect(assignLabelResponse.status).toBe(200);
      const assignedDetail = ParseResult.decodeUnknownSync(
        JobDetailResponseSchema
      )(await assignLabelResponse.json());
      expect(assignedDetail.job.labels).toContainEqual(
        expect.objectContaining({
          id: updatedLabel.id,
          name: "Waiting on PO",
        })
      );
      expect(assignedDetail.activity).toContainEqual(
        expect.objectContaining({
          payload: {
            eventType: "label_added",
            labelId: updatedLabel.id,
            labelName: "Waiting on PO",
          },
        })
      );

      const filteredJobsResponse = await api.handler(
        makeRequest(`/jobs?labelId=${updatedLabel.id}`, {
          cookieJar: ownerCookieJar,
        })
      );
      expect(filteredJobsResponse.status).toBe(200);
      const filteredJobs = ParseResult.decodeUnknownSync(JobListResponseSchema)(
        await filteredJobsResponse.json()
      );
      expect(filteredJobs.items.map((job) => job.id)).toContain(createdJob.id);

      const removeLabelResponse = await api.handler(
        makeRequest(`/jobs/${createdJob.id}/labels/${updatedLabel.id}`, {
          cookieJar: ownerCookieJar,
          method: "DELETE",
        })
      );
      expect(removeLabelResponse.status).toBe(200);
      const removedDetail = ParseResult.decodeUnknownSync(
        JobDetailResponseSchema
      )(await removeLabelResponse.json());
      expect(removedDetail.job.labels).toStrictEqual([]);
      expect(removedDetail.activity).toContainEqual(
        expect.objectContaining({
          payload: {
            eventType: "label_removed",
            labelId: updatedLabel.id,
            labelName: "Waiting on PO",
          },
        })
      );

      const filteredAfterRemoveResponse = await api.handler(
        makeRequest(`/jobs?labelId=${updatedLabel.id}`, {
          cookieJar: ownerCookieJar,
        })
      );
      expect(filteredAfterRemoveResponse.status).toBe(200);
      const filteredAfterRemove = ParseResult.decodeUnknownSync(
        JobListResponseSchema
      )(await filteredAfterRemoveResponse.json());
      expect(filteredAfterRemove.items).toHaveLength(0);

      const archiveLabelResponse = await api.handler(
        makeRequest(`/job-labels/${updatedLabel.id}`, {
          cookieJar: ownerCookieJar,
          method: "DELETE",
        })
      );
      expect(archiveLabelResponse.status).toBe(200);
      const archivedLabel = ParseResult.decodeUnknownSync(
        JobLabelResponseSchema
      )(await archiveLabelResponse.json());
      expect(archivedLabel).toMatchObject({
        id: updatedLabel.id,
        name: "Waiting on PO",
      });

      const labelsAfterArchiveResponse = await api.handler(
        makeRequest("/job-labels", {
          cookieJar: ownerCookieJar,
        })
      );
      expect(labelsAfterArchiveResponse.status).toBe(200);
      const labelsAfterArchive = ParseResult.decodeUnknownSync(
        JobLabelsResponseSchema
      )(await labelsAfterArchiveResponse.json());
      expect(labelsAfterArchive.labels).toStrictEqual([conflictingLabel]);

      const updateArchivedLabelResponse = await api.handler(
        makeJsonRequest(
          `/job-labels/${updatedLabel.id}`,
          {
            name: "Archived label",
          },
          {
            cookieJar: ownerCookieJar,
            method: "PATCH",
          }
        )
      );
      expect(updateArchivedLabelResponse.status).toBe(404);
      await expect(updateArchivedLabelResponse.json()).resolves.toMatchObject({
        _tag: JOB_LABEL_NOT_FOUND_ERROR_TAG,
      });

      const assignArchivedLabelResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/labels`,
          {
            labelId: updatedLabel.id,
          },
          {
            cookieJar: ownerCookieJar,
          }
        )
      );
      expect(assignArchivedLabelResponse.status).toBe(404);
      await expect(assignArchivedLabelResponse.json()).resolves.toMatchObject({
        _tag: JOB_LABEL_NOT_FOUND_ERROR_TAG,
      });

      const removeArchivedLabelResponse = await api.handler(
        makeRequest(`/jobs/${createdJob.id}/labels/${updatedLabel.id}`, {
          cookieJar: ownerCookieJar,
          method: "DELETE",
        })
      );
      expect(removeArchivedLabelResponse.status).toBe(404);
      await expect(removeArchivedLabelResponse.json()).resolves.toMatchObject({
        _tag: JOB_LABEL_NOT_FOUND_ERROR_TAG,
      });

      const archiveMissingLabelResponse = await api.handler(
        makeRequest(`/job-labels/${updatedLabel.id}`, {
          cookieJar: ownerCookieJar,
          method: "DELETE",
        })
      );
      expect(archiveMissingLabelResponse.status).toBe(404);
      await expect(archiveMissingLabelResponse.json()).resolves.toMatchObject({
        _tag: JOB_LABEL_NOT_FOUND_ERROR_TAG,
      });

      const memberDetailResponse = await api.handler(
        makeRequest(`/jobs/${createdJob.id}`, {
          cookieJar: memberCookieJar,
        })
      );
      expect(memberDetailResponse.status).toBe(200);
      const memberDetail = (await memberDetailResponse.json()) as {
        readonly comments: readonly unknown[];
        readonly job: {
          readonly assigneeId?: string;
          readonly completedAt?: string;
          readonly status: string;
        };
        readonly visits: readonly unknown[];
      };
      expect(memberDetail.job.assigneeId).toBe(memberUserId);

      const commentResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/comments`,
          {
            body: "Confirmed replacement parts are available.",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(commentResponse.status).toBe(201);

      const visitResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/visits`,
          {
            durationMinutes: 30,
            note: "Half-hour check-in should fail in v1.",
            visitDate: "2026-04-22",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(visitResponse.status).toBe(400);
      const invalidVisitError = (await visitResponse.json()) as {
        readonly _tag: string;
      };
      expect(invalidVisitError._tag).toBe(
        "@task-tracker/jobs-core/VisitDurationIncrementError"
      );

      const validVisitResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/visits`,
          {
            durationMinutes: 60,
            note: "Initial visit completed on site.",
            visitDate: "2026-04-22",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(validVisitResponse.status).toBe(201);

      const startedTransitionResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/transitions`,
          {
            status: "in_progress",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(startedTransitionResponse.status).toBe(200);

      const blockedWithoutReasonResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/transitions`,
          {
            status: "blocked",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(blockedWithoutReasonResponse.status).toBe(400);

      const blockedTransitionResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/transitions`,
          {
            blockedReason: "Waiting on a locked plant room.",
            status: "blocked",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(blockedTransitionResponse.status).toBe(200);

      const unblockedTransitionResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/transitions`,
          {
            status: "in_progress",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(unblockedTransitionResponse.status).toBe(200);

      const completedTransitionResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/transitions`,
          {
            status: "completed",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(completedTransitionResponse.status).toBe(200);

      const completedBlockedResponse = await api.handler(
        makeJsonRequest(
          `/jobs/${createdJob.id}/transitions`,
          {
            status: "blocked",
          },
          {
            cookieJar: memberCookieJar,
          }
        )
      );
      expect(completedBlockedResponse.status).toBe(400);
      const completedBlockedError = (await completedBlockedResponse.json()) as {
        readonly _tag: string;
      };
      expect(completedBlockedError._tag).toBe(
        "@task-tracker/jobs-core/InvalidJobTransitionError"
      );

      const reopenResponse = await api.handler(
        makeRequest(`/jobs/${createdJob.id}/reopen`, {
          cookieJar: memberCookieJar,
          method: "POST",
        })
      );
      expect(reopenResponse.status).toBe(200);

      const finalDetailResponse = await api.handler(
        makeRequest(`/jobs/${createdJob.id}`, {
          cookieJar: ownerCookieJar,
        })
      );
      expect(finalDetailResponse.status).toBe(200);
      const finalDetail = (await finalDetailResponse.json()) as {
        readonly activity: readonly unknown[];
        readonly comments: readonly unknown[];
        readonly job: {
          readonly completedAt?: string;
          readonly status: string;
        };
        readonly visits: readonly unknown[];
      };
      expect(finalDetail.job.status).toBe("in_progress");
      expect(finalDetail.job.completedAt).toBeUndefined();
      expect(finalDetail.comments).toHaveLength(1);
      expect(finalDetail.visits).toHaveLength(1);
      expect(finalDetail.activity.length).toBeGreaterThanOrEqual(7);
    });
  }, 30_000);
});

async function createOrganization(
  api: ReturnType<typeof makeApiWebHandler>,
  cookieJar: Map<string, string>,
  input: {
    readonly organizationName: string;
    readonly organizationSlug: string;
  }
) {
  const organizationResponse = await api.handler(
    makeJsonRequest(
      "/api/auth/organization/create",
      {
        name: input.organizationName,
        slug: input.organizationSlug,
      },
      {
        cookieJar,
      }
    )
  );
  updateCookieJar(cookieJar, organizationResponse);
  expect(organizationResponse.status).toBe(200);

  const organization = (await organizationResponse.json()) as {
    readonly id: string;
  };

  return organization.id;
}

async function signUpUser(
  api: ReturnType<typeof makeApiWebHandler>,
  cookieJar: Map<string, string>,
  input: {
    readonly email: string;
    readonly name: string;
  }
) {
  const signUpResponse = await api.handler(
    makeJsonRequest("/api/auth/sign-up/email", {
      email: input.email,
      name: input.name,
      password: "correct horse battery staple",
    })
  );
  updateCookieJar(cookieJar, signUpResponse);
  expect(signUpResponse.status).toBe(200);
}

async function queryUserIdByEmail(pool: Pool, email: string) {
  const result = await pool.query<{ readonly id: string }>(
    `select id from "user" where email = $1 limit 1`,
    [email]
  );

  const userId = result.rows[0]?.id;

  if (userId === undefined) {
    throw new Error(`Unable to find user ${email}`);
  }

  return userId;
}

async function querySessionIdByUserId(pool: Pool, userId: string) {
  const result = await pool.query<{ readonly id: string }>(
    `select id from session where user_id = $1 order by created_at desc limit 1`,
    [userId]
  );

  const sessionId = result.rows[0]?.id;

  if (sessionId === undefined) {
    throw new Error(`Unable to find session for ${userId}`);
  }

  return sessionId;
}

async function withJobsEnvironment<Result>(
  databaseUrl: string,
  operation: () => Promise<Result>
) {
  const previous = {
    AUTH_APP_ORIGIN: process.env.AUTH_APP_ORIGIN,
    AUTH_EMAIL_FROM: process.env.AUTH_EMAIL_FROM,
    AUTH_EMAIL_FROM_NAME: process.env.AUTH_EMAIL_FROM_NAME,
    AUTH_EMAIL_TRANSPORT: process.env.AUTH_EMAIL_TRANSPORT,
    BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
    PORTLESS_URL: process.env.PORTLESS_URL,
    SITE_GEOCODER_MODE: process.env.SITE_GEOCODER_MODE,
  };

  process.env.AUTH_APP_ORIGIN = "http://127.0.0.1:4173";
  process.env.AUTH_EMAIL_FROM = "noreply@example.com";
  process.env.AUTH_EMAIL_FROM_NAME = "Task Tracker Test";
  process.env.AUTH_EMAIL_TRANSPORT = "noop";
  process.env.BETTER_AUTH_BASE_URL = "http://127.0.0.1:3000";
  process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
  process.env.CLOUDFLARE_API_TOKEN = "test-token";
  process.env.DATABASE_URL = databaseUrl;
  process.env.SITE_GEOCODER_MODE = "stub";
  delete process.env.PORTLESS_URL;

  try {
    return await operation();
  } finally {
    if (previous.AUTH_APP_ORIGIN === undefined) {
      delete process.env.AUTH_APP_ORIGIN;
    } else {
      process.env.AUTH_APP_ORIGIN = previous.AUTH_APP_ORIGIN;
    }

    if (previous.AUTH_EMAIL_FROM === undefined) {
      delete process.env.AUTH_EMAIL_FROM;
    } else {
      process.env.AUTH_EMAIL_FROM = previous.AUTH_EMAIL_FROM;
    }

    if (previous.AUTH_EMAIL_FROM_NAME === undefined) {
      delete process.env.AUTH_EMAIL_FROM_NAME;
    } else {
      process.env.AUTH_EMAIL_FROM_NAME = previous.AUTH_EMAIL_FROM_NAME;
    }

    if (previous.AUTH_EMAIL_TRANSPORT === undefined) {
      delete process.env.AUTH_EMAIL_TRANSPORT;
    } else {
      process.env.AUTH_EMAIL_TRANSPORT = previous.AUTH_EMAIL_TRANSPORT;
    }

    if (previous.BETTER_AUTH_BASE_URL === undefined) {
      delete process.env.BETTER_AUTH_BASE_URL;
    } else {
      process.env.BETTER_AUTH_BASE_URL = previous.BETTER_AUTH_BASE_URL;
    }

    if (previous.BETTER_AUTH_SECRET === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = previous.BETTER_AUTH_SECRET;
    }

    if (previous.CLOUDFLARE_ACCOUNT_ID === undefined) {
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
    } else {
      process.env.CLOUDFLARE_ACCOUNT_ID = previous.CLOUDFLARE_ACCOUNT_ID;
    }

    if (previous.CLOUDFLARE_API_TOKEN === undefined) {
      delete process.env.CLOUDFLARE_API_TOKEN;
    } else {
      process.env.CLOUDFLARE_API_TOKEN = previous.CLOUDFLARE_API_TOKEN;
    }

    if (previous.DATABASE_URL === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous.DATABASE_URL;
    }

    if (previous.PORTLESS_URL === undefined) {
      delete process.env.PORTLESS_URL;
    } else {
      process.env.PORTLESS_URL = previous.PORTLESS_URL;
    }

    if (previous.SITE_GEOCODER_MODE === undefined) {
      delete process.env.SITE_GEOCODER_MODE;
    } else {
      process.env.SITE_GEOCODER_MODE = previous.SITE_GEOCODER_MODE;
    }
  }
}

function makeRequest(
  routePath: string,
  options?: {
    readonly cookieJar?: Map<string, string>;
    readonly headers?: ConstructorParameters<typeof Headers>[0];
    readonly method?: string;
  }
) {
  const headers = new Headers(options?.headers);

  if (options?.cookieJar !== undefined && options.cookieJar.size > 0) {
    headers.set(
      "cookie",
      [...options.cookieJar.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
    );
  }

  return new Request(`http://127.0.0.1:3000${routePath}`, {
    headers,
    method: options?.method ?? "GET",
  });
}

function makeJsonRequest(
  routePath: string,
  body: unknown,
  options?: {
    readonly cookieJar?: Map<string, string>;
    readonly method?: string;
  }
) {
  const headers = new Headers({
    "content-type": "application/json",
  });

  if (options?.cookieJar !== undefined && options.cookieJar.size > 0) {
    headers.set(
      "cookie",
      [...options.cookieJar.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
    );
  }

  return new Request(`http://127.0.0.1:3000${routePath}`, {
    body: JSON.stringify(body),
    headers,
    method: options?.method ?? "POST",
  });
}

function updateCookieJar(
  cookieJar: Map<string, string>,
  response: Response
): void {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieHeaders =
    headers.getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);

  for (const header of setCookieHeaders) {
    const [cookie] = header.split(";", 1);
    if (!cookie) {
      continue;
    }

    const separatorIndex = cookie.indexOf("=");
    const name = cookie.slice(0, separatorIndex);
    const value = cookie.slice(separatorIndex + 1);

    if (value.length === 0) {
      cookieJar.delete(name);
    } else {
      cookieJar.set(name, value);
    }
  }
}
