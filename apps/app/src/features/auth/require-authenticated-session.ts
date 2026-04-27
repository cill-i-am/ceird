import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { getLoginNavigationTarget } from "./auth-navigation";
import { isServerEnvironment } from "./runtime-environment";
import { getCurrentServerSession } from "./server-session";

async function getCurrentSession() {
  if (isServerEnvironment()) {
    return await getCurrentServerSession();
  }

  const session = await authClient.getSession();
  return session.data ?? null;
}

export async function requireAuthenticatedSession() {
  const session = await getCurrentSession();

  if (!session) {
    throw redirect(getLoginNavigationTarget());
  }

  return session;
}
