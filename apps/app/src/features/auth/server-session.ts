import { createServerOnlyFn } from "@tanstack/react-start";

export type { ServerAuthSession } from "./server-session-types";

export const getCurrentServerSession = createServerOnlyFn(async () => {
  const { getCurrentServerSessionDirect } =
    await import("./server-session-impl.server");
  return await getCurrentServerSessionDirect();
});
