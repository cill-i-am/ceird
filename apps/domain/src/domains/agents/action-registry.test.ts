import { AGENT_EXECUTABLE_ACTION_NAMES } from "@ceird/agents-core";
import { OrganizationId, UserId } from "@ceird/identity-core";
import type { CreateSiteInput } from "@ceird/sites-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import type { OrganizationActor } from "../organizations/current-actor.js";
import type { ResolveCreateSiteLocationOptions } from "../sites/location-resolution.js";
import { SitesService } from "../sites/service.js";
import {
  getDomainAgentActionHandler,
  getDomainAgentActionHandlerNames,
} from "./action-registry.js";

const actor = {
  organizationId: Schema.decodeUnknownSync(OrganizationId)("org_123"),
  role: "admin",
  userId: Schema.decodeUnknownSync(UserId)("user_admin"),
} satisfies OrganizationActor;

describe("agent domain action registry", () => {
  it("registers the narrowed sites, jobs, labels, and collaborator actions", () => {
    expect([...getDomainAgentActionHandlerNames()].toSorted()).toStrictEqual(
      [...AGENT_EXECUTABLE_ACTION_NAMES].toSorted()
    );
  });

  it("normalizes the site Eircode shortcut and requests Google-first resolution", async () => {
    const handler = getDomainAgentActionHandler("ceird.sites.create");

    expect(handler).toBeDefined();
    if (handler === undefined) {
      throw new Error("ceird.sites.create handler is not registered");
    }
    let createInput: CreateSiteInput | undefined;
    let createOptions: ResolveCreateSiteLocationOptions | undefined;
    const sitesServiceStub = SitesService.of({
      create: (
        input: CreateSiteInput,
        options: ResolveCreateSiteLocationOptions = {}
      ) => {
        createInput = input;
        createOptions = options;
        return Effect.succeed({ ok: true });
      },
    } as unknown as Parameters<typeof SitesService.of>[0]);
    const effect = handler.execute(actor, {
      eircode: "  V31R968  ",
      name: "  Listowel Yard  ",
    }) as Effect.Effect<unknown, unknown, SitesService>;

    const result = await Effect.runPromise(
      effect.pipe(Effect.provide(Layer.succeed(SitesService, sitesServiceStub)))
    );

    expect(result).toStrictEqual({ ok: true });
    expect(createInput).toStrictEqual({
      location: {
        country: "IE",
        kind: "manual",
        rawInput: "V31R968",
      },
      name: "Listowel Yard",
    });
    expect(createOptions).toStrictEqual({
      manualLocationResolution: "google-first",
    });
  });
});
