"use client";
import type {
  CreateLabelInput,
  Label,
  LabelIdType,
  UpdateLabelInput,
} from "@ceird/labels-core";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";

export function upsertOrganizationLabel(
  labels: readonly Label[],
  label: Label
) {
  return [
    label,
    ...labels.filter((currentLabel) => currentLabel.id !== label.id),
  ].toSorted(compareLabels);
}

export function removeOrganizationLabel(
  labels: readonly Label[],
  labelId: LabelIdType
) {
  return labels.filter((label) => label.id !== labelId);
}

export function sortOrganizationLabels(labels: readonly Label[]) {
  return labels.toSorted(compareLabels);
}

export function getOrganizationLabelsKey(labels: readonly Label[]) {
  return labels.map((label) => `${label.id}:${label.name}`).join("|");
}

export function createBrowserLabel(input: CreateLabelInput) {
  return runBrowserAppApiRequest("LabelsBrowser.createLabel", (client) =>
    client.labels.createLabel({
      payload: input,
    })
  );
}

export function updateBrowserLabel(
  labelId: LabelIdType,
  input: UpdateLabelInput
) {
  return runBrowserAppApiRequest("LabelsBrowser.updateLabel", (client) =>
    client.labels.updateLabel({
      path: { labelId },
      payload: input,
    })
  );
}

export function archiveBrowserLabel(labelId: LabelIdType) {
  return runBrowserAppApiRequest("LabelsBrowser.archiveLabel", (client) =>
    client.labels.deleteLabel({
      path: { labelId },
    })
  );
}

function compareLabels(left: Label, right: Label) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}
