"use client";

import type * as SentryBrowser from "@sentry/tanstackstart-react";
import { useMatch, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";

import {
  applySentryRouteContext,
  clearSentryRouteContext,
} from "#/sentry-config";

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
    let sentry: typeof SentryBrowser | undefined;

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

      sentry = Sentry;
      applySentryRouteContext(Sentry, {
        activeOrganizationId,
        currentOrganizationRole,
        userId,
      });
    })();

    return () => {
      cancelled = true;
      if (sentry) {
        clearSentryRouteContext(sentry);
      }
    };
  }, [activeOrganizationId, currentOrganizationRole, userId]);

  return null;
}
