#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const knownResources = [
  "PostgresBranch",
  "AgentAiGateway",
  "Domain",
  "Api",
  "Mcp",
  "Agent",
  "Sync",
  "ElectricSql",
  "ElectricStorageBucket",
  "Drizzle.Migrations",
  "TenantWorkerRoute",
  "TenantWildcardDnsRecord",
];
const defaultZoneName = "ceird.app";
const defaultProductionStage = "main";
const maxStageSlugLength = 40;
const maxTenantStageAliasLength = 14;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
  }
}

function check(name, status, message) {
  return { name, status, message };
}

function finding(code, severity, message) {
  return { code, severity, message };
}

function resourceType(resource) {
  return resource?.resourceType ?? resource?.type ?? resource?.Type;
}

function resourceAttr(resource) {
  return {
    ...resource?.props,
    ...resource?.Props,
    ...resource?.attr,
    ...resource?.attributes,
    ...resource?.Attributes,
  };
}

function hasRedactedConnectionUri(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.__redacted__ === "string"
  );
}

function makeStageSlug(value) {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-{2,}/g, "-");
  const base = slug.length > 0 ? slug : "stage";

  if (base.length <= maxStageSlugLength) {
    return base;
  }

  const hash = createHash("sha256").update(value).digest("hex").slice(0, 8);
  const prefix = base
    .slice(0, maxStageSlugLength - hash.length - 1)
    .replaceAll(/-+$/g, "");

  return `${prefix}-${hash}`;
}

function makeTenantStageAlias(stage) {
  const stageSlug = makeStageSlug(stage);

  if (stageSlug.length <= maxTenantStageAliasLength) {
    return stageSlug;
  }

  const hash = createHash("sha256").update(stage).digest("hex").slice(0, 12);

  return `s-${hash}`;
}

function isPullRequestPreviewStage(stage) {
  return /^pr-\d+$/.test(stage);
}

function isEphemeralCiStage(stage) {
  return /^ci-\d+-\d+$/.test(stage);
}

function expectedTenantRoutePattern(input) {
  return input.stage === input.productionStage
    ? `*.${input.zoneName}/*`
    : `*--${makeTenantStageAlias(input.stage)}.${input.zoneName}/*`;
}

