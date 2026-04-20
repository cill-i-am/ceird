import { isRedirect, redirect } from "@tanstack/react-router";

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
  try {
    const session = await getCurrentSession();

    if (session) {
      return session;
    }

    throw redirect(getLoginNavigationTarget());
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    throw redirect(getLoginNavigationTarget());
  }
}
