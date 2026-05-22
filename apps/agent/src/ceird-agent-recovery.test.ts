import { describe, expect, it } from "@effect/vitest";

import {
  CEIRD_CHAT_RECOVERY_STALE_AFTER_MS,
  makeCeirdChatRecoveryOptions,
} from "./ceird-agent-recovery.js";

describe("CeirdAgent chat recovery", () => {
  it("auto-continues fresh recovered chat turns", () => {
    const now = 1_000_000;

    expect(
      makeCeirdChatRecoveryOptions(
        {
          createdAt: now - CEIRD_CHAT_RECOVERY_STALE_AFTER_MS + 1,
        },
        now
      )
    ).toEqual({});
  });

  it("persists exact-threshold recovered turns without continuing", () => {
    const now = 1_000_000;

    expect(
      makeCeirdChatRecoveryOptions(
        {
          createdAt: now - CEIRD_CHAT_RECOVERY_STALE_AFTER_MS,
        },
        now
      )
    ).toEqual({ continue: false });
  });

  it("persists stale partial output without continuing the turn", () => {
    const now = 1_000_000;

    expect(
      makeCeirdChatRecoveryOptions(
        {
          createdAt: now - CEIRD_CHAT_RECOVERY_STALE_AFTER_MS - 1,
        },
        now
      )
    ).toEqual({ continue: false });
  });
});
