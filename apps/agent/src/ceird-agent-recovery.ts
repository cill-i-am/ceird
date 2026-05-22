import type { ChatRecoveryOptions } from "@cloudflare/ai-chat";

export const CEIRD_CHAT_RECOVERY_STALE_AFTER_MS = 2 * 60 * 1000;

export interface CeirdChatRecoveryTiming {
  readonly createdAt: number;
}

export function makeCeirdChatRecoveryOptions(
  ctx: CeirdChatRecoveryTiming,
  now = Date.now()
): ChatRecoveryOptions {
  return now - ctx.createdAt >= CEIRD_CHAT_RECOVERY_STALE_AFTER_MS
    ? { continue: false }
    : {};
}
