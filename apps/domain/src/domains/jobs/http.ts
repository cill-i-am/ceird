import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

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
      .handle("listJobs", ({ query }) =>
        jobsService.list(query).pipe(observeJobsOperation("listJobs"))
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
      .handle("listOrganizationActivity", ({ query }) =>
        jobsService
          .listOrganizationActivity(query)
          .pipe(observeJobsOperation("listOrganizationActivity"))
      )
      .handle("getJobDetail", ({ params }) =>
        jobsService
          .getDetail(params.workItemId)
          .pipe(observeJobsOperation("getJobDetail"))
      )
      .handle("patchJob", ({ params, payload }) =>
        jobsService
          .patch(params.workItemId, payload)
          .pipe(observeJobsOperation("patchJob"))
      )
      .handle("transitionJob", ({ params, payload }) =>
        jobsService
          .transition(params.workItemId, payload)
          .pipe(observeJobsOperation("transitionJob"))
      )
      .handle("reopenJob", ({ params }) =>
        jobsService
          .reopen(params.workItemId)
          .pipe(observeJobsOperation("reopenJob"))
      )
      .handle("addJobComment", ({ params, payload }) =>
        jobsService
          .addComment(params.workItemId, payload)
          .pipe(observeJobsOperation("addJobComment"))
      )
      .handle("addJobVisit", ({ params, payload }) =>
        jobsService
          .addVisit(params.workItemId, payload)
          .pipe(observeJobsOperation("addJobVisit"))
      )
      .handle("assignJobLabel", ({ params, payload }) =>
        jobsService
          .assignLabel(params.workItemId, payload)
          .pipe(observeJobsOperation("assignJobLabel"))
      )
      .handle("removeJobLabel", ({ params }) =>
        jobsService
          .removeLabel(params.workItemId, params.labelId)
          .pipe(observeJobsOperation("removeJobLabel"))
      )
      .handle("addJobCostLine", ({ params, payload }) =>
        jobsService
          .addCostLine(params.workItemId, payload)
          .pipe(observeJobsOperation("addJobCostLine"))
      )
      .handle("listJobCollaborators", ({ params }) =>
        jobsService
          .listCollaborators(params.workItemId)
          .pipe(observeJobsOperation("listJobCollaborators"))
      )
      .handle("attachJobCollaborator", ({ params, payload }) =>
        jobsService
          .attachCollaborator(params.workItemId, payload)
          .pipe(observeJobsOperation("attachJobCollaborator"))
      )
      .handle("updateJobCollaborator", ({ params, payload }) =>
        jobsService
          .updateCollaborator(params.workItemId, params.collaboratorId, payload)
          .pipe(observeJobsOperation("updateJobCollaborator"))
      )
      .handle("detachJobCollaborator", ({ params }) =>
        jobsService
          .removeCollaborator(params.workItemId, params.collaboratorId)
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
        .handle("updateRateCard", ({ params, payload }) =>
          configurationService
            .updateRateCard(params.rateCardId, payload)
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
