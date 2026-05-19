import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { ConfigurationService } from "./configuration-service.js";
import { JobsService } from "./service.js";

const observeJobsOperation = (operation: string) =>
  observeApiOperation({
    domain: "jobs",
    operation,
    service: "JobsService",
  });

const observeRateCardsOperation = (operation: string) =>
  observeApiOperation({
    domain: "rateCards",
    operation,
    service: "ConfigurationService",
  });

const JobsHandlersLive = HttpApiBuilder.group(AppApi, "jobs", (handlers) =>
  Effect.gen(function* () {
    const jobsService = yield* JobsService;

    return handlers
      .handle("listJobs", ({ urlParams }) =>
        jobsService.list(urlParams).pipe(observeJobsOperation("listJobs"))
      )
      .handle("getJobOptions", () =>
        jobsService.getOptions().pipe(observeJobsOperation("getJobOptions"))
      )
      .handle("getJobMemberOptions", () =>
        jobsService
          .getMemberOptions()
          .pipe(observeJobsOperation("getJobMemberOptions"))
      )
      .handle("getJobExternalMemberOptions", () =>
        jobsService
          .getExternalMemberOptions()
          .pipe(observeJobsOperation("getJobExternalMemberOptions"))
      )
      .handle("createJob", ({ payload }) =>
        jobsService.create(payload).pipe(observeJobsOperation("createJob"))
      )
      .handle("listOrganizationActivity", ({ urlParams }) =>
        jobsService
          .listOrganizationActivity(urlParams)
          .pipe(observeJobsOperation("listOrganizationActivity"))
      )
      .handle("getJobDetail", ({ path }) =>
        jobsService
          .getDetail(path.workItemId)
          .pipe(observeJobsOperation("getJobDetail"))
      )
      .handle("patchJob", ({ path, payload }) =>
        jobsService
          .patch(path.workItemId, payload)
          .pipe(observeJobsOperation("patchJob"))
      )
      .handle("transitionJob", ({ path, payload }) =>
        jobsService
          .transition(path.workItemId, payload)
          .pipe(observeJobsOperation("transitionJob"))
      )
      .handle("reopenJob", ({ path }) =>
        jobsService
          .reopen(path.workItemId)
          .pipe(observeJobsOperation("reopenJob"))
      )
      .handle("addJobComment", ({ path, payload }) =>
        jobsService
          .addComment(path.workItemId, payload)
          .pipe(observeJobsOperation("addJobComment"))
      )
      .handle("addJobVisit", ({ path, payload }) =>
        jobsService
          .addVisit(path.workItemId, payload)
          .pipe(observeJobsOperation("addJobVisit"))
      )
      .handle("assignJobLabel", ({ path, payload }) =>
        jobsService
          .assignLabel(path.workItemId, payload)
          .pipe(observeJobsOperation("assignJobLabel"))
      )
      .handle("removeJobLabel", ({ path }) =>
        jobsService
          .removeLabel(path.workItemId, path.labelId)
          .pipe(observeJobsOperation("removeJobLabel"))
      )
      .handle("addJobCostLine", ({ path, payload }) =>
        jobsService
          .addCostLine(path.workItemId, payload)
          .pipe(observeJobsOperation("addJobCostLine"))
      )
      .handle("listJobCollaborators", ({ path }) =>
        jobsService
          .listCollaborators(path.workItemId)
          .pipe(observeJobsOperation("listJobCollaborators"))
      )
      .handle("attachJobCollaborator", ({ path, payload }) =>
        jobsService
          .attachCollaborator(path.workItemId, payload)
          .pipe(observeJobsOperation("attachJobCollaborator"))
      )
      .handle("updateJobCollaborator", ({ path, payload }) =>
        jobsService
          .updateCollaborator(path.workItemId, path.collaboratorId, payload)
          .pipe(observeJobsOperation("updateJobCollaborator"))
      )
      .handle("detachJobCollaborator", ({ path }) =>
        jobsService
          .removeCollaborator(path.workItemId, path.collaboratorId)
          .pipe(observeJobsOperation("detachJobCollaborator"))
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
        .handle("listRateCards", () =>
          configurationService
            .listRateCards()
            .pipe(observeRateCardsOperation("listRateCards"))
        )
        .handle("createRateCard", ({ payload }) =>
          configurationService
            .createRateCard(payload)
            .pipe(observeRateCardsOperation("createRateCard"))
        )
        .handle("updateRateCard", ({ path, payload }) =>
          configurationService
            .updateRateCard(path.rateCardId, payload)
            .pipe(observeRateCardsOperation("updateRateCard"))
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
