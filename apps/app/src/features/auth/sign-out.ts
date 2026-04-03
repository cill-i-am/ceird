import { authClient } from "#/lib/auth-client";

export async function signOut() {
  return await authClient.signOut();
}
