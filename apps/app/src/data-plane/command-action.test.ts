import { Exit } from "effect";

import { executeDataPlaneCommandAction } from "./command-action";
import { createDataPlaneMutationJournal } from "./mutation-journal";

describe("data-plane command actions", () => {
  it("records command lifecycle and reconciles successful server-confirmed output once", async () => {
    const reconcile = vi.fn<() => Promise<void>>().mockResolvedValue();
    const journal = createDataPlaneMutationJournal({
      createId: () => "mutation_1",
      now: () => 1000,
    });

    const exit = await executeDataPlaneCommandAction(
      {
        affectedCollections: ["jobs"],
        execute: (input: { readonly title: string }) =>
          Promise.resolve(Exit.succeed({ id: "job_123", title: input.title })),
        name: "jobs.create",
        optimistic: "none",
        reconcile,
      },
      { title: "Inspect boiler" },
      { journal }
    );

    expect(Exit.isSuccess(exit)).toBeTruthy();
    expect(reconcile).toHaveBeenCalledExactlyOnceWith(
      { id: "job_123", title: "Inspect boiler" },
      { title: "Inspect boiler" }
    );
    expect(journal.entries()).toMatchObject([
      {
        affectedCollections: ["jobs"],
        commandName: "jobs.create",
        input: { title: "Inspect boiler" },
        output: { id: "job_123", title: "Inspect boiler" },
        status: "success",
      },
    ]);
  });

  it("records typed command failures without running reconciliation", async () => {
    const reconcile = vi.fn<() => Promise<void>>().mockResolvedValue();
    const journal = createDataPlaneMutationJournal({
      createId: () => "mutation_1",
      now: () => 1000,
    });
    const failure = { reason: "access_denied" } as const;

    const exit = await executeDataPlaneCommandAction(
      {
        affectedCollections: ["sites"],
        execute: () => Promise.resolve(Exit.fail(failure)),
        name: "sites.update",
        optimistic: "none",
        reconcile,
      },
      { name: "Dublin Port" },
      { journal }
    );

    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(reconcile).not.toHaveBeenCalled();
    expect(journal.entries()).toMatchObject([
      {
        commandName: "sites.update",
        error: failure,
        status: "failure",
      },
    ]);
  });
});
