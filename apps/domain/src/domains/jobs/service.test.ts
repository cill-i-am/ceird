import { OrganizationId, UserId } from "@ceird/identity-core";
import {
  CreateJobInputSchema,
  JobCollaboratorSchema,
  JobDetailResponseSchema,
  JobCommentSchema,
  JobSchema,
} from "@ceird/jobs-core";
import type { JobCollaborator } from "@ceird/jobs-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { LabelsRepository } from "../labels/repositories.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { SiteLocationProvider } from "../sites/location-provider.js";
import { SitesRepository } from "../sites/repositories.js";
import { JobsActivityRecorder } from "./activity-recorder.js";
import { JobsAuthorization } from "./authorization.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepository,
} from "./repositories.js";
import { JobsService } from "./service.js";

type ContextService<Service> = Service extends {
  readonly Service: infer Shape;
}
  ? Shape
  : never;

const decodeJob = Schema.decodeUnknownSync(JobSchema);
const decodeJobCollaborator = Schema.decodeUnknownSync(JobCollaboratorSchema);
const decodeJobComment = Schema.decodeUnknownSync(JobCommentSchema);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeUserId = Schema.decodeUnknownSync(UserId);

const externalActor = {
  organizationId: decodeOrganizationId("org_123"),
  role: "external",
  userId: decodeUserId("user_external"),
} satisfies OrganizationActor;
const workItemId = Schema.decodeUnknownSync(JobSchema)({
  createdAt: "2026-05-20T09:00:00.000Z",
  createdByUserId: "user_owner",
  id: "11111111-1111-4111-8111-111111111111",
  kind: "job",
  labels: [],
  priority: "none",
  status: "new",
  title: "Inspect boiler",
  updatedAt: "2026-05-20T09:00:00.000Z",
}).id;
const existingJob = decodeJob({
  createdAt: "2026-05-20T09:00:00.000Z",
  createdByUserId: "user_owner",
  id: workItemId,
  kind: "job",
  labels: [],
  priority: "none",
  status: "new",
  title: "Inspect boiler",
  updatedAt: "2026-05-20T09:00:00.000Z",
});

describe("JobsService contracts", () => {
  it("keeps job creation focused on title, priority, site, and contact", () => {
    expect(
      Schema.decodeUnknownSync(CreateJobInputSchema)({
        title: "  Replace boiler  ",
        priority: "high",
      })
    ).toStrictEqual({
      title: "Replace boiler",
      priority: "high",
    });

    expect(() =>
      Schema.decodeUnknownSync(CreateJobInputSchema)({
        title: "Replace boiler",
        removedField: "PO-4471",
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("keeps job detail free of costing payloads", () => {
    const detail = {
      activity: [],
      comments: [],
      job: {
        createdAt: "2026-05-20T09:00:00.000Z",
        createdByUserId: "user_123",
        id: "11111111-1111-4111-8111-111111111111",
        kind: "job",
        labels: [],
        priority: "none",
        status: "new",
        title: "Inspect boiler",
        updatedAt: "2026-05-20T09:00:00.000Z",
      },
      viewerAccess: {
        canComment: true,
        visibility: "internal",
      },
      visits: [],
    };

    expect(
      Schema.decodeUnknownSync(JobDetailResponseSchema)(detail)
    ).toStrictEqual(detail);
    expect(() =>
      Schema.decodeUnknownSync(JobDetailResponseSchema)({
        ...detail,
        removedPayload: { items: [] },
      })
    ).toThrow(/[Uu]nexpected/);
  });

  it("denies read-only external collaborators when adding comments", async () => {
    const calls = { addComment: 0, withTransaction: 0 };
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addComment(workItemId, {
          body: "Can we get an update?",
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsServiceTestLayer({
            calls,
            grant: makeGrant("read"),
          })
        )
      )
    );

    expect(exit._tag).toBe("Failure");
    expect(calls.withTransaction).toBe(0);
    expect(calls.addComment).toBe(0);
  });

  it("allows comment-level external collaborators to add comments", async () => {
    const calls = { addComment: 0, withTransaction: 0 };
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const jobs = yield* JobsService;

        return yield* jobs.addComment(workItemId, {
          body: "Can we get an update?",
        });
      }).pipe(
        Effect.provide(JobsService.DefaultWithoutDependencies),
        Effect.provide(
          makeJobsServiceTestLayer({
            calls,
            grant: makeGrant("comment"),
          })
        )
      )
    );

    expect(result.body).toBe("Can we get an update?");
    expect(calls.withTransaction).toBe(1);
    expect(calls.addComment).toBe(1);
  });
});

function makeGrant(
  accessLevel: JobCollaborator["accessLevel"]
): JobCollaborator {
  return decodeJobCollaborator({
    accessLevel,
    createdAt: "2026-05-20T09:00:00.000Z",
    id: "22222222-2222-4222-8222-222222222222",
    roleLabel: "Site contact",
    subjectType: "user",
    updatedAt: "2026-05-20T09:00:00.000Z",
    userId: externalActor.userId,
    workItemId,
  });
}

function makeJobsServiceTestLayer(options: {
  readonly calls: { addComment: number; withTransaction: number };
  readonly grant: JobCollaborator;
}) {
  return Layer.mergeAll(
    Layer.succeed(
      ContactsRepository,
      ContactsRepository.of({} as ContextService<typeof ContactsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(externalActor),
      })
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      {} as HttpServerRequest.HttpServerRequest
    ),
    Layer.succeed(
      JobLabelAssignmentsRepository,
      JobLabelAssignmentsRepository.of(
        {} as ContextService<typeof JobLabelAssignmentsRepository>
      )
    ),
    JobsAuthorization.Default,
    Layer.succeed(
      JobsActivityRecorder,
      JobsActivityRecorder.of({} as ContextService<typeof JobsActivityRecorder>)
    ),
    Layer.succeed(
      JobsRepository,
      JobsRepository.of({
        addComment: () => {
          options.calls.addComment += 1;
          return Effect.succeed(
            decodeJobComment({
              authorName: "External Contact",
              authorUserId: externalActor.userId,
              body: "Can we get an update?",
              createdAt: "2026-05-20T10:00:00.000Z",
              id: "33333333-3333-4333-8333-333333333333",
              workItemId,
            })
          );
        },
        findByIdForUpdate: () => Effect.succeed(Option.some(existingJob)),
        findUserCollaboratorGrant: () =>
          Effect.succeed(Option.some(options.grant)),
        withTransaction: <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => {
          options.calls.withTransaction += 1;
          return effect;
        },
      } as unknown as ContextService<typeof JobsRepository>)
    ),
    Layer.succeed(
      LabelsRepository,
      LabelsRepository.of({} as ContextService<typeof LabelsRepository>)
    ),
    Layer.succeed(
      SiteLocationProvider,
      SiteLocationProvider.of({} as ContextService<typeof SiteLocationProvider>)
    ),
    Layer.succeed(
      SitesRepository,
      SitesRepository.of({} as ContextService<typeof SitesRepository>)
    )
  );
}
