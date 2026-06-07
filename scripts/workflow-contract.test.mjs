import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const readJson = (relativePath) =>
  JSON.parse(readFileSync(path.join(repoRoot, relativePath), "utf8"));

function getWorkflowJob(workflow, jobName) {
  const escapedJobName = jobName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = workflow.match(
    new RegExp(
      `(?:^|\\n)  ${escapedJobName}:\\n[\\s\\S]*?(?=\\n  [A-Za-z0-9_-]+:\\n|\\n*$)`
    )
  );

  assert.notEqual(match, null, `workflow should define ${jobName}`);
  return match[0];
}

function getWorkflowStep(job, stepName) {
  const escapedStepName = stepName.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = job.match(
    new RegExp(
      `(?:^|\\n)      - name: ${escapedStepName}\\n[\\s\\S]*?(?=\\n      - name: |\\n  [A-Za-z0-9_-]+:\\n|\\n*$)`
    )
  );

  assert.notEqual(match, null, `workflow job should define step ${stepName}`);
  return match[0];
}

function assertContainsInOrder(text, orderedSnippets) {
  let previousIndex = -1;

  for (const snippet of orderedSnippets) {
    const index = text.indexOf(snippet, previousIndex + 1);

    assert.notEqual(index, -1, `workflow should include ${snippet}`);
    assert.ok(
      index > previousIndex,
      `${snippet} should appear after the previous ordered snippet`
    );
    previousIndex = index;
  }
}

function assertElectricStorageCredentialsEnv(text) {
  assert.match(
    text,
    /CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID: \$\{\{ secrets\.CEIRD_ELECTRIC_STORAGE_ACCESS_KEY_ID \}\}/
  );
  assert.match(
    text,
    /CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY: \$\{\{ secrets\.CEIRD_ELECTRIC_STORAGE_SECRET_ACCESS_KEY \}\}/
  );
}

const activeTextFileExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".yml",
  ".yaml",
]);

function shouldSkipRepositoryEntry(entry, relativePath) {
  return (
    entry === ".git" ||
    entry === ".agents" ||
    entry === ".alchemy" ||
    entry === ".auto-research" ||
    entry === ".pnpm-store" ||
    entry === ".worktrees" ||
    entry === "build" ||
    entry === "coverage" ||
    entry === "dist" ||
    entry === "node-compile-cache" ||
    entry === "node_modules" ||
    entry === "opensrc" ||
    entry === "out" ||
    relativePath.startsWith("docs/superpowers")
  );
}

function listMarkdownFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const relativePath = path.relative(repoRoot, absolutePath);

    if (shouldSkipRepositoryEntry(entry, relativePath)) {
      continue;
    }

    if (statSync(absolutePath).isDirectory()) {
      listMarkdownFiles(absolutePath, files);
      continue;
    }

    if (absolutePath.endsWith(".md")) {
      files.push(relativePath);
    }
  }

  return files;
}

function listActiveTextFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const relativePath = path.relative(repoRoot, absolutePath);

    if (shouldSkipRepositoryEntry(entry, relativePath)) {
      continue;
    }

    if (statSync(absolutePath).isDirectory()) {
      listActiveTextFiles(absolutePath, files);
      continue;
    }

    if (activeTextFileExtensions.has(path.extname(entry))) {
      files.push(relativePath);
    }
  }

  return files;
}

test("root workflow scripts call the Alchemy CLI directly", () => {
  const rootPackage = readJson("package.json");

  assert.equal(rootPackage.scripts.alchemy, "alchemy");
  assert.equal(rootPackage.scripts.dev, "node scripts/alchemy-dev.mjs");
  assert.equal(
    existsSync(path.join(repoRoot, "scripts/alchemy-dev.mjs")),
    true
  );
  assert.equal(rootPackage.scripts["infra:check-types"], undefined);
  assert.equal(rootPackage.scripts["infra:bootstrap:cloudflare"], undefined);
  assert.equal(rootPackage.scripts["infra:deploy"], undefined);
  assert.equal(rootPackage.scripts["infra:destroy"], undefined);
  assert.equal(rootPackage.scripts["infra:dev"], undefined);
  assert.equal(rootPackage.devDependencies.portless, undefined);
});

test("Alchemy dev wrapper keeps local development to one command", async () => {
  const {
    makeAlchemyExecOptions,
    makeAlchemyNodeExecArgv,
    makeAlchemyDevEnvironment,
    makeFallbackStage,
    normalizeAlchemyDevArgs,
    readExplicitAlchemyStageArg,
  } = await import(path.join(repoRoot, "scripts/alchemy-dev.mjs"));

  assert.deepEqual(normalizeAlchemyDevArgs(["--", "--stage", "codex-ui"]), [
    "--stage",
    "codex-ui",
  ]);
  assert.deepEqual(
    makeAlchemyNodeExecArgv({ nodeVersion: "v26.0.0" }).filter(
      (arg) => arg === "--experimental-transform-types"
    ),
    []
  );
  assert.ok(
    makeAlchemyNodeExecArgv({ nodeVersion: "v26.0.0" }).includes(
      "--disable-warning=DEP0205"
    )
  );
  assert.ok(
    makeAlchemyNodeExecArgv({ nodeVersion: "v24.16.0" }).includes(
      "--experimental-transform-types"
    )
  );
  assert.deepEqual(
    makeAlchemyExecOptions({
      args: ["--", "--stage", "codex-ui-polish"],
      defaultProfile: "ceird-env",
      envFile: ".env.local",
      fallbackStage: "codex-ui-polish",
    }),
    {
      dev: true,
      envFile: ".env.local",
      main: "alchemy.run.ts",
      profile: "ceird-env",
      stage: "codex-ui-polish",
      yes: false,
    }
  );
  assert.equal(
    makeAlchemyExecOptions({
      args: ["--", "--stage", "codex-ui-polish", "--yes"],
      defaultProfile: "ceird-env",
      envFile: ".env.local",
      fallbackStage: "codex-ui-polish",
    }).yes,
    true
  );
  assert.equal(
    makeAlchemyExecOptions({
      args: ["--", "--env-file", ".env.preview"],
      defaultProfile: "ceird-env",
      envFile: ".env.local",
      fallbackStage: "codex-ui-polish",
    }).envFile,
    ".env.preview"
  );
  assert.equal(
    readExplicitAlchemyStageArg(["--", "--stage=codex-ui"]),
    "codex-ui"
  );
  assert.equal(
    makeFallbackStage({ branch: "codex/ui-polish", user: "cillian" }),
    "codex-ui-polish"
  );
  assert.throws(
    () => makeFallbackStage({ branch: "", user: "cillian" }),
    /detached worktree/
  );
  assert.deepEqual(
    makeAlchemyDevEnvironment({
      baseEnv: {},
      defaultProfile: "ceird-env",
      envFileValues: {
        CLOUDFLARE_ACCOUNT_ID: "account-id",
        CLOUDFLARE_API_TOKEN: "token",
        NEON_API_KEY: "neon-key",
      },
      nodeVersion: "v24.16.0",
    }),
    {
      ALCHEMY_NO_TUI: "1",
      ALCHEMY_PROFILE: "ceird-env",
      CEIRD_CLOUDFLARE: "1",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      CLOUDFLARE_API_TOKEN: "token",
      NEON_API_KEY: "neon-key",
    }
  );
  assert.equal(
    makeAlchemyDevEnvironment({
      baseEnv: { NODE_OPTIONS: "--conditions development" },
      defaultProfile: "ceird-env",
      envFileValues: {},
      nodeVersion: "v26.0.0",
    }).NODE_OPTIONS,
    "--conditions development --disable-warning=DEP0205"
  );
});

