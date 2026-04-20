import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import { getAuthSuccessNavigationTarget } from "./auth-navigation";
import { isServerEnvironment } from "./runtime-environment";
import { getCurrentServerSession } from "./server-session";

async function getCurrentSession() {
  try {
    if (isServerEnvironment()) {
      return await getCurrentServerSession();
    }

    const session = await authClient.getSession();
    return session.data ?? null;
  } catch {
    return null;
  }
}

export async function redirectIfAuthenticated(
  search?: InvitationContinuationSearch
) {
  const session = await getCurrentSession();

  if (session) {
    throw redirect(getAuthSuccessNavigationTarget(search?.invitation));
  }
}
