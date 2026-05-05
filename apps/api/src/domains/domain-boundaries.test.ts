import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as Vitest from "vitest";

const { describe, expect, it } = Vitest;

const domainsDir = path.dirname(fileURLToPath(import.meta.url));
const apiSrcDir = path.resolve(domainsDir, "..");

describe("api domain boundaries", () => {
  it("keeps sites implementation in the sites domain", async () => {
    const domains = await listDomainSourceFiles();

    expect(domains).toContain("sites/http.ts");
    expect(domains).toContain("sites/service.ts");
    expect(domains).toContain("sites/repositories.ts");
    expect(domains).toContain("sites/schema.ts");
    expect(domains).toContain("sites/geocoder.ts");
    expect(domains).toContain("sites/geocoding-config.ts");
    expect(domains).not.toContain("jobs/sites-service.ts");
    expect(domains).not.toContain("jobs/site-geocoder.ts");
    expect(domains).not.toContain("jobs/site-geocoding-config.ts");
  });

  it("keeps labels implementation in the labels domain", async () => {
    const domains = await listDomainSourceFiles();

    expect(domains).toContain("labels/http.ts");
    expect(domains).toContain("labels/service.ts");
    expect(domains).toContain("labels/repositories.ts");
    expect(domains).toContain("labels/schema.ts");
  });

  it("keeps jobs code free of organization label CRUD ownership", async () => {
    const jobsSources = await readDomainSources("jobs");

    expect(jobsSources).not.toMatch(/\bJobLabelsRepository\b/);
    expect(jobsSources).not.toMatch(/\bcreateJobLabel\b/);
    expect(jobsSources).not.toMatch(/\blistJobLabels\b/);
    expect(jobsSources).not.toMatch(/\bupdateJobLabel\b/);
    expect(jobsSources).not.toMatch(/\barchiveJobLabel\b/);
    expect(jobsSources).not.toMatch(/\bjob_labels\b/);
    expect(jobsSources).not.toMatch(/pgTable\(\s*"labels"/);
    expect(jobsSources).not.toMatch(/pgTable\(\s*"sites"/);
    expect(jobsSources).not.toMatch(/pgTable\(\s*"service_areas"/);
  });

  it("keeps sites independent from jobs-owned contacts", async () => {
    const sitesSources = await readDomainSources("sites");

    expect(sitesSources).not.toContain("@ceird/jobs-core");
    expect(sitesSources).not.toMatch(/\bContactId\b/);
    expect(sitesSources).not.toMatch(/\bContactNotFoundError\b/);
    expect(sitesSources).not.toMatch(/\bsite_contacts\b/);
  });

  it("uses organization-level label table names", async () => {
    const source = await readApiSources();

    expect(source).toContain('"labels"');
    expect(source).not.toContain('"job_labels"');
  });
});

async function listDomainSourceFiles(): Promise<readonly string[]> {
  const files = await listSourceFiles(domainsDir);
  return files.map((file) => path.relative(domainsDir, file));
}

async function readDomainSources(domain: string): Promise<string> {
  const files = await listSourceFiles(path.join(domainsDir, domain));
  const contents = await Promise.all(
    files.map((file) => readFile(file, "utf8"))
  );

  return contents.join("\n");
}

async function readApiSources(): Promise<string> {
  const files = await listSourceFiles(apiSrcDir);
  const contents = await Promise.all(
    files.map((file) => readFile(file, "utf8"))
  );

  return contents.join("\n");
}

async function listSourceFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.endsWith(".test.ts"))
      .map((entry) => {
        const entryPath = path.join(root, entry.name);

        if (entry.isDirectory()) {
          return listSourceFiles(entryPath);
        }

        if (entry.name.endsWith(".ts")) {
          return [entryPath];
        }

        return [];
      })
  );

  return nested.flat();
}
