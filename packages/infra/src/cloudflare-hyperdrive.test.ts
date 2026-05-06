import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";

import { hyperdriveBody } from "./cloudflare-hyperdrive.ts";

describe("Hyperdrive API body", () => {
  it("includes the configured origin connection limit", () => {
    expect(
      hyperdriveBody({
        caching: { disabled: true },
        name: "ceird-production-postgres",
        origin: {
          database: "ceird-production",
          host: "aws.connect.psdb.cloud",
          password: Redacted.make("secret"),
          user: "ceird",
        },
        originConnectionLimit: 5,
      })
    ).toStrictEqual({
      caching: { disabled: true },
      name: "ceird-production-postgres",
      origin: {
        database: "ceird-production",
        host: "aws.connect.psdb.cloud",
        password: "secret",
        port: 5432,
        scheme: "postgres",
        user: "ceird",
      },
      origin_connection_limit: 5,
    });
  });
});
