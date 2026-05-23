import { redirect } from "@tanstack/react-router";

import { getLoginNavigationTarget } from "./auth-navigation";
import { getCachedClientAuthSession } from "./client-session-cache";
import { isServerEnvironment } from "./runtime-environment";

const importServerSession = () => import("./server-session");

async function getCurrentSession() {
  if (isServerEnvironment()) {
    const { getCurrentServerSession } = await importServerSession();
    return await getCurrentServerSession();
  }

  return await getCachedClientAuthSession();
}

export async function requireAuthenticatedSession() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect(getLoginNavigationTarget());
  }

  return session;
}
