import { redirect } from "@tanstack/react-router";

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import { getAuthSuccessNavigationTarget } from "./auth-navigation";
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

export async function redirectIfAuthenticated(
  search?: InvitationContinuationSearch
) {
  const session = await getCurrentSession();

  if (session) {
    throw redirect(getAuthSuccessNavigationTarget(search?.invitation));
  }
}
