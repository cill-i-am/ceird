import { Briefcase01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useRouteContext } from "@tanstack/react-router";

import { AppPageHeader } from "#/components/app-page-header";
import {
  AppRowList,
  AppRowListBody,
  AppRowListItem,
  AppRowListLeading,
  AppRowListMeta,
} from "#/components/app-row-list";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";

export function AuthenticatedShellHome() {
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });

  return (
    <main
      aria-label="Workspace home"
      className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8"
    >
      <AppPageHeader
        eyebrow="Workspace"
        title={activeOrganization.name}
        actions={
          <Link to="/jobs" className={buttonVariants({ size: "sm" })}>
            <HugeiconsIcon
              icon={Briefcase01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Open jobs
          </Link>
        }
      />

      <section
        aria-labelledby="workspace-next-actions-heading"
        className="flex max-w-5xl flex-col gap-4"
      >
        <h2
          id="workspace-next-actions-heading"
          className="font-heading text-lg font-medium"
        >
          Next actions
        </h2>
        <AppRowList>
          <AppRowListItem>
            <AppRowListLeading aria-hidden="true">01</AppRowListLeading>
            <AppRowListBody title="Invite the first teammate" />
            <AppRowListMeta>
              <Badge variant="secondary">Members</Badge>
              <Link
                to="/members"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Open
              </Link>
            </AppRowListMeta>
          </AppRowListItem>
        </AppRowList>
      </section>
    </main>
  );
}
