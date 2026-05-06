const cloudflareCreateRequireRuntime = "createRequire(import.meta.url)";
const cloudflareCreateRequireRuntimeWithFallback =
  'createRequire(import.meta.url ?? "file:///worker.js")';

export function applyCloudflareCreateRequireRuntimeFallback(code: string) {
  return code.replaceAll(
    cloudflareCreateRequireRuntime,
    cloudflareCreateRequireRuntimeWithFallback
  );
}
