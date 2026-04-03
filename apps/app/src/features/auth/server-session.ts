import { getServerAuthSession } from "./get-server-auth-session";

export async function getCurrentServerSession() {
  return await getServerAuthSession();
}
