import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import type { OrganizationId } from "@ceird/identity-core";
import { describe, expect, it } from "vitest";

import type { DataPlaneCollectionName } from "#/data-plane/collection-contract";
import { DATA_PLANE_COLLECTION_NAMES } from "#/data-plane/collection-contract";
import {
  createOrganizationDataScope,
  organizationDataQueryKey,
} from "#/data-plane/query-scope";

const APP_SRC_DIR = resolve(process.cwd(), "src");
const THIS_FILE = "test/data-plane-boundaries.test.ts";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const DIRECT_COLLECTION_IMPORT_ALLOWLIST = new Set([
  "data-plane/collection-contract.ts",
]);
const PRODUCT_COLLECTION_ROOTS = DATA_PLANE_COLLECTION_NAMES;

interface SourceFile {
  readonly filePath: string;
  readonly source: string;
}

let sourceFilesCache: readonly SourceFile[] | undefined;

describe("data-plane architecture boundaries", () => {
  it("centralizes raw TanStack DB collection construction", () => {
    const violations: string[] = [];

    for (const { filePath, source } of getAppSourceFiles()) {
      if (DIRECT_COLLECTION_IMPORT_ALLOWLIST.has(filePath)) {
        continue;
      }

      if (source.includes("@tanstack/query-db-collection")) {
        violations.push(`${filePath}: imports @tanstack/query-db-collection`);
      }

      if (source.includes("@tanstack/react-db")) {
        violations.push(`${filePath}: imports @tanstack/react-db`);
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("keeps jobs and sites state facades out of collection factories", () => {
    const violations = [
      "features/jobs/jobs-state.ts",
      "features/sites/sites-state.ts",
    ].flatMap((filePath) => {
      const source = readFileSync(join(APP_SRC_DIR, filePath), "utf8");

      return [
        source.includes("queryCollectionOptions")
          ? `${filePath}: calls queryCollectionOptions`
          : undefined,
        source.includes("createCollection")
          ? `${filePath}: calls createCollection`
          : undefined,
      ].filter((violation): violation is string => violation !== undefined);
    });

    expect(violations).toStrictEqual([]);
  });

  it("uses data-plane scope helpers for product collection roots", () => {
    const violations: string[] = [];
    const legacyProductRootPattern =
      /organizationScopedQueryKey\(\s*["'](?<root>jobs|sites|site-comments)["']/g;

    for (const { filePath, source } of getAppSourceFiles()) {
      for (const match of source.matchAll(legacyProductRootPattern)) {
        violations.push(
          `${filePath}: ${match.groups?.root ?? "unknown"} uses organizationScopedQueryKey`
        );
      }
    }

    expect(violations).toStrictEqual([]);
  });

  it("keeps product collection roots distinct", () => {
    const scope = createOrganizationDataScope({
      organizationId: "org_123" as OrganizationId,
      role: "owner",
      userId: "user_123",
    });
    const roots = PRODUCT_COLLECTION_ROOTS.map((root) => [
      root,
      organizationDataQueryKey(root, scope).join(":"),
    ]);

    for (const [leftRoot, leftKey] of roots) {
      for (const [rightRoot, rightKey] of roots) {
        if (leftRoot === rightRoot) {
          continue;
        }

        expect(leftKey.startsWith(`${rightKey}:`)).toBeFalsy();
        expect(rightKey.startsWith(`${leftKey}:`)).toBeFalsy();
      }
    }
  });

  it("declares command affected collections against known data-plane roots", () => {
    const knownRoots = new Set<DataPlaneCollectionName>(
      PRODUCT_COLLECTION_ROOTS
    );
    const affectedCollectionsPattern =
      /affectedCollections:\s*\[(?<collections>[^\]]*)\]/g;
    const stringLiteralPattern = /["'](?<collection>[^"']+)["']/g;
    const violations: string[] = [];

    for (const { filePath, source } of getAppSourceFiles()) {
      for (const match of source.matchAll(affectedCollectionsPattern)) {
        const collections = match.groups?.collections ?? "";
        for (const collectionMatch of collections.matchAll(
          stringLiteralPattern
        )) {
          const collection = collectionMatch.groups?.collection ?? "";
          if (knownRoots.has(collection as DataPlaneCollectionName)) {
            continue;
          }

          violations.push(
            `${filePath}: command declares unknown collection "${collection}"`
          );
        }
      }
    }

    expect(violations).toStrictEqual([]);
  });
});

function getAppSourceFiles() {
  sourceFilesCache ??= getSourceFiles(APP_SRC_DIR).flatMap((absolutePath) => {
    const filePath = relative(APP_SRC_DIR, absolutePath);

    return filePath === THIS_FILE
      ? []
      : [
          {
            filePath,
            source: readFileSync(absolutePath, "utf8"),
          },
        ];
  });

  return sourceFilesCache;
}

function getSourceFiles(rootDir: string) {
  return readdirSync(rootDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((filePath) => SOURCE_EXTENSIONS.has(extname(filePath)));
}
