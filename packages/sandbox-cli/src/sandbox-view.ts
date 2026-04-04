export interface SandboxViewUrls {
  readonly app: string;
  readonly api: string;
  readonly postgres: string;
  readonly fallbackApp: string;
  readonly fallbackApi: string;
}

export function formatSandboxViewLines(
  label: string,
  hostnameSlug: string,
  urls: SandboxViewUrls
): readonly string[] {
  return [
    label,
    `  slug: ${hostnameSlug}`,
    `  app url: ${urls.app}`,
    `  api url: ${urls.api}`,
    `  postgres url: ${urls.postgres}`,
    `  app fallback url: ${urls.fallbackApp}`,
    `  api fallback url: ${urls.fallbackApi}`,
  ];
}
