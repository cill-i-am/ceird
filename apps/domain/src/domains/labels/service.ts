import {
  LabelAccessDeniedError,
  LabelNotFoundError,
  LabelStorageError,
} from "@ceird/labels-core";
import type {
  CreateLabelInput,
  Label,
  LabelIdType as LabelId,
  LabelListStatus,
  ListLabelsQuery,
  LabelWriteResponse,
  UpdateLabelInput,
} from "@ceird/labels-core";
import { Layer, Context, Effect, Option } from "effect";

import {
  describeDomainStorageFailure,
  isDomainDrizzleStorageFailure,
} from "../../platform/database/database.js";
import type { DomainDrizzleStorageFailure } from "../../platform/database/database.js";
import { withElectricMutationConfirmation } from "../../platform/database/electric-mutation-confirmation.js";
import type { ElectricMutationConfirmed } from "../../platform/database/electric-mutation-confirmation.js";
import { mapOrganizationActorResolutionErrors } from "../organizations/actor-access.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import { ORGANIZATION_ACTOR_STORAGE_ERROR_TAG } from "../organizations/errors.js";
import type { OrganizationAuthorizationDeniedError } from "../organizations/errors.js";
import { LabelActivityRecorder } from "./activity-recorder.js";
import { LabelsRepository } from "./repositories.js";

