import {
  CreateLabelInputSchema,
  UpdateLabelInputSchema,
} from "@ceird/labels-core/dto";
import { LabelId } from "@ceird/labels-core/ids";
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
      summary: "Create a new organization label with a color.",
      target: "labels",
    },
    inputSchema: CreateLabelInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription:
      "Create a Ceird label by name, canonical OKLCH color, and optional description.",
    modelName: "createLabel",
    name: "ceird.labels.create",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Update label",
      summary: "Update an existing organization label.",
      target: "label",
    },
    inputSchema: UpdateLabelActionInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription:
      "Update the name, canonical OKLCH color, and optional description of an existing Ceird label.",
    modelName: "updateLabel",
    name: "ceird.labels.update",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm_destructive",
    display: {
      label: "Archive label",
      summary: "Archive an organization label.",
      target: "label",
    },
    inputSchema: LabelPathInputSchema,
    executionStatus: "executable",
    kind: "destructive",
    modelDescription: "Archive an existing Ceird label by ID.",
    modelName: "archiveLabel",
    name: "ceird.labels.archive",
  }),
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Restore label",
      summary: "Restore an archived organization label.",
      target: "label",
    },
    inputSchema: LabelPathInputSchema,
    executionStatus: "executable",
    kind: "write",
    modelDescription:
      "Restore an archived Ceird label by ID when no active label uses the same normalized name.",
    modelName: "restoreLabel",
    name: "ceird.labels.restore",
  }),
] as const;
