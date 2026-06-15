import type { OrganizationId, UserId } from "@ceird/identity-core";
import { LabelNotFoundError, LabelSchema } from "@ceird/labels-core";
import type { Label } from "@ceird/labels-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql";

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
