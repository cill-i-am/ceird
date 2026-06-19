import type { Label } from "@ceird/labels-core";

export function searchSettingsLabels(
  labels: readonly Label[],
  searchQuery: string
) {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  if (normalizedQuery.length === 0) {
    return labels;
  }

  return sortLabels(
    labels.filter((label) => {
      const description = label.description?.toLocaleLowerCase() ?? "";

      return (
        label.name.toLocaleLowerCase().includes(normalizedQuery) ||
        description.includes(normalizedQuery)
      );
    })
  );
}

function sortLabels(labels: readonly Label[]) {
  return labels.toSorted(compareLabels);
}

function compareLabels(left: Label, right: Label) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}
