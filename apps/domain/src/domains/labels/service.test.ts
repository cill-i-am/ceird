import { randomUUID } from "node:crypto";

import { OrganizationId, UserId } from "@ceird/identity-core";
import { LabelNotFoundError, LabelSchema } from "@ceird/labels-core";
import type { Label } from "@ceird/labels-core";
import { afterAll, describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { Pool } from "pg";

import {
  makeAppDatabaseLive,
  makeAppEffectSqlRuntimeLive,
} from "../../platform/database/database.js";
import {
  applyAllMigrations,
  canConnect,
  createTestDatabase,
  withPool,
} from "../../platform/database/test-database.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { LabelsRepository } from "./repositories.js";
import { LabelsService } from "./service.js";

type ContextService<Service> = Service extends {
  readonly Service: infer Shape;
}
  ? Shape
  : never;

const actor = {
  organizationId: "org_123" as OrganizationId,
  role: "owner",
  userId: "user_123" as UserId,
} satisfies OrganizationActor;
const label = decodeLabel({
  createdAt: "2026-06-14T00:00:00.000Z",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Plumbing",
  updatedAt: "2026-06-14T00:00:00.000Z",
});
const updatedLabel = {
  ...label,
  name: "Electrical",
} satisfies Label;

describe("LabelsService", () => {
  const cleanup: (() => Promise<void>)[] = [];

  afterAll(async () => {
    await Promise.all([...cleanup].toReversed().map((step) => step()));
  });

  it("returns Electric confirmation metadata for label definition writes", async () => {
    const result = await runLabelsServiceEffect(
      Effect.gen(function* () {
        const labels = yield* LabelsService;

        return {
          created: yield* labels.create({ name: label.name }),
          updated: yield* labels.update(label.id, { name: updatedLabel.name }),
          archived: yield* labels.archive(label.id),
        };
      }),
      {
        archive: () => Effect.succeed(Option.some(label)),
        create: () => Effect.succeed(label),
        update: () => Effect.succeed(Option.some(updatedLabel)),
      }
    );

    expect(result.created).toStrictEqual({
      label,
      mutation: { txid: 701 },
    });
    expect(result.updated).toStrictEqual({
      label: updatedLabel,
      mutation: { txid: 702 },
    });
    expect(result.archived).toStrictEqual({
      label,
      mutation: { txid: 703 },
    });
  });

  it("keeps label not-found failures visible instead of returning confirmation", async () => {
    await expect(
      runLabelsServiceEffect(
        Effect.gen(function* () {
          const labels = yield* LabelsService;

          return yield* labels.update(label.id, { name: updatedLabel.name });
        }),
        {
          update: () => Effect.succeed(Option.none()),
        }
      )
    ).rejects.toBeInstanceOf(LabelNotFoundError);
  });

  it("returns txids from the same DomainDrizzle transaction as label write rows", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "labels_service_txid",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Postgres integration database unavailable; skipping selected label write txid source coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId =
      Schema.decodeUnknownSync(OrganizationId)(randomUUID());
    const userId = Schema.decodeUnknownSync(UserId)(
      `labels_txid_${Date.now()}`
    );
    const integrationActor = {
      organizationId,
      role: "owner",
      userId,
    } satisfies OrganizationActor;

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Labels Txid",
      });
    });

    const result = await runLabelsServiceIntegrationEffect(
      testDatabase.url,
      integrationActor,
      Effect.gen(function* () {
        const labels = yield* LabelsService;
        const created = yield* labels.create({ name: "Install" });
        const createdXmin = yield* loadLabelRowXmin(created.label.id);
        const updated = yield* labels.update(created.label.id, {
          name: "Rough-In",
        });
        const updatedXmin = yield* loadLabelRowXmin(updated.label.id);
        const archived = yield* labels.archive(created.label.id);
        const archivedXmin = yield* loadLabelRowXmin(archived.label.id);

        return {
          archived,
          archivedXmin,
          created,
          createdXmin,
          updated,
          updatedXmin,
        };
      })
    );

    expect(result.created.mutation.txid).toBe(result.createdXmin);
    expect(result.updated.mutation.txid).toBe(result.updatedXmin);
    expect(result.archived.mutation.txid).toBe(result.archivedXmin);
  });
});

