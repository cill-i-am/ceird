import {
  InvitableOrganizationRole,
  IsoDateTimeString,
  decodeOrganizationRole,
  isAdministrativeOrganizationRole,
} from "@ceird/identity-core";
import type {
  IsoDateTimeString as IsoDateTimeStringType,
  OrganizationId,
  OrganizationRole as OrganizationRoleType,
  UserId,
} from "@ceird/identity-core";
import {
  Add01Icon,
  CommandIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import {
  AppRowList,
  AppRowListActions,
  AppRowListBody,
  AppRowListItem,
  AppRowListLeading,
  AppRowListMeta,
} from "#/components/app-row-list";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ResponsiveCommandSelect } from "#/components/ui/command-select";
import { DotMatrixLoadingState } from "#/components/ui/dot-matrix-loader";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "#/components/ui/responsive-dialog";
import { Skeleton } from "#/components/ui/skeleton";
import { getErrorText } from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { authClient } from "#/lib/auth-client";
import { submitClientForm } from "#/lib/client-form-submit";
import { beginMutationFeedback } from "#/lib/mutation-feedback";
import { cn } from "#/lib/utils";

import {
  INVITE_ROLE_SELECTION_GROUPS,
  isInviteRole,
} from "./organization-invite-role-options";
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
import {
  decodeOrganizationMemberInviteInput,
  organizationMemberInviteSchema,
} from "./organization-member-invite-schemas";
import type { OrganizationMemberInviteInput } from "./organization-member-invite-schemas";
import {
  CurrentMemberRow,
  PendingInvitationRow,
} from "./organization-member-row-actions";
import { decodeOrganizationViewerUserId } from "./organization-viewer";

interface CurrentMemberSummary {
  readonly email: string;
  readonly name: string;
  readonly role: OrganizationRoleType;
}

const DEFAULT_INVITE_VALUES: OrganizationMemberInviteInput = {
  email: "",
  role: "member",
};
const INVITE_FAILURE_MESSAGE =
  "We couldn't send that invitation. Please check the details and try again.";
const MEMBERS_PAGE_SIZE = 100;
const INVITATION_LOAD_FAILURE_MESSAGE =
  "We couldn't load invitations right now. Please try again.";
const INVITATION_ACTION_FAILURE_MESSAGE =
  "We couldn't update that invitation. Please try again.";
const MEMBER_LOAD_FAILURE_MESSAGE =
  "We couldn't load members right now. Please try again.";
const CURRENT_MEMBER_SKELETON_ROWS = [
  {
    descriptionWidth: "w-52",
    titleWidth: "w-36",
  },
  {
    descriptionWidth: "w-48",
    titleWidth: "w-44",
  },
  {
    descriptionWidth: "w-56",
    titleWidth: "w-32",
  },
] as const;
type CurrentMembersDisplayState =
  | {
      readonly kind: "loading";
    }
  | {
      readonly kind: "error";
      readonly message: string;
    }
  | {
      readonly kind: "empty";
    }
  | {
      readonly count: number;
      readonly kind: "ready";
      readonly loadErrorMessage: string | null;
      readonly members: readonly OrganizationMemberSummary[];
    };

function formatInvitationCount(count: number) {
  return count === 1 ? "1 open" : `${count} open`;
}

function formatMemberCount(count: number) {
  return count === 1 ? "1 active" : `${count} active`;
}

function getCurrentMembersDisplayState({
  hasCurrentMemberState,
  hasLoadedMembers,
  memberLoadErrorMessage,
  memberTotal,
  members,
}: {
  readonly hasCurrentMemberState: boolean;
  readonly hasLoadedMembers: boolean;
  readonly memberLoadErrorMessage: string | null;
  readonly memberTotal: number | null;
  readonly members: readonly OrganizationMemberSummary[];
}): CurrentMembersDisplayState {
  if (memberLoadErrorMessage && (!hasLoadedMembers || !hasCurrentMemberState)) {
    return { kind: "error", message: memberLoadErrorMessage };
  }

  if (!hasLoadedMembers || !hasCurrentMemberState) {
    return { kind: "loading" };
  }

  if (memberLoadErrorMessage) {
    return {
      count: memberTotal ?? members.length,
      kind: "ready",
      loadErrorMessage: memberLoadErrorMessage,
      members,
    };
  }

  if (members.length === 0) {
    return { kind: "empty" };
  }

  return {
    count: memberTotal ?? members.length,
    kind: "ready",
    loadErrorMessage: null,
    members,
  };
}

