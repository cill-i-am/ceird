import { randomUUID } from "node:crypto";

import { OrganizationId } from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
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
});

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
