import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";

import { AppApi } from "../../http-api.js";
import { DomainCorsLive } from "../http-cors.js";
import { LabelsService } from "./service.js";

const LabelsHandlersLive = HttpApiBuilder.group(AppApi, "labels", (handlers) =>
  Effect.gen(function* () {
    const labelsService = yield* LabelsService;

    return handlers
      .handle("listLabels", () => labelsService.list())
      .handle("createLabel", ({ payload }) => labelsService.create(payload))
      .handle("updateLabel", ({ path, payload }) =>
        labelsService.update(path.labelId, payload)
      )
      .handle("deleteLabel", ({ path }) => labelsService.archive(path.labelId));
  })
);

export const LabelsHttpLive = Layer.mergeAll(
  DomainCorsLive,
  LabelsHandlersLive
).pipe(Layer.provide(LabelsService.Default));
