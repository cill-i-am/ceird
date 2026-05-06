"use client";

import { useMatch, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";

import { applySentryRouteContext } from "#/sentry-config";

export function SentryRouteContext() {
  const {
    activeOrganizationId: appActiveOrganizationId,
    currentOrganizationRole: appCurrentOrganizationRole,
    session,
  } = useRouteContext({
    from: "/_app",
  });
  const organizationMatch = useMatch({
    from: "/_app/_org",
    shouldThrow: false,
  });
  const activeOrganizationId =
    organizationMatch?.context.activeOrganizationId ?? appActiveOrganizationId;
  const currentOrganizationRole =
    organizationMatch?.context.currentOrganizationRole ??
    appCurrentOrganizationRole;
  const userId = session.user.id;

  useEffect(() => {
    let cancelled = false;

    if (typeof window === "undefined") {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      const Sentry = await import("@sentry/tanstackstart-react");

      if (cancelled) {
        return;
      }

      applySentryRouteContext(Sentry, {
        activeOrganizationId,
        currentOrganizationRole,
        userId,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId, currentOrganizationRole, userId]);

  return null;
}
