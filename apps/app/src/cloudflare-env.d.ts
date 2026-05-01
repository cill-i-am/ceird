declare global {
  interface CloudflareEnv {
    readonly API_ORIGIN: string;
    readonly VITE_API_ORIGIN: string;
  }
}
