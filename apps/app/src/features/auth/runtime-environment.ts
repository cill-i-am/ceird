export function isServerEnvironment() {
  return typeof window === "undefined";
}
