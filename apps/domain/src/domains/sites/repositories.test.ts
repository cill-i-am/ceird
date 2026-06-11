import { randomUUID } from "node:crypto";

import { OrganizationId } from "@ceird/identity-core";
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
import { SitesRepository } from "./repositories.js";

const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeSiteId = Schema.decodeUnknownSync(SiteId);

describe("sites repository", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("matches proximity candidates using the same address fields as the Sites directory", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "sites_repo" });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Sites integration database unavailable; skipping repository coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);
    const organizationId = decodeOrganizationId(randomUUID());

    await withPool(testDatabase.url, async (pool) => {
      await pool.query(
        `insert into organization (id, name, slug, created_at)
         values ($1, $2, $3, now())`,
        [organizationId, "Northwind Sites", `northwind-sites-${Date.now()}`]
      );
      await seedMappedSite(pool, {
        addressLine1: "14 Willow Close",
        id: randomUUID(),
        name: "Line One Match",
        organizationId,
      });
      await seedMappedSite(pool, {
        county: "County Search",
        id: randomUUID(),
        name: "County Match",
        organizationId,
      });
      await seedMappedSite(pool, {
        displayLocation: "",
        formattedAddress: null,
        id: randomUUID(),
        name: "Raw Match",
        organizationId,
        rawLocationInput: "Back gate beside the old yard",
      });
      await seedMappedSite(pool, {
        addressLine1: "Visible Yard",
        formattedAddress: "Hidden Postal Component",
        id: randomUUID(),
        name: "Structured Fallback Guard",
        organizationId,
        rawLocationInput: "Hidden Raw Component",
      });
      await seedMappedSite(pool, {
        id: randomUUID(),
        name: "Unrelated",
        organizationId,
      });
    });

    const addressLineResult = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.listProximityCandidates(organizationId, {
        query: "Willow",
      })
    );
    const countyResult = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.listProximityCandidates(organizationId, {
        query: "County Search",
      })
    );
    const rawLocationResult = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.listProximityCandidates(organizationId, {
        query: "old yard",
      })
    );
    const hiddenFormattedAddressResult = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.listProximityCandidates(organizationId, {
        query: "Hidden Postal",
      })
    );
    const hiddenRawLocationResult = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.listProximityCandidates(organizationId, {
        query: "Hidden Raw",
      })
    );

    expect(
      addressLineResult.candidates.map(({ site }) => site.name)
    ).toStrictEqual(["Line One Match"]);
    expect(countyResult.candidates.map(({ site }) => site.name)).toStrictEqual([
      "County Match",
    ]);
    expect(
      rawLocationResult.candidates.map(({ site }) => site.name)
    ).toStrictEqual(["Raw Match"]);
    expect(hiddenFormattedAddressResult.candidates).toStrictEqual([]);
    expect(hiddenRawLocationResult.candidates).toStrictEqual([]);
  });

  it("loads active job summaries for site option and proximity paths", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({ prefix: "sites_repo" });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Sites integration database unavailable; skipping repository coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);
    const organizationId = decodeOrganizationId(randomUUID());
    const otherOrganizationId = decodeOrganizationId(randomUUID());
    const activeSiteId = randomUUID();
    const quietSiteId = randomUUID();
    const otherOrganizationSiteId = randomUUID();
    const userId = `user_sites_repo_${Date.now()}`;

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Active Work Sites",
      });
      await seedOrganization(pool, {
        id: otherOrganizationId,
        name: "Other Work Sites",
      });
      await seedUser(pool, userId);
      await seedMappedSite(pool, {
        id: activeSiteId,
        name: "Active Work Site",
        organizationId,
      });
      await seedMappedSite(pool, {
        id: quietSiteId,
        name: "Quiet Site",
        organizationId,
      });
      await seedMappedSite(pool, {
        id: otherOrganizationSiteId,
        name: "Other Organization Site",
        organizationId: otherOrganizationId,
      });

      await seedWorkItem(pool, {
        id: randomUUID(),
        organizationId,
        priority: "low",
        siteId: activeSiteId,
        status: "new",
        title: "Low active job",
        userId,
      });
      await seedWorkItem(pool, {
        id: randomUUID(),
        organizationId,
        priority: "urgent",
        siteId: activeSiteId,
        status: "in_progress",
        title: "Urgent active job",
        userId,
      });
      await seedWorkItem(pool, {
        id: randomUUID(),
        organizationId,
        priority: "urgent",
        siteId: activeSiteId,
        status: "completed",
        title: "Completed urgent job",
        userId,
      });
      await seedWorkItem(pool, {
        id: randomUUID(),
        organizationId,
        priority: "high",
        siteId: activeSiteId,
        status: "canceled",
        title: "Canceled high job",
        userId,
      });
      await seedWorkItem(pool, {
        id: randomUUID(),
        organizationId: otherOrganizationId,
        priority: "urgent",
        siteId: otherOrganizationSiteId,
        status: "new",
        title: "Other organization job",
        userId,
      });
    });

    const options = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.listOptions(organizationId)
    );
    const list = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.list(organizationId, { limit: 25 })
    );
    const optionById = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.getOptionById(organizationId, decodeSiteId(activeSiteId))
    );
    const proximityCandidates = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.listProximityCandidates(organizationId, {})
    );
    const activeSummary = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.getActiveJobSummary(
        organizationId,
        decodeSiteId(activeSiteId)
      )
    );
    const quietSummary = await runSitesRepositoryEffect(
      testDatabase.url,
      SitesRepository.getActiveJobSummary(
        organizationId,
        decodeSiteId(quietSiteId)
      )
    );

    expect(findSiteById(options, activeSiteId)).toMatchObject({
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
    });
    expect(findSiteById(options, quietSiteId)).toMatchObject({
      activeJobCount: 0,
    });
    expect(findSiteById(list.items, activeSiteId)).toMatchObject({
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
    });
    expect(Option.getOrThrow(optionById)).toMatchObject({
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
    });
    expect(
      findProximityCandidateBySiteId(proximityCandidates, activeSiteId)
    ).toMatchObject({
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
    });
    expect(
      findProximityCandidateBySiteId(proximityCandidates, quietSiteId)
    ).toMatchObject({
      activeJobCount: 0,
    });
    expect(activeSummary).toStrictEqual({
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
    });
    expect(quietSummary).toStrictEqual({
      activeJobCount: 0,
      highestActiveJobPriority: undefined,
    });
  });
});