function decodeLabel(input: unknown): Label {
  return Schema.decodeUnknownSync(LabelSchema)(input);
}

async function runLabelsServiceEffect<Value, Error, Requirements>(
  effect: Effect.Effect<Value, Error, Requirements>,
  repository: Partial<ContextService<typeof LabelsRepository>>
): Promise<Value> {
  let nextTxid = 700;

  return await Effect.runPromise(
    effect.pipe(
      Effect.provide(LabelsService.DefaultWithoutDependencies),
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(
            CurrentOrganizationActor,
            CurrentOrganizationActor.of({
              get: () => Effect.succeed(actor),
            })
          ),
          OrganizationAuthorization.Default,
          Layer.succeed(
            SqlClient.SqlClient,
            makeFakeSqlClient(() => {
              nextTxid += 1;
              return nextTxid;
            })
          ),
          Layer.succeed(
            LabelsRepository,
            LabelsRepository.of({
              archive:
                repository.archive ??
                (() => Effect.die("LabelsRepository.archive was not expected")),
              create:
                repository.create ??
                (() => Effect.die("LabelsRepository.create was not expected")),
              findById: () =>
                Effect.die("LabelsRepository.findById was not expected"),
              getActiveLabelOrFail: () =>
                Effect.die(
                  "LabelsRepository.getActiveLabelOrFail was not expected"
                ),
              list: () => Effect.die("LabelsRepository.list was not expected"),
              update:
                repository.update ??
                (() => Effect.die("LabelsRepository.update was not expected")),
            } as unknown as ContextService<typeof LabelsRepository>)
          )
        )
      )
    ) as Effect.Effect<Value, Error, never>
  );
}

function makeFakeSqlClient(nextTxid: () => number): SqlClient.SqlClient {
  const sql = Object.assign(
    <Row>() =>
      Effect.succeed([
        {
          txid: String(nextTxid()),
        },
      ] as Row[]),
    {
      withTransaction: <Value, Error, Requirements>(
        effect: Effect.Effect<Value, Error, Requirements>
      ) => effect,
    }
  );

  return sql as unknown as SqlClient.SqlClient;
}

async function runLabelsServiceIntegrationEffect<Value, Error, Requirements>(
  databaseUrl: string,
  integrationActor: OrganizationActor,
  effect: Effect.Effect<Value, Error, Requirements>
): Promise<Value> {
  return await Effect.runPromise(
    Effect.scoped(
      effect.pipe(
        Effect.provide(LabelsService.DefaultWithoutDependencies),
        Effect.provide(LabelsRepository.Default),
        Effect.provide(OrganizationAuthorization.Default),
        Effect.provide(
          Layer.succeed(
            CurrentOrganizationActor,
            CurrentOrganizationActor.of({
              get: () => Effect.succeed(integrationActor),
            })
          )
        ),
        Effect.provide(
          makeAppEffectSqlRuntimeLive(makeAppDatabaseLive(databaseUrl))
        )
      ) as Effect.Effect<Value, Error, never>
    )
  );
}

function loadLabelRowXmin(labelId: string) {
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly xmin: string }>`
      select xmin::text as xmin
      from labels
      where id = ${labelId}
      limit 1
    `;
    const xmin = rows[0]?.xmin;

    if (xmin === undefined) {
      return yield* Effect.die(`Expected label ${labelId} to exist`);
    }

    return Number.parseInt(xmin, 10);
  });
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
      `${input.name.toLowerCase().replaceAll(" ", "-")}-${randomUUID()
        .replaceAll("-", "")
        .slice(0, 12)}`,
    ]
  );
}
