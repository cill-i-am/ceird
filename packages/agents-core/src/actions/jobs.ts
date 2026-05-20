import {
  AddJobCommentInputSchema,
  AddJobCostLineInputSchema,
  AddJobVisitInputSchema,
  AssignJobLabelInputSchema,
  AttachJobCollaboratorInputSchema,
  CreateJobInputSchema,
  CreateRateCardInputSchema,
  JobCollaboratorId,
  JobListQuerySchema,
  OrganizationActivityQuerySchema,
  PatchJobInputSchema,
  RateCardId,
  TransitionJobInputSchema,
  UpdateJobCollaboratorInputSchema,
  UpdateRateCardInputSchema,
  WorkItemId,
} from "@ceird/jobs-core";
import { LabelId } from "@ceird/labels-core";
import { Schema } from "effect";

import { defineAgentAction } from "../action-registry.js";

const EmptyActionInputSchema = Schema.Struct({});

const JobPathInputSchema = Schema.Struct({
  workItemId: WorkItemId,
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

const JobNestedInputSchema = <A, I, R>(inputSchema: Schema.Schema<A, I, R>) =>
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

const UpdateRateCardActionInputSchema = Schema.Struct({
  input: UpdateRateCardInputSchema,
  rateCardId: RateCardId,
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
    kind: "read",
    modelDescription: "Get full detail for a Ceird job by ID.",
    modelName: "getJobDetail",
    name: "ceird.jobs.detail",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "Get job options",
      summary: "Read job form options.",
      target: "jobs",
    },
    inputSchema: EmptyActionInputSchema,
    kind: "read",
    modelDescription:
      "List job form options such as members, labels, sites, contacts, and service areas.",
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
    kind: "destructive",
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
    kind: "destructive",
    modelDescription: "Remove a label from a Ceird job.",
    modelName: "removeJobLabel",
    name: "ceird.jobs.remove_label",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Add job cost",
      summary: "Add a cost line to a job.",
      target: "job",
    },
    inputSchema: JobNestedInputSchema(AddJobCostLineInputSchema),
    kind: "write",
    modelDescription: "Add a cost line to a Ceird job.",
    modelName: "addJobCostLine",
    name: "ceird.jobs.cost_lines.add",
  }),
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List job collaborators",
      summary: "Read collaborators attached to a job.",
      target: "job",
    },
    inputSchema: JobPathInputSchema,
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
    kind: "destructive",
    modelDescription: "Detach a collaborator from a Ceird job.",
    modelName: "detachJobCollaborator",
    name: "ceird.jobs.collaborators.detach",
  }),
] as const;

export const rateCardAgentActions = [
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List rate cards",
      summary: "Read organization rate cards.",
      target: "rate cards",
    },
    inputSchema: EmptyActionInputSchema,
    kind: "read",
    modelDescription: "List Ceird rate cards.",
    modelName: "listRateCards",
    name: "ceird.rate_cards.list",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Create rate card",
      summary: "Create a new rate card.",
      target: "rate card",
    },
    inputSchema: CreateRateCardInputSchema,
    kind: "write",
    modelDescription: "Create a Ceird rate card.",
    modelName: "createRateCard",
    name: "ceird.rate_cards.create",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Update rate card",
      summary: "Update an existing rate card.",
      target: "rate card",
    },
    inputSchema: UpdateRateCardActionInputSchema,
    kind: "write",
    modelDescription: "Update a Ceird rate card by ID.",
    modelName: "updateRateCard",
    name: "ceird.rate_cards.update",
  }),
] as const;
