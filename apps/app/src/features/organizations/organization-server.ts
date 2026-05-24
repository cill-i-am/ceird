import {
  decodeCreateOrganizationNameInput,
  decodeOrganizationId,
} from "@ceird/identity-core";
import type {
  CreateOrganizationNameInput,
  OrganizationId as OrganizationIdType,
} from "@ceird/identity-core";
import { createServerFn } from "@tanstack/react-start";

import {
  organizationFunctionMiddleware,
  requiredAuthFunctionMiddleware,
} from "../auth/app-context-middleware";

export const createCurrentServerOrganization = createServerFn({
  method: "POST",
})
  .middleware([requiredAuthFunctionMiddleware])
  .inputValidator((input: unknown) => decodeCreateOrganizationNameInput(input))
  .handler(async ({ data }) => {
    const { createCurrentServerOrganizationDirect } =
      await import("./organization-server-impl.server");

    return await createCurrentServerOrganizationDirect(
      data satisfies CreateOrganizationNameInput
    );
  });

const getCurrentServerOrganizationSessionFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { getCurrentServerOrganizationSessionDirect } =
    await import("./organization-server-impl.server");

  return await getCurrentServerOrganizationSessionDirect();
});

export async function getCurrentServerOrganizationSession() {
  return await getCurrentServerOrganizationSessionFn();
}

const getCurrentServerOrganizationsFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { getCurrentServerOrganizationsDirect } =
    await import("./organization-server-impl.server");

  return await getCurrentServerOrganizationsDirect();
});

export async function getCurrentServerOrganizations() {
  return await getCurrentServerOrganizationsFn();
}

const getCurrentServerOrganizationMemberRoleFn = createServerFn({
  method: "GET",
})
  .inputValidator((input: unknown) => decodeOrganizationId(input))
  .handler(async ({ data }) => {
    const { getCurrentServerOrganizationMemberRoleDirect } =
      await import("./organization-server-impl.server");
    const organizationId = decodeOrganizationId(String(data));

    return await getCurrentServerOrganizationMemberRoleDirect(organizationId);
  });

export async function getCurrentServerOrganizationMemberRole(
  organizationId: OrganizationIdType
) {
  return await getCurrentServerOrganizationMemberRoleFn({
    data: organizationId,
  });
}

const setCurrentServerActiveOrganizationFn = createServerFn({
  method: "POST",
})
  .middleware([organizationFunctionMiddleware])
  .inputValidator((input: unknown) => decodeOrganizationId(input))
  .handler(async ({ data }) => {
    const { setCurrentServerActiveOrganizationDirect } =
      await import("./organization-server-impl.server");
    const organizationId = decodeOrganizationId(String(data));

    return await setCurrentServerActiveOrganizationDirect(organizationId);
  });

export async function setCurrentServerActiveOrganization(
  organizationId: OrganizationIdType
) {
  return await setCurrentServerActiveOrganizationFn({
    data: organizationId,
  });
}
