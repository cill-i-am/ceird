import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import path from "node:path";

const skippedRepositoryEntries = new Set([
  ".git",
  ".agents",
  ".alchemy",
  ".auto-research",
  ".pnpm-store",
  ".worktrees",
  "build",
  "coverage",
  "dist",
  "node-compile-cache",
  "node_modules",
  "opensrc",
  "out",
]);

export const instructionTopologyPolicy = {
  canonicalNodes: [
    ".",
    "apps",
    "apps/agent",
    "apps/api",
    "apps/app",
    "apps/domain",
    "apps/mcp",
    "apps/sync",
    "docs",
    "docs/agents",
    "docs/architecture",
    "infra",
    "packages",
    "packages/agents-core",
    "packages/comments-core",
    "packages/domain-core",
    "packages/identity-core",
    "packages/jobs-core",
    "packages/labels-core",
    "packages/proximity-core",
    "packages/sites-core",
    "packages/worker-observability",
    "scripts",
  ],
  mirrorTarget: "AGENTS.md",
  mirrorFileName: "CLAUDE.md",
  mirrorExceptions: [],
};

export function instructionNodePath(node, fileName) {
  return node === "." ? fileName : path.posix.join(node, fileName);
}

function shouldSkipRepositoryEntry(entry, relativePath) {
  return (
    skippedRepositoryEntries.has(entry) ||
    relativePath.startsWith("docs/superpowers")
  );
}

function listRepositoryFiles(cwd, fileName, directory = cwd, files = []) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const relativePath = path
      .relative(cwd, absolutePath)
      .split(path.sep)
      .join("/");

    if (shouldSkipRepositoryEntry(entry, relativePath)) {
      continue;
    }

    if (lstatSync(absolutePath).isDirectory()) {
      listRepositoryFiles(cwd, fileName, absolutePath, files);
      continue;
    }

    if (entry === fileName) {
      files.push(relativePath);
    }
  }

  return files.toSorted();
}

export function discoverInstructionTopology(
  cwd,
  policy = instructionTopologyPolicy
) {
  return {
    canonicalFiles: listRepositoryFiles(cwd, "AGENTS.md"),
    mirrorFiles: listRepositoryFiles(cwd, policy.mirrorFileName),
  };
}

export function expectedInstructionTopology(
  policy = instructionTopologyPolicy
) {
  const exceptionNodes = new Set(
    policy.mirrorExceptions.map(({ node }) => node)
  );
  const canonicalFiles = policy.canonicalNodes.map((node) =>
    instructionNodePath(node, "AGENTS.md")
  );
  const mirrorFiles = policy.canonicalNodes
    .filter((node) => !exceptionNodes.has(node))
    .map((node) => instructionNodePath(node, policy.mirrorFileName));

  return {
    canonicalFiles,
    mirrorFiles,
  };
}

function compareExpectedFiles({ expected, actual, label }) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((filePath) => !actualSet.has(filePath));
  const unexpected = actual.filter((filePath) => !expectedSet.has(filePath));

  return [
    ...missing.map((filePath) => `Missing ${label} ${filePath}`),
    ...unexpected.map((filePath) => `Unexpected ${label} ${filePath}`),
  ];
}

function validateCanonicalNode(cwd, node) {
  const canonicalPath = instructionNodePath(node, "AGENTS.md");
  const absoluteCanonicalPath = path.join(cwd, canonicalPath);

  if (!existsSync(absoluteCanonicalPath)) {
    return [];
  }

  return lstatSync(absoluteCanonicalPath).isFile()
    ? []
    : [`${canonicalPath} should be a regular source-of-truth file`];
}

function validateMirror(cwd, node, policy) {
  const mirrorPath = instructionNodePath(node, policy.mirrorFileName);
  const absoluteMirrorPath = path.join(cwd, mirrorPath);

  if (!existsSync(absoluteMirrorPath)) {
    return [`Missing mirror ${mirrorPath}`];
  }

  const mirrorStat = lstatSync(absoluteMirrorPath);

  if (!mirrorStat.isSymbolicLink()) {
    return [`${mirrorPath} should be a symlink to ${policy.mirrorTarget}`];
  }

  const target = readlinkSync(absoluteMirrorPath);

  return target === policy.mirrorTarget
    ? []
    : [`${mirrorPath} should point to ${policy.mirrorTarget}, found ${target}`];
}

