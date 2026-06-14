import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  formatInstructionTopologyReport,
  validateInstructionTopology,
} from "./instruction-topology.mjs";

const defaultScenarioDirectory = "evals/skills/scenarios";
const defaultForwardPackDirectory = "evals/skills/forward/packs";

const requiredWorkflowSkills = [
  "to-prd",
  "to-issues",
  "triage",
  "orchestrator",
  "worker",
  "subagent-execution",
  "production-ready",
  "ci-watch",
  "systematic-debugging",
  "reconcile-project",
  "linear-setup",
  "backend-review",
  "frontend-review",
  "auth-context-review",
];

const upstreamLockedSkills = [
  "grill-with-docs",
  "improve-codebase-architecture",
  "tdd",
  "zoom-out",
  "improve",
];

const requiredAgentDocs = [
  "docs/agents/README.md",
  "docs/agents/linear-workflow.md",
  "docs/agents/triage-states.md",
  "docs/agents/domain.md",
  "docs/agents/execution-policy.md",
];

const activeTextExtensions = new Set([
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const staleReviewSkillReferences = [
  "ceird-backend-review",
  "ceird-frontend-review",
  "ceird-auth-context-review",
];

const relativePath = (cwd, absolutePath) =>
  path.relative(cwd, absolutePath).split(path.sep).join("/");

const checkResult = ({ id, title, failures = [], details = "" }) => ({
  id,
  title,
  ok: failures.length === 0,
  failures,
  details,
});

const readText = (cwd, relativeFilePath) =>
  readFile(path.join(cwd, relativeFilePath), "utf8");

const readJson = async (cwd, relativeFilePath) =>
  JSON.parse(await readText(cwd, relativeFilePath));

const pathExists = (cwd, relativeFilePath) =>
  existsSync(path.join(cwd, relativeFilePath));

async function listTextFiles(cwd, relativeRoot) {
  const root = path.join(cwd, relativeRoot);

  if (!existsSync(root)) {
    return [];
  }

  const entryStat = await stat(root);

  if (entryStat.isFile()) {
    return activeTextExtensions.has(path.extname(root)) ? [relativeRoot] : [];
  }

  const files = [];

  for (const entry of await readdir(root)) {
    const relativeEntry = path.posix.join(relativeRoot, entry);
    const absoluteEntry = path.join(cwd, relativeEntry);
    const entryStats = await stat(absoluteEntry);

    if (entryStats.isDirectory()) {
      files.push(...(await listTextFiles(cwd, relativeEntry)));
      continue;
    }

    if (activeTextExtensions.has(path.extname(entry))) {
      files.push(relativeEntry);
    }
  }

  return files;
}

function assertContains(text, snippets, artifactPath) {
  return snippets.flatMap((snippet) =>
    text.includes(snippet)
      ? []
      : [`${artifactPath} should contain ${JSON.stringify(snippet)}`]
  );
}

function assertNotContains(text, snippets, artifactPath) {
  return snippets.flatMap((snippet) =>
    text.includes(snippet)
      ? [`${artifactPath} should not contain ${JSON.stringify(snippet)}`]
      : []
  );
}

function checkRequiredWorkflowSkills(cwd) {
  const failures = requiredWorkflowSkills.flatMap((skill) => {
    const skillPath = `.agents/skills/${skill}/SKILL.md`;

    if (!pathExists(cwd, skillPath)) {
      return [`Missing ${skillPath}`];
    }

    return [];
  });

  return checkResult({
    id: "required-workflow-skills",
    title: "Linear workflow skills exist locally",
    failures,
    details: `${requiredWorkflowSkills.length} expected skills`,
  });
}

function checkRequiredAgentDocs(cwd) {
  const failures = requiredAgentDocs.flatMap((docPath) =>
    pathExists(cwd, docPath) ? [] : [`Missing ${docPath}`]
  );

  return checkResult({
    id: "required-agent-docs",
    title: "Agent workflow docs exist",
    failures,
    details: `${requiredAgentDocs.length} expected docs`,
  });
}

async function checkSkillLockOwnership(cwd) {
  const lock = await readJson(cwd, "skills-lock.json");
  const lockedSkills = lock.skills ?? {};
  const failures = [
    ...requiredWorkflowSkills.flatMap((skill) =>
      lockedSkills[skill]
        ? [`${skill} should be local/adapted, not locked to an upstream source`]
        : []
    ),
    ...upstreamLockedSkills.flatMap((skill) =>
      lockedSkills[skill]
        ? []
        : [`${skill} should remain locked to its upstream installed source`]
    ),
  ];

  return checkResult({
    id: "skill-lock-ownership",
    title: "Skill lockfile separates adapted and upstream skills",
    failures,
    details: `${requiredWorkflowSkills.length} local, ${upstreamLockedSkills.length} upstream`,
  });
}

function checkNoDuplicateReviewSkills(cwd) {
  const failures = staleReviewSkillReferences.flatMap((skill) =>
    pathExists(cwd, `.agents/skills/${skill}/SKILL.md`)
      ? [`Remove duplicate skill .agents/skills/${skill}/SKILL.md`]
      : []
  );

  return checkResult({
    id: "no-prefixed-review-skills",
    title: "No duplicate ceird-prefixed review skills remain",
    failures,
  });
}

function checkInstructionTopology(cwd) {
  const result = validateInstructionTopology(cwd);

  return checkResult({
    id: "instruction-topology",
    title: "Instruction topology policy is executable",
    failures: result.failures,
    details: result.ok
      ? `${result.policy.canonicalNodes.length} canonical nodes, ${result.expected.mirrorFiles.length} mirrors`
      : formatInstructionTopologyReport(result),
  });
}

async function checkNoStaleReviewReferences(cwd) {
  const scanRoots = [
    "AGENTS.md",
    "docs/README.md",
    "docs/agents",
    ".agents/skills",
    ".codex/hooks",
  ];
  const filesByRoot = await Promise.all(
    scanRoots.map((scanRoot) => listTextFiles(cwd, scanRoot))
  );
  const files = filesByRoot.flat();
  const failures = [];

  for (const filePath of files) {
    const text = await readText(cwd, filePath);

    for (const staleReference of staleReviewSkillReferences) {
      if (text.includes(staleReference)) {
        failures.push(`${filePath} still references ${staleReference}`);
      }
    }
  }

  return checkResult({
    id: "no-stale-review-references",
    title: "Active workflow files reference non-prefixed review skills",
    failures,
    details: `${files.length} files scanned`,
  });
}

async function checkStopHookReviewRouting(cwd) {
  const hookPath = ".codex/hooks/stop_review_prompt.mjs";
  const hookText = await readText(cwd, hookPath);
  const productionReadyText = await readText(
    cwd,
    ".agents/skills/production-ready/SKILL.md"
  );
  const failures = [
    ...assertContains(
      hookText,
      ["backend-review", "frontend-review"],
      hookPath
    ),
    ...assertNotContains(hookText, staleReviewSkillReferences, hookPath),
    ...assertContains(
      productionReadyText,
      [hookPath, "backend-review", "frontend-review", "auth-context-review"],
      ".agents/skills/production-ready/SKILL.md"
    ),
  ];

  return checkResult({
    id: "stop-hook-review-routing",
    title: "Production-ready and stop hook agree on review routing",
    failures,
  });
}

async function checkEvalScenariosExist(cwd) {
  const scenarioPaths = await discoverScenarioPaths(cwd);

  return checkResult({
    id: "skill-eval-scenarios",
    title: "Skill eval scenarios exist",
    failures:
      scenarioPaths.length >= 6
        ? []
        : [`Expected at least 6 scenarios, found ${scenarioPaths.length}`],
    details: `${scenarioPaths.length} scenarios`,
  });
}

const staticChecks = [
  checkRequiredWorkflowSkills,
  checkRequiredAgentDocs,
  checkSkillLockOwnership,
  checkNoDuplicateReviewSkills,
  checkInstructionTopology,
  checkNoStaleReviewReferences,
  checkStopHookReviewRouting,
  checkEvalScenariosExist,
];

export async function discoverScenarioPaths(
  cwd,
  scenarioDirectory = defaultScenarioDirectory
) {
  const absoluteDirectory = path.join(cwd, scenarioDirectory);

  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  const entries = await readdir(absoluteDirectory);

  return entries
    .filter((entry) => entry.endsWith(".json"))
    .toSorted()
    .map((entry) => path.join(scenarioDirectory, entry));
}

export async function discoverForwardPackPaths(
  cwd,
  forwardPackDirectory = defaultForwardPackDirectory
) {
  const absoluteDirectory = path.join(cwd, forwardPackDirectory);

  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  const entries = await readdir(absoluteDirectory);

  return entries
    .filter((entry) => entry.endsWith(".json"))
    .toSorted()
    .map((entry) => path.join(forwardPackDirectory, entry));
}

async function loadScenario(cwd, scenarioPath) {
  const scenario = await readJson(cwd, scenarioPath);
  const failures = [];

  for (const field of ["id", "title", "prompt"]) {
    if (typeof scenario[field] !== "string" || scenario[field].length === 0) {
      failures.push(`${scenarioPath} is missing string field ${field}`);
    }
  }

  if (!Array.isArray(scenario.expectedSkills)) {
    failures.push(`${scenarioPath} is missing expectedSkills array`);
  }

  if (!Array.isArray(scenario.artifacts)) {
    failures.push(`${scenarioPath} is missing artifacts array`);
  }

  return { scenario, schemaFailures: failures };
}

async function evaluateScenario(cwd, scenarioPath) {
  const { scenario, schemaFailures } = await loadScenario(cwd, scenarioPath);
  const failures = [...schemaFailures];

  if (schemaFailures.length === 0) {
    for (const skill of scenario.expectedSkills) {
      const skillPath = `.agents/skills/${skill}/SKILL.md`;

      if (!pathExists(cwd, skillPath)) {
        failures.push(`${scenarioPath} expects missing skill ${skillPath}`);
      }
    }

    for (const artifact of scenario.artifacts) {
      if (typeof artifact.path !== "string") {
        failures.push(`${scenarioPath} has an artifact without a path`);
        continue;
      }

      if (!pathExists(cwd, artifact.path)) {
        failures.push(`${scenarioPath} expects missing ${artifact.path}`);
        continue;
      }

      const text = await readText(cwd, artifact.path);
      failures.push(
        ...assertContains(text, artifact.mustContain ?? [], artifact.path),
        ...assertNotContains(text, artifact.mustNotContain ?? [], artifact.path)
      );
    }
  }

  return checkResult({
    id: scenario.id ?? relativePath(cwd, path.join(cwd, scenarioPath)),
    title: scenario.title ?? scenarioPath,
    failures,
    details:
      schemaFailures.length === 0
        ? `${scenario.expectedSkills.length} expected skills`
        : "schema failure",
  });
}

async function loadForwardPack(cwd, packPath) {
  const pack = await readJson(cwd, packPath);
  const failures = [];

  for (const field of ["id", "title", "prompt", "rubricPath"]) {
    if (typeof pack[field] !== "string" || pack[field].length === 0) {
      failures.push(`${packPath} is missing string field ${field}`);
    }
  }

  for (const field of [
    "skills",
    "fixturePaths",
    "rubricCriteria",
    "expectedOutputSections",
  ]) {
    if (!Array.isArray(pack[field]) || pack[field].length === 0) {
      failures.push(`${packPath} is missing non-empty ${field} array`);
    }
  }

  return { pack, schemaFailures: failures };
}

async function loadRubric(cwd, rubricPath) {
  const rubric = await readJson(cwd, rubricPath);
  const failures = [];

  for (const field of ["id", "title"]) {
    if (typeof rubric[field] !== "string" || rubric[field].length === 0) {
      failures.push(`${rubricPath} is missing string field ${field}`);
    }
  }

  if (!Array.isArray(rubric.criteria) || rubric.criteria.length === 0) {
    failures.push(`${rubricPath} is missing non-empty criteria array`);
  }

  for (const criterion of rubric.criteria ?? []) {
    if (typeof criterion.id !== "string" || criterion.id.length === 0) {
      failures.push(`${rubricPath} has a criterion without an id`);
    }

    if (
      typeof criterion.question !== "string" ||
      criterion.question.length === 0
    ) {
      failures.push(
        `${rubricPath} has criterion ${criterion.id} without a question`
      );
    }
  }

  return { rubric, rubricFailures: failures };
}

export function buildForwardTestPrompt(pack, rubric) {
  const skillList = pack.skills.map((skill) => `$${skill}`).join(", ");
  const fixtures = pack.fixturePaths
    .map((fixturePath) => `- ${fixturePath}`)
    .join("\n");
  const rubricCriteria = pack.rubricCriteria
    .map((criterionId) => {
      const criterion = rubric.criteria.find(({ id }) => id === criterionId);
      return criterion
        ? `- ${criterion.id}: ${criterion.question}`
        : `- ${criterionId}`;
    })
    .join("\n");
  const outputSections = pack.expectedOutputSections
    .map((section) => `- ${section}`)
    .join("\n");

  return `Use ${skillList} to complete this isolated forward-test scenario.

Do not modify live Linear, GitHub, provider resources, production data, or the local repository. Treat every referenced Linear/GitHub object as a mock fixture.

Scenario:
${pack.prompt}

Read these fixture files from the repository:
${fixtures}

Rubric criteria:
${rubricCriteria}

Return exactly these sections:
${outputSections}`;
}

async function evaluateForwardPack(cwd, packPath, { includeForwardPrompts }) {
  const { pack, schemaFailures } = await loadForwardPack(cwd, packPath);
  const failures = [...schemaFailures];
  let forwardPrompt;

  if (schemaFailures.length === 0) {
    for (const skill of pack.skills) {
      const skillPath = `.agents/skills/${skill}/SKILL.md`;

      if (!pathExists(cwd, skillPath)) {
        failures.push(`${packPath} expects missing skill ${skillPath}`);
      }
    }

    for (const fixturePath of pack.fixturePaths) {
      if (!pathExists(cwd, fixturePath)) {
        failures.push(`${packPath} expects missing fixture ${fixturePath}`);
      }
    }

    if (pathExists(cwd, pack.rubricPath)) {
      const { rubric, rubricFailures } = await loadRubric(cwd, pack.rubricPath);
      failures.push(...rubricFailures);

      if (rubricFailures.length === 0) {
        const rubricCriterionIds = new Set(rubric.criteria.map(({ id }) => id));

        for (const criterionId of pack.rubricCriteria) {
          if (!rubricCriterionIds.has(criterionId)) {
            failures.push(
              `${packPath} references missing rubric criterion ${criterionId}`
            );
          }
        }

        if (includeForwardPrompts && failures.length === 0) {
          forwardPrompt = buildForwardTestPrompt(pack, rubric);
        }
      }
    } else {
      failures.push(`${packPath} expects missing rubric ${pack.rubricPath}`);
    }
  }

  return {
    ...checkResult({
      id: pack.id ?? relativePath(cwd, path.join(cwd, packPath)),
      title: pack.title ?? packPath,
      failures,
      details:
        schemaFailures.length === 0
          ? `${pack.skills.length} skills, ${pack.fixturePaths.length} fixtures`
          : "schema failure",
    }),
    forwardPrompt,
  };
}

async function collectCheckResults(items, evaluateItem) {
  const results = [];

  for (const item of items) {
    try {
      results.push(await evaluateItem(item));
    } catch (error) {
      results.push(
        checkResult({
          id: typeof item === "string" ? item : evaluateItem.name,
          title: typeof item === "string" ? item : evaluateItem.name,
          failures: [error instanceof Error ? error.message : String(error)],
        })
      );
    }
  }

  return results;
}

export async function runSkillEvals({
  cwd = process.cwd(),
  includeStaticChecks = true,
  includeForwardPrompts = false,
  scenarioPaths,
  scenarioDirectory = defaultScenarioDirectory,
  forwardPackPaths,
  forwardPackDirectory = defaultForwardPackDirectory,
} = {}) {
  const resolvedScenarioPaths =
    scenarioPaths ?? (await discoverScenarioPaths(cwd, scenarioDirectory));
  const resolvedForwardPackPaths =
    forwardPackPaths ??
    (await discoverForwardPackPaths(cwd, forwardPackDirectory));
  const staticCheckResults = includeStaticChecks
    ? await collectCheckResults(staticChecks, (staticCheck) => staticCheck(cwd))
    : [];
  const scenarioResults = await collectCheckResults(
    resolvedScenarioPaths,
    (scenarioPath) => evaluateScenario(cwd, scenarioPath)
  );
  const forwardPackResults = await collectCheckResults(
    resolvedForwardPackPaths,
    (forwardPackPath) =>
      evaluateForwardPack(cwd, forwardPackPath, { includeForwardPrompts })
  );

  return {
    ok:
      staticCheckResults.every((result) => result.ok) &&
      scenarioResults.every((result) => result.ok) &&
      forwardPackResults.every((result) => result.ok),
    staticCheckResults,
    scenarioResults,
    forwardPackResults,
  };
}

const countPassed = (results) => results.filter((result) => result.ok).length;

function formatResultLine(result) {
  const status = result.ok ? "PASS" : "FAIL";
  const details = result.details ? ` (${result.details})` : "";

  return `${status} ${result.id} - ${result.title}${details}`;
}

function formatSection(title, results) {
  const lines = [title];

  for (const result of results) {
    lines.push(formatResultLine(result));

    for (const failure of result.failures) {
      lines.push(`  - ${failure}`);
    }

    if (result.forwardPrompt) {
      lines.push("  Forward prompt:");

      for (const line of result.forwardPrompt.split("\n")) {
        lines.push(line.length === 0 ? "    " : `    ${line}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatTextReport(result) {
  return [
    `Skill evals ${result.ok ? "PASS" : "FAIL"}`,
    `Static checks: ${countPassed(result.staticCheckResults)}/${result.staticCheckResults.length}`,
    `Scenarios: ${countPassed(result.scenarioResults)}/${result.scenarioResults.length}`,
    `Forward packs: ${countPassed(result.forwardPackResults)}/${result.forwardPackResults.length}`,
    "",
    formatSection("Static checks", result.staticCheckResults),
    "",
    formatSection("Scenarios", result.scenarioResults),
    "",
    formatSection("Forward packs", result.forwardPackResults),
  ].join("\n");
}

export function parseCliArgs(args) {
  const parsed = {
    json: false,
    help: false,
    forwardPrompts: false,
    scenarioPaths: [],
  };

  for (const arg of args) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    if (arg === "--forward-prompts") {
      parsed.forwardPrompts = true;
      continue;
    }

    parsed.scenarioPaths.push(arg);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/run-skill-evals.mjs [--json] [--forward-prompts] [scenario.json ...]

Runs deterministic contract evals for the local agent skill suite.

Options:
  --json              Print the full result as JSON
  --forward-prompts   Include copyable prompts for isolated forward tests
  --help              Show this help text`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const result = await runSkillEvals({
    cwd: process.cwd(),
    includeForwardPrompts: args.forwardPrompts,
    scenarioPaths:
      args.scenarioPaths.length === 0 ? undefined : args.scenarioPaths,
  });

  console.log(
    args.json ? JSON.stringify(result, null, 2) : formatTextReport(result)
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
