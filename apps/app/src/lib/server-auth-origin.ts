export function readConfiguredServerAuthOrigin(): string | undefined {
  return typeof __SERVER_AUTH_ORIGIN__ === "string"
    ? __SERVER_AUTH_ORIGIN__
    : undefined;
}
