import { describe, expect, it } from "vitest";

import {
  apiWorkerCompatibility,
  appWorkerCompatibility,
} from "./cloudflare-stack.ts";

describe("Cloudflare Worker compatibility", () => {
  it("keeps the API on full Node.js compatibility", () => {
    expect(apiWorkerCompatibility).toStrictEqual({
      date: "2026-04-30",
      flags: ["nodejs_compat"],
    });
  });

  it("uses only AsyncLocalStorage compatibility for the app Worker", () => {
    expect(appWorkerCompatibility).toStrictEqual({
      date: "2026-04-30",
      flags: ["nodejs_als"],
    });
  });
});
