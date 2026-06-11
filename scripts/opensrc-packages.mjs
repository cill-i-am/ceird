const INCLUDED_PACKAGE_NAMES = new Set([
  "@tanstack/db",
  "@tanstack/react-router",
  "@tanstack/react-router-ssr-query",
  "@tanstack/react-start",
  "better-auth",
  "drizzle-orm",
  "effect",
  "pg",
  "react-dom",
  "tailwindcss",
]);

const INCLUDED_PACKAGE_PREFIXES = ["@effect/"];

export function shouldIncludeOpensrcPackage(packageName) {
  return (
    INCLUDED_PACKAGE_NAMES.has(packageName) ||
    INCLUDED_PACKAGE_PREFIXES.some((prefix) => packageName.startsWith(prefix))
  );
}

export function buildOpensrcSourceList(workspacePackageJsons) {
  const packages = new Set();

  for (const packageJson of workspacePackageJsons) {
    for (const dependency of Object.keys(packageJson.dependencies ?? {})) {
      if (dependency.startsWith("@ceird/")) {
        continue;
      }

      if (!shouldIncludeOpensrcPackage(dependency)) {
        continue;
      }

      packages.add(dependency);
    }
  }

  return [...packages].toSorted();
}
