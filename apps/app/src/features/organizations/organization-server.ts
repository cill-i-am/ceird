import {
  decodeCreateOrganizationNameInput,
  decodeOrganizationId,
} from "@ceird/identity-core";
import type {
  CreateOrganizationNameInput,
  OrganizationId as OrganizationIdType,
} from "@ceird/identity-core";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";

import {
  organizationFunctionMiddleware,
  requiredAuthFunctionMiddleware,
} from "../auth/app-context-middleware";

export const createCurrentServerOrganization = createServerFn({
  method: "POST",
})
  .middleware([requiredAuthFunctionMiddleware])
  .validator((input: unknown) => decodeCreateOrganizationNameInput(input))
  .handler(async ({ data }) => {
    const { createCurrentServerOrganizationDirect } =
      await import("./organization-server-impl.server");

    return await createCurrentServerOrganizationDirect(
      data satisfies CreateOrganizationNameInput
    );
  });

export const getCurrentServerOrganizationSession = createServerOnlyFn(
  async () => {
    const { getCurrentServerOrganizationSessionDirect } =
      await import("./organization-server-impl.server");

    return await getCurrentServerOrganizationSessionDirect();
  }
);

export const getCurrentServerOrganizations = createServerOnlyFn(async () => {
  const { getCurrentServerOrganizationsDirect } =
    await import("./organization-server-impl.server");

  return await getCurrentServerOrganizationsDirect();
});

export const getCurrentServerOrganizationMemberRole = createServerOnlyFn(
  async (organizationId: OrganizationIdType) => {
    const { getCurrentServerOrganizationMemberRoleDirect } =
      await import("./organization-server-impl.server");

    return await getCurrentServerOrganizationMemberRoleDirect(
      decodeOrganizationId(organizationId)
    );
  }
);

const setCurrentServerActiveOrganizationFn = createServerFn({
  method: "POST",
})
  .middleware([organizationFunctionMiddleware])
  .validator((input: unknown) => decodeOrganizationId(input))
  .handler(async ({ data }) => {
    const { setCurrentServerActiveOrganizationDirect } =
      await import("./organization-server-impl.server");

    return await setCurrentServerActiveOrganizationDirect(
      decodeOrganizationId(data)
    );
  });

export async function setCurrentServerActiveOrganization(
  organizationId: OrganizationIdType
) {
  return await setCurrentServerActiveOrganizationFn({
    data: organizationId,
  });
}
