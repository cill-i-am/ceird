"use client";
import type { OrganizationId } from "@ceird/identity-core";
import type {
  CreateLabelInput,
  Label,
  LabelIdType,
  UpdateLabelInput,
} from "@ceird/labels-core";
import { Atom } from "@effect-atom/atom-react";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";

export interface OrganizationLabelsState {
  readonly labels: readonly Label[];
  readonly organizationId: OrganizationId | null;
}

export const organizationLabelsStateAtom = Atom.make<OrganizationLabelsState>({
  labels: [],
  organizationId: null,
}).pipe(Atom.keepAlive);

export function seedOrganizationLabelsState(
  organizationId: OrganizationId,
  labels: readonly Label[]
): OrganizationLabelsState {
  return {
    labels,
    organizationId,
  };
}

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

export function syncOrganizationLabel(
  get: Atom.FnContext,
  label: Label,
  expectedOrganizationId?: OrganizationId | null
) {
  const currentLabelsState = get(organizationLabelsStateAtom);

  if (
    expectedOrganizationId !== undefined &&
    currentLabelsState.organizationId !== expectedOrganizationId
  ) {
    return;
  }

  get.set(organizationLabelsStateAtom, {
    labels: upsertOrganizationLabel(currentLabelsState.labels, label),
    organizationId: currentLabelsState.organizationId,
  });
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
