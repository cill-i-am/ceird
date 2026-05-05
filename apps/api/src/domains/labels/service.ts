import {
  LabelAccessDeniedError,
  LabelNotFoundError,
  LabelStorageError,
} from "@ceird/labels-core";
import type {
  CreateLabelInput,
  LabelIdType as LabelId,
  UpdateLabelInput,
} from "@ceird/labels-core";
import { Effect, Option } from "effect";

import { mapOrganizationActorResolutionErrors } from "../organizations/actor-access.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import { ORGANIZATION_ACTOR_STORAGE_ERROR_TAG } from "../organizations/errors.js";
import type { OrganizationAuthorizationDeniedError } from "../organizations/errors.js";
import { LabelsRepository } from "./repositories.js";

export class LabelsService extends Effect.Service<LabelsService>()(
  "@ceird/domains/labels/LabelsService",
  {
    accessors: true,
    dependencies: [
      CurrentOrganizationActor.Default,
      LabelsRepository.Default,
      OrganizationAuthorization.Default,
    ],
    effect: Effect.gen(function* LabelsServiceLive() {
      const actor = yield* CurrentOrganizationActor;
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

      const list = Effect.fn("LabelsService.list")(function* () {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanViewOrganizationData(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const labels = yield* labelsRepository
          .list(currentActor.organizationId)
          .pipe(Effect.catchTag("SqlError", failLabelStorage));

        return { labels } as const;
      });

      const create = Effect.fn("LabelsService.create")(function* (
        input: CreateLabelInput
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageLabels(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        return yield* labelsRepository
          .create({
            name: input.name,
            organizationId: currentActor.organizationId,
          })
          .pipe(Effect.catchTag("SqlError", failLabelStorage));
      });

      const update = Effect.fn("LabelsService.update")(function* (
        labelId: LabelId,
        input: UpdateLabelInput
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageLabels(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const label = yield* labelsRepository
          .update(currentActor.organizationId, labelId, {
            name: input.name,
          })
          .pipe(
            Effect.catchTag("SqlError", failLabelStorage),
            Effect.map(Option.getOrUndefined)
          );

        if (label !== undefined) {
          return label;
        }

        return yield* Effect.fail(
          new LabelNotFoundError({
            labelId,
            message: "Label does not exist in the organization",
          })
        );
      });

      const archive = Effect.fn("LabelsService.archive")(function* (
        labelId: LabelId
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageLabels(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const result = yield* labelsRepository
          .archive(currentActor.organizationId, labelId)
          .pipe(Effect.catchTag("SqlError", failLabelStorage));

        if (Option.isSome(result)) {
          return result.value;
        }

        return yield* Effect.fail(
          new LabelNotFoundError({
            labelId,
            message: "Label does not exist in the organization",
          })
        );
      });

      return {
        archive,
        create,
        list,
        update,
      };
    }),
  }
) {}

const mapLabelsActorErrors = mapOrganizationActorResolutionErrors(
  (message) => new LabelAccessDeniedError({ message })
);

function mapAuthorizationDenied(error: OrganizationAuthorizationDeniedError) {
  return new LabelAccessDeniedError({ message: error.message });
}

function failLabelStorage(error: unknown) {
  return Effect.fail(
    new LabelStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "Label storage operation failed",
    })
  );
}
