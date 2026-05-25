import {
  ORGANIZATION_ROLES,
  isAdministrativeOrganizationRole,
} from "@ceird/identity-core";
import type {
  IsoDateTimeString as IsoDateTimeStringType,
  OrganizationRole as OrganizationRoleType,
} from "@ceird/identity-core";
import {
  MoreHorizontalCircle01Icon,
  Refresh01Icon,
  UserRemove01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import {
  AppRowListActions,
  AppRowListBody,
  AppRowListItem,
  AppRowListLeading,
  AppRowListMeta,
} from "#/components/app-row-list";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "#/components/ui/responsive-dialog";

import {
  formatRoleLabel,
  getMemberDisplayName,
} from "./organization-member-display";
import type {
  InvitationAction,
  InvitationSummary,
  MemberAction,
  OrganizationMemberSummary,
} from "./organization-member-display";

const invitationExpiryFormatter = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

function formatInvitationExpiry(expiresAt: IsoDateTimeStringType) {
  return `Expires ${invitationExpiryFormatter.format(new Date(expiresAt))}`;
}

function getOrganizationMemberInitial(member: OrganizationMemberSummary) {
  return (member.name || member.email).trim().charAt(0).toUpperCase() || "U";
}

export function CurrentMemberRow({
  activeAction,
  actionsDisabled,
  currentViewerRole,
  errorMessage,
  isCurrentUser,
  member,
  ownerCount,
  onRemove,
  onRoleChange,
}: {
  readonly activeAction: MemberAction | null;
  readonly actionsDisabled: boolean;
  readonly currentViewerRole: OrganizationRoleType;
  readonly errorMessage?: string | undefined;
  readonly isCurrentUser: boolean;
  readonly member: OrganizationMemberSummary;
  readonly ownerCount: number;
  readonly onRemove: (member: OrganizationMemberSummary) => Promise<void>;
  readonly onRoleChange: (
    member: OrganizationMemberSummary,
    role: OrganizationRoleType
  ) => Promise<void>;
}) {
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = React.useState(false);
  const displayName = getMemberDisplayName(member);
  const roleOptions = getManageableRoleOptions({
    currentViewerRole,
    isCurrentUser,
    member,
    ownerCount,
  });
  const canRemove = canRemoveMember({
    currentViewerRole,
    isCurrentUser,
    member,
    ownerCount,
  });
  const hasActions = roleOptions.length > 0 || canRemove;
  const isPending = activeAction?.memberId === member.id;

  return (
    <AppRowListItem>
      <AppRowListLeading aria-hidden="true">
        {getOrganizationMemberInitial(member)}
      </AppRowListLeading>
      <AppRowListBody
        title={displayName}
        description={member.email}
        descriptionClassName="break-all"
      >
        {errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
      </AppRowListBody>
      <AppRowListMeta>
        <Badge variant="secondary">{formatRoleLabel(member.role)}</Badge>
        {isCurrentUser ? <Badge variant="outline">You</Badge> : null}
      </AppRowListMeta>
      {hasActions ? (
        <AppRowListActions>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  loading={isPending}
                  disabled={actionsDisabled}
                  aria-label={`Member actions for ${displayName}`}
                />
              }
            >
              <HugeiconsIcon
                icon={MoreHorizontalCircle01Icon}
                strokeWidth={2}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {roleOptions.length > 0 ? (
                <DropdownMenuGroup>
                  {roleOptions.map((role) => (
                    <DropdownMenuItem
                      key={role}
                      onClick={() => {
                        void onRoleChange(member, role);
                      }}
                    >
                      <span>Make {formatRoleLabel(role).toLowerCase()}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              ) : null}
              {roleOptions.length > 0 && canRemove ? (
                <DropdownMenuSeparator />
              ) : null}
              {canRemove ? (
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setIsRemoveDialogOpen(true);
                    }}
                  >
                    <HugeiconsIcon
                      icon={UserRemove01Icon}
                      strokeWidth={2}
                      className="text-muted-foreground"
                    />
                    <span>Remove member</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <ResponsiveDialog
            open={isRemoveDialogOpen}
            onOpenChange={setIsRemoveDialogOpen}
          >
            <ResponsiveDialogContent>
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle>
                  Remove {displayName}?
                </ResponsiveDialogTitle>
                <ResponsiveDialogDescription>
                  They will lose access to this organization.
                </ResponsiveDialogDescription>
              </ResponsiveDialogHeader>
              <ResponsiveDialogFooter>
                <ResponsiveDialogClose render={<Button variant="outline" />}>
                  Cancel
                </ResponsiveDialogClose>
                <Button
                  type="button"
                  variant="destructive"
                  loading={isPending}
                  disabled={actionsDisabled}
                  onClick={() => {
                    setIsRemoveDialogOpen(false);
                    void onRemove(member);
                  }}
                >
                  Remove member
                </Button>
              </ResponsiveDialogFooter>
            </ResponsiveDialogContent>
          </ResponsiveDialog>
        </AppRowListActions>
      ) : null}
    </AppRowListItem>
  );
}

export function PendingInvitationRow({
  activeAction,
  actionsDisabled,
  invitation,
  onInvitationAction,
}: {
  readonly activeAction: {
    readonly invitationId: string;
    readonly type: InvitationAction;
  } | null;
  readonly actionsDisabled: boolean;
  readonly invitation: InvitationSummary;
  readonly onInvitationAction: (
    invitation: InvitationSummary,
    action: InvitationAction
  ) => Promise<void>;
}) {
  const isResending =
    activeAction?.invitationId === invitation.id &&
    activeAction.type === "resend";
  const isCanceling =
    activeAction?.invitationId === invitation.id &&
    activeAction.type === "cancel";
  const isPending = isResending || isCanceling;

  return (
    <AppRowListItem>
      <AppRowListLeading aria-hidden="true">
        {invitation.email.charAt(0).toUpperCase()}
      </AppRowListLeading>
      <AppRowListBody
        title={<span title={invitation.email}>{invitation.email}</span>}
        titleClassName="break-all"
        truncateTitle={false}
        description="Awaiting acceptance from the invited teammate."
      >
        <p className="text-sm/6 text-muted-foreground">
          {formatInvitationExpiry(invitation.expiresAt)}
        </p>
      </AppRowListBody>
      <AppRowListMeta>
        <Badge variant="secondary">{formatRoleLabel(invitation.role)}</Badge>
        <Badge variant="outline">{formatRoleLabel(invitation.status)}</Badge>
      </AppRowListMeta>
      <AppRowListActions>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                loading={isPending}
                disabled={actionsDisabled}
                aria-label={`Invitation actions for ${invitation.email}`}
              />
            }
          >
            <HugeiconsIcon icon={MoreHorizontalCircle01Icon} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={actionsDisabled}
              onClick={() => {
                void onInvitationAction(invitation, "resend");
              }}
            >
              <HugeiconsIcon
                icon={Refresh01Icon}
                strokeWidth={2}
                className="text-muted-foreground"
              />
              <span>Resend invitation</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={actionsDisabled}
              variant="destructive"
              onClick={() => {
                void onInvitationAction(invitation, "cancel");
              }}
            >
              <HugeiconsIcon
                icon={UserRemove01Icon}
                strokeWidth={2}
                className="text-muted-foreground"
              />
              <span>Cancel invitation</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </AppRowListActions>
    </AppRowListItem>
  );
}

function getManageableRoleOptions({
  currentViewerRole,
  isCurrentUser,
  member,
  ownerCount,
}: {
  readonly currentViewerRole: OrganizationRoleType;
  readonly isCurrentUser: boolean;
  readonly member: OrganizationMemberSummary;
  readonly ownerCount: number;
}) {
  if (isCurrentUser) {
    return [];
  }

  if (!isAdministrativeOrganizationRole(currentViewerRole)) {
    return [];
  }

  if (currentViewerRole === "admin" && member.role === "owner") {
    return [];
  }

  const availableRoles =
    currentViewerRole === "owner"
      ? ORGANIZATION_ROLES
      : ORGANIZATION_ROLES.filter((role) => role !== "owner");

  return availableRoles.filter((role) => {
    if (role === member.role) {
      return false;
    }

    if (member.role === "owner" && ownerCount <= 1 && role !== "owner") {
      return false;
    }

    return true;
  });
}

function canRemoveMember({
  currentViewerRole,
  isCurrentUser,
  member,
  ownerCount,
}: {
  readonly currentViewerRole: OrganizationRoleType;
  readonly isCurrentUser: boolean;
  readonly member: OrganizationMemberSummary;
  readonly ownerCount: number;
}) {
  if (isCurrentUser) {
    return false;
  }

  if (member.role === "owner") {
    return currentViewerRole === "owner" && ownerCount > 1;
  }

  return isAdministrativeOrganizationRole(currentViewerRole);
}
