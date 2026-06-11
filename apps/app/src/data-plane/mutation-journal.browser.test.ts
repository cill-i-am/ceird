import { createDataPlaneMutationJournal } from "./mutation-journal";
import type { DataPlaneMutationJournalEntry } from "./mutation-journal";

describe("data-plane mutation journal", () => {
  it("records pending, success, and failure lifecycle entries", () => {
    let id = 0;
    let now = 1000;
    const journal = createDataPlaneMutationJournal({
      createId: () => {
        id += 1;
        return `mutation_${id}`;
      },
      now: () => now,
    });

    const pending = journal.recordPending({
      affectedCollections: ["jobs"],
      commandName: "jobs.create",
      input: { title: "Inspect boiler" },
    });

    expect(pending).toMatchObject({
      affectedCollections: ["jobs"],
      commandName: "jobs.create",
      id: "mutation_1",
      input: { title: "Inspect boiler" },
      startedAt: 1000,
      status: "pending",
    } satisfies Partial<DataPlaneMutationJournalEntry>);

    now = 1100;
    journal.recordSuccess(pending.id, { id: "job_123" });

    expect(journal.get(pending.id)).toMatchObject({
      completedAt: 1100,
      output: { id: "job_123" },
      status: "success",
    });

    const failed = journal.recordPending({
      affectedCollections: ["sites"],
      commandName: "sites.update",
      input: { name: "Dublin Port" },
    });
    const error = new Error("Access denied");

    now = 1200;
    journal.recordFailure(failed.id, error);

    expect(journal.get(failed.id)).toMatchObject({
      completedAt: 1200,
      error,
      status: "failure",
    });
    expect(journal.entries()).toHaveLength(2);
  });
});