function validateMirrorException(cwd, exception, policy) {
  const mirrorPath = instructionNodePath(exception.node, policy.mirrorFileName);
  const absoluteMirrorPath = path.join(cwd, mirrorPath);
  const agentPath = instructionNodePath(exception.node, "AGENTS.md");
  const failures = [];

  if (typeof exception.reason !== "string" || exception.reason.length === 0) {
    failures.push(`Mirror exception ${mirrorPath} should include a reason`);
  }

  if (!existsSync(absoluteMirrorPath)) {
    failures.push(
      `Mirror exception ${mirrorPath} should exist as a regular file`
    );
    return failures;
  }

  if (lstatSync(absoluteMirrorPath).isSymbolicLink()) {
    failures.push(`Mirror exception ${mirrorPath} should not be a symlink`);
    return failures;
  }

  if (!existsSync(path.join(cwd, agentPath))) {
    failures.push(
      `${agentPath} should exist to document mirror exception ${mirrorPath}`
    );
    return failures;
  }

  const instructionText = readFileSync(path.join(cwd, agentPath), "utf8");
  const documentationSnippets = [
    policy.mirrorFileName,
    exception.reason,
  ].filter(Boolean);
  const missingDocumentation = documentationSnippets.filter(
    (snippet) => !instructionText.includes(snippet)
  );

  if (missingDocumentation.length > 0) {
    failures.push(
      `${agentPath} should document mirror exception ${mirrorPath} with ${missingDocumentation
        .map((snippet) => JSON.stringify(snippet))
        .join(", ")}`
    );
  }

  return failures;
}

export function validateInstructionTopology(
  cwd,
  policy = instructionTopologyPolicy
) {
  const discovered = discoverInstructionTopology(cwd, policy);
  const expected = expectedInstructionTopology(policy);
  const exceptionNodes = new Set(
    policy.mirrorExceptions.map(({ node }) => node)
  );
  const failures = [
    ...compareExpectedFiles({
      expected: expected.canonicalFiles,
      actual: discovered.canonicalFiles,
      label: "canonical instruction file",
    }),
    ...compareExpectedFiles({
      expected: expected.mirrorFiles,
      actual: discovered.mirrorFiles.filter((mirrorPath) => {
        const node = path.posix.dirname(mirrorPath);
        return !exceptionNodes.has(node === "." ? "." : node);
      }),
      label: "mirror instruction file",
    }),
  ];

  for (const node of policy.canonicalNodes) {
    failures.push(...validateCanonicalNode(cwd, node));

    if (!exceptionNodes.has(node)) {
      failures.push(...validateMirror(cwd, node, policy));
    }
  }

  for (const exception of policy.mirrorExceptions) {
    failures.push(...validateMirrorException(cwd, exception, policy));
  }

  return {
    ok: failures.length === 0,
    failures,
    discovered,
    expected,
    policy,
  };
}

export function formatInstructionTopologyReport(result) {
  const lines = [
    `Instruction topology ${result.ok ? "PASS" : "FAIL"}`,
    `Canonical nodes: ${result.policy.canonicalNodes.length}`,
    `Expected mirrors: ${result.expected.mirrorFiles.length}`,
    `Mirror exceptions: ${result.policy.mirrorExceptions.length}`,
    "",
    "Canonical nodes",
  ];

  for (const node of result.policy.canonicalNodes) {
    lines.push(`- ${instructionNodePath(node, "AGENTS.md")}`);
  }

  lines.push("", "Mirrors");

  for (const mirrorPath of result.expected.mirrorFiles) {
    lines.push(`- ${mirrorPath} -> ${result.policy.mirrorTarget}`);
  }

  if (result.policy.mirrorExceptions.length > 0) {
    lines.push("", "Mirror exceptions");

    for (const exception of result.policy.mirrorExceptions) {
      lines.push(`- ${exception.node}: ${exception.reason}`);
    }
  }

  if (!result.ok) {
    lines.push("", "Failures");

    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join("\n");
}
