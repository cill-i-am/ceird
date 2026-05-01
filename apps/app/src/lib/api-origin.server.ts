export function readConfiguredServerApiOrigin(): string | undefined {
  const envOrigin = (
    globalThis as unknown as {
      readonly process?: {
        readonly env?: Record<string, string | undefined>;
      };
    }
  ).process?.env?.API_ORIGIN;

  return typeof envOrigin === "string" && envOrigin.length > 0
    ? envOrigin
    : undefined;
}
