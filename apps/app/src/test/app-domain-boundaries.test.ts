/* oxlint-disable unicorn/no-array-sort */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const APP_SRC_DIR = resolve(process.cwd(), "src");
const THIS_FILE = "test/app-domain-boundaries.test.ts";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const SITE_OR_LABEL_OWNED_JOBS_CORE_IMPORTS = new Set([
  "CreateLabelInput",
  "CreateJobLabelInput",
  "CreateServiceAreaInput",
  "CreateServiceAreaResponse",
  "CreateSiteInput",
  "CreateSiteResponse",
  "Label",
  "LabelIdType",
  "LabelNameSchema",
  "JobLabel",
  "JobLabelIdType",
  "JobLabelNameSchema",
  "JobLabelsResponse",
  "JobSiteOption",
  "LabelsResponse",
  "SERVICE_AREA_NOT_FOUND_ERROR_TAG",
  "SITE_ACCESS_DENIED_ERROR_TAG",
  "SITE_COUNTRIES",
  "SITE_GEOCODING_FAILED_ERROR_TAG",
  "SITE_GEOCODING_PROVIDERS",
  "SITE_NOT_FOUND_ERROR_TAG",
  "SITE_STORAGE_ERROR_TAG",
  "ServiceArea",
  "ServiceAreaIdType",
  "ServiceAreaListResponse",
  "ServiceAreaNotFoundError",
  "ServiceAreaOption",
  "SiteCountry",
  "SiteDetail",
  "SiteGeocodingFailedError",
  "SiteGeocodingProvider",
  "SiteId",
  "SiteIdType",
  "SiteLatitude",
  "SiteLongitude",
  "SiteNotFoundError",
  "SiteOption",
  "SitesOptionsResponse",
  "UpdateLabelInput",
  "UpdateJobLabelInput",
  "UpdateServiceAreaInput",
  "UpdateServiceAreaResponse",
  "UpdateSiteInput",
  "UpdateSiteResponse",
  "normalizeLabelName",
  "normalizeJobLabelName",
]);

interface SourceFile {
  readonly filePath: string;
  readonly source: string;
}

const SOURCE_FILES: readonly SourceFile[] = getSourceFiles(APP_SRC_DIR).flatMap(
  (filePath) =>
    filePath === THIS_FILE
      ? []
      : [
          {
            filePath,
            source: readFileSync(join(APP_SRC_DIR, filePath), "utf8"),
          },
        ]
);

describe("app domain package boundaries", () => {
  it("does not import site or organization label primitives from jobs-core", () => {
    const violations = collectSourceFileViolations(
      findJobsCoreImportViolations
    );

    expect(violations).toStrictEqual([]);
  });

  it("does not load site or label route data through jobs server helpers", () => {
    const violations = collectSourceFileViolations(
      findJobsServerDomainHelperViolations
    );

    expect(violations).toStrictEqual([]);
  });

  it("keeps site and label app features independent from jobs features", () => {
    const violations: string[] = [];

    for (const { filePath, source } of SOURCE_FILES) {
      if (
        !filePath.startsWith("features/sites/") &&
        !filePath.startsWith("features/labels/")
      ) {
        continue;
      }

      violations.push(...findJobsFeatureImportViolations(filePath, source));
    }

    expect(violations).toStrictEqual([]);
  });
});

function collectSourceFileViolations(
  findViolations: (filePath: string, source: string) => readonly string[]
) {
  const violations: string[] = [];

  for (const { filePath, source } of SOURCE_FILES) {
    violations.push(...findViolations(filePath, source));
  }

  return violations;
}

function findJobsCoreImportViolations(filePath: string, source: string) {
  const violations: string[] = [];
  const importPattern =
    /import\s+(?:type\s+)?\{(?<imports>[^}]+)\}\s+from\s+["']@ceird\/jobs-core["']/gs;

  for (const match of source.matchAll(importPattern)) {
    const imports = match.groups?.imports ?? "";
    for (const importedName of getImportedNames(imports)) {
      if (SITE_OR_LABEL_OWNED_JOBS_CORE_IMPORTS.has(importedName)) {
        violations.push(`${filePath}: ${importedName}`);
      }
    }
  }

  return violations;
}

function getImportedNames(imports: string) {
  return imports.split(",").flatMap((importedName) => {
    const name = importedName
      .trim()
      .split(/\s+as\s+/u)[0]
      ?.trim();

    return name ? [name] : [];
  });
}

function findJobsServerDomainHelperViolations(
  filePath: string,
  source: string
) {
  const violations: string[] = [];
  const importPattern =
    /import\s+(?:type\s+)?\{(?<imports>[^}]+)\}\s+from\s+["']#\/features\/jobs\/jobs-server["']/gs;

  for (const match of source.matchAll(importPattern)) {
    const imports = match.groups?.imports ?? "";
    for (const importedName of getImportedNames(imports)) {
      if (
        importedName === "getCurrentServerLabels" ||
        importedName === "getCurrentServerSiteOptions"
      ) {
        violations.push(`${filePath}: ${importedName}`);
      }
    }
  }

  return violations;
}

function findJobsFeatureImportViolations(filePath: string, source: string) {
  const violations: string[] = [];
  const importPattern =
    /from\s+["'](?<specifier>#\/features\/jobs\/[^"']+)["']/g;

  for (const match of source.matchAll(importPattern)) {
    const specifier = match.groups?.specifier;

    if (specifier !== undefined) {
      violations.push(`${filePath}: ${specifier}`);
    }
  }

  return violations;
}

function getSourceFiles(directory: string): readonly string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      files.push(...getSourceFiles(absolutePath));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(getExtension(entry))) {
      files.push(relative(APP_SRC_DIR, absolutePath).replaceAll("\\", "/"));
    }
  }

  return files.sort();
}

function getExtension(filePath: string) {
  const extensionStart = filePath.lastIndexOf(".");
  return extensionStart === -1 ? "" : filePath.slice(extensionStart);
}
