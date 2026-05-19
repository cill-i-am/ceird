import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { LabelsService } from "./service.js";

const observeLabelsOperation = (operation: string) =>
  observeApiOperation({
    domain: "labels",
    operation,
    service: "LabelsService",
  });

const LabelsHandlersLive = HttpApiBuilder.group(AppApi, "labels", (handlers) =>
  Effect.gen(function* () {
    const labelsService = yield* LabelsService;

    return handlers
      .handle("listLabels", () =>
        labelsService.list().pipe(observeLabelsOperation("listLabels"))
      )
      .handle("createLabel", ({ payload }) =>
        labelsService
          .create(payload)
          .pipe(observeLabelsOperation("createLabel"))
      )
      .handle("updateLabel", ({ path, payload }) =>
        labelsService
          .update(path.labelId, payload)
          .pipe(observeLabelsOperation("updateLabel"))
      )
      .handle("deleteLabel", ({ path }) =>
        labelsService
          .archive(path.labelId)
          .pipe(observeLabelsOperation("deleteLabel"))
      );
  })
);

export const LabelsHttpLive = Layer.mergeAll(
  DomainCorsLive,
  LabelsHandlersLive
).pipe(Layer.provide(LabelsService.Default));
