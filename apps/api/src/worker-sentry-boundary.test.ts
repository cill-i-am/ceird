import { describe, expect, it, vi } from "vitest";

vi.mock(import("@sentry/effect/server"), () => {
  throw new Error("Worker imported the Node Sentry SDK");
});

describe("worker sentry boundary", () => {
  it("does not import the Node Sentry SDK in the Cloudflare Worker entrypoint", async () => {
    await expect(import("./worker.js")).resolves.toBeDefined();
  });
});