test("root Alchemy stack uses a single source-defined stack name", () => {
  const rootPackage = readJson("package.json");
  const stack = readFileSync(path.join(repoRoot, "alchemy.run.ts"), "utf8");

  assert.equal(rootPackage.type, "module");
  assert.match(stack, /const stackName = "ceird";/);
  assert.match(stack, /Alchemy\.Stack\(\s*stackName/);
  assert.doesNotMatch(stack, /CEIRD_ALCHEMY_STACK_NAME/);
  assert.doesNotMatch(stack, /process\.env\.CEIRD_ALCHEMY_STACK_NAME/);
});

test("root Alchemy stack exposes operator outputs for owned runtime resources", () => {
  const stack = readFileSync(path.join(repoRoot, "alchemy.run.ts"), "utf8");
  const localInfraGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/local-development-and-infra.md"),
    "utf8"
  );

  for (const outputName of [
    "api",
    "agent",
    "app",
    "authEmailDeadLetterQueue",
    "authEmailQueue",
    "branch",
    "hyperdrive",
    "mcp",
    "neonDatabase",
    "sync",
  ]) {
    assert.match(
      stack,
      new RegExp(`${outputName}:`),
      `alchemy.run.ts should expose ${outputName} as a stack output`
    );
  }

  assert.match(localInfraGuide, /authEmailQueue/);
  assert.match(localInfraGuide, /authEmailDeadLetterQueue/);
});

test("package-local dev scripts do not depend on Portless", () => {
  const appPackage = readJson("apps/app/package.json");
  const apiPackage = readJson("apps/api/package.json");

  assert.equal(
    appPackage.scripts.dev,
    "vite dev --host 127.0.0.1 --port 4173 --strictPort"
  );
  assert.equal(apiPackage.scripts.dev, "tsx watch src/index.ts");
  assert.equal(
    existsSync(path.join(repoRoot, "scripts/vite-portless-dev.mjs")),
    false
  );
  assert.equal(
    existsSync(path.join(repoRoot, "packages/infra/scripts/alchemy-env.mjs")),
    false
  );
});

