import { decodePublicInvitationPreview } from "@task-tracker/identity-core";
import type { PublicInvitationPreview } from "@task-tracker/identity-core";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import {
  readConfiguredApiOrigin,
  readConfiguredServerApiOrigin,
  resolveApiOrigin,
} from "./api-origin";

export const API_BASE_PATH = "/api";
export const AUTH_BASE_PATH = "/api/auth";
const configuredApiOrigin = readConfiguredApiOrigin();

export class AuthClientConfigurationError extends Error {
  constructor(message = "Cannot resolve a trusted auth API origin.") {
    super(message);
    this.name = "AuthClientConfigurationError";
  }
}

export function resolveAuthBaseURL(
  origin?: string | undefined,
  explicitAuthOrigin?: string | undefined
): string | undefined {
  const apiOrigin = resolveApiOrigin(origin, explicitAuthOrigin);

  if (!apiOrigin) {
    return undefined;
  }

  return new URL(AUTH_BASE_PATH, apiOrigin).toString();
}

export function resolveConfiguredServerAuthBaseURL(): string | undefined {
  return resolveAuthBaseURL(undefined, readConfiguredServerApiOrigin());
}

export function resolveApiBaseURL(
  origin?: string | undefined,
  explicitAuthOrigin?: string | undefined
): string | undefined {
  const apiOrigin = resolveApiOrigin(origin, explicitAuthOrigin);

  if (!apiOrigin) {
    return undefined;
  }

  return new URL(API_BASE_PATH, apiOrigin).toString();
}

export function createTaskTrackerAuthClient(baseURL?: string | undefined) {
  return createAuthClient({
    basePath: AUTH_BASE_PATH,
    plugins: [organizationClient()],
    ...(baseURL ? { baseURL } : {}),
  });
}

function createUnavailableAuthClient(
  error: AuthClientConfigurationError
): ReturnType<typeof createTaskTrackerAuthClient> {
  const unavailable = new Proxy(
    function unavailableAuthClient() {
      return null;
    },
    {
      apply() {
        throw error;
      },
      get() {
        return unavailable;
      },
    }
  );

  return unavailable as unknown as ReturnType<
    typeof createTaskTrackerAuthClient
  >;
}

const defaultApiBaseURL =
  typeof window === "undefined"
    ? undefined
    : resolveApiBaseURL(window.location.origin, configuredApiOrigin);
export async function getPublicInvitationPreview(
  invitationId: string,
  baseURL = defaultApiBaseURL
): Promise<PublicInvitationPreview | null> {
  if (!baseURL) {
    return null;
  }

  const response = await fetch(
    new URL(
      `public/invitations/${encodeURIComponent(invitationId)}/preview`,
      `${baseURL}/`
    ),
    {
      headers: {
        accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();

  if (payload === null) {
    return null;
  }

  try {
    return decodePublicInvitationPreview(payload);
  } catch {
    return null;
  }
}

export function createBrowserTaskTrackerAuthClient(
  origin: string,
  explicitAuthOrigin?: string | undefined
) {
  const baseURL = resolveAuthBaseURL(origin, explicitAuthOrigin);

  if (!baseURL) {
    return createUnavailableAuthClient(
      new AuthClientConfigurationError(
        "Cannot resolve a trusted auth API origin for browser requests."
      )
    );
  }

  return createTaskTrackerAuthClient(baseURL);
}

export function buildPasswordResetRedirectTo(
  origin: string,
  invitationId?: string
): string {
  const url = new URL("/reset-password", origin);

  if (invitationId) {
    url.searchParams.set("invitation", invitationId);
  }

  return url.toString();
}

export function buildEmailVerificationRedirectTo(origin: string): string {
  const redirectURL = new URL("/verify-email", origin);
  redirectURL.searchParams.set("status", "success");

  return redirectURL.toString();
}

export const authClient =
  typeof window === "undefined"
    ? createTaskTrackerAuthClient()
    : createBrowserTaskTrackerAuthClient(
        window.location.origin,
        configuredApiOrigin
      );
