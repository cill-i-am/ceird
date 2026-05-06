declare global {
  interface CloudflareEnv {
    readonly API_ORIGIN: string;
    readonly SENTRY_ENVIRONMENT?: string;
    readonly SENTRY_RELEASE?: string;
    readonly SENTRY_TRACES_SAMPLE_RATE?: string;
    readonly VITE_API_ORIGIN: string;
  }
}
