import { randomUUID } from "node:crypto";

import { AgentActionRunId, AgentThreadId } from "@ceird/agents-core";
import { OrganizationId, ProductActorId, UserId } from "@ceird/identity-core";
import {
  DEFAULT_LABEL_COLOR,
  LabelAccessDeniedError,
  LabelNameConflictError,
  LabelNotFoundError,
  LabelRestoreConflictError,
  LabelSchema,
} from "@ceird/labels-core";
import type { Label } from "@ceird/labels-core";
import { afterAll, describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { SqlError } from "effect/unstable/sql";
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
import {
  ActivityEventsRepository,
  ProductActivityActorsRepository,
} from "../activity/repository.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { OrganizationAuthorizationDeniedError } from "../organizations/errors.js";
import { RouteInvocationContext } from "../proximity/service.js";
import { LabelActivityRecorder } from "./activity-recorder.js";
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
  archivedAt: null,
  color: DEFAULT_LABEL_COLOR,
  createdAt: "2026-06-14T00:00:00.000Z",
  description: null,
  id: "11111111-1111-4111-8111-111111111111",
  name: "Plumbing",
  updatedAt: "2026-06-14T00:00:00.000Z",
});
const updatedLabel = {
  ...label,
  color: "oklch(63% 0.18 255)",
  description: "Updated label description",
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
          created: yield* labels.create(createLabelInput(label.name)),
          updated: yield* labels.update(
            label.id,
            updateLabelInput(updatedLabel.name)
          ),
          archived: yield* labels.archive(label.id),
          restored: yield* labels.restore(label.id),
        };
      }),
      {
        archive: () => Effect.succeed(Option.some(label)),
        create: () => Effect.succeed(label),
        restore: () => Effect.succeed(Option.some(label)),
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
    expect(result.restored).toStrictEqual({
      label,
      mutation: { txid: 704 },
    });
  });

  it("keeps label not-found failures visible instead of returning confirmation", async () => {
    const activityCalls: string[] = [];

    await expect(
      runLabelsServiceEffect(
        Effect.gen(function* () {
          const labels = yield* LabelsService;

          return yield* labels.update(
            label.id,
            updateLabelInput(updatedLabel.name)
          );
        }),
        {
          update: () => Effect.succeed(Option.none()),
        },
        {
          activityRecorder: {
            recordUpdated: () => {
              activityCalls.push("updated");
              return Effect.void;
            },
          },
        }
      )
    ).rejects.toBeInstanceOf(LabelNotFoundError);
    expect(activityCalls).toStrictEqual([]);
  });

  it("records label activity only after successful label writes", async () => {
    const activityCalls: string[] = [];

    await runLabelsServiceEffect(
      Effect.gen(function* () {
        const labels = yield* LabelsService;

        yield* labels.create(createLabelInput(label.name));
        yield* labels.update(label.id, updateLabelInput(updatedLabel.name));
        yield* labels.archive(label.id);
        yield* labels.restore(label.id);
      }),
      {
        archive: () => Effect.succeed(Option.some(label)),
        create: () => Effect.succeed(label),
        restore: () => Effect.succeed(Option.some(label)),
        update: () => Effect.succeed(Option.some(updatedLabel)),
      },
      {
        activityRecorder: {
          recordArchived: (_actor, recordedLabel) => {
            activityCalls.push(`archived:${recordedLabel.name}`);
            return Effect.void;
          },
          recordCreated: (_actor, recordedLabel) => {
            activityCalls.push(`created:${recordedLabel.name}`);
            return Effect.void;
          },
          recordRestored: (_actor, recordedLabel) => {
            activityCalls.push(`restored:${recordedLabel.name}`);
            return Effect.void;
          },
          recordUpdated: (_actor, recordedLabel) => {
            activityCalls.push(`updated:${recordedLabel.name}`);
            return Effect.void;
          },
        },
      }
    );

    expect(activityCalls).toStrictEqual([
      "created:Plumbing",
      "updated:Electrical",
      "archived:Plumbing",
      "restored:Plumbing",
    ]);
  });

  it("keeps active organization-label reads available to internal members but gates archived management reads", async () => {
    await runLabelsServiceEffect(
      Effect.gen(function* () {
        const labels = yield* LabelsService;

        return yield* labels.list({ status: "active" });
      }),
      {
        list: () => Effect.succeed([label]),
      },
      {
        authorization: {
          ensureCanManageLabels: () =>
            Effect.fail(
              new OrganizationAuthorizationDeniedError({
                message: "Labels are owner-managed",
              })
            ),
          ensureCanViewOrganizationData: () => Effect.void,
        },
      }
    );

    await expect(
      runLabelsServiceEffect(
        Effect.gen(function* () {
          const labels = yield* LabelsService;

          return yield* labels.list({ status: "archived" });
        }),
        {
          list: () => Effect.succeed([label]),
        },
        {
          authorization: {
            ensureCanManageLabels: () =>
              Effect.fail(
                new OrganizationAuthorizationDeniedError({
                  message: "Labels are owner-managed",
                })
              ),
            ensureCanViewOrganizationData: () => Effect.void,
          },
        }
      )
    ).rejects.toBeInstanceOf(LabelAccessDeniedError);
  });

  it("does not record label activity when authorization rejects the write", async () => {
    const activityCalls: string[] = [];

    await expect(
      runLabelsServiceEffect(
        Effect.gen(function* () {
          const labels = yield* LabelsService;

          return yield* labels.create(createLabelInput(label.name));
        }),
        {
          create: () => Effect.succeed(label),
        },
        {
          activityRecorder: {
            recordCreated: () => {
              activityCalls.push("created");
              return Effect.void;
            },
          },
          authorization: {
            ensureCanManageLabels: () =>
              Effect.fail(
                new OrganizationAuthorizationDeniedError({
                  message: "Labels are owner-managed",
                })
              ),
          },
        }
      )
    ).rejects.toBeInstanceOf(LabelAccessDeniedError);
    expect(activityCalls).toStrictEqual([]);
  });

  it("records agent action source context for agent-triggered label activity", async () => {
    const agentThreadId = Schema.decodeUnknownSync(AgentThreadId)(
      "44444444-4444-4444-8444-444444444444"
    );
    const agentActionRunId = Schema.decodeUnknownSync(AgentActionRunId)(
      "55555555-5555-4555-8555-555555555555"
    );
    const agentActorId = Schema.decodeUnknownSync(ProductActorId)(
      "66666666-6666-4666-8666-666666666666"
    );
    const calls: unknown[] = [];

    await Effect.runPromise(
      Effect.gen(function* () {
        const recorder = yield* LabelActivityRecorder;

        yield* recorder.recordCreated(actor, label);
      }).pipe(
        Effect.provide(LabelActivityRecorder.DefaultWithoutDependencies),
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(
              ActivityEventsRepository,
              ActivityEventsRepository.of({
                recordEvent: (
                  event: Parameters<
                    ContextService<
                      typeof ActivityEventsRepository
                    >["recordEvent"]
                  >[0]
                ) =>
                  Effect.sync(() => {
                    calls.push({ kind: "event", event });
                  }),
              } as unknown as ContextService<typeof ActivityEventsRepository>)
            ),
            Layer.succeed(
              ProductActivityActorsRepository,
              ProductActivityActorsRepository.of({
                ensureAgentActor: (
                  input: Parameters<
                    ContextService<
                      typeof ProductActivityActorsRepository
                    >["ensureAgentActor"]
                  >[0]
                ) =>
                  Effect.sync(() => {
                    calls.push({ input, kind: "agentActor" });

                    return {
                      actor: {
                        displayDetail: "Agent action",
                        displayName: "Ceird Agent",
                        id: agentActorId,
                        kind: "agent",
                      },
                      sourceAgentThreadId: input.agentThreadId,
                      sourceUserId: input.userId,
                    };
                  }),
                ensureMemberActor: () =>
                  Effect.die("Expected agent actor resolution"),
              } as unknown as ContextService<
                typeof ProductActivityActorsRepository
              >)
            ),
            Layer.succeed(
              RouteInvocationContext,
              RouteInvocationContext.of({
                agentActionRunId,
                agentThreadId,
              })
            )
          )
        )
      )
    );

    expect(calls).toMatchObject([
      {
        input: {
          agentThreadId,
          organizationId: actor.organizationId,
          userId: actor.userId,
        },
        kind: "agentActor",
      },
      {
        event: {
          actorId: agentActorId,
          eventType: "label.created",
          sourceId: `${agentActionRunId}:label.created:${label.id}`,
          sourceType: "agent_action_run",
          targetId: label.id,
          targetType: "label",
        },
        kind: "event",
      },
    ]);
  });

  it("keeps agent label activity separate from generic agent action activity", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "labels_service_agent_activity_collision",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Postgres integration database unavailable; skipping agent label activity collision coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId =
      Schema.decodeUnknownSync(OrganizationId)(randomUUID());
    const userId = Schema.decodeUnknownSync(UserId)(
      `agent_label_activity_${Date.now()}`
    );
    const agentThreadId = Schema.decodeUnknownSync(AgentThreadId)(randomUUID());
    const agentActionRunId =
      Schema.decodeUnknownSync(AgentActionRunId)(randomUUID());
    const integrationActor = {
      organizationId,
      role: "owner",
      userId,
    } satisfies OrganizationActor;

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Agent Labels",
      });
      await seedMember(pool, {
        email: "agent-label-activity@example.com",
        name: "Agent Label Owner",
        organizationId,
        userId,
      });
      await seedAgentThread(pool, {
        id: agentThreadId,
        organizationId,
        title: "Private label cleanup plan",
        userId,
      });
    });

    const result = await runLabelsServiceIntegrationEffect(
      testDatabase.url,
      integrationActor,
      Effect.gen(function* () {
        const activityActors = yield* ProductActivityActorsRepository;
        const activityEvents = yield* ActivityEventsRepository;
        const labels = yield* LabelsService;

        const productActor = yield* activityActors.ensureAgentActor({
          agentThreadId,
          organizationId,
          userId,
        });
        yield* activityEvents.recordEvent({
          actorId: productActor.actor.id,
          display: {
            summary: "Agent action synced",
          },
          eventType: "agent.product_effect",
          organizationId,
          sourceId: agentActionRunId,
          sourceType: "agent_action_run",
          status: "synced",
          targetId: agentActionRunId,
          targetType: "agent_action_run",
        });

        const created = yield* labels
          .create(createLabelInput("Compliance"))
          .pipe(
            Effect.provide(
              Layer.succeed(
                RouteInvocationContext,
                RouteInvocationContext.of({
                  agentActionRunId,
                  agentThreadId,
                })
              )
            )
          );
        const events = yield* activityEvents.listRecent(organizationId);

        return {
          created,
          events,
        };
      })
    );

    const labelActivity = result.events.find(
      (event) => event.eventType === "label.created"
    );
    const agentActivity = result.events.find(
      (event) => event.eventType === "agent.product_effect"
    );

    expect(labelActivity).toMatchObject({
      display: {
        route: {
          href: "/organization/settings/labels",
          label: "Compliance",
        },
        summary: "Label created",
      },
      sourceId: `${agentActionRunId}:label.created:${result.created.label.id}`,
      sourceType: "agent_action_run",
      targetId: result.created.label.id,
      targetType: "label",
    });
    expect(agentActivity).toMatchObject({
      display: {
        summary: "Agent action synced",
      },
      sourceId: agentActionRunId,
      sourceType: "agent_action_run",
      targetId: agentActionRunId,
      targetType: "agent_action_run",
    });
    expect(result.events).toHaveLength(2);
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
      await seedMember(pool, {
        email: "labels-txid@example.com",
        name: "Labels Txid Owner",
        organizationId,
        userId,
      });
    });

    const result = await runLabelsServiceIntegrationEffect(
      testDatabase.url,
      integrationActor,
      Effect.gen(function* () {
        const labels = yield* LabelsService;
        const created = yield* labels.create(createLabelInput("Install"));
        const createdXmin = yield* loadLabelRowXmin(created.label.id);
        const updated = yield* labels.update(created.label.id, {
          color: "oklch(63% 0.18 255)",
          description: "Updated rough-in workflow",
          name: "Rough-In",
        });
        const updatedXmin = yield* loadLabelRowXmin(updated.label.id);
        const archived = yield* labels.archive(created.label.id);
        const archivedXmin = yield* loadLabelRowXmin(archived.label.id);
        const restored = yield* labels.restore(created.label.id);
        const restoredXmin = yield* loadLabelRowXmin(restored.label.id);

        return {
          archived,
          archivedXmin,
          created,
          createdXmin,
          restored,
          restoredXmin,
          updated,
          updatedXmin,
        };
      })
    );

    expect(result.created.mutation.txid).toBe(result.createdXmin);
    expect(result.updated.mutation.txid).toBe(result.updatedXmin);
    expect(result.archived.mutation.txid).toBe(result.archivedXmin);
    expect(result.restored.mutation.txid).toBe(result.restoredXmin);
  });

  it("persists color, description, archive, restore, active-name conflicts, archived-name reuse, and restore conflicts", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "labels_service_lifecycle",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Postgres integration database unavailable; skipping label lifecycle coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId =
      Schema.decodeUnknownSync(OrganizationId)(randomUUID());
    const userId = Schema.decodeUnknownSync(UserId)(
      `labels_lifecycle_${Date.now()}`
    );
    const integrationActor = {
      organizationId,
      role: "owner",
      userId,
    } satisfies OrganizationActor;

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Labels Lifecycle",
      });
      await seedMember(pool, {
        email: "labels-lifecycle@example.com",
        name: "Labels Lifecycle Owner",
        organizationId,
        userId,
      });
    });

    const lifecycle = await runLabelsServiceIntegrationEffect(
      testDatabase.url,
      integrationActor,
      Effect.gen(function* () {
        const labels = yield* LabelsService;
        const created = yield* labels.create({
          color: "oklch(67% 0.15 196)",
          description: "Needs owner review",
          name: "  Permit   Hold  ",
        });
        const updated = yield* labels.update(created.label.id, {
          color: "oklch(63% 0.18 255)",
          description: null,
          name: "Permit Hold",
        });

        yield* labels
          .create({
            color: "oklch(64% 0.19 28)",
            description: null,
            name: " permit hold ",
          })
          .pipe(
            Effect.flip,
            Effect.flatMap((error) =>
              error instanceof LabelNameConflictError
                ? Effect.succeed(error)
                : Effect.fail(error)
            )
          );

        const archived = yield* labels.archive(updated.label.id);
        const archivedLabels = yield* labels.list({ status: "archived" });
        const reused = yield* labels.create({
          color: "oklch(72% 0.16 75)",
          description: "Replacement active label",
          name: "permit hold",
        });

        return {
          archived,
          archivedLabels,
          created,
          reused,
          updated,
        };
      })
    );

    expect(lifecycle.created.label).toMatchObject({
      archivedAt: null,
      color: "oklch(67% 0.15 196)",
      description: "Needs owner review",
      name: "Permit   Hold",
    });
    expect(lifecycle.updated.label).toMatchObject({
      archivedAt: null,
      color: "oklch(63% 0.18 255)",
      description: null,
      name: "Permit Hold",
    });
    expect(lifecycle.archived.label.archivedAt).toEqual(expect.any(String));
    expect(
      lifecycle.archivedLabels.labels.map((item) => item.id)
    ).toStrictEqual([lifecycle.archived.label.id]);
    expect(lifecycle.reused.label.id).not.toBe(lifecycle.archived.label.id);

    await expect(
      runLabelsServiceIntegrationEffect(
        testDatabase.url,
        integrationActor,
        Effect.gen(function* () {
          const labels = yield* LabelsService;

          return yield* labels.restore(lifecycle.archived.label.id);
        })
      )
    ).rejects.toBeInstanceOf(LabelRestoreConflictError);

    const restored = await runLabelsServiceIntegrationEffect(
      testDatabase.url,
      integrationActor,
      Effect.gen(function* () {
        const labels = yield* LabelsService;

        yield* labels.archive(lifecycle.reused.label.id);

        return yield* labels.restore(lifecycle.archived.label.id);
      })
    );

    expect(restored.label).toMatchObject({
      archivedAt: null,
      color: "oklch(63% 0.18 255)",
      description: null,
      id: lifecycle.archived.label.id,
      name: "Permit Hold",
    });
  });

  it("rolls back label rows when activity recording fails after the write", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "labels_service_activity_rollback",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Postgres integration database unavailable; skipping label activity rollback coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId =
      Schema.decodeUnknownSync(OrganizationId)(randomUUID());
    const userId = Schema.decodeUnknownSync(UserId)(
      `labels_rollback_${Date.now()}`
    );
    const integrationActor = {
      organizationId,
      role: "owner",
      userId,
    } satisfies OrganizationActor;

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Labels Rollback",
      });
      await seedMember(pool, {
        email: "labels-rollback@example.com",
        name: "Labels Rollback Owner",
        organizationId,
        userId,
      });
    });

    await expect(
      runLabelsServiceIntegrationEffect(
        testDatabase.url,
        integrationActor,
        Effect.gen(function* () {
          const labels = yield* LabelsService;

          return yield* labels.create(createLabelInput("Rollback Probe"));
        }),
        {
          activityRecorder: {
            recordCreated: () => Effect.fail(makeSqlError()),
          },
        }
      )
    ).rejects.toThrow("activity recorder unavailable");

    await withPool(testDatabase.url, async (pool) => {
      const rows = await pool.query<{ readonly count: string }>(
        `select count(*)::text as count
         from labels
         where organization_id = $1
           and name = $2`,
        [organizationId, "Rollback Probe"]
      );

      expect(rows.rows[0]?.count).toBe("0");
    });
  });

  it("persists product-safe activity rows for label create, rename, and archive", async (context: {
    skip: (note?: string) => never;
  }) => {
    const testDatabase = await createTestDatabase({
      prefix: "labels_service_activity",
    });
    cleanup.push(testDatabase.cleanup);

    const canReachDatabase = await withPool(
      testDatabase.url,
      async (pool) => await canConnect(pool)
    );

    if (!canReachDatabase) {
      context.skip(
        "Postgres integration database unavailable; skipping selected label activity coverage"
      );
    }

    await applyAllMigrations(testDatabase.url);

    const organizationId =
      Schema.decodeUnknownSync(OrganizationId)(randomUUID());
    const userId = Schema.decodeUnknownSync(UserId)(
      `labels_activity_${Date.now()}`
    );
    const integrationActor = {
      organizationId,
      role: "owner",
      userId,
    } satisfies OrganizationActor;

    await withPool(testDatabase.url, async (pool) => {
      await seedOrganization(pool, {
        id: organizationId,
        name: "Labels Activity",
      });
      await seedMember(pool, {
        email: "labels-activity@example.com",
        name: "Activity Owner",
        organizationId,
        userId,
      });
    });

    const result = await runLabelsServiceIntegrationEffect(
      testDatabase.url,
      integrationActor,
      Effect.gen(function* () {
        const labels = yield* LabelsService;
        const activityEvents = yield* ActivityEventsRepository;

        const created = yield* labels.create(createLabelInput("Planning"));
        const updated = yield* labels.update(created.label.id, {
          color: "oklch(63% 0.18 255)",
          description: "Procurement workflow",
          name: "Procurement",
        });
        const archived = yield* labels.archive(created.label.id);
        const events = yield* activityEvents.listRecent(organizationId);

        return {
          archived,
          created,
          events,
          updated,
        };
      })
    );

    expect(result.events.map((event) => event.eventType)).toStrictEqual([
      "label.archived",
      "label.updated",
      "label.created",
    ]);
    expect(result.events.map((event) => event.targetType)).toStrictEqual([
      "label",
      "label",
      "label",
    ]);
    expect(result.events.map((event) => event.targetId)).toStrictEqual([
      result.archived.label.id,
      result.updated.label.id,
      result.created.label.id,
    ]);
    expect(result.events.map((event) => event.display.route)).toStrictEqual([
      {
        href: "/organization/settings/labels",
        label: "Procurement",
      },
      {
        href: "/organization/settings/labels",
        label: "Procurement",
      },
      {
        href: "/organization/settings/labels",
        label: "Planning",
      },
    ]);
  });
});

