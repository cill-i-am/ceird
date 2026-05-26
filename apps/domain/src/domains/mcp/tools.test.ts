import type { Context } from "effect";
import { Effect, Layer, Stream } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { JobsService } from "../jobs/service.js";
import { LabelsService } from "../labels/service.js";
import { SitesService } from "../sites/service.js";
import {
  CeirdMcpToolkit,
  CeirdMcpToolkitLayer,
  hasRequiredScope,
  MCP_TOOL_DEFINITIONS,
  MCP_TOOL_REGISTRATIONS,
  McpToolDomainRuntime,
  McpToolRequestRuntime,
} from "./tools.js";

describe("mcp tools registry metadata", () => {
  it("registers exact unique tool names", () => {
    const names = MCP_TOOL_REGISTRATIONS.map((tool) => tool.name);

    expect(names).toStrictEqual([
      "ceird.labels.list",
      "ceird.sites.options",
      "ceird.jobs.list",
      "ceird.jobs.detail",
      "ceird.jobs.options",
      "ceird.jobs.activity.list",
      "ceird.jobs.add_comment",
      "ceird.jobs.assign_label",
      "ceird.jobs.remove_label",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("derives public registrations from the canonical tool definitions", () => {
    expect(MCP_TOOL_REGISTRATIONS).toStrictEqual(
      MCP_TOOL_DEFINITIONS.map(({ isAdminTool, name, requiredScope }) => ({
        isAdminTool,
        name,
        requiredScope,
      }))
    );
  });

  it("maps read write and admin scopes correctly", () => {
    const byName = new Map(
      MCP_TOOL_REGISTRATIONS.map((tool) => [tool.name, tool.requiredScope])
    );

    expect(byName.get("ceird.labels.list")).toBe("ceird:read");
    expect(byName.get("ceird.jobs.add_comment")).toBe("ceird:write");
    expect(byName.get("ceird.jobs.activity.list")).toBe("ceird:admin");
  });
});

describe("mcp scope enforcement", () => {
  it("allows admin scope for all tools", () => {
    expect(hasRequiredScope(["ceird:admin"], "ceird:read")).toBeTruthy();
    expect(hasRequiredScope(["ceird:admin"], "ceird:write")).toBeTruthy();
    expect(hasRequiredScope(["ceird:admin"], "ceird:admin")).toBeTruthy();
  });

  it("requires read for read tools and write for write tools", () => {
    expect(hasRequiredScope(["ceird:read"], "ceird:read")).toBeTruthy();
    expect(hasRequiredScope(["ceird:write"], "ceird:read")).toBeFalsy();
    expect(hasRequiredScope(["ceird:write"], "ceird:write")).toBeTruthy();
    expect(hasRequiredScope(["ceird:read"], "ceird:write")).toBeFalsy();
    expect(
      hasRequiredScope(["ceird:read", "ceird:write"], "ceird:write")
    ).toBeTruthy();
  });
});

describe("effect ai mcp toolkit", () => {
  it("exposes every registered tool through the Effect AI toolkit", () => {
    expect(Object.keys(CeirdMcpToolkit.tools)).toStrictEqual(
      MCP_TOOL_REGISTRATIONS.map((tool) => tool.name)
    );
  });

  it("runs an authorized tool through its typed domain service", async () => {
    let labelsCalled = false;

    const result = await runToolkitTool(
      "ceird.labels.list",
      {},
      {
        scopes: ["ceird:read"],
      },
      makeTestToolServicesLayer({
        labelsList: () => {
          labelsCalled = true;
          return Effect.succeed({ ok: true });
        },
      })
    );

    expect(labelsCalled).toBeTruthy();
    expect(result?.encodedResult).toStrictEqual({ ok: true });
  });
});

function runToolkitTool(
  name: keyof typeof CeirdMcpToolkit.tools,
  params: unknown,
  runtime: ContextRuntime,
  servicesLayer: Layer.Layer<JobsService | LabelsService | SitesService>
) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const toolkit = yield* CeirdMcpToolkit;
      const stream = yield* toolkit.handle(name, params as never);
      const results = yield* Stream.runCollect(stream);

      return [...results].at(-1);
    }).pipe(
      Effect.provide(CeirdMcpToolkitLayer),
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(
            McpToolDomainRuntime,
            McpToolDomainRuntime.of({
              run: (effect) => Effect.provide(effect, servicesLayer),
            })
          ),
          Layer.succeed(McpToolRequestRuntime, runtime as never),
          Layer.succeed(
            HttpServerRequest.HttpServerRequest,
            {} as HttpServerRequest.HttpServerRequest
          ),
          servicesLayer
        )
      )
    )
  );
}

interface ContextRuntime {
  readonly scopes: readonly string[];
}

function makeTestToolServicesLayer(options: {
  readonly labelsList?: () => Effect.Effect<unknown>;
}) {
  return Layer.mergeAll(
    Layer.succeed(
      LabelsService,
      LabelsService.of({
        list: options.labelsList ?? notImplementedToolService("Labels.list"),
      } as unknown as Context.Service.Shape<typeof LabelsService>)
    ),
    Layer.succeed(
      JobsService,
      JobsService.of({} as Context.Service.Shape<typeof JobsService>)
    ),
    Layer.succeed(
      SitesService,
      SitesService.of({} as Context.Service.Shape<typeof SitesService>)
    )
  );
}

function notImplementedToolService(name: string) {
  return () => Effect.die(new Error(`${name} should not be called`));
}
