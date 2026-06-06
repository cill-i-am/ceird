import {
  AddJobCommentInputSchema,
  AddJobVisitInputSchema,
  AssignJobLabelInputSchema,
  AttachJobCollaboratorInputSchema,
  CreateJobInputSchema,
  JobListQuerySchema,
  JobProximityInputSchema,
  JobRoutePreviewInputSchema,
  OrganizationActivityQuerySchema,
  PatchJobInputSchema,
  TransitionJobInputSchema,
  UpdateJobCollaboratorInputSchema,
} from "@ceird/jobs-core/dto";
import { JobCollaboratorId, WorkItemId } from "@ceird/jobs-core/ids";
import { LabelId } from "@ceird/labels-core/ids";
import { Schema } from "effect";

import {
  defineAgentAction,
  EmptyAgentActionInputSchema,
} from "../action-registry.js";

const JobPathInputSchema = Schema.Struct({
  workItemId: WorkItemId,
});

const JobAgentProximityInputSchema = Schema.Struct({
  filters: JobProximityInputSchema.fields.filters,
  limit: JobProximityInputSchema.fields.limit,
  origin: JobProximityInputSchema.fields.origin,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

const PatchJobActionInputSchema = Schema.Struct({
  input: PatchJobInputSchema,
  workItemId: WorkItemId,
});

const TransitionJobActionInputSchema = Schema.Struct({
  input: TransitionJobInputSchema,
  workItemId: WorkItemId,
});

const AddJobCommentActionInputSchema = Schema.Struct({
  body: AddJobCommentInputSchema.fields.body,
  workItemId: WorkItemId,
});

const JobNestedInputSchema = <InputSchema extends Schema.Top>(
  inputSchema: InputSchema
) =>
  Schema.Struct({
    input: inputSchema,
    workItemId: WorkItemId,
  });

const AssignJobLabelActionInputSchema = Schema.Struct({
  labelId: AssignJobLabelInputSchema.fields.labelId,
  workItemId: WorkItemId,
});

const RemoveJobLabelActionInputSchema = Schema.Struct({
  labelId: LabelId,
  workItemId: WorkItemId,
});

const UpdateJobCollaboratorActionInputSchema = Schema.Struct({
  collaboratorId: JobCollaboratorId,
  input: UpdateJobCollaboratorInputSchema,
  workItemId: WorkItemId,
});

const JobCollaboratorPathInputSchema = Schema.Struct({
  collaboratorId: JobCollaboratorId,
  workItemId: WorkItemId,
});

export const jobAgentActions = [
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List jobs",
      summary: "Read jobs with optional filters.",
      target: "jobs",
    },
    inputSchema: JobListQuerySchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription:
      "List Ceird jobs, optionally filtered by status or limited in size.",
    modelName: "listJobs",
    name: "ceird.jobs.list",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "Get job detail",
      summary: "Read full detail for a job.",
      target: "job",
    },
    inputSchema: JobPathInputSchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription: "Get full detail for a Ceird job by ID.",
    modelName: "getJobDetail",
    name: "ceird.jobs.detail",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "Rank nearby jobs",
      summary: "Rank filtered jobs by driving time.",
      target: "jobs",
    },
    inputSchema: JobAgentProximityInputSchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription:
      "Rank Ceird jobs near a current or typed origin by traffic-aware driving time, respecting supplied job filters.",
    modelName: "rankNearbyJobs",
    name: "ceird.jobs.proximity",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "Preview job route",
      summary: "Read route distance and duration for one job.",
      target: "job",
    },
    inputSchema: JobNestedInputSchema(JobRoutePreviewInputSchema),
    executionStatus: "executable",
    kind: "read",
    modelDescription:
      "Preview traffic-aware driving distance and duration from an origin to a specific Ceird job.",
    modelName: "getJobRoutePreview",
    name: "ceird.jobs.route_preview",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "Get job options",
      summary: "Read job form options.",
      target: "jobs",
    },
    inputSchema: EmptyAgentActionInputSchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription:
      "List job form options such as members, labels, sites, and contacts.",
    modelName: "getJobOptions",
    name: "ceird.jobs.options",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Create job",
      summary: "Create a new job.",
      target: "job",
    },
    inputSchema: CreateJobInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Create a Ceird job.",
    modelName: "createJob",
    name: "ceird.jobs.create",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Update job",
      summary: "Update an existing job.",
      target: "job",
    },
    inputSchema: PatchJobActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Update fields on an existing Ceird job.",
    modelName: "updateJob",
    name: "ceird.jobs.update",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Transition job",
      summary: "Move a job to another status.",
      target: "job",
    },
    inputSchema: TransitionJobActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Transition a Ceird job to another status.",
    modelName: "transitionJob",
    name: "ceird.jobs.transition",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Reopen job",
      summary: "Reopen a completed or canceled job.",
      target: "job",
    },
    inputSchema: JobPathInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Reopen a Ceird job.",
    modelName: "reopenJob",
    name: "ceird.jobs.reopen",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List organization activity",
      summary: "Read organization activity events.",
      target: "activity",
    },
    inputSchema: OrganizationActivityQuerySchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription: "List Ceird organization activity events.",
    modelName: "listOrganizationActivity",
    name: "ceird.jobs.activity.list",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Add job comment",
      summary: "Add a comment to a job.",
      target: "job",
    },
    inputSchema: AddJobCommentActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Add a comment to a Ceird job.",
    modelName: "addJobComment",
    name: "ceird.jobs.add_comment",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Add job visit",
      summary: "Log a visit on a job.",
      target: "job",
    },
    inputSchema: JobNestedInputSchema(AddJobVisitInputSchema),
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Log a visit on a Ceird job.",
    modelName: "addJobVisit",
    name: "ceird.jobs.visits.add",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Assign job label",
      summary: "Assign a label to a job.",
      target: "job",
    },
    inputSchema: AssignJobLabelActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Assign an existing label to a Ceird job.",
    modelName: "assignJobLabel",
    name: "ceird.jobs.assign_label",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm_destructive",
    display: {
      label: "Remove job label",
      summary: "Remove a label from a job.",
      target: "job",
    },
    inputSchema: RemoveJobLabelActionInputSchema,
    executionStatus: "executable",
    kind: "destructive",
    modelDescription: "Remove a label from a Ceird job.",
    modelName: "removeJobLabel",
    name: "ceird.jobs.remove_label",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List job collaborators",
      summary: "Read collaborators attached to a job.",
      target: "job",
    },
    inputSchema: JobPathInputSchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription: "List collaborators attached to a Ceird job.",
    modelName: "listJobCollaborators",
    name: "ceird.jobs.collaborators.list",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Attach job collaborator",
      summary: "Attach a collaborator to a job.",
      target: "job",
    },
    inputSchema: JobNestedInputSchema(AttachJobCollaboratorInputSchema),
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Attach a collaborator to a Ceird job.",
    modelName: "attachJobCollaborator",
    name: "ceird.jobs.collaborators.attach",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Update job collaborator",
      summary: "Update a job collaborator.",
      target: "job",
    },
    inputSchema: UpdateJobCollaboratorActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Update a collaborator attached to a Ceird job.",
    modelName: "updateJobCollaborator",
    name: "ceird.jobs.collaborators.update",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm_destructive",
    display: {
      label: "Detach job collaborator",
      summary: "Remove a collaborator from a job.",
      target: "job",
    },
    inputSchema: JobCollaboratorPathInputSchema,
    executionStatus: "executable",
    kind: "destructive",
    modelDescription: "Detach a collaborator from a Ceird job.",
    modelName: "detachJobCollaborator",
    name: "ceird.jobs.collaborators.detach",
  }),
] as const;