function findSiteById<T extends { readonly id: string }>(
  sites: readonly T[],
  siteId: string
) {
  const site = sites.find((item) => item.id === siteId);

  expect(site).toBeDefined();

  return site;
}

function findProximityCandidateBySiteId(
  candidates: {
    readonly candidates: readonly { readonly site: { readonly id: string } }[];
  },
  siteId: string
) {
  const candidate = candidates.candidates.find(
    (item) => item.site.id === siteId
  );

  expect(candidate).toBeDefined();

  return candidate;
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
      `${input.name.toLowerCase().replaceAll(" ", "-")}-${Date.now()}`,
    ]
  );
}

async function seedUser(pool: Pool, userId: string) {
  await pool.query(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1, $2, $3, true, now(), now())`,
    [userId, "Sites Repo User", `${userId}@example.com`]
  );
}

async function seedWorkItem(
  pool: Pool,
  input: {
    readonly id: string;
    readonly organizationId: string;
    readonly priority: "high" | "low" | "medium" | "none" | "urgent";
    readonly siteId: string;
    readonly status:
      | "blocked"
      | "canceled"
      | "completed"
      | "in_progress"
      | "new"
      | "triaged";
    readonly title: string;
    readonly userId: string;
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
       blocked_reason,
       completed_at,
       completed_by_user_id,
       created_at,
       updated_at,
       created_by_user_id
     )
     values (
       $1,
       $2,
       'job',
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9,
       now(),
       now(),
       $10
     )`,
    [
      input.id,
      input.organizationId,
      input.title,
      input.status,
      input.priority,
      input.siteId,
      input.status === "blocked" ? "Waiting on parts" : null,
      input.status === "completed" ? new Date() : null,
      input.status === "completed" ? input.userId : null,
      input.userId,
    ]
  );
}

async function seedMappedSite(
  pool: Pool,
  input: {
    readonly addressLine1?: string;
    readonly county?: string;
    readonly displayLocation?: string;
    readonly formattedAddress?: string | null;
    readonly id: string;
    readonly name: string;
    readonly organizationId: string;
    readonly rawLocationInput?: string;
  }
) {
  await pool.query(
    `insert into sites (
       id,
       organization_id,
       name,
       address_line_1,
       county,
       raw_location_input,
       display_location,
       formatted_address,
       google_place_id,
       latitude,
       longitude,
       location_provider,
       location_resolved_at,
       location_status,
       created_at,
       updated_at
     )
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 53.35, -6.26, 'google_places', now(), 'google_resolved', now(), now())`,
    [
      input.id,
      input.organizationId,
      input.name,
      input.addressLine1 ?? null,
      input.county ?? null,
      input.rawLocationInput ?? null,
      input.displayLocation ?? `${input.name}, Dublin`,
      input.formattedAddress === undefined
        ? `${input.name}, Dublin, Ireland`
        : input.formattedAddress,
      `place_${input.id.replaceAll("-", "_")}`,
    ]
  );
}

async function runSitesRepositoryEffect<Value, Error, Requirements>(
  databaseUrl: string,
  effect: Effect.Effect<Value, Error, Requirements>
): Promise<Value> {
  return await Effect.runPromise(
    Effect.scoped(
      effect.pipe(
        Effect.provide(SitesRepository.Default),
        Effect.provide(AppEffectSqlRuntimeLive),
        withConfigProvider(
          configProviderFromMap(new Map([["DATABASE_URL", databaseUrl]]))
        )
      ) as Effect.Effect<Value, Error, never>
    )
  );
}
