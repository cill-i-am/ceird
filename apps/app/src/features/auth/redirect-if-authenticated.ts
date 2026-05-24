import { redirect } from "@tanstack/react-router";

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import { getCachedClientAppContext } from "./app-context-client-cache";
import { getAuthSuccessNavigationTarget } from "./auth-navigation";
import { isServerEnvironment } from "./runtime-environment";

const importServerSession = () => import("./server-session");

async function getCurrentSession() {
  if (isServerEnvironment()) {
    const { getCurrentServerSession } = await importServerSession();
    return await getCurrentServerSession();
  }

  const appContext = await getCachedClientAppContext();

  return appContext.session;
}

export async function redirectIfAuthenticated(
  search?: InvitationContinuationSearch
) {
  const session = await getCurrentSession();

  if (session) {
    throw redirect(getAuthSuccessNavigationTarget(search?.invitation));
  }
}