test("Alchemy implementation helpers are root-owned, not a workspace package", () => {
  const rootPackage = readJson("package.json");
  const stack = readFileSync(path.join(repoRoot, "alchemy.run.ts"), "utf8");
  const workspace = readFileSync(
    path.join(repoRoot, "pnpm-workspace.yaml"),
    "utf8"
  );
  const deployWorkflow = readFileSync(
    path.join(repoRoot, ".github/workflows/deploy-main.yml"),
    "utf8"
  );
  const buildWorkflow = readFileSync(
    path.join(repoRoot, ".github/workflows/build.yml"),
    "utf8"
  );

  assert.equal(existsSync(path.join(repoRoot, "infra")), true);
  assert.equal(existsSync(path.join(repoRoot, "packages/infra")), false);
  assert.equal(existsSync(path.join(repoRoot, "tsconfig.infra.json")), true);
  assert.equal(
    rootPackage.scripts["check-types:infra"],
    "tsc --noEmit -p tsconfig.infra.json"
  );
  assert.equal(
    rootPackage.scripts["test:infra"],
    "vitest run --dir infra --exclude 'opensrc/**'"
  );
  assert.match(
    rootPackage.scripts["check-types"],
    /pnpm run check-types:infra/
  );
  assert.match(rootPackage.scripts.test, /pnpm run test:infra/);
  assert.doesNotMatch(stack, /\.\/packages\/infra\//);
  assert.match(stack, /from "\.\/infra\/cloudflare-stack\.ts"/);
  assert.match(workspace, /"packages\/\*"/);
  assert.doesNotMatch(workspace, /packages\/infra/);
  assert.match(buildWorkflow, /run: pnpm check-types\b/);
  assert.match(buildWorkflow, /command: pnpm run test:infra\b/);
  assert.doesNotMatch(deployWorkflow, /--filter @ceird\/infra/);
});

test("package overview describes infrastructure without Docker-era process boundaries", () => {
  const packagesReadme = readFileSync(
    path.join(repoRoot, "packages/README.md"),
    "utf8"
  );

  assert.match(packagesReadme, /Root\s+infrastructure lives in `\.\.\/infra`/);
  assert.doesNotMatch(packagesReadme, /`infra`\s+\|/);
  assert.match(packagesReadme, /pnpm run check-types:infra/);
  assert.doesNotMatch(packagesReadme, /Docker process\s+execution/);
});

test("root ignore rules do not preserve removed Turborepo artifacts", () => {
  const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8");

  assert.doesNotMatch(gitignore, /^# Turbo$/m);
  assert.doesNotMatch(gitignore, /^\.turbo$/m);
});

test("root ignore rules exclude Alchemy local output", () => {
  const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8");

  assert.match(gitignore, /^\.alchemy\/$/m);
  assert.doesNotMatch(gitignore, /packages\/infra\/\.alchemy/);
});

test("runtime configuration no longer reads Portless-specific environment", () => {
  const authConfig = readFileSync(
    path.join(
      repoRoot,
      "apps/domain/src/domains/identity/authentication/config.ts"
    ),
    "utf8"
  );

  assert.doesNotMatch(authConfig, /PORTLESS_URL/);
  assert.doesNotMatch(authConfig, /portlessUrl/);
  assert.doesNotMatch(authConfig, /portless/i);
});

test("main deploy workflow uses current Alchemy command order explicitly", () => {
  const deployWorkflow = readFileSync(
    path.join(repoRoot, ".github/workflows/deploy-main.yml"),
    "utf8"
  );

  assert.match(deployWorkflow, /CEIRD_CLOUDFLARE:\s+"1"/);
  assert.match(deployWorkflow, /CEIRD_APP_HOSTNAME:\s+app\.ceird\.app/);
  assert.match(deployWorkflow, /CEIRD_API_HOSTNAME:\s+api\.ceird\.app/);
  assert.match(deployWorkflow, /CEIRD_AGENT_HOSTNAME:\s+agent\.ceird\.app/);
  assert.match(deployWorkflow, /CEIRD_MCP_HOSTNAME:\s+mcp\.ceird\.app/);
  assert.match(deployWorkflow, /CEIRD_SYNC_HOSTNAME:\s+sync\.ceird\.app/);
  assert.doesNotMatch(deployWorkflow, /ALCHEMY_STAGE:/);
  assert.doesNotMatch(deployWorkflow, /CEIRD_ALCHEMY_STAGE:/);
  assert.doesNotMatch(deployWorkflow, /AUTH_EMAIL_TRANSPORT:/);
  assert.match(deployWorkflow, /name: Build\n\s+run: pnpm build/);
  assert.match(deployWorkflow, /Restore Alchemy state store credentials/);
  assert.match(deployWorkflow, /ALCHEMY_CLOUDFLARE_STATE_STORE_CREDENTIALS/);
  assert.match(
    deployWorkflow,
    /node scripts\/restore-alchemy-state-store-credentials\.mjs/
  );
  assert.doesNotMatch(deployWorkflow, /pnpm alchemy cloudflare bootstrap/);
  assert.match(deployWorkflow, /run: pnpm alchemy deploy --stage main --yes\b/);
  assert.match(
    deployWorkflow,
    /pnpm alchemy:state-audit --stage main --json --tenant-routing-required --allow-finding legacy_drizzle_migrations_state/
  );
  assertContainsInOrder(deployWorkflow, [
    "name: Build",
    "name: Restore Alchemy state store credentials",
    "name: Deploy",
    "name: Audit main Alchemy state",
  ]);
  assert.doesNotMatch(deployWorkflow, /pnpm --filter api check-types\b/);
  assert.doesNotMatch(deployWorkflow, /pnpm --filter domain check-types\b/);
  assert.doesNotMatch(deployWorkflow, /pnpm --filter mcp check-types\b/);
  assert.doesNotMatch(deployWorkflow, /pnpm --filter .* test\b/);
});

test("Codex environment actions use the Alchemy-native workflow", () => {
  const codexEnvironment = readFileSync(
    path.join(repoRoot, ".codex/environments/environment.toml"),
    "utf8"
  );
  const stopReviewPrompt = readFileSync(
    path.join(repoRoot, ".codex/hooks/stop_review_prompt.mjs"),
    "utf8"
  );

  assert.match(codexEnvironment, /name = "Ceird Alchemy"/);
  assert.match(
    codexEnvironment,
    /command = "pnpm dev -- --stage codex-alchemy-v2-native-migration"/
  );
  assert.match(
    codexEnvironment,
    /command = "CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file \.env\.local --stage codex-alchemy-v2-native-migration"/
  );
  assert.match(
    codexEnvironment,
    /command = "CEIRD_CLOUDFLARE=1 pnpm alchemy state tree --env-file \.env\.local --stage codex-alchemy-v2-native-migration"/
  );
  assert.match(
    codexEnvironment,
    /command = "CEIRD_CLOUDFLARE=1 pnpm alchemy logs --env-file \.env\.local --stage codex-alchemy-v2-native-migration"/
  );
  assert.match(codexEnvironment, /command = "pnpm test"/);
  assert.match(codexEnvironment, /command = "pnpm --filter api test"/);
  assert.doesNotMatch(codexEnvironment, /sandbox/i);
  assert.match(stopReviewPrompt, /file === "alchemy\.run\.ts"/);
  assert.match(stopReviewPrompt, /file === "tsconfig\.infra\.json"/);
  assert.match(stopReviewPrompt, /file\.startsWith\("infra\/"\)/);
  assert.doesNotMatch(stopReviewPrompt, /packages\/infra/);
  assert.doesNotMatch(stopReviewPrompt, /packages\/sandbox-(core|cli)\//);
});

test("Codex Alchemy inspection actions load local environment secrets", () => {
  const codexEnvironment = readFileSync(
    path.join(repoRoot, ".codex/environments/environment.toml"),
    "utf8"
  );

  assert.match(
    codexEnvironment,
    /command = "CEIRD_CLOUDFLARE=1 pnpm alchemy state tree --env-file \.env\.local --stage codex-alchemy-v2-native-migration"/
  );
  assert.match(
    codexEnvironment,
    /command = "CEIRD_CLOUDFLARE=1 pnpm alchemy logs --env-file \.env\.local --stage codex-alchemy-v2-native-migration"/
  );
});

test("Codex environment exposes the parent-stage Alchemy plan preflight", () => {
  const codexEnvironment = readFileSync(
    path.join(repoRoot, ".codex/environments/environment.toml"),
    "utf8"
  );

  assert.match(codexEnvironment, /name = "Plan parent Alchemy stage"/);
  assert.match(
    codexEnvironment,
    /command = "CEIRD_CLOUDFLARE=1 pnpm alchemy plan --env-file \.env\.local --stage main"/
  );
});

test("Codex environment exposes the parent-stage Alchemy state inspection", () => {
  const codexEnvironment = readFileSync(
    path.join(repoRoot, ".codex/environments/environment.toml"),
    "utf8"
  );

  assert.match(codexEnvironment, /name = "Inspect parent Alchemy state"/);
  assert.match(
    codexEnvironment,
    /command = "CEIRD_CLOUDFLARE=1 pnpm alchemy state tree --env-file \.env\.local --stage main"/
  );
});

test("developer docs select Alchemy stages with CLI flags", () => {
  for (const relativePath of listMarkdownFiles(repoRoot)) {
    const contents = readFileSync(path.join(repoRoot, relativePath), "utf8");

    assert.doesNotMatch(
      contents,
      /ALCHEMY_STAGE=/,
      `${relativePath} should use alchemy --stage instead of ALCHEMY_STAGE=`
    );
  }

  assert.match(
    readFileSync(path.join(repoRoot, "README.md"), "utf8"),
    /pnpm dev -- --stage codex-my-task/
  );
  assert.match(
    readFileSync(path.join(repoRoot, "docs/development.md"), "utf8"),
    /pnpm dev -- --stage codex-my-task/
  );
});

test("local Alchemy docs keep Cloudflare provider auth profile-based", () => {
  const localOperatorDocs = [
    "README.md",
    "docs/development.md",
    "docs/architecture/data-layer.md",
    "docs/architecture/local-development-and-infra.md",
  ];

  for (const relativePath of localOperatorDocs) {
    const contents = readFileSync(path.join(repoRoot, relativePath), "utf8");

    assert.doesNotMatch(
      contents,
      /bootstrap Cloudflare credentials/i,
      `${relativePath} should describe Alchemy profile auth for local runs`
    );
    assert.doesNotMatch(
      contents,
      /Export bootstrap `CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN)`/i,
      `${relativePath} should not ask local operators to export Cloudflare provider env vars`
    );
  }

  const localInfraGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/local-development-and-infra.md"),
    "utf8"
  );
  const developmentGuide = readFileSync(
    path.join(repoRoot, "docs/development.md"),
    "utf8"
  );

  assert.match(localInfraGuide, /pnpm alchemy login/);
  assert.match(localInfraGuide, /Alchemy profile/i);
  assert.doesNotMatch(
    developmentGuide,
    /\| `CLOUDFLARE_(?:ACCOUNT_ID|API_TOKEN)`\s+\|\s+API,\s*infra\s+\|/,
    "docs/development.md should not present Cloudflare provider auth as local API env"
  );
});

test("local Alchemy command snippets include env file and Cloudflare build flag", () => {
  const localCommandDocs = [
    "AGENTS.md",
    "README.md",
    "docs/development.md",
    "docs/architecture/local-development-and-infra.md",
    "infra/README.md",
  ];

  for (const relativePath of localCommandDocs) {
    const contents = readFileSync(path.join(repoRoot, relativePath), "utf8");

    assert.doesNotMatch(
      contents,
      /^pnpm alchemy dev --stage /m,
      `${relativePath} should pass --env-file .env.local when bypassing pnpm dev`
    );
    assert.doesNotMatch(
      contents,
      /^pnpm alchemy deploy --stage /m,
      `${relativePath} should include CEIRD_CLOUDFLARE=1 and --env-file .env.local for local deploys`
    );
    assert.doesNotMatch(
      contents,
      /^pnpm alchemy destroy --stage /m,
      `${relativePath} should include --env-file .env.local for local destroys`
    );
    assert.doesNotMatch(
      contents,
      /pnpm alchemy destroy --stage\b/,
      `${relativePath} should not document destroy without --env-file .env.local`
    );
    assert.doesNotMatch(
      contents,
      /^pnpm alchemy destroy --env-file \.env\.local --stage /m,
      `${relativePath} should include CEIRD_CLOUDFLARE=1 for local destroys`
    );
  }
});

test("local Alchemy docs explain the parent Neon stage precondition", () => {
  const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const developmentGuide = readFileSync(
    path.join(repoRoot, "docs/development.md"),
    "utf8"
  );
  const localInfraGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/local-development-and-infra.md"),
    "utf8"
  );
  const dataLayerGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/data-layer.md"),
    "utf8"
  );

  assert.match(readme, /parent `main` stage/);
  assert.match(developmentGuide, /parent `main` stage/);
  assert.match(localInfraGuide, /Non-parent stages require the parent stage/);
  assert.match(dataLayerGuide, /deploy --env-file \.env\.local --stage main/);
});

