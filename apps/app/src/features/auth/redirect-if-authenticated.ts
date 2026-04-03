import { redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { isServerEnvironment } from "./runtime-environment";
import { getCurrentServerSession } from "./server-session";

async function getCurrentSession() {
  try {
    if (isServerEnvironment()) {
      return await getCurrentServerSession();
    }

    const session = await authClient.getSession();
    return session.data?.session ?? null;
  } catch {
    return null;
  }
}

export async function redirectIfAuthenticated() {
  const session = await getCurrentSession();

  if (session) {
    throw redirect({ to: "/" });
  }
}