export class LabelsService extends Context.Service<LabelsService>()(
  "@ceird/domains/labels/LabelsService",
  {
    make: Effect.gen(function* LabelsServiceLive() {
      const actor = yield* CurrentOrganizationActor;
      const activityRecorder = yield* LabelActivityRecorder;
      const authorization = yield* OrganizationAuthorization;
      const labelsRepository = yield* LabelsRepository;

      const loadActor = Effect.fn("LabelsService.loadActor")(function* () {
        return yield* actor
          .get()
          .pipe(
            mapLabelsActorErrors,
            Effect.catchTag(
              ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
              failLabelStorage
            )
          );
      });

      const list = Effect.fn("LabelsService.list")(function* (
        query: ListLabelsQuery = {}
      ) {
        const currentActor = yield* loadActor();
        const status: LabelListStatus = query.status ?? "active";
        yield* (
          status === "active"
            ? authorization.ensureCanViewOrganizationData(currentActor)
            : authorization.ensureCanManageLabels(currentActor)
        ).pipe(Effect.mapError(mapAuthorizationDenied));

        const labels = yield* labelsRepository
          .list(currentActor.organizationId, status)
          .pipe(Effect.catchTag("EffectDrizzleQueryError", failLabelStorage));

        return { labels } as const;
      });

      const read = Effect.fn("LabelsService.read")(function* (
        labelId: LabelId
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanViewOrganizationData(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const foundLabel = yield* labelsRepository
          .read(currentActor.organizationId, labelId, "active")
          .pipe(
            Effect.catchTag("EffectDrizzleQueryError", failLabelStorage),
            Effect.map(Option.getOrUndefined)
          );

        if (foundLabel === undefined) {
          return yield* Effect.fail(
            new LabelNotFoundError({
              labelId,
              message: "Label does not exist in the organization",
            })
          );
        }

        return { label: foundLabel } as const;
      });

      const create = Effect.fn("LabelsService.create")(function* (
        input: CreateLabelInput
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageLabels(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        return yield* withElectricMutationConfirmation(
          Effect.gen(function* () {
            const label = yield* labelsRepository.create({
              color: input.color,
              description: input.description,
              name: input.name,
              organizationId: currentActor.organizationId,
            });
            yield* activityRecorder.recordCreated(currentActor, label);

            return label;
          })
        ).pipe(Effect.map(toLabelWriteResponse), catchLabelsStorageError());
      });

      const update = Effect.fn("LabelsService.update")(function* (
        labelId: LabelId,
        input: UpdateLabelInput
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageLabels(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        return yield* withElectricMutationConfirmation(
          Effect.gen(function* () {
            const label = yield* labelsRepository
              .update(currentActor.organizationId, labelId, {
                color: input.color,
                description: input.description,
                name: input.name,
              })
              .pipe(Effect.map(Option.getOrUndefined));

            if (label !== undefined) {
              yield* activityRecorder.recordUpdated(currentActor, label);

              return label;
            }

            return yield* Effect.fail(
              new LabelNotFoundError({
                labelId,
                message: "Label does not exist in the organization",
              })
            );
          })
        ).pipe(Effect.map(toLabelWriteResponse), catchLabelsStorageError());
      });

      const archive = Effect.fn("LabelsService.archive")(function* (
        labelId: LabelId
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageLabels(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        return yield* withElectricMutationConfirmation(
          Effect.gen(function* () {
            const archivedLabel = yield* labelsRepository.archive(
              currentActor.organizationId,
              labelId
            );

            if (Option.isSome(archivedLabel)) {
              yield* activityRecorder.recordArchived(
                currentActor,
                archivedLabel.value
              );

              return archivedLabel.value;
            }

            return yield* Effect.fail(
              new LabelNotFoundError({
                labelId,
                message: "Label does not exist in the organization",
              })
            );
          })
        ).pipe(Effect.map(toLabelWriteResponse), catchLabelsStorageError());
      });

      const restore = Effect.fn("LabelsService.restore")(function* (
        labelId: LabelId
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageLabels(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        return yield* withElectricMutationConfirmation(
          Effect.gen(function* () {
            const restoredLabel = yield* labelsRepository.restore(
              currentActor.organizationId,
              labelId
            );

            if (Option.isSome(restoredLabel)) {
              yield* activityRecorder.recordRestored(
                currentActor,
                restoredLabel.value
              );

              return restoredLabel.value;
            }

            return yield* Effect.fail(
              new LabelNotFoundError({
                labelId,
                message: "Label does not exist in the organization",
              })
            );
          })
        ).pipe(Effect.map(toLabelWriteResponse), catchLabelsStorageError());
      });

      return {
        archive,
        create,
        list,
        read,
        restore,
        update,
      };
    }),
  }
) {
  static readonly list = (
    ...args: Parameters<Context.Service.Shape<typeof LabelsService>["list"]>
  ) => LabelsService.use((service) => service.list(...args));
  static readonly read = (
    ...args: Parameters<Context.Service.Shape<typeof LabelsService>["read"]>
  ) => LabelsService.use((service) => service.read(...args));
  static readonly DefaultWithoutDependencies = Layer.effect(
    LabelsService,
    LabelsService.make
  );
  static readonly Default = LabelsService.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        CurrentOrganizationActor.Default,
        LabelActivityRecorder.Default,
        LabelsRepository.Default,
        OrganizationAuthorization.Default
      )
    )
  );
}

const mapLabelsActorErrors = mapOrganizationActorResolutionErrors(
  (message) => new LabelAccessDeniedError({ message })
);

function mapAuthorizationDenied(error: OrganizationAuthorizationDeniedError) {
  return new LabelAccessDeniedError({ message: error.message });
}

function failLabelStorage(error: unknown) {
  return Effect.fail(
    new LabelStorageError({
      cause: describeDomainStorageFailure(error),
      message: "Label storage operation failed",
    })
  );
}

function catchLabelsStorageError<Value, Error, Requirements>(): (
  effect: Effect.Effect<Value, Error, Requirements>
) => Effect.Effect<
  Value,
  Exclude<Error, DomainDrizzleStorageFailure> | LabelStorageError,
  Requirements
> {
  return ((effect: Effect.Effect<Value, Error, Requirements>) =>
    effect.pipe(
      Effect.catchIf(isDomainDrizzleStorageFailure, failLabelStorage)
    )) as (
    effect: Effect.Effect<Value, Error, Requirements>
  ) => Effect.Effect<
    Value,
    Exclude<Error, DomainDrizzleStorageFailure> | LabelStorageError,
    Requirements
  >;
}

function toLabelWriteResponse(
  result: ElectricMutationConfirmed<Label>
): LabelWriteResponse {
  return {
    label: result.value,
    mutation: result.mutation,
  };
}