function stateReadErrorCheck(error) {
  return check(
    `state_read_${error.fqn.replaceAll(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
    "fail",
    [
      `Could not read ${error.fqn} state for stage ${error.stage}.`,
      `status=${error.status}.`,
      error.stderr.length > 0 ? `stderr=${error.stderr}` : "stderr=<empty>.",
      error.context,
    ].join(" ")
  );
}

function postgresBranchChecksAndFindings(resources) {
  const checks = [];
  const findings = [];
  const postgresBranch = resources.PostgresBranch;
  const postgresBranchAttr = resourceAttr(postgresBranch);

  checks.push(
    resourceType(postgresBranch) === "Neon.Branch" && postgresBranchAttr.origin
      ? check(
          "postgres_branch",
          "pass",
          "PostgresBranch has a Hyperdrive origin."
        )
      : check(
          "postgres_branch",
          "fail",
          "PostgresBranch state is missing its origin."
        )
  );

  if (
    postgresBranchAttr.connectionUri !== undefined &&
    !hasRedactedConnectionUri(postgresBranchAttr.connectionUri)
  ) {
    findings.push(
      finding(
        "plain_connection_uri_state",
        "low",
        "PostgresBranch connectionUri is present without Alchemy redaction; prefer redacted state once Alchemy supports it for this resource shape."
      )
    );
  }

  return { checks, findings };
}

function agentAiGatewayChecks(resources) {
  const agentAiGateway = resources.AgentAiGateway;
  const agentAiGatewayAttr = resourceAttr(agentAiGateway);

  if (resourceType(agentAiGateway) !== "Cloudflare.AiGateway") {
    return [
      check(
        "agent_ai_gateway",
        "fail",
        "AgentAiGateway is missing from state."
      ),
    ];
  }

  return [
    check("agent_ai_gateway", "pass", "Agent AI Gateway exists in state."),
    agentAiGatewayAttr.authentication === true
      ? check(
          "agent_ai_gateway_authentication",
          "pass",
          "Agent AI Gateway requires authentication."
        )
      : check(
          "agent_ai_gateway_authentication",
          "fail",
          "Agent AI Gateway must set authentication=true."
        ),
    agentAiGatewayAttr.collectLogs === false
      ? check(
          "agent_ai_gateway_logs",
          "pass",
          "Agent AI Gateway does not collect prompt logs."
        )
      : check(
          "agent_ai_gateway_logs",
          "fail",
          "Agent AI Gateway must set collectLogs=false."
        ),
  ];
}

function workerChecks(resources) {
  return [
    workerBindingCheck(resources, "Domain", ["ANALYTICS"], {
      placementRequired: true,
    }),
    workerBindingCheck(resources, "Api", ["ANALYTICS"]),
    workerBindingCheck(resources, "Mcp", ["ANALYTICS"]),
    workerBindingCheck(resources, "Agent", ["ANALYTICS"]),
    workerBindingCheck(
      resources,
      "Sync",
      ["ANALYTICS", "DOMAIN", "ElectricSql"],
      {
        requiredEnv: [
          "AUTH_APP_ORIGIN",
          "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE",
          "ELECTRIC_SOURCE_SECRET",
          "ELECTRIC_SQL_LOCATION_HINT",
        ],
      }
    ),
  ];
}

function workerBindingCheck(
  resources,
  resourceName,
  requiredBindings,
  options = {}
) {
  const worker = resources[resourceName];
  const attr = resourceAttr(worker);

  if (resourceType(worker) !== "Cloudflare.Worker") {
    return check(
      `${resourceName.toLowerCase()}_worker`,
      "fail",
      `${resourceName} Worker is missing from state.`
    );
  }

  const missingBindings = requiredBindings.filter(
    (bindingName) => !workerHasBinding(attr, bindingName)
  );
  const requiredEnv = options.requiredEnv ?? [
    "CEIRD_WORKER_ANALYTICS_SAMPLE_RATE",
  ];
  const missingEnv = requiredEnv.filter(
    (envName) => !workerHasEnvValue(attr, envName)
  );

  if (missingBindings.length > 0) {
    return check(
      `${resourceName.toLowerCase()}_worker_bindings`,
      "fail",
      `${resourceName} Worker is missing bindings: ${missingBindings.join(", ")}.`
    );
  }

  if (
    missingEnv.length > 0 ||
    (options.placementRequired === true && !workerHasSmartPlacement(attr))
  ) {
    return check(
      `${resourceName.toLowerCase()}_worker_runtime_config`,
      "fail",
      [
        `${resourceName} Worker is missing expected runtime config`,
        missingEnv.length > 0 ? `env: ${missingEnv.join(", ")}` : undefined,
        options.placementRequired === true ? "or Smart Placement" : undefined,
      ]
        .filter(Boolean)
        .join(" ")
        .concat(".")
    );
  }

  return check(
    `${resourceName.toLowerCase()}_worker`,
    "pass",
    `${resourceName} Worker has required analytics binding and runtime config.`
  );
}

function electricSyncStorageChecks(input) {
  const productionStage = input.productionStage ?? defaultProductionStage;
  const electricContainer = input.resources.ElectricSql;
  const electricStorageBucket = input.resources.ElectricStorageBucket;
  const optionalProbeStage =
    input.stage !== productionStage &&
    (isPullRequestPreviewStage(input.stage) || isEphemeralCiStage(input.stage));

  if (
    optionalProbeStage &&
    electricContainer === undefined &&
    electricStorageBucket === undefined
  ) {
    return [
      check(
        "electric_preview_shallow_sync",
        "pass",
        "Preview and ephemeral CI stages may run the sync authorization probe without Electric runtime storage credentials."
      ),
    ];
  }

  if (input.stage !== productionStage && input.tenantRoutingRequired !== true) {
    return [];
  }

  const stageDescription =
    input.stage === productionStage ? "production sync" : "audited cloud sync";

  return [
    resourceType(electricStorageBucket) === "Cloudflare.R2Bucket"
      ? check(
          "electric_storage_bucket",
          "pass",
          `Electric storage R2 bucket exists for ${stageDescription}.`
        )
      : check(
          "electric_storage_bucket",
          "fail",
          `Electric storage R2 bucket is required for ${stageDescription}.`
        ),
    resourceType(electricContainer) === "Cloudflare.Container"
      ? check(
          "electric_container",
          "pass",
          `Electric container application exists for ${stageDescription}.`
        )
      : check(
          "electric_container",
          "fail",
          `Electric container application is required for ${stageDescription}.`
        ),
  ];
}

function workerHasBinding(attr, bindingName) {
  const bindingSources = [
    attr.bindings,
    attr.Bindings,
    attr.env,
    attr.Env,
    attr.environment,
  ].filter(Boolean);

  return bindingSources.some((bindings) => {
    if (Array.isArray(bindings)) {
      return bindings.some((binding) =>
        [
          binding?.name,
          binding?.Name,
          binding?.binding,
          binding?.Binding,
        ].includes(bindingName)
      );
    }

    return (
      Object.hasOwn(bindings, bindingName) ||
      Object.values(bindings).some((binding) =>
        [
          binding?.name,
          binding?.Name,
          binding?.binding,
          binding?.Binding,
        ].includes(bindingName)
      )
    );
  });
}

function workerHasEnvValue(attr, name) {
  const env = attr.env ?? attr.vars ?? attr.environment ?? {};

  return Object.hasOwn(env, name);
}

function workerHasSmartPlacement(attr) {
  return (attr.placement ?? attr.Placement)?.mode === "smart";
}

function tenantRouteCheck(input) {
  const tenantRoute = input.resources.TenantWorkerRoute;
  const tenantRoutePattern = resourceAttr(tenantRoute).pattern;
  const expectedRoutePattern = expectedTenantRoutePattern(input);

  if (tenantRoute === undefined) {
    return check(
      "tenant_route_pattern",
      input.tenantRoutingRequired ? "fail" : "warn",
      input.tenantRoutingRequired
        ? "TenantWorkerRoute is required for this stage but is absent."
        : "TenantWorkerRoute is absent; this is expected only for local or tenant-disabled stages."
    );
  }

  return tenantRoutePattern === expectedRoutePattern
    ? check(
        "tenant_route_pattern",
        "pass",
        "Tenant route pattern matches the stage."
      )
    : check(
        "tenant_route_pattern",
        "fail",
        `Tenant route pattern ${tenantRoutePattern} does not match expected ${expectedRoutePattern}.`
      );
}

function tenantWildcardDnsRecordCheck(input) {
  const tenantWildcardDnsRecord = input.resources.TenantWildcardDnsRecord;
  const tenantWildcardDnsRecordAttr = resourceAttr(tenantWildcardDnsRecord);

  if (tenantWildcardDnsRecord === undefined) {
    return check(
      "tenant_wildcard_dns_record",
      input.tenantRoutingRequired ? "fail" : "warn",
      input.tenantRoutingRequired
        ? "TenantWildcardDnsRecord is required for this stage but is absent."
        : "TenantWildcardDnsRecord is absent; this is expected only for local or tenant-disabled stages."
    );
  }

  if (
    resourceType(tenantWildcardDnsRecord) !==
    "Ceird.CloudflareTenantWildcardDnsRecord"
  ) {
    return check(
      "tenant_wildcard_dns_record",
      "fail",
      "TenantWildcardDnsRecord has an unexpected resource type."
    );
  }

  return tenantWildcardDnsRecordAttr.zoneName === input.zoneName &&
    typeof tenantWildcardDnsRecordAttr.recordId === "string" &&
    typeof tenantWildcardDnsRecordAttr.zoneId === "string"
    ? check(
        "tenant_wildcard_dns_record",
        "pass",
        "Tenant wildcard DNS record is managed for the expected zone."
      )
    : check(
        "tenant_wildcard_dns_record",
        "fail",
        `Tenant wildcard DNS record does not match expected zone ${input.zoneName} or is missing stable IDs.`
      );
}

export function analyzeAlchemyStateResources(input) {
  const { resources, stage } = input;
  const allowedFindingCodes = new Set(input.allowedFindingCodes);
  const productionStage = input.productionStage ?? defaultProductionStage;
  const stateReadErrors = input.stateReadErrors ?? [];
  const tenantRoutingRequired = input.tenantRoutingRequired ?? false;
  const zoneName = input.zoneName ?? defaultZoneName;
  const postgresBranchReport = postgresBranchChecksAndFindings(resources);
  const findings = [...postgresBranchReport.findings];
  const checks = [
    ...stateReadErrors.map(stateReadErrorCheck),
    ...postgresBranchReport.checks,
    ...agentAiGatewayChecks(resources),
    ...workerChecks(resources),
    ...electricSyncStorageChecks({
      productionStage,
      resources,
      stage,
      tenantRoutingRequired,
    }),
  ];

  if (resources["Drizzle.Migrations"] !== undefined) {
    findings.push(
      finding(
        "legacy_drizzle_migrations_state",
        "medium",
        "Legacy Drizzle.Migrations state is still present; inspect before removing the tombstone provider."
      )
    );
  }

  checks.push(
    tenantRouteCheck({
      productionStage,
      resources,
      stage,
      tenantRoutingRequired,
      zoneName,
    }),
    tenantWildcardDnsRecordCheck({
      resources,
      tenantRoutingRequired,
      zoneName,
    })
  );

  const ok =
    checks.every((item) => item.status !== "fail") &&
    findings.every(
      (item) =>
        allowedFindingCodes.has(item.code) ||
        (item.severity !== "high" && item.severity !== "medium")
    );

  return {
    checks,
    findings,
    ok,
    stateReadErrors,
    stage,
  };
}

function requireValue(name, value) {
  if (value === undefined || value.startsWith("--") || value.length === 0) {
    throw new UsageError(`${name} requires a value.`);
  }

  return value;
}

function setOptionValue(options, name, value) {
  switch (name) {
    case "--file":
    case "--state-file": {
      const requiredValue = requireValue(name, value);
      options.file = requiredValue;
      return true;
    }
    case "--stage": {
      const requiredValue = requireValue(name, value);
      options.stage = requiredValue;
      return true;
    }
    case "--env-file": {
      const requiredValue = requireValue(name, value);
      options.envFile = requiredValue;
      options.envFileExplicit = true;
      return true;
    }
    case "--profile": {
      const requiredValue = requireValue(name, value);
      options.profile = requiredValue;
      return true;
    }
    case "--production-stage": {
      const requiredValue = requireValue(name, value);
      options.productionStage = requiredValue;
      return true;
    }
    case "--zone-name": {
      const requiredValue = requireValue(name, value);
      options.zoneName = requiredValue;
      return true;
    }
    case "--allow-finding":
    case "--allow-finding-code": {
      const requiredValue = requireValue(name, value);
      options.allowedFindingCodes.push(requiredValue);
      return true;
    }
    default: {
      return false;
    }
  }
}

function setEqualsOption(options, arg) {
  const equalsIndex = arg.indexOf("=");

  if (equalsIndex === -1) {
    return false;
  }

  const name = arg.slice(0, equalsIndex);
  const value = arg.slice(equalsIndex + 1);

  if (!setOptionValue(options, name, value)) {
    throw new UsageError(`Unknown option ${name}.`);
  }

  return true;
}

function setFlagOption(options, arg) {
  switch (arg) {
    case "--local": {
      options.local = true;
      return true;
    }
    case "--json": {
      options.json = true;
      return true;
    }
    case "--tenant-routing-required": {
      options.tenantRoutingRequired = true;
      return true;
    }
    default: {
      return false;
    }
  }
}

export function parseAlchemyStateAuditArgs(args) {
  const options = {
    envFile: ".env.local",
    envFileExplicit: false,
    file: undefined,
    json: false,
    local: false,
    productionStage: defaultProductionStage,
    profile: undefined,
    stage: undefined,
    tenantRoutingRequired: false,
    zoneName: defaultZoneName,
    allowedFindingCodes: [],
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (setFlagOption(options, arg)) {
      continue;
    }

    if (setEqualsOption(options, arg)) {
      continue;
    }

    if (arg.startsWith("--")) {
      if (setOptionValue(options, arg, next)) {
        index += 1;
        continue;
      }

      throw new UsageError(`Unknown option ${arg}.`);
    }

    throw new UsageError(`Unexpected positional argument ${arg}.`);
  }

  return options;
}

function readResourcesFromFile(file) {
  const parsed = JSON.parse(readFileSync(resolve(repoRoot, file), "utf8"));

  return parsed.resources ?? parsed;
}

export function makeAlchemyStateGetArgs(options, fqn) {
  const args = [
    "--silent",
    "alchemy",
    "state",
    "get",
    "ceird",
    options.stage,
    fqn,
  ];

  if (options.envFileExplicit || options.envFileExists) {
    args.push("--env-file", options.envFile);
  }

  args.push("--stage", options.stage);

  if (options.profile !== undefined) {
    args.push("--profile", options.profile);
  }

  if (options.local) {
    args.push("--local");
  }

  return args;
}

function isMissingStateResult(result) {
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  return /\b(not found|notfound|no state|404)\b/iu.test(text);
}

function sanitizeCliText(value) {
  return value
    .replaceAll(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer <redacted>")
    .replaceAll(
      /([?&](?:token|code|secret|password|authToken)=)[^&\s]+/giu,
      "$1<redacted>"
    )
    .replaceAll(
      /\b(?:token|secret|password|authToken)=\S+/giu,
      (match) => `${match.split("=")[0]}=<redacted>`
    )
    .trim()
    .slice(0, 500);
}

function makeStateReadError(input) {
  return {
    context: input.context,
    fqn: input.fqn,
    stage: input.stage,
    status: input.status,
    stderr: sanitizeCliText(input.stderr),
  };
}

export function parseAlchemyStateGetResult(options, fqn, result) {
  if (result.status !== 0) {
    return isMissingStateResult(result)
      ? { missing: true }
      : {
          error: makeStateReadError({
            context: "alchemy state get exited nonzero.",
            fqn,
            stage: options.stage,
            status: result.status ?? -1,
            stderr: result.stderr,
          }),
        };
  }

  if (result.stdout.trim().length === 0) {
    return {
      error: makeStateReadError({
        context: "alchemy state get returned empty stdout.",
        fqn,
        stage: options.stage,
        status: result.status ?? -1,
        stderr: result.stderr,
      }),
    };
  }

  if (isMissingStateResult(result)) {
    return { missing: true };
  }

  try {
    return { value: JSON.parse(result.stdout) };
  } catch (error) {
    return {
      error: makeStateReadError({
        context: `alchemy state get returned malformed JSON: ${error instanceof Error ? error.message : String(error)}.`,
        fqn,
        stage: options.stage,
        status: result.status ?? -1,
        stderr: result.stderr,
      }),
    };
  }
}

function readResourceFromAlchemy(options, fqn) {
  const args = makeAlchemyStateGetArgs(
    {
      ...options,
      envFileExists: existsSync(resolve(repoRoot, options.envFile)),
    },
    fqn
  );

  const result = spawnSync("pnpm", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return parseAlchemyStateGetResult(options, fqn, result);
}

function readResourcesFromAlchemy(options) {
  const resources = {};
  const stateReadErrors = [];

  for (const fqn of knownResources) {
    const result = readResourceFromAlchemy(options, fqn);

    if (result?.value !== undefined) {
      resources[fqn] = result.value;
    }

    if (result?.error !== undefined) {
      stateReadErrors.push(result.error);
    }
  }

  return { resources, stateReadErrors };
}

function main() {
  let options;

  try {
    options = parseAlchemyStateAuditArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      process.exit(2);
    }

    throw error;
  }

  if (options.file === undefined && options.stage === undefined) {
    console.error("Pass --stage <stage> or --file <state-snapshot.json>.");
    process.exit(2);
  }

  const state =
    options.file === undefined
      ? readResourcesFromAlchemy(options)
      : { resources: readResourcesFromFile(options.file), stateReadErrors: [] };
  const report = analyzeAlchemyStateResources({
    allowedFindingCodes: options.allowedFindingCodes,
    productionStage: options.productionStage,
    resources: state.resources,
    stateReadErrors: state.stateReadErrors,
    stage: options.stage ?? "snapshot",
    tenantRoutingRequired: options.tenantRoutingRequired,
    zoneName: options.zoneName,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Alchemy state audit for ${report.stage}`);
    for (const item of report.checks) {
      console.log(`${item.status.toUpperCase()} ${item.name}: ${item.message}`);
    }
    for (const item of report.findings) {
      console.log(
        `${item.severity.toUpperCase()} ${item.code}: ${item.message}`
      );
    }
  }

  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
