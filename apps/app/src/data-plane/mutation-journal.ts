import type { DataPlaneCollectionName } from "./collection-contract";

type DataPlaneMutationStatus = "pending" | "success" | "failure";

export interface DataPlaneMutationJournalEntry {
  readonly affectedCollections: readonly DataPlaneCollectionName[];
  readonly commandName: string;
  readonly completedAt?: number | undefined;
  readonly error?: unknown;
  readonly id: string;
  readonly input: unknown;
  readonly output?: unknown;
  readonly startedAt: number;
  readonly status: DataPlaneMutationStatus;
}

export interface DataPlaneMutationJournal {
  readonly clear: () => void;
  readonly entries: () => readonly DataPlaneMutationJournalEntry[];
  readonly get: (id: string) => DataPlaneMutationJournalEntry | undefined;
  readonly recordFailure: (
    id: string,
    error: unknown
  ) => DataPlaneMutationJournalEntry;
  readonly recordPending: (input: {
    readonly affectedCollections: readonly DataPlaneCollectionName[];
    readonly commandName: string;
    readonly input: unknown;
  }) => DataPlaneMutationJournalEntry;
  readonly recordSuccess: (
    id: string,
    output: unknown
  ) => DataPlaneMutationJournalEntry;
}

export function createDataPlaneMutationJournal({
  createId = defaultMutationId,
  now = () => Date.now(),
}: {
  readonly createId?: (() => string) | undefined;
  readonly now?: (() => number) | undefined;
} = {}): DataPlaneMutationJournal {
  const entries: DataPlaneMutationJournalEntry[] = [];

  const updateEntry = (
    id: string,
    update: (
      entry: DataPlaneMutationJournalEntry
    ) => DataPlaneMutationJournalEntry
  ) => {
    const index = entries.findIndex((entry) => entry.id === id);

    if (index === -1) {
      throw new Error(`Unknown data-plane mutation journal entry: ${id}`);
    }

    const existingEntry = entries[index];

    if (existingEntry === undefined) {
      throw new Error(`Unknown data-plane mutation journal entry: ${id}`);
    }

    const updated = update(existingEntry);
    entries[index] = updated;
    return updated;
  };

  return {
    clear: () => {
      entries.length = 0;
    },
    entries: () => [...entries],
    get: (id) => entries.find((entry) => entry.id === id),
    recordFailure: (id, error) =>
      updateEntry(id, (entry) => ({
        ...entry,
        completedAt: now(),
        error,
        status: "failure",
      })),
    recordPending: ({ affectedCollections, commandName, input }) => {
      const entry = {
        affectedCollections: [...affectedCollections],
        commandName,
        id: createId(),
        input,
        startedAt: now(),
        status: "pending",
      } satisfies DataPlaneMutationJournalEntry;
      entries.push(entry);
      return entry;
    },
    recordSuccess: (id, output) =>
      updateEntry(id, (entry) => ({
        ...entry,
        completedAt: now(),
        output,
        status: "success",
      })),
  };
}

function defaultMutationId() {
  if ("crypto" in globalThis && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `mutation_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
