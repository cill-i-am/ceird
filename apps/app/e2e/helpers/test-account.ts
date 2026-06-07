import { randomUUID } from "node:crypto";

export function createTestPassword(prefix = "CeirdE2E") {
  return `${prefix}-${randomUUID()}!`;
}
