import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "@effect/vitest";

const mcpSrcDir = path.dirname(fileURLToPath(import.meta.url));

describe("MCP domain adapter boundaries", () => {
  it("keeps product domain implementations out of the MCP protocol app", async () => {
    const files = await listSourceFiles(mcpSrcDir);
    const relativeFiles = files.map((file) => path.relative(mcpSrcDir, file));

    expect(relativeFiles).not.toContain("domains/jobs/repositories.ts");
    expect(relativeFiles).not.toContain("domains/jobs/service.ts");
    expect(relativeFiles).not.toContain("domains/jobs/authorization.ts");
    expect(relativeFiles).not.toContain("domains/sites/repositories.ts");
    expect(relativeFiles).not.toContain("domains/sites/service.ts");
    expect(relativeFiles).not.toContain("domains/labels/repositories.ts");
    expect(relativeFiles).not.toContain("domains/labels/service.ts");
    expect(relativeFiles).not.toContain("domains/comments/repository.ts");
    expect(relativeFiles).not.toContain("domains/mcp/tools.ts");
  });

  it("keeps persistence ownership behind the private domain Worker", async () => {
    const files = await listSourceFiles(mcpSrcDir);
    const relativeFiles = files.map((file) => path.relative(mcpSrcDir, file));
    const source = await readSources(files);

    expect(relativeFiles).not.toContain("platform/database/database.ts");
    expect(relativeFiles).not.toContain("platform/database/schema.ts");
    expect(source).not.toContain("drizzle-orm");
    expect(source).not.toContain("effect/unstable/sql");
    expect(source).not.toContain("@effect/sql-pg");
    expect(source).not.toContain("@ceird/backend-core");
    expect(source).not.toContain('from "pg"');
  });
});

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

async function readSources(files: readonly string[]): Promise<string> {
  const contents = await Promise.all(
    files.map((file) => readFile(file, "utf8"))
  );

  return contents.join("\n");
}