function isCurrentOrganizationMember(
  member: OrganizationMemberSummary,
  currentUserId: UserId | undefined
) {
  return currentUserId !== undefined && member.userId === currentUserId;
}

// The members page coordinates active members, invitations, role actions, and route-level hotkeys.
// eslint-disable-next-line complexity -- This page coordinates separate member, invite, and hotkey workflows until they settle into smaller feature modules.
// react-doctor-disable-next-line
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
  // The remaining local states represent separate async workflows and form surfaces.
  // react-doctor-disable-next-line
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
  const inviteDialogContentRef = React.useRef<HTMLDivElement | null>(null);
  const inviteEmailInputRef = React.useRef<HTMLInputElement | null>(null);
  const latestActiveOrganizationId = React.useRef(activeOrganizationId);
  const memberRequestSequence = React.useRef(0);
  const membersOrganizationId = React.useRef(activeOrganizationId);
  const invitationRequestSequence = React.useRef(0);
  const invitationsOrganizationId = React.useRef(activeOrganizationId);
  const roleSelectTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [roleSelectOpen, setRoleSelectOpen] = React.useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = React.useState(false);
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

    try {
      const loadedMembers: OrganizationMemberSummary[] = [];
      let memberCount = 0;

      while (true) {
        // Offset pagination advances from the number of members already loaded.
        // react-doctor-disable-next-line
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

      setInvitations(
        result.data.flatMap((invitation) =>
          isPendingInvitation(invitation) ? [toInvitation(invitation)] : []
        )
      );
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

  // Member loading is request-sequenced and tied to the active organization.
  // react-doctor-disable-next-line
  React.useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  React.useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  // Clear organization-scoped action feedback when switching organizations.
  // react-doctor-disable-next-line
  React.useEffect(() => {
    setActiveInvitationAction(null);
    setActiveMemberAction(null);
    setMemberActionErrors({});
    setMemberActionSuccessMessage(null);
    setMemberTotal(null);
  }, [activeOrganizationId]);

  const form = useForm({
    defaultValues: DEFAULT_INVITE_VALUES,
    validators: {
      onSubmit: Schema.toStandardSchemaV1(organizationMemberInviteSchema),
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

      const actionOrganizationId = activeOrganizationId;
      const invite = decodeOrganizationMemberInviteInput(value);
      const mutationFeedback = beginMutationFeedback();
      const result = await authClient.organization.inviteMember({
        email: invite.email,
        organizationId: actionOrganizationId,
        role: invite.role,
      });

      if (result.error) {
        setErrorMessage(INVITE_FAILURE_MESSAGE);
        return;
      }

      await mutationFeedback.waitForSuccess();

      if (!isLatestActiveOrganization(actionOrganizationId)) {
        return;
      }

      formApi.reset();
      setSuccessMessage(`Invitation sent to ${invite.email}.`);
      setIsInviteDialogOpen(false);
      setRoleSelectOpen(false);
      await loadInvitations();
    },
  });

  const handleInvitationAction = React.useCallback(
    async (invitation: InvitationSummary, action: InvitationAction) => {
      const actionOrganizationId = activeOrganizationId;

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
        const mutationFeedback = beginMutationFeedback();
        const result =
          action === "resend"
            ? await authClient.organization.inviteMember({
                email: invitation.email,
                organizationId: actionOrganizationId,
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

        await mutationFeedback.waitForSuccess();

        if (!isLatestActiveOrganization(actionOrganizationId)) {
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
        if (isLatestActiveOrganization(actionOrganizationId)) {
          setInvitationActionErrorMessage(INVITATION_ACTION_FAILURE_MESSAGE);
        }
      } finally {
        if (isLatestActiveOrganization(actionOrganizationId)) {
          setActiveInvitationAction(null);
        }
      }
    },
    [activeOrganizationId, isLatestActiveOrganization]
  );

  const currentViewerRole = resolveCurrentViewerRole({
    currentMember,
    currentUserId,
    members,
  });
  const hasLoadedMembers = memberTotal !== null;
  const hasCurrentMemberState =
    membersOrganizationId.current === activeOrganizationId;
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const canInviteMembers = isAdministrativeOrganizationRole(currentViewerRole);
  const currentMembersDisplayState = getCurrentMembersDisplayState({
    hasCurrentMemberState,
    hasLoadedMembers,
    memberLoadErrorMessage,
    memberTotal,
    members,
  });

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
        const mutationFeedback = beginMutationFeedback();
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

        await mutationFeedback.waitForSuccess();

        if (!isLatestActiveOrganization(actionOrganizationId)) {
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
        const mutationFeedback = beginMutationFeedback();
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

        await mutationFeedback.waitForSuccess();

        if (!isLatestActiveOrganization(actionOrganizationId)) {
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

  const membersPageCommandActions = React.useMemo<
    readonly CommandAction[]
  >(() => {
    const actions: CommandAction[] = [
      {
        group: "Current page",
        icon: Refresh01Icon,
        id: "members-refresh",
        priority: 70,
        run: async () => {
          await Promise.all([loadMembers(), loadInvitations()]);
        },
        scope: "route",
        title: "Refresh members",
      },
    ];

    if (canInviteMembers) {
      actions.unshift({
        disabled: !isHydrated || isInviteDialogOpen,
        group: "Current page",
        icon: Add01Icon,
        id: "members-invite",
        priority: 80,
        run: () => setIsInviteDialogOpen(true),
        scope: "route",
        shortcut: HOTKEYS.membersInvite,
        title: "Invite teammate",
      });
    }

    return actions;
  }, [
    canInviteMembers,
    isHydrated,
    isInviteDialogOpen,
    loadInvitations,
    loadMembers,
  ]);

  useRegisterCommandActions(membersPageCommandActions);

  useAppHotkey(
    "membersInvite",
    () => {
      setIsInviteDialogOpen(true);
    },
    {
      enabled: isHydrated && canInviteMembers && !isInviteDialogOpen,
      ignoreInputs: true,
    }
  );
  useAppHotkey(
    "membersSubmit",
    () => {
      if (form.state.isSubmitting) {
        return;
      }

      if (!isInviteDialogOpen) {
        return;
      }

      formRef.current?.requestSubmit();
    },
    { enabled: isHydrated && canInviteMembers }
  );
  useAppHotkey(
    "membersRole",
    () => {
      if (form.state.isSubmitting) {
        return;
      }

      if (!isInviteDialogOpen) {
        return;
      }

      roleSelectTriggerRef.current?.focus();
      setRoleSelectOpen(true);
    },
    {
      enabled: isHydrated && canInviteMembers && !roleSelectOpen,
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
    <div className="flex flex-1 flex-col gap-5 p-3 sm:p-4 lg:p-5">
      <MembersPageHeader
        canInviteMembers={canInviteMembers}
        isHydrated={isHydrated}
        onInvite={() => setIsInviteDialogOpen(true)}
      />

      {successMessage ? (
        <p role="status" className="text-sm text-muted-foreground">
          {successMessage}
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
        <CurrentMembersSection
          activeMemberAction={activeMemberAction}
          currentUserId={currentUserId}
          currentViewerRole={currentViewerRole}
          displayState={currentMembersDisplayState}
          isHydrated={isHydrated}
          memberActionErrors={memberActionErrors}
          memberActionSuccessMessage={memberActionSuccessMessage}
          ownerCount={ownerCount}
          onMemberRemoval={handleMemberRemoval}
          onMemberRoleChange={handleMemberRoleChange}
        />

        {shouldRenderInvitationsSection ? (
          <PendingInvitationsSection
            activeInvitationAction={activeInvitationAction}
            invitationActionErrorMessage={invitationActionErrorMessage}
            invitationActionSuccessMessage={invitationActionSuccessMessage}
            invitations={invitations}
            isHydrated={isHydrated}
            isLoadingInvitations={isLoadingInvitations}
            loadErrorMessage={loadErrorMessage}
            onInvitationAction={handleInvitationAction}
          />
        ) : null}
      </div>

      <ResponsiveDialog
        open={isInviteDialogOpen}
        onOpenChange={(open) => {
          setIsInviteDialogOpen(open);
          if (!open) {
            setRoleSelectOpen(false);
          }
        }}
      >
        <ResponsiveDialogContent
          ref={inviteDialogContentRef}
          className="sm:max-w-lg"
          initialFocus={inviteEmailInputRef}
        >
          <form
            ref={formRef}
            className="flex flex-col sm:gap-5"
            method="post"
            noValidate
            onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
          >
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>Invite teammate</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                Send an invitation to join this organization.
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>

            <div className="flex flex-col gap-5 px-5 py-5 sm:px-0 sm:py-0">
              <FieldGroup>
                <form.Field name="email">
                  {(field) => {
                    const errorText = getErrorText(field.state.meta.errors);

                    return (
                      <AuthFormField
                        label="Email"
                        htmlFor="invite-email"
                        errorText={errorText}
                      >
                        <Input
                          ref={inviteEmailInputRef}
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
                        errorText={errorText}
                      >
                        <ResponsiveCommandSelect
                          id="invite-role"
                          value={field.state.value}
                          drawerTitle="Role"
                          nestedDrawer
                          placeholder="Pick role"
                          emptyText="No roles found."
                          groups={INVITE_ROLE_SELECTION_GROUPS}
                          searchable={false}
                          showGroupHeadings={false}
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
            </div>

            <ResponsiveDialogFooter>
              <ResponsiveDialogClose
                render={<Button type="button" variant="outline" />}
              >
                Cancel
              </ResponsiveDialogClose>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    type="submit"
                    loading={isSubmitting}
                    disabled={!isHydrated}
                  >
                    {isSubmitting ? "Sending invite..." : "Send invite"}
                  </Button>
                )}
              </form.Subscribe>
            </ResponsiveDialogFooter>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

function MembersPageHeader({
  canInviteMembers,
  isHydrated,
  onInvite,
}: {
  readonly canInviteMembers: boolean;
  readonly isHydrated: boolean;
  readonly onInvite: () => void;
}) {
  return (
    <AppPageHeader
      title="Members"
      leading={<HugeiconsIcon icon={CommandIcon} strokeWidth={2} />}
      actions={
        canInviteMembers ? (
          <Button
            type="button"
            size="sm"
            onClick={onInvite}
            disabled={!isHydrated}
          >
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Invite teammate
            <ShortcutHint
              surface="button"
              hotkey={HOTKEYS.membersInvite.hotkey}
              label={HOTKEYS.membersInvite.label}
              decorative
            />
          </Button>
        ) : null
      }
    />
  );
}

function CurrentMembersSection({
  activeMemberAction,
  currentUserId,
  currentViewerRole,
  displayState,
  isHydrated,
  memberActionErrors,
  memberActionSuccessMessage,
  ownerCount,
  onMemberRemoval,
  onMemberRoleChange,
}: {
  readonly activeMemberAction: MemberAction | null;
  readonly currentUserId?: UserId | undefined;
  readonly currentViewerRole: OrganizationRoleType;
  readonly displayState: CurrentMembersDisplayState;
  readonly isHydrated: boolean;
  readonly memberActionErrors: Readonly<Record<string, string>>;
  readonly memberActionSuccessMessage: string | null;
  readonly ownerCount: number;
  readonly onMemberRemoval: (
    member: OrganizationMemberSummary
  ) => Promise<void>;
  readonly onMemberRoleChange: (
    member: OrganizationMemberSummary,
    role: OrganizationRoleType
  ) => Promise<void>;
}) {
  const shouldShowMemberCount = displayState.kind === "ready";

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="current-members-heading">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              id="current-members-heading"
              className="font-heading text-lg font-medium"
            >
              Current members
            </h2>
          </div>
          {shouldShowMemberCount ? (
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
              {formatMemberCount(displayState.count)}
            </Badge>
          ) : null}
        </div>
        {displayState.kind === "loading" ? (
          <CurrentMembersSkeletonList />
        ) : null}
        {displayState.kind === "error" ||
        (displayState.kind === "ready" &&
          displayState.loadErrorMessage !== null) ? (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>
              {displayState.kind === "error"
                ? displayState.message
                : displayState.loadErrorMessage}
            </AlertDescription>
          </Alert>
        ) : null}
        {memberActionSuccessMessage ? (
          <p role="status" className="mb-4 text-sm text-muted-foreground">
            {memberActionSuccessMessage}
          </p>
        ) : null}
        {displayState.kind === "empty" ? (
          <Empty className="min-h-64 rounded-[calc(var(--radius)*3)] bg-background/78 supports-[backdrop-filter]:bg-background/68">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No active members.</EmptyTitle>
              <EmptyDescription>
                Invite an owner or admin before this workspace is used.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {displayState.kind === "ready" ? (
          <AppRowList aria-label="Current members">
            {displayState.members.map((member) => (
              <CurrentMemberRow
                key={member.id}
                activeAction={activeMemberAction}
                actionsDisabled={!isHydrated || Boolean(activeMemberAction)}
                currentViewerRole={currentViewerRole}
                errorMessage={memberActionErrors[member.id]}
                isCurrentUser={isCurrentOrganizationMember(
                  member,
                  currentUserId
                )}
                member={member}
                ownerCount={ownerCount}
                onRoleChange={onMemberRoleChange}
                onRemove={onMemberRemoval}
              />
            ))}
          </AppRowList>
        ) : null}
      </section>
    </div>
  );
}

function CurrentMembersSkeletonList() {
  return (
    <div aria-label="Loading members" role="status">
      <AppRowList
        aria-hidden="true"
        className="pointer-events-none"
        aria-busy="true"
      >
        {CURRENT_MEMBER_SKELETON_ROWS.map((row) => (
          <AppRowListItem key={row.titleWidth}>
            <AppRowListLeading aria-hidden="true">
              <Skeleton className="size-full rounded-[calc(var(--radius)*2.2)]" />
            </AppRowListLeading>
            <AppRowListBody
              title={
                <span
                  className={cn(
                    "block h-4 animate-pulse rounded-2xl bg-muted",
                    row.titleWidth
                  )}
                />
              }
              description={
                <span
                  className={cn(
                    "block h-3.5 animate-pulse rounded-2xl bg-muted",
                    row.descriptionWidth
                  )}
                />
              }
            />
            <AppRowListMeta>
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-10 rounded-full" />
            </AppRowListMeta>
            <AppRowListActions>
              <Skeleton className="size-8 rounded-full" />
            </AppRowListActions>
          </AppRowListItem>
        ))}
      </AppRowList>
    </div>
  );
}

function PendingInvitationsSection({
  activeInvitationAction,
  invitationActionErrorMessage,
  invitationActionSuccessMessage,
  invitations,
  isHydrated,
  isLoadingInvitations,
  loadErrorMessage,
  onInvitationAction,
}: {
  readonly activeInvitationAction: {
    readonly invitationId: string;
    readonly type: InvitationAction;
  } | null;
  readonly invitationActionErrorMessage: string | null;
  readonly invitationActionSuccessMessage: string | null;
  readonly invitations: readonly InvitationSummary[];
  readonly isHydrated: boolean;
  readonly isLoadingInvitations: boolean;
  readonly loadErrorMessage: string | null;
  readonly onInvitationAction: (
    invitation: InvitationSummary,
    action: InvitationAction
  ) => Promise<void>;
}) {
  return (
    <section
      aria-labelledby="pending-invitations-heading"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            id="pending-invitations-heading"
            className="font-heading text-lg font-medium"
          >
            Pending invitations
          </h2>
        </div>
        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
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
          <AlertDescription>{invitationActionErrorMessage}</AlertDescription>
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
              actionsDisabled={!isHydrated || Boolean(activeInvitationAction)}
              invitation={invitation}
              onInvitationAction={onInvitationAction}
            />
          ))}
        </AppRowList>
      ) : null}
    </section>
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
  return Schema.decodeUnknownSync(IsoDateTimeString)(
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
    role: Schema.decodeUnknownSync(InvitableOrganizationRole)(input.role),
    status: input.status,
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

function omitRecordKey(record: Readonly<Record<string, string>>, key: string) {
  const { [key]: _ignored, ...rest } = record;

  return rest;
}
