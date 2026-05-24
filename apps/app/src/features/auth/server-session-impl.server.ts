import { readGlobalAppServerContext } from "./app-server-context";
import { readOptionalServerAuthSessionFromHeaders } from "./auth-request-context.server";

export async function getCurrentServerSessionDirect() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cachedSession = readGlobalAppServerContext().authSession;

  if (cachedSession !== undefined) {
    return cachedSession;
  }

  return await readOptionalServerAuthSessionFromHeaders((name) =>
    getRequestHeader(name)
  );
}
