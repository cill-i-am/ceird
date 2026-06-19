import { readGlobalAppServerContext } from "./app-server-context";
import { readOptionalServerAuthSessionFromHeaders } from "./auth-request-context.server";
import { getServerRequestHeader } from "./server-request-headers.server";

export async function getCurrentServerSessionDirect(
  readHeader: (name: string) => string | undefined = getServerRequestHeader
) {
  const cachedSession = readGlobalAppServerContext().authSession;

  if (cachedSession !== undefined) {
    return cachedSession;
  }

  return await readOptionalServerAuthSessionFromHeaders(readHeader);
}
