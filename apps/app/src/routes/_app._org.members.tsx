import type {
  OrganizationId,
  OrganizationRole,
  UserId,
} from "@ceird/identity-core";
import {
  createFileRoute,
  useRouteContext,
  useRouter,
} from "@tanstack/react-router";

import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import { OrganizationMembersPage } from "#/features/organizations/organization-members-page";

export const Route = createFileRoute("/_app/_org/members")({
  staticData: {
    breadcrumb: {
      label: "Members",
      to: "/members",
    },
  },
  beforeLoad: ({ context }) => loadMembersRouteData(context),
  component: MembersRoute,
});

export function loadMembersRouteData(context: {
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  assertOrganizationAdministrationRouteContext(context);

  return {
    currentMemberRole: context.currentOrganizationRole,
  };
}

export function createOrganizationMembersPageProps({
  activeOrganizationId,
  currentMemberRole,
  currentUserId,
  onCurrentMemberAccessChanged,
  session,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly currentMemberRole?: OrganizationRole | undefined;
  readonly currentUserId?: UserId | undefined;
  readonly onCurrentMemberAccessChanged: () => void | Promise<void>;
  readonly session: {
    readonly user: {
      readonly email: string;
      readonly name: string;
    };
  };
}) {
  return {
    activeOrganizationId,
    currentMember: {
      email: session.user.email,
      name: session.user.name,
      role: currentMemberRole ?? "member",
    },
    currentUserId,
    onCurrentMemberAccessChanged,
  };
}

function MembersRoute() {
  const router = useRouter();
  const { activeOrganizationId, currentUserId } = useRouteContext({
    from: "/_app/_org",
  });
  const { session } = useRouteContext({ from: "/_app" });
  const { currentMemberRole } = Route.useRouteContext();

  return (
    <OrganizationMembersPage
      {...createOrganizationMembersPageProps({
        activeOrganizationId,
        currentMemberRole,
        currentUserId,
        onCurrentMemberAccessChanged: () => router.invalidate(),
        session,
      })}
    />
  );
}
