import { readConfiguredApiOrigin } from "#/lib/api-origin";
import { authClient, resolveAuthBaseURL } from "#/lib/auth-client";

export async function signOut() {
  const result = await authClient.signOut();

  if (typeof window !== "undefined") {
    await fetchSignOutFallback(window.location.origin);
  }

  return result;
}

async function fetchSignOutFallback(origin: string) {
  const baseURL = resolveAuthBaseURL(origin, readConfiguredApiOrigin());

  if (!baseURL) {
    return;
  }

  try {
    await fetch(new URL("sign-out", `${baseURL}/`), {
      cache: "no-store",
      credentials: "include",
      headers: {
        accept: "application/json",
      },
      method: "POST",
    });
  } catch {
    // The better-auth client result is still authoritative for the UI.
  }
}
