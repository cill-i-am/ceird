import { getLoginNavigationTarget } from "./auth-navigation";

export function hardRedirectToLogin(invitationId?: string) {
  try {
    const target = getLoginNavigationTarget(invitationId);
    const url = new URL(target.to, window.location.origin);

    if (target.search.invitation) {
      url.searchParams.set("invitation", target.search.invitation);
    }

    window.location.assign(url.toString());
    return true;
  } catch {
    return false;
  }
}
