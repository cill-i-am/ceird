import { isRedirect, redirect } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";

import { isServerEnvironment } from "../auth/runtime-environment";
import { getCurrentServerSession } from "../auth/server-session";
import { getCurrentServerOrganizations } from "./organization-server";

type Session = NonNullable<
  Awaited<ReturnType<typeof authClient.getSession>>["data"]
>;
type Organization = NonNullable<
  Awaited<ReturnType<typeof authClient.organization.list>>["data"]
>[number];

type OrganizationAccessState = {
  session: Session;
  organizations: Organization[];
  organizationId: string | null;
} | null;

async function getCurrentSession() {
  try {
    if (isServerEnvironment()) {
      return await getCurrentServerSession();
    }

    const session = await authClient.getSession();
    return session.data ?? null;
  } catch {
    return null;
  }
}

async function getCurrentOrganizations() {
  if (isServerEnvironment()) {
    return await getCurrentServerOrganizations();
  }

  const organizations = await authClient.organization.list();

  if (organizations.error) {
    throw organizations.error;
  }

  if (!organizations.data) {
    throw new Error("Organization lookup returned no data.");
  }

  return organizations.data;
}

async function getOrganizationAccessState(): Promise<OrganizationAccessState> {
  const session = await getCurrentSession();

  if (!session) {
    return null;
  }

  const activeOrganizationId = session.session.activeOrganizationId ?? null;

  if (activeOrganizationId) {
    return {
      session,
      organizations: [],
      organizationId: activeOrganizationId,
    };
  }

  const organizations = await getCurrentOrganizations();

  return {
    session,
    organizations,
    organizationId: organizations[0]?.id ?? null,
  };
}

export async function requireOrganizationAccess() {
  try {
    const access = await getOrganizationAccessState();

    if (!access) {
      throw redirect({ to: "/login" });
    }

    if (access.organizationId) {
      return access;
    }

    throw redirect({ to: "/create-organization" as never });
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    throw redirect({ to: "/login" });
  }
}

export async function redirectIfOrganizationReady() {
  try {
    const access = await getOrganizationAccessState();

    if (access?.organizationId) {
      throw redirect({ to: "/" });
    }
  } catch (error) {
    if (isRedirect(error)) {
      throw error;
    }

    throw redirect({ to: "/login" });
  }
}