test("manual Drizzle commands are documented as package-local fallbacks", () => {
  const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const developmentGuide = readFileSync(
    path.join(repoRoot, "docs/development.md"),
    "utf8"
  );
  const domainReadme = readFileSync(
    path.join(repoRoot, "apps/domain/README.md"),
    "utf8"
  );
  const dataLayerGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/data-layer.md"),
    "utf8"
  );

  for (const [name, contents] of [
    ["README.md", readme],
    ["docs/development.md", developmentGuide],
    ["apps/domain/README.md", domainReadme],
  ]) {
    assert.doesNotMatch(
      contents,
      /db:migrate[^\n]*configured database|Apply migrations to the configured database/i,
      `${name} should not present manual Drizzle migration as the stage deploy path`
    );
  }

  assert.match(readme, /package-local Drizzle migration/);
  assert.doesNotMatch(readme, /baseline\/future snapshots/);
  assert.match(readme, /Alchemy-generated migration\s+state/);
  assert.match(developmentGuide, /package-local Drizzle CLI fallback/);
  assert.match(domainReadme, /package-local database workflow/);
  assert.match(developmentGuide, /Alchemy Neon branch resource applies/);
  assert.match(dataLayerGuide, /root `infra`/);
  assert.doesNotMatch(dataLayerGuide, /infra\s+package/);
});

