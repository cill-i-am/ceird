export function hardRedirectToLogin() {
  try {
    window.location.assign("/login");
    return true;
  } catch {
    return false;
  }
}
