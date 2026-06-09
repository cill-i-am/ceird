import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const readText = (relativePath) =>
  readFileSync(path.join(repoRoot, relativePath), "utf8");

const readJson = (relativePath) => JSON.parse(readText(relativePath));

test("Alchemy reference architecture policy forbids raw AI bindings and raw database outputs", () => {
  const agentInfra = readText("apps/agent/infra/cloudflare-worker.ts");
  const defaults = readText("infra/cloudflare-worker-defaults.ts");
  const domainInfra = readText("apps/domain/infra/cloudflare-worker.ts");
  const githubStack = readText("alchemy.github.run.ts");
  const agentRuntime = readText("apps/agent/src/ceird-agent.ts");
  const neon = readText("infra/neon.ts");
  const stack = readText("infra/cloudflare-stack.ts");
  const root = readText("alchemy.run.ts");

  assert.match(agentInfra, /Cloudflare\.AiGateway/);
  assert.match(agentInfra, /AGENT_AI_GATEWAY_ID/);
  assert.doesNotMatch(agentInfra, /AgentWorkersAiBinding/);
  assert.doesNotMatch(agentInfra, /type:\s*["']ai["']/);
  assert.match(agentRuntime, /gateway:\s*\{/);
  assert.match(stack, /Cloudflare\.AiGateway\(\s*"AgentAiGateway"/);
  assert.match(
    stack,
    /Cloudflare\.AnalyticsEngineDataset\(\s*"WorkerAnalytics"/
  );
  assert.match(defaults, /ceirdWorkerTelemetryHeadSamplingRate\s*=\s*0\.1/);
  assert.match(defaults, /ceirdDomainWorkerPlacement/);
  assert.match(domainInfra, /placement:\s*ceirdDomainWorkerPlacement/);
  assert.match(githubStack, /makeGitHubCiStack/);
  assert.match(neon, /hyperdriveOrigin:\s*branch\.origin/);
  assert.doesNotMatch(root, /connectionUri\s*:/);
});

test("operator scripts expose a doctor and a safe state-audit path", () => {
  const rootPackage = readJson("package.json");

  assert.equal(
    rootPackage.scripts["alchemy:doctor"],
    "node scripts/alchemy-doctor.mjs"
  );
  assert.equal(
    rootPackage.scripts["alchemy:state-audit"],
    "node scripts/alchemy-state-audit.mjs"
  );
  assert.equal(
    existsSync(path.join(repoRoot, "scripts/alchemy-doctor.mjs")),
    true
  );
  assert.equal(
    existsSync(path.join(repoRoot, "scripts/alchemy-state-audit.mjs")),
    true
  );
  assert.equal(
    existsSync(
      path.join(repoRoot, "scripts/restore-alchemy-state-store-credentials.mjs")
    ),
    true
  );
});

test("state-store credential restore validates and writes the canonical file", async () => {
  const {
    defaultCredentialsFile,
    parseStateStoreCredentials,
    restoreStateStoreCredentials,
  } = await import(
    path.join(repoRoot, "scripts/restore-alchemy-state-store-credentials.mjs")
  );
  const homeDir = mkdtempSync(path.join(tmpdir(), "ceird-alchemy-home-"));
  const credentialsValue = JSON.stringify({
    authToken: "secret-token",
    url: "https://state.ceird.test",
  });
  const credentialsFile = defaultCredentialsFile(homeDir);

  assert.deepEqual(parseStateStoreCredentials(credentialsValue), {
    authToken: "secret-token",
    url: "https://state.ceird.test",
  });
  assert.equal(
    restoreStateStoreCredentials({
      credentialsFile,
      value: credentialsValue,
    }),
    credentialsFile
  );
  assert.deepEqual(JSON.parse(readFileSync(credentialsFile, "utf8")), {
    authToken: "secret-token",
    url: "https://state.ceird.test",
  });
  if (process.platform !== "win32") {
    assert.equal(statSync(credentialsFile).mode.toString(8).slice(-3), "600");
  }
  assert.equal(defaultCredentialsFile(homeDir), credentialsFile);
  assert.throws(() => parseStateStoreCredentials("{"), /valid JSON/);
  assert.throws(
    () =>
      parseStateStoreCredentials(
        JSON.stringify({ authToken: "secret-token", url: "http://state.test" })
      ),
    /https/
  );
  assert.throws(
    () =>
      parseStateStoreCredentials(
        JSON.stringify({ authToken: "secret-token", url: "https://" })
      ),
    /https/
  );
});

test("doctor reports detached worktrees and missing required Alchemy env without mutating providers", async () => {
  const { makeAlchemyDoctorReport, parseAlchemyDoctorArgs } = await import(
    path.join(repoRoot, "scripts/alchemy-doctor.mjs")
  );

  const report = makeAlchemyDoctorReport({
    branch: "",
    envFileExists: true,
    envFileValues: {},
    explicitStage: undefined,
    nodeMajor: 24,
    packageAlchemyVersion: "2.0.0-beta.44",
    user: "cillian",
  });

  assert.equal(report.ok, false);
  assert.match(report.summary, /detached worktree/i);
  assert.deepEqual(
    report.checks
      .filter((check) => check.status === "fail")
      .map((check) => check.name),
    ["stage", "env"]
  );
  assert.match(report.summary, /GOOGLE_MAPS_API_KEY/);
  assert.throws(() => parseAlchemyDoctorArgs(["--stage", "--json"]), /stage/);
  assert.throws(() => parseAlchemyDoctorArgs(["--unknown"]), /Unknown option/);
});

test("state audit flags legacy migration state and validates expected managed resources", async () => {
  const {
    analyzeAlchemyStateResources,
    makeAlchemyStateGetArgs,
    parseAlchemyStateGetResult,
    parseAlchemyStateAuditArgs,
  } = await import(path.join(repoRoot, "scripts/alchemy-state-audit.mjs"));
  const healthyResources = {
    AgentAiGateway: {
      resourceType: "Cloudflare.AiGateway",
      attr: {
        authentication: true,
        collectLogs: false,
        gatewayId: "ceird-main-agent-ai",
      },
    },
    Agent: {
      resourceType: "Cloudflare.Worker",
      props: {
        env: {
          ANALYTICS: { name: "ANALYTICS" },
          CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        },
      },
    },
    Api: {
      resourceType: "Cloudflare.Worker",
      props: {
        env: {
          ANALYTICS: { name: "ANALYTICS" },
          CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        },
      },
    },
    Domain: {
      resourceType: "Cloudflare.Worker",
      props: {
        env: {
          ANALYTICS: { name: "ANALYTICS" },
          CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        },
        placement: { mode: "smart" },
      },
    },
    Mcp: {
      resourceType: "Cloudflare.Worker",
      props: {
        env: {
          ANALYTICS: { name: "ANALYTICS" },
          CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
        },
      },
    },
    Sync: {
      resourceType: "Cloudflare.Worker",
      props: {
        env: {
          ANALYTICS: { name: "ANALYTICS" },
          DOMAIN: { name: "DOMAIN" },
          ElectricSql: { name: "ElectricSql" },
          AUTH_APP_ORIGIN: "https://app.ceird.app",
          CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
          ELECTRIC_SOURCE_SECRET: "secret",
          ELECTRIC_SQL_LOCATION_HINT: "weur",
        },
      },
    },
    ElectricSql: {
      resourceType: "Cloudflare.Container",
      props: {},
    },
    ElectricStorageBucket: {
      resourceType: "Cloudflare.R2Bucket",
      props: {},
    },
    PostgresBranch: {
      resourceType: "Neon.Branch",
      attr: {
        connectionUri: { __redacted__: "postgresql://redacted" },
        origin: { host: "ep-example.neon.tech" },
      },
    },
    TenantWildcardDnsRecord: {
      resourceType: "Ceird.CloudflareTenantWildcardDnsRecord",
      attr: {
        recordId: "dns-managed",
        zoneId: "zone-id",
        zoneName: "ceird.app",
      },
    },
    TenantWorkerRoute: {
      resourceType: "Ceird.CloudflareTenantWorkerRoute",
      attr: { pattern: "*.ceird.app/*" },
    },
  };

  const report = analyzeAlchemyStateResources({
    resources: {
      ...healthyResources,
      "Drizzle.Migrations": {
        resourceType: "Drizzle.Migrations",
        attr: {},
      },
    },
    stage: "main",
    tenantRoutingRequired: true,
  });

  assert.equal(report.ok, false);
  assert.equal(
    analyzeAlchemyStateResources({
      allowedFindingCodes: ["legacy_drizzle_migrations_state"],
      resources: {
        ...healthyResources,
        "Drizzle.Migrations": {
          attr: {},
          resourceType: "Drizzle.Migrations",
        },
      },
      stage: "main",
      tenantRoutingRequired: true,
    }).ok,
    true
  );
  assert.deepEqual(
    report.findings.map((finding) => finding.code),
    ["legacy_drizzle_migrations_state"]
  );
  assert.deepEqual(
    report.checks
      .filter((check) => check.status === "pass")
      .map((check) => check.name),
    [
      "postgres_branch",
      "agent_ai_gateway",
      "agent_ai_gateway_authentication",
      "agent_ai_gateway_logs",
      "domain_worker",
      "api_worker",
      "mcp_worker",
      "agent_worker",
      "sync_worker",
      "electric_storage_bucket",
      "electric_container",
      "tenant_route_pattern",
      "tenant_wildcard_dns_record",
    ]
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        AgentAiGateway: undefined,
      },
      stage: "main",
      tenantRoutingRequired: true,
    }).ok,
    false
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        Domain: {
          resourceType: "Cloudflare.Worker",
          attr: {
            bindings: {},
            env: { CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1" },
            placement: { mode: "smart" },
          },
        },
      },
      stage: "main",
      tenantRoutingRequired: true,
    }).checks.find((check) => check.name === "domain_worker_bindings")?.status,
    "fail"
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        Domain: {
          resourceType: "Cloudflare.Worker",
          attr: {
            bindings: { ANALYTICS: { name: "ANALYTICS" } },
            env: { CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1" },
            placement: { mode: "smart" },
          },
        },
      },
      stage: "main",
      tenantRoutingRequired: true,
    }).checks.find((check) => check.name === "domain_worker")?.status,
    "pass"
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        Domain: {
          resourceType: "Cloudflare.Worker",
          attr: {
            bindings: { ANALYTICS: { name: "ANALYTICS" } },
            env: { CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1" },
          },
        },
      },
      stage: "main",
      tenantRoutingRequired: true,
    }).checks.find((check) => check.name === "domain_worker_runtime_config")
      ?.status,
    "fail"
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        Sync: {
          resourceType: "Cloudflare.Worker",
          attr: {
            env: {
              ANALYTICS: { name: "ANALYTICS" },
              DOMAIN: { name: "DOMAIN" },
              AUTH_APP_ORIGIN: "https://app.ceird.app",
              CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: "0.1",
              ELECTRIC_SOURCE_SECRET: "secret",
              ELECTRIC_SQL_LOCATION_HINT: "weur",
            },
          },
        },
      },
      stage: "main",
      tenantRoutingRequired: true,
    }).checks.find((check) => check.name === "sync_worker_bindings")?.status,
    "fail"
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        ElectricSql: undefined,
        ElectricStorageBucket: undefined,
        TenantWildcardDnsRecord: undefined,
        TenantWorkerRoute: undefined,
      },
      stage: "pr-104",
      tenantRoutingRequired: false,
    }).ok,
    true
  );
  const previewShallowSyncReport = analyzeAlchemyStateResources({
    resources: {
      ...healthyResources,
      ElectricSql: undefined,
      ElectricStorageBucket: undefined,
      TenantWorkerRoute: {
        resourceType: "Ceird.CloudflareTenantWorkerRoute",
        attr: { pattern: "*--pr-104.ceird.app/*" },
      },
    },
    stage: "pr-104",
    tenantRoutingRequired: true,
  });

  assert.equal(previewShallowSyncReport.ok, true);
  assert.equal(
    previewShallowSyncReport.checks.find(
      (check) => check.name === "electric_preview_shallow_sync"
    )?.status,
    "pass"
  );
  const nonPreviewMissingElectricReport = analyzeAlchemyStateResources({
    resources: {
      ...healthyResources,
      ElectricSql: undefined,
      ElectricStorageBucket: undefined,
      TenantWorkerRoute: {
        resourceType: "Ceird.CloudflareTenantWorkerRoute",
        attr: { pattern: "*--qa-sync.ceird.app/*" },
      },
    },
    stage: "qa-sync",
    tenantRoutingRequired: true,
  });

  assert.equal(nonPreviewMissingElectricReport.ok, false);
  assert.equal(
    nonPreviewMissingElectricReport.checks.find(
      (check) => check.name === "electric_storage_bucket"
    )?.status,
    "fail"
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        PostgresBranch: {
          resourceType: "Neon.Branch",
          attr: {
            connectionUri: { __redacted__: "postgresql://redacted" },
          },
        },
      },
      stage: "main",
      tenantRoutingRequired: true,
    }).ok,
    false
  );
  assert.deepEqual(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        PostgresBranch: {
          resourceType: "Neon.Branch",
          attr: {
            connectionUri: "postgresql://plain-secret@example.neon.tech/app",
            origin: { host: "ep-example.neon.tech" },
          },
        },
      },
      stage: "main",
      tenantRoutingRequired: true,
    }).findings,
    [
      {
        code: "plain_connection_uri_state",
        message:
          "PostgresBranch connectionUri is present without Alchemy redaction; prefer redacted state once Alchemy supports it for this resource shape.",
        severity: "low",
      },
    ]
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        TenantWorkerRoute: {
          resourceType: "Ceird.CloudflareTenantWorkerRoute",
          attr: { pattern: "*--wrong.ceird.app/*" },
        },
      },
      stage: "codex-long-tenant-routing-stage-name",
      tenantRoutingRequired: true,
    }).ok,
    false
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: {
        ...healthyResources,
        TenantWorkerRoute: undefined,
      },
      stage: "main",
      tenantRoutingRequired: true,
    }).checks.find((check) => check.name === "tenant_route_pattern")?.status,
    "fail"
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: healthyResources,
      stage: "codex-long-tenant-routing-stage-name",
      tenantRoutingRequired: true,
    }).checks.find((check) => check.name === "tenant_route_pattern")?.message,
    "Tenant route pattern *.ceird.app/* does not match expected *--s-bee12a6901aa.ceird.app/*."
  );
  assert.equal(
    analyzeAlchemyStateResources({
      resources: healthyResources,
      stage: "main",
      stateReadErrors: [
        {
          context: "alchemy state get exited nonzero.",
          fqn: "PostgresBranch",
          stage: "main",
          status: 1,
          stderr: "Unauthorized",
        },
      ],
    }).checks.find((check) => check.name === "state_read_postgresbranch")
      ?.status,
    "fail"
  );
  assert.throws(
    () => parseAlchemyStateAuditArgs(["--stage", "--json"]),
    /stage/
  );
  assert.throws(
    () => parseAlchemyStateAuditArgs(["--unknown"]),
    /Unknown option/
  );
  assert.deepEqual(
    parseAlchemyStateGetResult({ stage: "pr-123" }, "Drizzle.Migrations", {
      status: 0,
      stderr: "",
      stdout: "(not found)\n",
    }),
    { missing: true }
  );
  assert.deepEqual(
    makeAlchemyStateGetArgs(
      {
        envFile: ".env.local",
        envFileExists: false,
        envFileExplicit: false,
        local: false,
        profile: undefined,
        stage: "pr-123",
      },
      "PostgresBranch"
    ),
    [
      "--silent",
      "alchemy",
      "state",
      "get",
      "ceird",
      "pr-123",
      "PostgresBranch",
      "--stage",
      "pr-123",
    ]
  );
  assert.deepEqual(
    makeAlchemyStateGetArgs(
      {
        envFile: ".env.local",
        envFileExists: true,
        envFileExplicit: false,
        local: false,
        profile: "ceird-env",
        stage: "codex-task",
      },
      "AgentAiGateway"
    ),
    [
      "--silent",
      "alchemy",
      "state",
      "get",
      "ceird",
      "codex-task",
      "AgentAiGateway",
      "--env-file",
      ".env.local",
      "--stage",
      "codex-task",
      "--profile",
      "ceird-env",
    ]
  );
});

test("reference architecture guide documents adding future infrastructure safely", () => {
  const guide = readText("docs/architecture/alchemy-reference-architecture.md");

  for (const expected of [
    "Add a Worker",
    "Add a Binding",
    "Add a Secret",
    "Preview-safe resources",
    "Native resource vs custom provider",
    "AI Gateway",
    "Live state audit",
  ]) {
    assert.match(guide, new RegExp(expected));
  }
});
