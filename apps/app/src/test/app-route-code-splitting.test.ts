import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const APP_SRC_DIR = resolve(process.cwd(), "src");

const DOMAIN_HEAVY_ROUTE_FILES = [
  "routes/_app._org.activity.tsx",
  "routes/_app._org.index.tsx",
  "routes/_app._org.jobs.tsx",
  "routes/_app._org.organization.security.tsx",
  "routes/_app._org.organization.settings.tsx",
  "routes/_app._org.sites.tsx",
] as const;

const FORM_HEAVY_ROUTE_FILES = [
  "routes/_app._org.members.tsx",
  "routes/forgot-password.tsx",
  "routes/login.tsx",
  "routes/reset-password.tsx",
  "routes/signup.tsx",
  "routes/verify-email.tsx",
  "routes/_app.settings.tsx",
] as const;

const ROUTE_SEARCH_FILES = [
  "features/auth/email-verification-search.ts",
  "features/auth/password-reset-search.ts",
  "features/activity/activity-search.ts",
  "features/jobs/jobs-search.ts",
  "features/organization-security/organization-security-search.ts",
  "features/settings/user-settings-search.ts",
  "features/workspace-sheets/workspace-sheet-search.ts",
] as const;

describe("app route code splitting", () => {
  it("keeps domain-heavy route loaders in lazy route chunks", () => {
    const unsplitRouteFiles = DOMAIN_HEAVY_ROUTE_FILES.filter((filePath) => {
      const source = readAppSource(filePath);

      return !hasLoaderCodeSplitGrouping(source);
    });

    expect(unsplitRouteFiles).toStrictEqual([]);
  });

  it("does not add a nested dynamic import before route loaders run", () => {
    for (const filePath of DOMAIN_HEAVY_ROUTE_FILES) {
      const source = readAppSource(filePath);

      expect(source).not.toMatch(
        /await\s+import\(\s*["'][^"']*route-loader["']\s*\)/u
      );
    }
  });

  it("does not export domain-heavy route helper functions from route files", () => {
    for (const filePath of DOMAIN_HEAVY_ROUTE_FILES) {
      const source = readAppSource(filePath);

      expect(source).not.toMatch(/export\s+(async\s+)?function\s+load/u);
    }
  });

  it("keeps form-heavy route pages in lazy route chunks", () => {
    const unsplitRouteFiles = FORM_HEAVY_ROUTE_FILES.filter((filePath) => {
      const source = readAppSource(filePath);

      return !hasComponentCodeSplitGrouping(source);
    });

    expect(unsplitRouteFiles).toStrictEqual([]);
  });

  it("keeps route search decoders free of boundary schema imports", () => {
    for (const filePath of ROUTE_SEARCH_FILES) {
      const source = readAppSource(filePath);

      expect(source).not.toMatch(/from\s+["']effect["']/u);
      expect(source).not.toMatch(
        /import\s+\{[^}]*\}\s+from\s+["']@ceird\/jobs-core["']/u
      );
      expect(source).not.toMatch(
        /import\s+\{[^}]*\}\s+from\s+["']@ceird\/sites-core["']/u
      );
    }
  });

  it("loads the jobs coverage map only when the map view renders", () => {
    const source = readAppSource("features/jobs/jobs-page.tsx");

    expect(source).not.toMatch(
      /import\s+\{\s*JobsCoverageMap\s*\}\s+from\s+["']\.\/jobs-coverage-map["']/u
    );
    expect(source).toContain('import("./jobs-coverage-map")');
  });
});

function readAppSource(filePath: string) {
  return readFileSync(resolve(APP_SRC_DIR, filePath), "utf8");
}

function hasLoaderCodeSplitGrouping(source: string) {
  return /codeSplitGroupings:\s*\[[\s\S]*["']loader["'][\s\S]*\]/u.test(source);
}

function hasComponentCodeSplitGrouping(source: string) {
  return /codeSplitGroupings:\s*\[[\s\S]*["']component["'][\s\S]*\]/u.test(
    source
  );
}
