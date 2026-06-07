import { decodeOrganizationId, decodeUserId } from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { OrganizationAuthorization } from "./authorization.js";
import type { OrganizationActor } from "./current-actor.js";

const owner = {
  organizationId: decodeOrganizationId("org_123"),
  role: "owner",
  userId: decodeUserId("user_owner"),
} satisfies OrganizationActor;
const admin = {
  organizationId: decodeOrganizationId("org_123"),
  role: "admin",
  userId: decodeUserId("user_admin"),
} satisfies OrganizationActor;
const member = {
  organizationId: decodeOrganizationId("org_123"),
  role: "member",
  userId: decodeUserId("user_member"),
} satisfies OrganizationActor;
const external = {
  organizationId: decodeOrganizationId("org_123"),
  role: "external",
  userId: decodeUserId("user_external"),
} satisfies OrganizationActor;

describe("OrganizationAuthorization", () => {
  it("allows owners and admins to manage organization product surfaces", async () => {
    await expect(
      runOrganizationAuthorization(
        Effect.gen(function* () {
          const authorization = yield* OrganizationAuthorization;

          for (const actor of [owner, admin]) {
            yield* authorization.ensureCanCreateSite(actor);
            yield* authorization.ensureCanManageConfiguration(actor);
            yield* authorization.ensureCanManageLabels(actor);
            yield* authorization.ensureCanViewOrganizationData(actor);
            yield* authorization.ensureCanViewOrganizationSecurityActivity(
              actor
            );
          }
        })
      )
    ).resolves.toBeUndefined();
  });

  it("allows internal members to view organization data without granting elevated actions", async () => {
    const create = await runOrganizationAuthorizationExit(
      organizationAuthorizationCall((authorization) =>
        authorization.ensureCanCreateSite(member)
      )
    );
    const configure = await runOrganizationAuthorizationExit(
      organizationAuthorizationCall((authorization) =>
        authorization.ensureCanManageConfiguration(member)
      )
    );
    const labels = await runOrganizationAuthorizationExit(
      organizationAuthorizationCall((authorization) =>
        authorization.ensureCanManageLabels(member)
      )
    );
    const view = await runOrganizationAuthorizationExit(
      organizationAuthorizationCall((authorization) =>
        authorization.ensureCanViewOrganizationData(member)
      )
    );
    const securityActivity = await runOrganizationAuthorizationExit(
      organizationAuthorizationCall((authorization) =>
        authorization.ensureCanViewOrganizationSecurityActivity(member)
      )
    );

    expect(create._tag).toBe("Failure");
    expect(configure._tag).toBe("Failure");
    expect(labels._tag).toBe("Failure");
    expect(view._tag).toBe("Success");
    expect(securityActivity._tag).toBe("Failure");
  });

  it("denies external collaborators from organization-wide data and elevated actions", async () => {
    const create = await runOrganizationAuthorizationExit(
      organizationAuthorizationCall((authorization) =>
        authorization.ensureCanCreateSite(external)
      )
    );
    const configure = await runOrganizationAuthorizationExit(
      organizationAuthorizationCall((authorization) =>
        authorization.ensureCanManageConfiguration(external)
      )
    );
    const labels = await runOrganizationAuthorizationExit(
      organizationAuthorizationCall((authorization) =>
        authorization.ensureCanManageLabels(external)
      )
    );
    const view = await runOrganizationAuthorizationExit(
      organizationAuthorizationCall((authorization) =>
        authorization.ensureCanViewOrganizationData(external)
      )
    );

    expect(create._tag).toBe("Failure");
    expect(configure._tag).toBe("Failure");
    expect(labels._tag).toBe("Failure");
    expect(view._tag).toBe("Failure");
  });
});

function organizationAuthorizationCall<Value, Error>(
  call: (
    authorization: ContextService<typeof OrganizationAuthorization>
  ) => Effect.Effect<Value, Error>
) {
  return Effect.gen(function* () {
    const authorization = yield* OrganizationAuthorization;

    return yield* call(authorization);
  });
}

function runOrganizationAuthorization<Value, Error>(
  effect: Effect.Effect<Value, Error, OrganizationAuthorization>
) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(OrganizationAuthorization.Default))
  );
}

function runOrganizationAuthorizationExit<Value, Error>(
  effect: Effect.Effect<Value, Error, OrganizationAuthorization>
) {
  return Effect.runPromiseExit(
    effect.pipe(Effect.provide(OrganizationAuthorization.Default))
  );
}

type ContextService<Service> = Service extends {
  readonly Service: infer Shape;
}
  ? Shape
  : never;
