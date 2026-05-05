const INCLUDED_PACKAGE_NAMES = new Set([
  "@tanstack/react-form",
  "@tanstack/react-router",
  "@tanstack/react-router-ssr-query",
  "@tanstack/react-start",
  "better-auth",
  "drizzle-orm",
  "effect",
  "pg",
  "portless",
  "react-dom",
  "tailwindcss",
]);

const INCLUDED_PACKAGE_PREFIXES = ["@effect/"];

const EXTRA_SOURCES = ["github:facebook/react"];

export function shouldIncludeOpensrcPackage(packageName) {
  return (
    INCLUDED_PACKAGE_NAMES.has(packageName) ||
    INCLUDED_PACKAGE_PREFIXES.some((prefix) => packageName.startsWith(prefix))
  );
}

export function buildOpensrcSourceList(workspacePackageJsons) {
  const packages = new Set(["portless"]);

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

  return [...packages, ...EXTRA_SOURCES].toSorted();
}
