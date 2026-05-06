import { tanstackStartServerEntry } from "../lib/tanstack-start-config";

describe("vite config", () => {
  it("points TanStack Start at the custom app Worker server entry", () => {
    expect(tanstackStartServerEntry).toBe("./server.ts");
  });
});
