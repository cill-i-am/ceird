import { render, waitFor } from "@testing-library/react";

import { useHydratedCollectionItems } from "./hydrated-collection";

interface SnapshotRequestOptions {
  readonly optimizedOnly?: boolean | undefined;
}

describe("hydrated collection hook", () => {
  it("requests an initial snapshot so on-demand collections load their subset", async () => {
    const requestSnapshot =
      vi.fn<(options?: SnapshotRequestOptions | undefined) => void>();
    const unsubscribe = vi.fn<() => void>();
    const collection = {
      entries: () => new Map<string, { readonly id: string }>().entries(),
      status: "ready",
      subscribeChanges: vi.fn<
        (callback: () => void) => {
          readonly requestSnapshot: (
            options?: SnapshotRequestOptions | undefined
          ) => void;
          readonly unsubscribe: () => void;
        }
      >(() => ({
        requestSnapshot,
        unsubscribe,
      })),
    };

    render(<HydratedCollectionProbe collection={collection} />);

    await waitFor(() => {
      expect(requestSnapshot).toHaveBeenCalledWith({ optimizedOnly: false });
    });
  });
});

function HydratedCollectionProbe({
  collection,
}: {
  readonly collection: Parameters<typeof useHydratedCollectionItems>[0];
}) {
  useHydratedCollectionItems(collection, []);
  return null;
}