function decodeLabel(input: unknown): Label {
  return Schema.decodeUnknownSync(LabelSchema)(input);
}

async function runLabelsServiceEffect<Value, Error, Requirements>(
  effect: Effect.Effect<Value, Error, Requirements>,
  repository: Partial<ContextService<typeof LabelsRepository>>,
  options: {
    readonly activityRecorder?: Partial<
      ContextService<typeof LabelActivityRecorder>
    >;
    readonly authorization?: Partial<
      ContextService<typeof OrganizationAuthorization>
    >;
  } = {}
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
          Layer.succeed(
            LabelActivityRecorder,
            LabelActivityRecorder.of({
              recordArchived:
                options.activityRecorder?.recordArchived ?? (() => Effect.void),
              recordCreated:
                options.activityRecorder?.recordCreated ?? (() => Effect.void),
              recordRestored:
                options.activityRecorder?.recordRestored ?? (() => Effect.void),
              recordUpdated:
                options.activityRecorder?.recordUpdated ?? (() => Effect.void),
            } as unknown as ContextService<typeof LabelActivityRecorder>)
          ),
          Layer.succeed(
            OrganizationAuthorization,
            OrganizationAuthorization.of({
              ensureCanCreateSite: () => Effect.void,
              ensureCanManageConfiguration: () => Effect.void,
              ensureCanManageLabels: () => Effect.void,
              ensureCanViewOrganizationData: () => Effect.void,
              ensureCanViewOrganizationSecurityActivity: () => Effect.void,
              ...options.authorization,
            } as unknown as ContextService<typeof OrganizationAuthorization>)
          ),
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
              list:
                repository.list ??
                (() => Effect.die("LabelsRepository.list was not expected")),
              read: () => Effect.die("LabelsRepository.read was not expected"),
              restore:
                repository.restore ??
                (() => Effect.die("LabelsRepository.restore was not expected")),
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

function makeSqlError(): SqlError.SqlError {
  return Object.assign(new Error("activity recorder unavailable"), {
    _tag: "SqlError" as const,
    cause: "activity recorder unavailable",
    isRetryable: false,
    reason: "Unknown",
  }) as unknown as SqlError.SqlError;
}

async function runLabelsServiceIntegrationEffect<Value, Error, Requirements>(
  databaseUrl: string,
  integrationActor: OrganizationActor,
  effect: Effect.Effect<Value, Error, Requirements>,
  options: {
    readonly activityRecorder?: Partial<
      ContextService<typeof LabelActivityRecorder>
    >;
  } = {}
): Promise<Value> {
  const labelActivityRecorderLayer =
    options.activityRecorder === undefined
      ? LabelActivityRecorder.Default
      : Layer.succeed(
          LabelActivityRecorder,
          LabelActivityRecorder.of({
            recordArchived:
              options.activityRecorder.recordArchived ?? (() => Effect.void),
            recordCreated:
              options.activityRecorder.recordCreated ?? (() => Effect.void),
            recordRestored:
              options.activityRecorder.recordRestored ?? (() => Effect.void),
            recordUpdated:
              options.activityRecorder.recordUpdated ?? (() => Effect.void),
          } as unknown as ContextService<typeof LabelActivityRecorder>)
        );

  return await Effect.runPromise(
    Effect.scoped(
      effect.pipe(
        Effect.provide(LabelsService.DefaultWithoutDependencies),
        Effect.provide(labelActivityRecorderLayer),
        Effect.provide(ActivityEventsRepository.Default),
        Effect.provide(ProductActivityActorsRepository.Default),
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

async function seedMember(
  pool: Pool,
  input: {
    readonly email: string;
    readonly name: string;
    readonly organizationId: string;
    readonly userId: string;
  }
) {
  await pool.query(
    `insert into "user" (id, name, email, email_verified, two_factor_enabled, created_at, updated_at)
     values ($1, $2, $3, false, false, now(), now())`,
    [input.userId, input.name, input.email]
  );
  await pool.query(
    `insert into member (id, organization_id, user_id, role, created_at)
     values ($1, $2, $3, 'owner', now())`,
    [randomUUID(), input.organizationId, input.userId]
  );
}

async function seedAgentThread(
  pool: Pool,
  input: {
    readonly id: string;
    readonly organizationId: string;
    readonly title: string;
    readonly userId: string;
  }
) {
  await pool.query(
    `insert into agent_threads (
       id,
       organization_id,
       user_id,
       agent_instance_name,
       title,
       status,
       created_at,
       updated_at
     )
     values ($1, $2, $3, $4, $5, 'active', now(), now())`,
    [
      input.id,
      input.organizationId,
      input.userId,
      `agent-${input.organizationId}-${input.userId}-${input.id}`,
      input.title,
    ]
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

function createLabelInput(name: string) {
  return {
    color: DEFAULT_LABEL_COLOR,
    description: null,
    name,
  } as const;
}

function updateLabelInput(name: string) {
  return {
    color: updatedLabel.color,
    description: updatedLabel.description,
    name,
  } as const;
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
