import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

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
      .handle("updateLabel", ({ params, payload }) =>
        labelsService
          .update(params.labelId, payload)
          .pipe(observeLabelsOperation("updateLabel"))
      )
      .handle("deleteLabel", ({ params }) =>
        labelsService
          .archive(params.labelId)
          .pipe(observeLabelsOperation("deleteLabel"))
      );
  })
);

export const LabelsHttpLive = Layer.mergeAll(
  DomainCorsLive,
  LabelsHandlersLive
).pipe(Layer.provide(LabelsService.Default));
