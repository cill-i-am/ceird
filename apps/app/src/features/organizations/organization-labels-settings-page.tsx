import { isAdministrativeOrganizationRole } from "@ceird/identity-core";
import type {
  OrganizationRole,
  OrganizationSummary,
} from "@ceird/identity-core";
import {
  ArrowRight,
  CheckCircle2,
  RadioTower,
  ShieldAlert,
} from "lucide-react";
import type * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { buttonVariants } from "#/components/ui/button";

type LabelsSettingsShellState =
  | "loading"
  | "empty"
  | "unavailable"
  | "permission-aware";

export interface OrganizationLabelsSettingsPageProps {
  readonly organization: OrganizationSummary;
  readonly organizationRole?: OrganizationRole | undefined;
  readonly state?: LabelsSettingsShellState;
}

export function OrganizationLabelsSettingsPage({
  organization,
  organizationRole,
  state = "permission-aware",
}: OrganizationLabelsSettingsPageProps) {
  const canManageLabels =
    organizationRole !== undefined &&
    isAdministrativeOrganizationRole(organizationRole);
  const shellState = canManageLabels ? state : "permission-aware";

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <AppPageHeader
        eyebrow={organization.name}
        title="Labels"
        description="Manage the organization label definitions that will sync across realtime product surfaces."
        className="border-b-0 pb-0"
        actions={
          <a className={buttonVariants()} href="/organization/settings">
            General settings
            <ArrowRight aria-hidden="true" />
          </a>
        }
      />

      <div className="flex max-w-5xl flex-col gap-5">
        <AppUtilityPanel
          id="organization-labels-realtime-shell"
          title="Realtime labels"
          description="This dedicated surface is ready for the Electric-backed label collection and mutation confirmation flows."
        >
          <LabelsShellStateView state={shellState} />
        </AppUtilityPanel>
      </div>
    </main>
  );
}

function LabelsShellStateView({
  state,
}: {
  readonly state: LabelsSettingsShellState;
}) {
  switch (state) {
    case "loading": {
      return (
        <div
          className="grid gap-3 rounded-lg border border-border/60 p-4"
          aria-busy="true"
        >
          <div className="h-4 w-36 rounded bg-muted" />
          <div className="h-3 w-full max-w-lg rounded bg-muted/70" />
          <div className="h-3 w-4/5 max-w-md rounded bg-muted/70" />
        </div>
      );
    }
    case "empty": {
      return (
        <ShellNotice
          icon={<CheckCircle2 aria-hidden="true" />}
          title="No labels yet"
          description="The first synced label list can render here without inheriting the old settings-panel state."
        />
      );
    }
    case "unavailable": {
      return (
        <ShellNotice
          icon={<RadioTower aria-hidden="true" />}
          title="Realtime labels unavailable"
          description="When the Electric collection cannot connect, this route will show a clear recovery state instead of silently falling back to the old panel."
        />
      );
    }
    case "permission-aware": {
      return (
        <ShellNotice
          icon={<ShieldAlert aria-hidden="true" />}
          title="Admin label management"
          description="Owners and admins can reach the new label-management entry point. Member-facing access stays guarded until realtime label management is ready for them."
        />
      );
    }
    default: {
      state satisfies never;
      return null;
    }
  }
}

function ShellNotice({
  icon,
  title,
  description,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-start">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="max-w-[64ch] text-sm/6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
