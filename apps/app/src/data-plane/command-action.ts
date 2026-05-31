import { Cause, Exit, Option } from "effect";

import type { DataPlaneCollectionName } from "./collection-contract";
import type { DataPlaneMutationJournal } from "./mutation-journal";

type DataPlaneCommandOptimisticPolicy =
  | "none"
  | "reversible"
  | "temporary-row"
  | "multi-collection";

export interface DataPlaneCommandAction<Input, Output, Failure> {
  readonly affectedCollections: readonly DataPlaneCollectionName[];
  readonly execute: (input: Input) => Promise<Exit.Exit<Output, Failure>>;
  readonly name: string;
  readonly optimistic: DataPlaneCommandOptimisticPolicy;
  readonly reconcile?: (output: Output, input: Input) => Promise<void> | void;
}

function defineDataPlaneCommandAction<Input, Output, Failure>(
  action: DataPlaneCommandAction<Input, Output, Failure>
): DataPlaneCommandAction<Input, Output, Failure> {
  if (action.name.length === 0) {
    throw new Error("Data-plane command action name is required.");
  }

  if (action.affectedCollections.length === 0) {
    throw new Error(
      `Data-plane command action ${action.name} must declare affected collections.`
    );
  }

  return action;
}

export async function executeDataPlaneCommandAction<Input, Output, Failure>(
  action: DataPlaneCommandAction<Input, Output, Failure>,
  input: Input,
  {
    journal,
  }: {
    readonly journal?: DataPlaneMutationJournal | undefined;
  } = {}
): Promise<Exit.Exit<Output, Failure>> {
  const command = defineDataPlaneCommandAction(action);
  const journalEntry = journal?.recordPending({
    affectedCollections: command.affectedCollections,
    commandName: command.name,
    input,
  });

  try {
    const exit = await command.execute(input);

    if (Exit.isSuccess(exit)) {
      await command.reconcile?.(exit.value, input);
      if (journalEntry) {
        journal?.recordSuccess(journalEntry.id, exit.value);
      }
      return exit;
    }

    if (journalEntry) {
      journal?.recordFailure(journalEntry.id, failureFromCause(exit.cause));
    }
    return exit;
  } catch (error) {
    if (journalEntry) {
      journal?.recordFailure(journalEntry.id, error);
    }
    throw error;
  }
}

function failureFromCause<Failure>(cause: Cause.Cause<Failure>): unknown {
  const failure = Cause.findErrorOption(cause);

  return Option.isSome(failure) ? failure.value : Cause.squash(cause);
}
