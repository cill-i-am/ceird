import { redirect } from "@tanstack/react-router";

import { getCachedClientAppContext } from "./app-context-client-cache";
import { getLoginNavigationTarget } from "./auth-navigation";
import { isServerEnvironment } from "./runtime-environment";

const importServerSession = () => import("./server-session");

async function getCurrentSession() {
  if (isServerEnvironment()) {
    const { getCurrentServerSession } = await importServerSession();
    return await getCurrentServerSession();
  }

  return (await getCachedClientAppContext()).session;
}

export async function requireAuthenticatedSession() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect(getLoginNavigationTarget());
  }

  return session;
}
