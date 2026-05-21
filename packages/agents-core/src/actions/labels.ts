import {
  CreateLabelInputSchema,
  LabelId,
  UpdateLabelInputSchema,
} from "@ceird/labels-core";
import { Schema } from "effect";

import {
  defineAgentAction,
  EmptyAgentActionInputSchema,
} from "../action-registry.js";

const LabelPathInputSchema = Schema.Struct({
  labelId: LabelId,
});

const UpdateLabelActionInputSchema = Schema.Struct({
  input: UpdateLabelInputSchema,
  labelId: LabelId,
});

export const labelAgentActions = [
  defineAgentAction({
    confirmationPolicy: "none",
    display: {
      label: "List labels",
      summary: "Read organization labels available for jobs and sites.",
      target: "labels",
    },
    inputSchema: EmptyAgentActionInputSchema,
    executionStatus: "executable",
    kind: "read",
    modelDescription: "List active Ceird labels for the organization.",
    modelName: "listLabels",
    name: "ceird.labels.list",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Create label",
      summary: "Create a new organization label.",
      target: "labels",
    },
    inputSchema: CreateLabelInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Create a Ceird label by name.",
    modelName: "createLabel",
    name: "ceird.labels.create",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Update label",
      summary: "Rename an existing organization label.",
      target: "label",
    },
    inputSchema: UpdateLabelActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription: "Update the name of an existing Ceird label.",
    modelName: "updateLabel",
    name: "ceird.labels.update",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm_destructive",
    display: {
      label: "Delete label",
      summary: "Delete an organization label.",
      target: "label",
    },
    inputSchema: LabelPathInputSchema,
    executionStatus: "executable",
    kind: "destructive",
    modelDescription: "Delete an existing Ceird label by ID.",
    modelName: "deleteLabel",
    name: "ceird.labels.delete",
  }),
] as const;