test("main branch CI deploys an ephemeral Cloudflare stage before Playwright E2E", () => {
  const buildWorkflow = readFileSync(
    path.join(repoRoot, ".github/workflows/build.yml"),
    "utf8"
  );
  const ciDeployJob = getWorkflowJob(buildWorkflow, "cloud-e2e-deploy");
  const ciE2eJob = getWorkflowJob(buildWorkflow, "cloud-e2e");
  const ciDestroyJob = getWorkflowJob(buildWorkflow, "cloud-e2e-destroy");
  const ciAuditStep = getWorkflowStep(ciDeployJob, "Audit CI Alchemy state");
  const ciDatabaseExportStep = getWorkflowStep(
    ciE2eJob,
    "Export Playwright database URL"
  );
  const playwrightConfig = readFileSync(
    path.join(repoRoot, "apps/app/playwright.config.ts"),
    "utf8"
  );
  const readme = readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const appReadme = readFileSync(
    path.join(repoRoot, "apps/app/README.md"),
    "utf8"
  );
  const developmentGuide = readFileSync(
    path.join(repoRoot, "docs/development.md"),
    "utf8"
  );
  const cloudflareCiGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/cloudflare-ci.md"),
    "utf8"
  );

  assert.match(playwrightConfig, /PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER/);
  assert.doesNotMatch(playwrightConfig, /PLAYWRIGHT_USE_EXTERNAL_SERVER/);
  assert.doesNotMatch(
    buildWorkflow,
    /services:\n\s+postgres:|postgres:16|pnpm --filter (?:api|domain) db:migrate/
  );
  assert.doesNotMatch(
    buildWorkflow,
    /e2e:\n(?: {4}.*\n)* {4}environment: main/
  );
  assert.match(ciDeployJob, /needs:\n(?: {6}.*\n)* {6}- build/);
  assert.match(ciE2eJob, /needs:\n(?: {6}.*\n)* {6}- cloud-e2e-deploy/);
  assert.match(
    ciDestroyJob,
    /needs:\n(?: {6}.*\n)* {6}- cloud-e2e-deploy\n {6}- cloud-e2e/
  );
  assert.match(buildWorkflow, /environment: preview-deploy/);
  assert.match(
    buildWorkflow,
    /if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/
  );
  assert.doesNotMatch(buildWorkflow, /STAGING_STAGE/);
  assert.match(
    buildWorkflow,
    /CI_STAGE: ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}/
  );
  assert.match(
    buildWorkflow,
    /CEIRD_APP_HOSTNAME: app-ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(
    buildWorkflow,
    /CEIRD_API_HOSTNAME: api-ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(
    buildWorkflow,
    /CEIRD_AGENT_HOSTNAME: agent-ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(
    buildWorkflow,
    /CEIRD_MCP_HOSTNAME: mcp-ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(
    buildWorkflow,
    /CEIRD_SYNC_HOSTNAME: sync-ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(
    buildWorkflow,
    /PLAYWRIGHT_BASE_URL: https:\/\/app-ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(
    buildWorkflow,
    /PLAYWRIGHT_API_URL: https:\/\/api-ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(
    buildWorkflow,
    /PLAYWRIGHT_AGENT_URL: https:\/\/agent-ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(
    buildWorkflow,
    /PLAYWRIGHT_SYNC_URL: https:\/\/sync-ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(
    buildWorkflow,
    /PLAYWRIGHT_TENANT_URL: https:\/\/ci-tenant-health--ci-\$\{\{ github\.run_number \}\}-\$\{\{ github\.run_attempt \}\}\.ceird\.app/
  );
  assert.match(ciDeployJob, /pnpm alchemy deploy --stage "\$CI_STAGE" --yes/);
  assert.match(ciDeployJob, /AUTH_RATE_LIMIT_ENABLED: "false"/);
  assert.match(
    ciDeployJob,
    /pnpm alchemy:state-audit --stage "\$CI_STAGE" --json --tenant-routing-required --allow-finding legacy_drizzle_migrations_state/
  );
  assertContainsInOrder(ciDeployJob, [
    "name: Restore Alchemy state store credentials",
    "name: Deploy cloud E2E",
    "name: Audit CI Alchemy state",
    "name: Wait for CI deploy health",
  ]);
  assert.match(buildWorkflow, /Restore Alchemy state store credentials/);
  assert.match(buildWorkflow, /ALCHEMY_CLOUDFLARE_STATE_STORE_CREDENTIALS/);
  assert.match(
    buildWorkflow,
    /node scripts\/restore-alchemy-state-store-credentials\.mjs/
  );
  assert.doesNotMatch(
    ciDeployJob + ciE2eJob + ciDestroyJob,
    /pnpm alchemy cloudflare bootstrap/
  );
  assert.match(
    ciE2eJob,
    /pnpm --silent alchemy state get ceird "\$CI_STAGE" PostgresBranch --stage "\$CI_STAGE"/
  );
  assert.match(ciDeployJob, /Wait for CI deploy health/);
  assert.match(ciDeployJob, /"\$PLAYWRIGHT_SYNC_URL\/health"/);
  assert.match(ciDeployJob, /wait_for_sync_authorization/);
  assert.match(
    ciDeployJob,
    /"\$PLAYWRIGHT_SYNC_URL\/v1\/shapes\/jobs\?offset=-1"/
  );
  assertElectricStorageCredentialsEnv(ciDeployJob);
  assertElectricStorageCredentialsEnv(ciAuditStep);
  assertElectricStorageCredentialsEnv(ciDatabaseExportStep);
  assertElectricStorageCredentialsEnv(ciDestroyJob);
  assert.match(
    buildWorkflow,
    /\[\[ ! "\$CI_STAGE" =~ \^ci-\[0-9\]\+-\[0-9\]\+\$ \]\]/
  );
  assert.doesNotMatch(ciDeployJob, /pnpm --filter app e2e/);
  assert.match(ciE2eJob, /strategy:\n {6}fail-fast: false/);
  for (const shard of ["1/3", "2/3", "3/3"]) {
    assert.match(
      ciE2eJob,
      new RegExp(`- ${shard.replace("/", "\\/")}\\b`),
      `cloud e2e should run shard ${shard}`
    );
  }
  assert.match(
    ciE2eJob,
    /pnpm --filter app e2e --shard=\$\{\{ matrix\.shard \}\}/
  );
  assert.doesNotMatch(ciE2eJob, /pnpm alchemy deploy/);
  assert.doesNotMatch(ciE2eJob, /pnpm alchemy destroy/);
  assert.match(
    ciDestroyJob,
    /if: always\(\) && github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/
  );
  assert.match(ciDestroyJob, /pnpm alchemy destroy --stage "\$CI_STAGE" --yes/);
  assert.doesNotMatch(ciDestroyJob, /pnpm --filter app e2e/);
  assert.doesNotMatch(readme, /PLAYWRIGHT_USE_EXTERNAL_SERVER/);
  assert.match(appReadme, /PLAYWRIGHT_BASE_URL=<alchemy-app-url>/);
  assert.match(appReadme, /PLAYWRIGHT_AGENT_URL=<alchemy-agent-url>/);
  assert.doesNotMatch(appReadme, /PLAYWRIGHT_USE_EXTERNAL_SERVER/);
  assert.doesNotMatch(developmentGuide, /PLAYWRIGHT_USE_EXTERNAL_SERVER/);
  assert.match(developmentGuide, /PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1/);
  assert.match(cloudflareCiGuide, /ephemeral CI deploy stage/);
  assert.match(cloudflareCiGuide, /first-level hostnames/);
  assert.doesNotMatch(
    cloudflareCiGuide,
    /Build` workflow's Playwright E2E job selects the `main` environment/
  );
  assert.match(
    cloudflareCiGuide,
    /cloud E2E path uses `preview-deploy` with an\s+ephemeral `ci-<run-number>-<attempt>` stage/
  );
  assert.match(
    cloudflareCiGuide,
    /Cloud E2E and preview deploys pass\s+Electric storage credentials/
  );
  assert.match(
    developmentGuide,
    /Cloud E2E jobs read the\s+target stage's `PostgresBranch` state/
  );
});

test("build workflow runs static checks and tests before build in parallel", () => {
  const buildWorkflow = readFileSync(
    path.join(repoRoot, ".github/workflows/build.yml"),
    "utf8"
  );

  assert.match(buildWorkflow, /lint:\n(?: {4}.*\n)* {4}runs-on:/);
  assert.match(buildWorkflow, /format:\n(?: {4}.*\n)* {4}runs-on:/);
  assert.match(buildWorkflow, /check-types:\n(?: {4}.*\n)* {4}runs-on:/);
  assert.match(buildWorkflow, /knip:\n(?: {4}.*\n)* {4}runs-on:/);
  assert.match(buildWorkflow, /react-doctor:\n(?: {4}.*\n)* {4}runs-on:/);
  assert.match(buildWorkflow, /tests:\n(?: {4}.*\n)* {4}strategy:/);
  for (const testName of [
    "agent",
    "api",
    "app",
    "domain",
    "mcp",
    "sync",
    "agents-core",
    "comments-core",
    "domain-core",
    "identity-core",
    "jobs-core",
    "labels-core",
    "sites-core",
    "infra",
    "scripts",
  ]) {
    assert.match(
      buildWorkflow,
      new RegExp(`name: ${testName}\\n\\s+command:`),
      `build workflow should run ${testName} tests in the test matrix`
    );
  }
  assert.match(
    buildWorkflow,
    /build:\n(?: {4}.*\n)* {4}needs:\n(?: {6}- (?:lint|format|check-types|knip|react-doctor|tests)\n){6}/
  );
  assert.match(buildWorkflow, /run: pnpm build/);
});

test("preview workflow deploys same-repository PR stages for E2E", () => {
  const previewWorkflow = readFileSync(
    path.join(repoRoot, ".github/workflows/preview.yml"),
    "utf8"
  );
  const previewDeployJob = getWorkflowJob(previewWorkflow, "deploy-e2e");
  const previewAuditStep = getWorkflowStep(
    previewDeployJob,
    "Audit preview Alchemy state"
  );
  const previewDatabaseExportStep = getWorkflowStep(
    previewDeployJob,
    "Export Playwright database URL"
  );

  assert.match(previewWorkflow, /^name: Preview$/m);
  assert.match(previewWorkflow, /pull_request:/);
  assert.match(previewWorkflow, /workflow_dispatch:/);
  assert.match(previewWorkflow, /pr_number:/);
  for (const action of ["opened", "synchronize", "reopened", "closed"]) {
    assert.match(
      previewWorkflow,
      new RegExp(`- ${action}\\b`),
      `preview workflow should handle pull_request ${action}`
    );
  }
  assert.doesNotMatch(previewWorkflow, /pull_request_target/);
  assert.match(previewWorkflow, /contents:\s+read/);
  assert.match(previewWorkflow, /issues:\s+write/);
  assert.match(previewWorkflow, /pull-requests:\s+write/);
  assert.match(
    previewWorkflow,
    /group: ceird-preview-pr-\$\{\{ github\.event\.pull_request\.number \|\| inputs\.pr_number \|\| github\.run_id \}\}/
  );
  assert.match(
    previewWorkflow,
    /PREVIEW_STAGE: pr-\$\{\{ github\.event\.pull_request\.number \|\| inputs\.pr_number \}\}/
  );
  assert.match(
    previewWorkflow,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/
  );
  assert.match(previewWorkflow, /environment: preview-deploy/);
  assert.match(previewWorkflow, /Restore Alchemy state store credentials/);
  assert.match(previewWorkflow, /ALCHEMY_CLOUDFLARE_STATE_STORE_CREDENTIALS/);
  assert.match(
    previewWorkflow,
    /node scripts\/restore-alchemy-state-store-credentials\.mjs/
  );
  assert.doesNotMatch(previewWorkflow, /pnpm alchemy cloudflare bootstrap/);
  assert.match(
    previewWorkflow,
    /PLAYWRIGHT_BASE_URL: https:\/\/app\.pr-\$\{\{ github\.event\.pull_request\.number \}\}\.ceird\.app/
  );
  assert.match(
    previewWorkflow,
    /PLAYWRIGHT_API_URL: https:\/\/api\.pr-\$\{\{ github\.event\.pull_request\.number \}\}\.ceird\.app/
  );
  assert.match(
    previewWorkflow,
    /PLAYWRIGHT_AGENT_URL: https:\/\/agent\.pr-\$\{\{ github\.event\.pull_request\.number \}\}\.ceird\.app/
  );
  assert.match(
    previewWorkflow,
    /PLAYWRIGHT_SYNC_URL: https:\/\/sync\.pr-\$\{\{ github\.event\.pull_request\.number \}\}\.ceird\.app/
  );
  assert.match(
    previewWorkflow,
    /pnpm alchemy deploy --stage "\$PREVIEW_STAGE" --yes/
  );
  assert.match(
    previewWorkflow,
    /pnpm alchemy:state-audit --stage "\$PREVIEW_STAGE" --json --tenant-routing-required --allow-finding legacy_drizzle_migrations_state/
  );
  assertContainsInOrder(previewWorkflow, [
    "name: Restore Alchemy state store credentials",
    "name: Deploy preview",
    "name: Audit preview Alchemy state",
    "name: Export Playwright database URL",
  ]);
  assert.match(
    previewWorkflow,
    /pnpm --silent alchemy state get ceird "\$PREVIEW_STAGE" PostgresBranch --stage "\$PREVIEW_STAGE"/
  );
  assert.match(
    previewWorkflow,
    /node scripts\/export-playwright-database-url\.mjs/
  );
  assert.match(previewWorkflow, /Wait for preview health/);
  assert.match(previewWorkflow, /for attempt in \{1\.\.120\}/);
  assert.match(
    previewWorkflow,
    /waiting for preview route and TLS propagation/
  );
  assert.match(previewWorkflow, /"\$PLAYWRIGHT_API_URL\/health"/);
  assert.match(
    previewWorkflow,
    /"\$PLAYWRIGHT_API_URL\/api\/auth\/get-session"/
  );
  assert.match(previewWorkflow, /wait_for_auth_domain_forwarding/);
  assert.match(previewWorkflow, /preview-health-%s@example\.com/);
  assert.match(
    previewWorkflow,
    /"\$PLAYWRIGHT_API_URL\/api\/auth\/organization\/create"/
  );
  assert.match(previewWorkflow, /waiting for service binding propagation/);
  assert.match(previewWorkflow, /"\$PLAYWRIGHT_AGENT_URL\/health"/);
  assert.match(previewWorkflow, /"\$PLAYWRIGHT_BASE_URL\/health"/);
  assert.match(previewWorkflow, /"\$PLAYWRIGHT_SYNC_URL\/health"/);
  assert.match(previewWorkflow, /wait_for_sync_authorization/);
  assert.match(
    previewWorkflow,
    /"\$PLAYWRIGHT_SYNC_URL\/v1\/shapes\/jobs\?offset=-1"/
  );
  assert.match(previewWorkflow, /wait_for_app_authenticated_navigation/);
  assert.match(previewWorkflow, /preview-app-health-%s@example\.com/);
  assert.match(previewWorkflow, /\^location: \/create-organization/);
  assert.match(previewWorkflow, /waiting for app\/auth propagation/);
  assert.match(previewWorkflow, /actions\/github-script@v/);
  assert.match(previewWorkflow, /ceird-preview-environment/);
  assert.match(previewWorkflow, /Preview environment is ready/);
  assert.match(previewWorkflow, /Agent \|/);
  assert.match(previewWorkflow, /Sync \|/);
  assertElectricStorageCredentialsEnv(previewDeployJob);
  assertElectricStorageCredentialsEnv(previewAuditStep);
  assertElectricStorageCredentialsEnv(previewDatabaseExportStep);
  assert.match(previewWorkflow, /pnpm --filter app e2e/);
});

test("preview workflow destroys PR stages from the default branch on close", () => {
  const previewWorkflow = readFileSync(
    path.join(repoRoot, ".github/workflows/preview.yml"),
    "utf8"
  );
  const previewCleanupJob = getWorkflowJob(previewWorkflow, "cleanup");

  assert.match(previewWorkflow, /github\.event\.action == 'closed'/);
  assert.match(previewWorkflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(previewWorkflow, /environment: preview-cleanup/);
  assertElectricStorageCredentialsEnv(previewCleanupJob);
  assert.match(
    previewWorkflow,
    /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/
  );
  assert.match(
    previewWorkflow,
    /if \[\[ ! "\$PREVIEW_STAGE" =~ \^pr-\[0-9\]\+\$ \]\]; then/
  );
  assert.match(
    previewWorkflow,
    /pnpm alchemy destroy --stage "\$PREVIEW_STAGE" --yes/
  );
  assert.doesNotMatch(previewWorkflow, /CEIRD_APP_HOSTNAME: app\.ceird\.app/);
  assert.doesNotMatch(previewWorkflow, /CEIRD_API_HOSTNAME: api\.ceird\.app/);
});

test("Playwright database URL fallback is package-local only", () => {
  const testUrls = readFileSync(
    path.join(repoRoot, "apps/app/e2e/test-urls.ts"),
    "utf8"
  );
  const stack = readFileSync(path.join(repoRoot, "alchemy.run.ts"), "utf8");
  const developmentGuide = readFileSync(
    path.join(repoRoot, "docs/development.md"),
    "utf8"
  );
  const playwrightConfig = readFileSync(
    path.join(repoRoot, "apps/app/playwright.config.ts"),
    "utf8"
  );
  const frontendGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/frontend.md"),
    "utf8"
  );

  assert.doesNotMatch(
    stack,
    /databaseUrl:|connectionUri:|pooledConnectionUri:/,
    "stack outputs should not print Neon connection strings into deploy logs"
  );
  assert.match(playwrightConfig, /from "\.\/e2e\/test-origins"/);
  assert.doesNotMatch(
    playwrightConfig,
    /from "\.\/e2e\/test-urls"/,
    "Playwright config should load app/API origins without eagerly resolving database URLs"
  );
  assert.match(testUrls, /from "\.\/test-origins"/);
  assert.match(testUrls, /function readPlaywrightDatabaseUrl/);
  assert.match(
    testUrls,
    /PLAYWRIGHT_DATABASE_URL is required for database-backed E2E tests against an existing Alchemy stage/
  );
  assert.match(
    testUrls,
    /USE_PACKAGE_LOCAL_SERVER[\s\S]*readOptionalEnv\("DATABASE_URL"\)/
  );
  assert.doesNotMatch(
    testUrls,
    /readOptionalEnv\("PLAYWRIGHT_DATABASE_URL"\)\s*\?\?\s*readOptionalEnv\("DATABASE_URL"\)/,
    "stage-targeted Playwright runs must not silently fall back to generic DATABASE_URL"
  );
  assert.match(
    frontendGuide,
    /Use `DATABASE_URL` only with `PLAYWRIGHT_USE_PACKAGE_LOCAL_SERVER=1`/
  );
  for (const [name, contents] of [
    ["docs/development.md", developmentGuide],
    ["docs/architecture/frontend.md", frontendGuide],
  ]) {
    assert.match(
      contents,
      /alchemy state get ceird <stage> PostgresBranch/,
      `${name} should explain how to inspect the stage PostgresBranch state`
    );
    assert.match(
      contents,
      /\.attr\.connectionUri\.__redacted__ \/\/ \.attr\.connectionUri/,
      `${name} should handle current and redacted Alchemy state encodings`
    );
  }
});

test("database URL state inspection docs name their JSON reader dependency", () => {
  const developmentGuide = readFileSync(
    path.join(repoRoot, "docs/development.md"),
    "utf8"
  );
  const localInfraGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/local-development-and-infra.md"),
    "utf8"
  );

  assert.match(developmentGuide, /- jq\./);
  assert.match(
    localInfraGuide,
    /`PostgresBranch` inspection examples use `jq`/
  );
});

test("app server runtime reads Cloudflare Worker env bindings", () => {
  const serverApiOrigin = readFileSync(
    path.join(repoRoot, "apps/app/src/lib/api-origin.server.ts"),
    "utf8"
  );
  const appHealthRoute = readFileSync(
    path.join(repoRoot, "apps/app/src/routes/health.ts"),
    "utf8"
  );

  assert.match(serverApiOrigin, /cloudflare:workers/);
  assert.match(serverApiOrigin, /API_ORIGIN/);
  assert.match(appHealthRoute, /cloudflare:workers/);
  assert.match(appHealthRoute, /ALCHEMY_STACK_NAME/);
  assert.match(appHealthRoute, /ALCHEMY_STAGE/);
});

test("infra docs describe the domain Worker as Effect-threaded", () => {
  const localInfraGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/local-development-and-infra.md"),
    "utf8"
  );
  const apiGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/api.md"),
    "utf8"
  );

  for (const [name, contents] of [
    ["docs/architecture/local-development-and-infra.md", localInfraGuide],
    ["docs/architecture/api.md", apiGuide],
  ]) {
    assert.match(contents, /single Effect-threaded domain runtime\s+boundary/);
    assert.match(contents, /src\/platform\/cloudflare\/runtime\.ts/);
    assert.doesNotMatch(
      contents,
      /temporary async Worker bridge/,
      `${name} should describe the current runtime boundary`
    );
    assert.doesNotMatch(
      contents,
      /can move to an Alchemy Effect Worker|until the Worker entrypoint is migrated/,
      `${name} should not describe current Effect-threaded runtime composition as a future migration`
    );
  }
});

test("auth extension docs describe the deployed Worker email binding path", () => {
  const authNextSteps = readFileSync(
    path.join(repoRoot, "docs/architecture/auth-next-steps.md"),
    "utf8"
  );

  assert.match(authNextSteps, /Cloudflare Workers Email Service binding/);
  assert.match(authNextSteps, /AUTH_EMAIL_QUEUE/);
  assert.doesNotMatch(authNextSteps, /CLOUDFLARE_ACCOUNT_ID/);
  assert.doesNotMatch(authNextSteps, /CLOUDFLARE_API_TOKEN/);
});

test("auth email delivery does not keep a parallel Cloudflare REST SDK path", () => {
  const domainPackage = readJson("apps/domain/package.json");
  const authEmailConfig = readFileSync(
    path.join(
      repoRoot,
      "apps/domain/src/domains/identity/authentication/auth-email-config.ts"
    ),
    "utf8"
  );
  const authEmailTransport = readFileSync(
    path.join(
      repoRoot,
      "apps/domain/src/domains/identity/authentication/auth-email-transport.ts"
    ),
    "utf8"
  );
  const domainWorkerEnv = readFileSync(
    path.join(repoRoot, "apps/domain/src/platform/cloudflare/env.ts"),
    "utf8"
  );

  assert.equal(domainPackage.dependencies.cloudflare, undefined);
  assert.equal(
    existsSync(
      path.join(
        repoRoot,
        "apps/domain/src/domains/identity/authentication/cloudflare-auth-email-transport.ts"
      )
    ),
    false
  );

  for (const [name, contents] of [
    ["auth-email-config.ts", authEmailConfig],
    ["auth-email-transport.ts", authEmailTransport],
    ["platform/cloudflare/env.ts", domainWorkerEnv],
  ]) {
    assert.doesNotMatch(
      contents,
      /CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|CloudflareApi|makeCloudflareAuthEmailTransport|loadCloudflareAuthEmailConfig|loadOptionalCloudflareAuthEmailConfig/,
      `${name} should not keep Cloudflare REST API email delivery config`
    );
  }

  for (const relativePath of [
    "docs/architecture/auth.md",
    "docs/architecture/api.md",
    "docs/architecture/data-layer.md",
    "docs/architecture/local-development-and-infra.md",
    "docs/development.md",
  ]) {
    const contents = readFileSync(path.join(repoRoot, relativePath), "utf8");

    assert.doesNotMatch(
      contents,
      /Cloudflare (?:REST )?API email|Cloudflare email API|package-local Cloudflare email|manual email testing/i,
      `${relativePath} should describe binding-backed deployed email and deterministic local delivery`
    );
  }
});

test("auth architecture docs point at the current SSR session bridge", () => {
  const authArchitecture = readFileSync(
    path.join(repoRoot, "docs/architecture/auth.md"),
    "utf8"
  );

  assert.match(
    authArchitecture,
    /apps\/app\/src\/features\/auth\/server-session\.ts/
  );
  assert.match(authArchitecture, /VITE_API_ORIGIN/);
  assert.match(authArchitecture, /API_ORIGIN/);
  assert.doesNotMatch(authArchitecture, /get-server-auth-session\.ts/);
  assert.doesNotMatch(authArchitecture, /authentication\/database\.ts/);
  assert.doesNotMatch(authArchitecture, /VITE_AUTH_ORIGIN/);
  assert.doesNotMatch(authArchitecture, /createServerFn/);
  assert.doesNotMatch(
    authArchitecture,
    /derive the correct auth base URL from the request protocol and host/
  );
});

test("active docs use Alchemy-native local development guide naming", () => {
  assert.equal(
    existsSync(
      path.join(repoRoot, "docs/architecture/local-development-and-infra.md")
    ),
    true
  );
  assert.equal(
    existsSync(path.join(repoRoot, "docs/architecture/sandbox-and-infra.md")),
    false
  );

  for (const relativePath of listMarkdownFiles(repoRoot)) {
    const contents = readFileSync(path.join(repoRoot, relativePath), "utf8");

    assert.doesNotMatch(
      contents,
      /sandbox-and-infra\.md/,
      `${relativePath} should link to local-development-and-infra.md`
    );
  }
});

test("active docs describe the Alchemy stack as current architecture", () => {
  for (const relativePath of listMarkdownFiles(repoRoot)) {
    const contents = readFileSync(path.join(repoRoot, relativePath), "utf8");

    assert.doesNotMatch(
      contents,
      /\bPOC\b|proof[- ]of[- ]concept/i,
      `${relativePath} should not describe current Alchemy architecture as a POC`
    );
    assert.doesNotMatch(
      contents,
      /\bThis branch\b/,
      `${relativePath} should describe current architecture, not branch-local migration notes`
    );
    assert.doesNotMatch(
      contents,
      /PlanetScale/,
      `${relativePath} should not document the removed PlanetScale deploy path`
    );
  }
});

test("Alchemy native migration has a current progress note", () => {
  const progressNote = readFileSync(
    path.join(
      repoRoot,
      "docs/superpowers/progress/2026-05-18-alchemy-v2-native-migration.md"
    ),
    "utf8"
  );

  assert.match(progressNote, /# Alchemy V2 Native Migration Progress/);
  assert.match(progressNote, /CEIRD_CLOUDFLARE=1 pnpm alchemy plan/);
  assert.match(progressNote, /Plan: 10 to noop/);
  assert.match(
    progressNote,
    /DATABASE` binding state now persists the Hyperdrive id/
  );
  assert.match(progressNote, /api\.main\.ceird\.app\/health/);
  assert.match(progressNote, /app\.main\.ceird\.app\/health/);
  assert.match(progressNote, /state tree/);
  assert.match(progressNote, /DrizzleMigrations/);
  assert.match(progressNote, /PostgresProject/);
  assert.match(progressNote, /PostgresBranch/);
  assert.match(progressNote, /DatabaseSchema/);
  assert.match(progressNote, /codex-alchemy-v2-native-migration/);
  assert.match(progressNote, /now succeeds/);
  assert.match(progressNote, /operator approval/);
  assert.match(progressNote, /pnpm check-types/);
  assert.match(progressNote, /pnpm lint/);
  assert.match(progressNote, /pnpm format/);
  assert.match(progressNote, /git diff --check/);
  assert.match(progressNote, /Provider Reconciliation Status/);
  assert.match(
    progressNote,
    /CEIRD_CLOUDFLARE=1 pnpm alchemy deploy --env-file \.env\.local --stage main/
  );
  assert.match(progressNote, /AuthEmailDeadLetterQueue/);
  assert.match(progressNote, /AuthEmailQueue/);
  assert.match(progressNote, /provider state is converged/i);
});

test("active source no longer names the old sandbox host aliases", () => {
  const oldSandboxHostAlias = new RegExp(
    `ceird-${String.fromCodePoint(115, 98, 120)}`,
    "i"
  );

  for (const relativePath of listActiveTextFiles(repoRoot)) {
    const contents = readFileSync(path.join(repoRoot, relativePath), "utf8");

    assert.doesNotMatch(
      contents,
      oldSandboxHostAlias,
      `${relativePath} should use Alchemy-stage or conventional example origins`
    );
  }
});

test("Cloudflare state-store docs match the stack state configuration", () => {
  const stack = readFileSync(path.join(repoRoot, "alchemy.run.ts"), "utf8");
  const cloudflareCiGuide = readFileSync(
    path.join(repoRoot, "docs/architecture/cloudflare-ci.md"),
    "utf8"
  );

  assert.match(stack, /state:\s*Cloudflare\.state\(\)/);
  assert.doesNotMatch(stack, /Cloudflare\.state\(\s*\{/);
  assert.match(cloudflareCiGuide, /`Cloudflare\.state\(\)`/);
  assert.doesNotMatch(cloudflareCiGuide, /Cloudflare\.state\(\s*\{/);

  for (const relativePath of listMarkdownFiles(repoRoot)) {
    const contents = readFileSync(path.join(repoRoot, relativePath), "utf8");

    assert.doesNotMatch(
      contents,
      /ceird-alchemy-state/,
      `${relativePath} should not document a custom state-store Worker name`
    );
  }
});
