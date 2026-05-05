import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";

import { AppApi } from "../../http-api.js";
import { DomainCorsLive } from "../http-cors.js";
import { ConfigurationService } from "./configuration-service.js";
import { JobsService } from "./service.js";

const JobsHandlersLive = HttpApiBuilder.group(AppApi, "jobs", (handlers) =>
  Effect.gen(function* () {
    const jobsService = yield* JobsService;

    return handlers
      .handle("listJobs", ({ urlParams }) => jobsService.list(urlParams))
      .handle("getJobOptions", () => jobsService.getOptions())
      .handle("getJobMemberOptions", () => jobsService.getMemberOptions())
      .handle("getJobExternalMemberOptions", () =>
        jobsService.getExternalMemberOptions()
      )
      .handle("createJob", ({ payload }) => jobsService.create(payload))
      .handle("listOrganizationActivity", ({ urlParams }) =>
        jobsService.listOrganizationActivity(urlParams)
      )
      .handle("getJobDetail", ({ path }) =>
        jobsService.getDetail(path.workItemId)
      )
      .handle("patchJob", ({ path, payload }) =>
        jobsService.patch(path.workItemId, payload)
      )
      .handle("transitionJob", ({ path, payload }) =>
        jobsService.transition(path.workItemId, payload)
      )
      .handle("reopenJob", ({ path }) => jobsService.reopen(path.workItemId))
      .handle("addJobComment", ({ path, payload }) =>
        jobsService.addComment(path.workItemId, payload)
      )
      .handle("addJobVisit", ({ path, payload }) =>
        jobsService.addVisit(path.workItemId, payload)
      )
      .handle("assignJobLabel", ({ path, payload }) =>
        jobsService.assignLabel(path.workItemId, payload)
      )
      .handle("removeJobLabel", ({ path }) =>
        jobsService.removeLabel(path.workItemId, path.labelId)
      )
      .handle("addJobCostLine", ({ path, payload }) =>
        jobsService.addCostLine(path.workItemId, payload)
      )
      .handle("listJobCollaborators", ({ path }) =>
        jobsService.listCollaborators(path.workItemId)
      )
      .handle("attachJobCollaborator", ({ path, payload }) =>
        jobsService.attachCollaborator(path.workItemId, payload)
      )
      .handle("updateJobCollaborator", ({ path, payload }) =>
        jobsService.updateCollaborator(
          path.workItemId,
          path.collaboratorId,
          payload
        )
      )
      .handle("detachJobCollaborator", ({ path }) =>
        jobsService.removeCollaborator(path.workItemId, path.collaboratorId)
      );
  })
);

const RateCardsHandlersLive = HttpApiBuilder.group(
  AppApi,
  "rateCards",
  (handlers) =>
    Effect.gen(function* () {
      const configurationService = yield* ConfigurationService;

      return handlers
        .handle("listRateCards", () => configurationService.listRateCards())
        .handle("createRateCard", ({ payload }) =>
          configurationService.createRateCard(payload)
        )
        .handle("updateRateCard", ({ path, payload }) =>
          configurationService.updateRateCard(path.rateCardId, payload)
        );
    })
);

export const JobsHttpLive = Layer.mergeAll(
  DomainCorsLive,
  JobsHandlersLive,
  RateCardsHandlersLive
).pipe(
  Layer.provide(
    Layer.mergeAll(JobsService.Default, ConfigurationService.Default)
  )
);
