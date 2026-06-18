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
      .handle("listLabels", ({ query }) =>
        labelsService.list(query).pipe(observeLabelsOperation("listLabels"))
      )
      .handle("readLabel", ({ params }) =>
        labelsService
          .read(params.labelId)
          .pipe(observeLabelsOperation("readLabel"))
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
      .handle("archiveLabel", ({ params }) =>
        labelsService
          .archive(params.labelId)
          .pipe(observeLabelsOperation("archiveLabel"))
      )
      .handle("restoreLabel", ({ params }) =>
        labelsService
          .restore(params.labelId)
          .pipe(observeLabelsOperation("restoreLabel"))
      );
  })
);

export const LabelsHttpLive = Layer.mergeAll(
  DomainCorsLive,
  LabelsHandlersLive
).pipe(Layer.provide(LabelsService.Default));
