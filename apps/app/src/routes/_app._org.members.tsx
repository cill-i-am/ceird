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

import { OrganizationMembersPage } from "#/features/organizations/organization-members-page";
import {
  assertOrganizationAdministrationRole,
  requireOrganizationRouteContextRole,
} from "#/features/organizations/organization-route-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-route-access";

export const Route = createFileRoute("/_app/_org/members")({
  staticData: {
    breadcrumb: {
      label: "Members",
      to: "/members",
    },
  },
  codeSplitGroupings: [["component"]],
  beforeLoad: ({ context }) => loadMembersRouteData(context),
  component: MembersRoute,
});

export function loadMembersRouteData(context: {
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  if (context.activeOrganizationSync.required) {
    return {
      currentMemberRole: null,
    };
  }

  const currentMemberRole = requireOrganizationRouteContextRole(context);
  assertOrganizationAdministrationRole({ role: currentMemberRole });

  return {
    currentMemberRole,
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
  readonly currentMemberRole: OrganizationRole;
  readonly currentUserId: UserId;
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
      role: currentMemberRole,
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

  if (currentMemberRole === null) {
    return null;
  }

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
