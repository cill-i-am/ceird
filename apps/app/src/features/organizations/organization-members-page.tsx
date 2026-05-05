import {
  INVITABLE_ORGANIZATION_ROLES,
  InvitableOrganizationRole,
  IsoDateTimeString,
  ORGANIZATION_ROLES,
  OrganizationRole,
  decodeOrganizationRole,
} from "@ceird/identity-core";
import type {
  InvitableOrganizationRole as InvitableOrganizationRoleType,
  IsoDateTimeString as IsoDateTimeStringType,
  OrganizationId,
  OrganizationRole as OrganizationRoleType,
  UserId,
} from "@ceird/identity-core";
import {
  MoreHorizontalCircle01Icon,
  UserRemove01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { ParseResult, Schema } from "effect";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import {
  AppRowList,
  AppRowListActions,
  AppRowListItem,
  AppRowListLeading,
  AppRowListMeta,
} from "#/components/app-row-list";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { DotMatrixLoadingState } from "#/components/ui/dot-matrix-loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { getErrorText } from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { authClient } from "#/lib/auth-client";

import {
  decodeOrganizationMemberInviteInput,
  organizationMemberInviteSchema,
} from "./organization-member-invite-schemas";
import type { OrganizationMemberInviteInput } from "./organization-member-invite-schemas";
import { decodeOrganizationViewerUserId } from "./organization-viewer";

interface InvitationSummary {
  readonly email: string;
  readonly expiresAt: IsoDateTimeStringType;
  readonly id: string;
  readonly role: InvitableOrganizationRoleType;
  readonly status: string;
}

interface CurrentMemberSummary {
  readonly email: string;
  readonly name: string;
  readonly role: OrganizationRoleType;
}

interface OrganizationMemberSummary {
  readonly email: string;
  readonly id: string;
  readonly name: string;
  readonly role: OrganizationRoleType;
  readonly userId: UserId;
}

const DEFAULT_INVITE_VALUES: OrganizationMemberInviteInput = {
  email: "",
  role: "member",
};
const FALLBACK_CURRENT_USER_ID = decodeOrganizationViewerUserId("current-user");
const INVITE_FAILURE_MESSAGE =
  "We couldn't send that invitation. Please check the details and try again.";
const MEMBERS_PAGE_SIZE = 100;
const INVITATION_LOAD_FAILURE_MESSAGE =
  "We couldn't load invitations right now. Please try again.";
const INVITATION_ACTION_FAILURE_MESSAGE =
  "We couldn't update that invitation. Please try again.";
const MEMBER_LOAD_FAILURE_MESSAGE =
  "We couldn't load members right now. Please try again.";
const INVITE_ROLE_LABELS = {
  admin: "Admin",
  external: "External collaborator",
  member: "Member",
} satisfies Record<OrganizationMemberInviteInput["role"], string>;
const MEMBER_ROLE_LABELS = {
  admin: "Admin",
  external: "External",
  member: "Member",
  owner: "Owner",
} satisfies Record<OrganizationRoleType, string>;
const ROLE_SELECTION_GROUPS = [
  {
    label: "Role",
    options: INVITABLE_ORGANIZATION_ROLES.map((role) => ({
      label: INVITE_ROLE_LABELS[role],
      value: role,
    })),
  },
] satisfies readonly CommandSelectGroup[];
const isInviteRole = Schema.is(InvitableOrganizationRole);
const isOrganizationRole = Schema.is(OrganizationRole);
const invitationExpiryFormatter = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

type InvitationAction = "cancel" | "resend";
type MemberAction =
  | {
      readonly memberId: string;
      readonly type: "remove";
    }
  | {
      readonly memberId: string;
      readonly role: OrganizationRoleType;
      readonly type: "role";
    };

function formatRoleLabel(role: OrganizationRoleType | string) {
  if (isOrganizationRole(role)) {
    return MEMBER_ROLE_LABELS[role];
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatInvitationCount(count: number) {
  return count === 1 ? "1 open" : `${count} open`;
}

function formatInvitationExpiry(expiresAt: IsoDateTimeStringType) {
  return `Expires ${invitationExpiryFormatter.format(new Date(expiresAt))}`;
}

function getOrganizationMemberInitial(member: OrganizationMemberSummary) {
  return (member.name || member.email).trim().charAt(0).toUpperCase() || "U";
}

function getMemberDisplayName(member: OrganizationMemberSummary) {
  return member.name || member.email;
}

function formatMemberCount(count: number) {
  return count === 1 ? "1 active" : `${count} active`;
}

export function OrganizationMembersPage({
  activeOrganizationId,
  currentMember = {
    email: "You",
    name: "You",
    role: "member",
  },
  currentUserId,
  onCurrentMemberAccessChanged,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly currentMember?: CurrentMemberSummary;
  readonly currentUserId?: UserId | undefined;
  readonly onCurrentMemberAccessChanged?:
    | (() => void | Promise<void>)
    | undefined;
}) {
  const isHydrated = useIsHydrated();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<
    readonly OrganizationMemberSummary[]
  >([]);
  const [memberTotal, setMemberTotal] = React.useState<number | null>(null);
  const [memberLoadErrorMessage, setMemberLoadErrorMessage] = React.useState<
    string | null
  >(null);
  const [memberActionErrors, setMemberActionErrors] = React.useState<
    Readonly<Record<string, string>>
  >({});
  const [memberActionSuccessMessage, setMemberActionSuccessMessage] =
    React.useState<string | null>(null);
  const [activeMemberAction, setActiveMemberAction] =
    React.useState<MemberAction | null>(null);
  const [isLoadingMembers, setIsLoadingMembers] = React.useState(false);
  const [invitations, setInvitations] = React.useState<
    readonly InvitationSummary[]
  >([]);
  const [loadErrorMessage, setLoadErrorMessage] = React.useState<string | null>(
    null
  );
  const [invitationActionErrorMessage, setInvitationActionErrorMessage] =
    React.useState<string | null>(null);
  const [invitationActionSuccessMessage, setInvitationActionSuccessMessage] =
    React.useState<string | null>(null);
  const [activeInvitationAction, setActiveInvitationAction] = React.useState<{
    readonly invitationId: string;
    readonly type: InvitationAction;
  } | null>(null);
  const [isLoadingInvitations, setIsLoadingInvitations] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null
  );
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const latestActiveOrganizationId = React.useRef(activeOrganizationId);
  const memberRequestSequence = React.useRef(0);
  const membersOrganizationId = React.useRef(activeOrganizationId);
  const invitationRequestSequence = React.useRef(0);
  const invitationsOrganizationId = React.useRef(activeOrganizationId);
  const roleSelectTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [roleSelectOpen, setRoleSelectOpen] = React.useState(false);
  latestActiveOrganizationId.current = activeOrganizationId;

  const isLatestActiveOrganization = React.useCallback(
    (organizationId: OrganizationId) =>
      latestActiveOrganizationId.current === organizationId,
    []
  );

  const loadMembers = React.useCallback(async () => {
    if (!isLatestActiveOrganization(activeOrganizationId)) {
      return;
    }

    memberRequestSequence.current += 1;
    const requestSequence = memberRequestSequence.current;

    if (membersOrganizationId.current !== activeOrganizationId) {
      membersOrganizationId.current = activeOrganizationId;
      setMembers([]);
      setMemberTotal(null);
    }

    setMemberLoadErrorMessage(null);
    setIsLoadingMembers(true);

    try {
      const loadedMembers: OrganizationMemberSummary[] = [];
      let memberCount = 0;

      while (true) {
        const result = await authClient.organization.listMembers({
          query: {
            limit: MEMBERS_PAGE_SIZE,
            offset: loadedMembers.length,
            organizationId: activeOrganizationId,
          },
        });

        if (
          requestSequence !== memberRequestSequence.current ||
          !isLatestActiveOrganization(activeOrganizationId)
        ) {
          return;
        }

        if (result.error || !result.data) {
          setMemberLoadErrorMessage(MEMBER_LOAD_FAILURE_MESSAGE);
          return;
        }

        memberCount = result.data.total;
        loadedMembers.push(...result.data.members.map(toOrganizationMember));

        if (
          loadedMembers.length >= result.data.total ||
          result.data.members.length < MEMBERS_PAGE_SIZE
        ) {
          break;
        }
      }

      setMembers(loadedMembers);
      setMemberTotal(memberCount);
    } catch {
      if (
        requestSequence !== memberRequestSequence.current ||
        !isLatestActiveOrganization(activeOrganizationId)
      ) {
        return;
      }
      setMemberLoadErrorMessage(MEMBER_LOAD_FAILURE_MESSAGE);
    } finally {
      if (
        requestSequence === memberRequestSequence.current &&
        isLatestActiveOrganization(activeOrganizationId)
      ) {
        setIsLoadingMembers(false);
      }
    }
  }, [activeOrganizationId, isLatestActiveOrganization]);

  const loadInvitations = React.useCallback(async () => {
    if (!isLatestActiveOrganization(activeOrganizationId)) {
      return;
    }

    invitationRequestSequence.current += 1;
    const requestSequence = invitationRequestSequence.current;

    if (invitationsOrganizationId.current !== activeOrganizationId) {
      invitationsOrganizationId.current = activeOrganizationId;
      setInvitations([]);
    }

    setLoadErrorMessage(null);
    setIsLoadingInvitations(true);

    try {
      const result = await authClient.organization.listInvitations({
        query: {
          organizationId: activeOrganizationId,
        },
      });

      if (
        requestSequence !== invitationRequestSequence.current ||
        !isLatestActiveOrganization(activeOrganizationId)
      ) {
        return;
      }

      if (result.error || !result.data) {
        setLoadErrorMessage(INVITATION_LOAD_FAILURE_MESSAGE);
        return;
      }

      setInvitations(result.data.filter(isPendingInvitation).map(toInvitation));
    } catch {
      if (
        requestSequence !== invitationRequestSequence.current ||
        !isLatestActiveOrganization(activeOrganizationId)
      ) {
        return;
      }
      setLoadErrorMessage(INVITATION_LOAD_FAILURE_MESSAGE);
    } finally {
      if (
        requestSequence === invitationRequestSequence.current &&
        isLatestActiveOrganization(activeOrganizationId)
      ) {
        setIsLoadingInvitations(false);
      }
    }
  }, [activeOrganizationId, isLatestActiveOrganization]);

  React.useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  React.useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  React.useEffect(() => {
    setActiveMemberAction(null);
    setMemberActionErrors({});
    setMemberActionSuccessMessage(null);
    setMemberTotal(null);
  }, [activeOrganizationId]);

  const form = useForm({
    defaultValues: DEFAULT_INVITE_VALUES,
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationMemberInviteSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });
      setErrorMessage(null);
      setMemberActionErrors({});
      setMemberActionSuccessMessage(null);
      setInvitationActionErrorMessage(null);
      setInvitationActionSuccessMessage(null);
      setSuccessMessage(null);

      const invite = decodeOrganizationMemberInviteInput(value);
      const result = await authClient.organization.inviteMember({
        email: invite.email,
        organizationId: activeOrganizationId,
        role: invite.role,
      });

      if (result.error) {
        setErrorMessage(INVITE_FAILURE_MESSAGE);
        return;
      }

      formApi.reset();
      setSuccessMessage(`Invitation sent to ${invite.email}.`);
      await loadInvitations();
    },
  });

  const handleInvitationAction = React.useCallback(
    async (invitation: InvitationSummary, action: InvitationAction) => {
      setActiveInvitationAction({
        invitationId: invitation.id,
        type: action,
      });
      setErrorMessage(null);
      setMemberActionErrors({});
      setMemberActionSuccessMessage(null);
      setInvitationActionErrorMessage(null);
      setInvitationActionSuccessMessage(null);
      setSuccessMessage(null);

      try {
        const result =
          action === "resend"
            ? await authClient.organization.inviteMember({
                email: invitation.email,
                organizationId: activeOrganizationId,
                resend: true,
                role: invitation.role,
              })
            : await authClient.organization.cancelInvitation({
                invitationId: invitation.id,
              });

        if (result.error) {
          setInvitationActionErrorMessage(INVITATION_ACTION_FAILURE_MESSAGE);
          return;
        }

        if (action === "cancel") {
          setInvitations((current) =>
            current.filter((item) => item.id !== invitation.id)
          );
        }

        setInvitationActionSuccessMessage(
          action === "resend"
            ? `Invitation resent to ${invitation.email}.`
            : `Invitation canceled for ${invitation.email}.`
        );
      } catch {
        setInvitationActionErrorMessage(INVITATION_ACTION_FAILURE_MESSAGE);
      } finally {
        setActiveInvitationAction(null);
      }
    },
    [activeOrganizationId]
  );

  const currentViewerRole = resolveCurrentViewerRole({
    currentMember,
    currentUserId,
    members,
  });
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const displayedMembers =
    members.length > 0
      ? members
      : [toCurrentOrganizationMember(currentMember, currentUserId)];
  const displayedMemberCount = memberTotal ?? displayedMembers.length;

  const handleMemberRoleChange = React.useCallback(
    async (member: OrganizationMemberSummary, role: OrganizationRoleType) => {
      const actionOrganizationId = activeOrganizationId;
      const displayName = getMemberDisplayName(member);

      setActiveMemberAction({
        memberId: member.id,
        role,
        type: "role",
      });
      setMemberActionErrors((current) => omitRecordKey(current, member.id));
      setMemberActionSuccessMessage(null);
      setErrorMessage(null);
      setInvitationActionErrorMessage(null);
      setInvitationActionSuccessMessage(null);
      setSuccessMessage(null);

      try {
        const result = await authClient.organization.updateMemberRole({
          memberId: member.id,
          organizationId: actionOrganizationId,
          role,
        });

        if (!isLatestActiveOrganization(actionOrganizationId)) {
          return;
        }

        if (result.error || !result.data) {
          setMemberActionErrors((current) => ({
            ...current,
            [member.id]: `We couldn't update ${displayName}'s role.`,
          }));
          return;
        }

        const updatedRole = decodeOrganizationRole(result.data.role);

        setMembers((current) =>
          current.map((listedMember) =>
            listedMember.id === member.id
              ? {
                  ...listedMember,
                  role: updatedRole,
                }
              : listedMember
          )
        );
        setMemberActionSuccessMessage(
          `${displayName} is now ${formatRoleLabel(updatedRole)}.`
        );
        await loadMembers();

        if (!isLatestActiveOrganization(actionOrganizationId)) {
          return;
        }

        if (currentUserId !== undefined && member.userId === currentUserId) {
          await onCurrentMemberAccessChanged?.();
        }
      } catch {
        if (!isLatestActiveOrganization(actionOrganizationId)) {
          return;
        }

        setMemberActionErrors((current) => ({
          ...current,
          [member.id]: `We couldn't update ${displayName}'s role.`,
        }));
      } finally {
        if (isLatestActiveOrganization(actionOrganizationId)) {
          setActiveMemberAction(null);
        }
      }
    },
    [
      activeOrganizationId,
      currentUserId,
      isLatestActiveOrganization,
      loadMembers,
      onCurrentMemberAccessChanged,
    ]
  );

  const handleMemberRemoval = React.useCallback(
    async (member: OrganizationMemberSummary) => {
      const actionOrganizationId = activeOrganizationId;
      const displayName = getMemberDisplayName(member);

      setActiveMemberAction({
        memberId: member.id,
        type: "remove",
      });
      setMemberActionErrors((current) => omitRecordKey(current, member.id));
      setMemberActionSuccessMessage(null);
      setErrorMessage(null);
      setInvitationActionErrorMessage(null);
      setInvitationActionSuccessMessage(null);
      setSuccessMessage(null);

      try {
        const result = await authClient.organization.removeMember({
          memberIdOrEmail: member.id,
          organizationId: actionOrganizationId,
        });

        if (!isLatestActiveOrganization(actionOrganizationId)) {
          return;
        }

        if (result.error || !result.data) {
          setMemberActionErrors((current) => ({
            ...current,
            [member.id]: `We couldn't remove ${displayName}.`,
          }));
          return;
        }

        setMembers((current) =>
          current.filter((listedMember) => listedMember.id !== member.id)
        );
        setMemberActionSuccessMessage(`${displayName} was removed.`);
        await loadMembers();

        if (!isLatestActiveOrganization(actionOrganizationId)) {
          return;
        }

        if (currentUserId !== undefined && member.userId === currentUserId) {
          await onCurrentMemberAccessChanged?.();
        }
      } catch {
        if (!isLatestActiveOrganization(actionOrganizationId)) {
          return;
        }

        setMemberActionErrors((current) => ({
          ...current,
          [member.id]: `We couldn't remove ${displayName}.`,
        }));
      } finally {
        if (isLatestActiveOrganization(actionOrganizationId)) {
          setActiveMemberAction(null);
        }
      }
    },
    [
      activeOrganizationId,
      currentUserId,
      isLatestActiveOrganization,
      loadMembers,
      onCurrentMemberAccessChanged,
    ]
  );

  useAppHotkey(
    "membersSubmit",
    () => {
      if (form.state.isSubmitting) {
        return;
      }

      formRef.current?.requestSubmit();
    },
    { enabled: isHydrated }
  );
  useAppHotkey(
    "membersRole",
    () => {
      if (form.state.isSubmitting) {
        return;
      }

      roleSelectTriggerRef.current?.focus();
      setRoleSelectOpen(true);
    },
    {
      enabled: isHydrated && !roleSelectOpen,
      ignoreInputs: true,
    }
  );

  const shouldRenderInvitationsSection = shouldRenderPendingInvitationsSection({
    invitationActionErrorMessage,
    invitationActionSuccessMessage,
    invitations,
    isLoadingInvitations,
    loadErrorMessage,
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <AppPageHeader eyebrow="Organization access" title="Members" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="current-members-heading">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h2
                id="current-members-heading"
                className="font-heading text-lg font-medium"
              >
                Current members
              </h2>
              <Badge
                variant="secondary"
                className="w-fit rounded-full px-3 py-1"
              >
                {formatMemberCount(displayedMemberCount)}
              </Badge>
            </div>
            {isLoadingMembers && members.length === 0 ? (
              <DotMatrixLoadingState
                label="Loading members"
                className="justify-start border-y py-4"
              />
            ) : null}
            {memberLoadErrorMessage ? (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{memberLoadErrorMessage}</AlertDescription>
              </Alert>
            ) : null}
            {memberActionSuccessMessage ? (
              <p role="status" className="mb-4 text-sm text-muted-foreground">
                {memberActionSuccessMessage}
              </p>
            ) : null}
            <AppRowList aria-label="Current members">
              {displayedMembers.map((member) => (
                <CurrentMemberRow
                  key={member.id}
                  activeAction={activeMemberAction}
                  actionsDisabled={!isHydrated || Boolean(activeMemberAction)}
                  currentViewerRole={currentViewerRole}
                  errorMessage={memberActionErrors[member.id]}
                  isCurrentUser={
                    currentUserId !== undefined &&
                    member.userId === currentUserId
                  }
                  member={member}
                  ownerCount={ownerCount}
                  onRoleChange={handleMemberRoleChange}
                  onRemove={handleMemberRemoval}
                />
              ))}
            </AppRowList>
          </section>

          <AppUtilityPanel
            title="Invite teammate"
            className="rounded-none border-x-0 border-t border-b bg-transparent p-0 pt-5 shadow-none supports-[backdrop-filter]:bg-transparent sm:p-0 sm:pt-5"
          >
            <form
              ref={formRef}
              className="flex flex-col gap-5"
              method="post"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <FieldGroup>
                <form.Field name="email">
                  {(field) => {
                    const errorText = getErrorText(field.state.meta.errors);

                    return (
                      <AuthFormField
                        label="Email"
                        htmlFor="invite-email"
                        invalid={Boolean(errorText)}
                        errorText={errorText}
                      >
                        <Input
                          id="invite-email"
                          name={field.name}
                          type="email"
                          autoComplete="email"
                          value={field.state.value}
                          aria-invalid={Boolean(errorText) || undefined}
                          onBlur={field.handleBlur}
                          onChange={(event) =>
                            field.handleChange(event.target.value)
                          }
                        />
                      </AuthFormField>
                    );
                  }}
                </form.Field>

                <form.Field name="role">
                  {(field) => {
                    const errorText = getErrorText(field.state.meta.errors);

                    return (
                      <AuthFormField
                        label="Role"
                        htmlFor="invite-role"
                        invalid={Boolean(errorText)}
                        errorText={errorText}
                      >
                        <CommandSelect
                          id="invite-role"
                          value={field.state.value}
                          placeholder="Pick role"
                          emptyText="No roles found."
                          groups={ROLE_SELECTION_GROUPS}
                          ariaInvalid={errorText ? true : undefined}
                          open={roleSelectOpen}
                          triggerRef={roleSelectTriggerRef}
                          onOpenChange={setRoleSelectOpen}
                          onValueChange={(nextValue) => {
                            if (!isInviteRole(nextValue)) {
                              return;
                            }

                            field.handleChange(nextValue);
                            field.handleBlur();
                          }}
                        />
                      </AuthFormField>
                    );
                  }}
                </form.Field>
              </FieldGroup>

              {errorMessage ? (
                <p role="alert" className="text-sm text-destructive">
                  {errorMessage}
                </p>
              ) : null}
              {successMessage ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {successMessage}
                </p>
              ) : null}

              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full sm:w-auto"
                    loading={isSubmitting}
                    disabled={!isHydrated}
                  >
                    {isSubmitting ? "Sending invite..." : "Send invite"}
                  </Button>
                )}
              </form.Subscribe>
            </form>
          </AppUtilityPanel>
        </div>

        {shouldRenderInvitationsSection ? (
          <section
            aria-labelledby="pending-invitations-heading"
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h2
                id="pending-invitations-heading"
                className="font-heading text-lg font-medium"
              >
                Pending invitations
              </h2>
              <Badge
                variant="secondary"
                className="w-fit rounded-full px-3 py-1"
              >
                {formatInvitationCount(invitations.length)}
              </Badge>
            </div>
            {isLoadingInvitations ? (
              <DotMatrixLoadingState
                label="Loading invitations"
                className="justify-start border-y py-4"
              />
            ) : null}
            {loadErrorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>{loadErrorMessage}</AlertDescription>
              </Alert>
            ) : null}
            {invitationActionErrorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {invitationActionErrorMessage}
                </AlertDescription>
              </Alert>
            ) : null}
            {invitationActionSuccessMessage ? (
              <p role="status" className="text-sm text-muted-foreground">
                {invitationActionSuccessMessage}
              </p>
            ) : null}
            {invitations.length > 0 ? (
              <AppRowList aria-label="Pending invitations">
                {invitations.map((invitation) => (
                  <PendingInvitationRow
                    key={invitation.id}
                    activeAction={activeInvitationAction}
                    actionsDisabled={
                      !isHydrated || Boolean(activeInvitationAction)
                    }
                    invitation={invitation}
                    onInvitationAction={handleInvitationAction}
                  />
                ))}
              </AppRowList>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function CurrentMemberRow({
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
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-medium text-foreground">
          {displayName}
        </p>
        <p className="text-sm/6 break-all text-muted-foreground">
          {member.email}
        </p>
        {errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
      </div>
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
          <Dialog
            open={isRemoveDialogOpen}
            onOpenChange={setIsRemoveDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove {displayName}?</DialogTitle>
                <DialogDescription>
                  They will lose access to this organization.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  Cancel
                </DialogClose>
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
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </AppRowListActions>
      ) : null}
    </AppRowListItem>
  );
}

function PendingInvitationRow({
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

  return (
    <AppRowListItem>
      <AppRowListLeading aria-hidden="true">
        {invitation.email.charAt(0).toUpperCase()}
      </AppRowListLeading>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p
          className="text-sm font-medium break-all text-foreground"
          title={invitation.email}
        >
          {invitation.email}
        </p>
        <p className="text-sm/6 text-muted-foreground">
          Awaiting acceptance from the invited teammate.
        </p>
        <p className="text-sm/6 text-muted-foreground">
          {formatInvitationExpiry(invitation.expiresAt)}
        </p>
      </div>
      <AppRowListMeta>
        <Badge variant="secondary">{formatRoleLabel(invitation.role)}</Badge>
        <Badge variant="outline">{formatRoleLabel(invitation.status)}</Badge>
      </AppRowListMeta>
      <AppRowListActions>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={isResending}
          disabled={actionsDisabled}
          aria-label={`Resend invitation to ${invitation.email}`}
          onClick={() => {
            void onInvitationAction(invitation, "resend");
          }}
        >
          Resend
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={isCanceling}
          disabled={actionsDisabled}
          aria-label={`Cancel invitation to ${invitation.email}`}
          onClick={() => {
            void onInvitationAction(invitation, "cancel");
          }}
        >
          Cancel
        </Button>
      </AppRowListActions>
    </AppRowListItem>
  );
}

function shouldRenderPendingInvitationsSection({
  invitationActionErrorMessage,
  invitationActionSuccessMessage,
  invitations,
  isLoadingInvitations,
  loadErrorMessage,
}: {
  readonly invitationActionErrorMessage: string | null;
  readonly invitationActionSuccessMessage: string | null;
  readonly invitations: readonly InvitationSummary[];
  readonly isLoadingInvitations: boolean;
  readonly loadErrorMessage: string | null;
}) {
  return (
    isLoadingInvitations ||
    invitations.length > 0 ||
    Boolean(loadErrorMessage) ||
    Boolean(invitationActionErrorMessage) ||
    Boolean(invitationActionSuccessMessage)
  );
}

function isPendingInvitation(input: { readonly status: string }) {
  return input.status === "pending";
}

function decodeInvitationExpiresAt(input: unknown): IsoDateTimeStringType {
  return ParseResult.decodeUnknownSync(IsoDateTimeString)(
    input instanceof Date ? input.toISOString() : input
  );
}

function toInvitation(input: {
  readonly email: string;
  readonly expiresAt: unknown;
  readonly id: string;
  readonly role: unknown;
  readonly status: string;
}): InvitationSummary {
  return {
    email: input.email,
    expiresAt: decodeInvitationExpiresAt(input.expiresAt),
    id: input.id,
    role: ParseResult.decodeUnknownSync(InvitableOrganizationRole)(input.role),
    status: input.status,
  };
}

function toCurrentOrganizationMember(
  currentMember: CurrentMemberSummary,
  currentUserId: UserId | undefined = FALLBACK_CURRENT_USER_ID
): OrganizationMemberSummary {
  return {
    email: currentMember.email,
    id: `current-${currentUserId}`,
    name: currentMember.name,
    role: currentMember.role,
    userId: currentUserId,
  };
}

function toOrganizationMember(input: {
  readonly id: string;
  readonly role: unknown;
  readonly user?: {
    readonly email?: string | null | undefined;
    readonly id?: string | null | undefined;
    readonly name?: string | null | undefined;
  } | null;
  readonly userId: string;
}): OrganizationMemberSummary {
  const email = input.user?.email ?? input.userId;
  const name = input.user?.name ?? email;

  return {
    email,
    id: input.id,
    name,
    role: decodeOrganizationRole(input.role),
    userId: decodeOrganizationViewerUserId(input.userId),
  };
}

function resolveCurrentViewerRole({
  currentMember,
  currentUserId,
  members,
}: {
  readonly currentMember: CurrentMemberSummary;
  readonly currentUserId?: UserId | undefined;
  readonly members: readonly OrganizationMemberSummary[];
}): OrganizationRoleType {
  if (currentUserId === undefined) {
    return currentMember.role;
  }

  return (
    members.find((member) => member.userId === currentUserId)?.role ??
    currentMember.role
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

  if (currentViewerRole !== "owner" && currentViewerRole !== "admin") {
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

  return currentViewerRole === "owner" || currentViewerRole === "admin";
}

function omitRecordKey(record: Readonly<Record<string, string>>, key: string) {
  const { [key]: _ignored, ...rest } = record;

  return rest;
}
