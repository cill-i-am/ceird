import {
  decodeOrganizationRole,
  INVITABLE_ORGANIZATION_ROLES,
  InvitableOrganizationRole,
} from "@ceird/identity-core";
import type {
  InvitableOrganizationRole as InvitableOrganizationRoleType,
  OrganizationId,
} from "@ceird/identity-core";
import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
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
import { DotMatrixLoadingState } from "#/components/ui/dot-matrix-loader";
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

interface InvitationSummary {
  readonly email: string;
  readonly id: string;
  readonly role: InvitableOrganizationRoleType;
  readonly status: string;
}

interface CurrentMemberSummary {
  readonly email: string;
  readonly name: string;
  readonly role: string;
}

const DEFAULT_INVITE_VALUES: OrganizationMemberInviteInput = {
  email: "",
  role: "member",
};
const INVITE_FAILURE_MESSAGE =
  "We couldn't send that invitation. Please check the details and try again.";
const INVITATION_LOAD_FAILURE_MESSAGE =
  "We couldn't load invitations right now. Please try again.";
const INVITATION_ACTION_FAILURE_MESSAGE =
  "We couldn't update that invitation. Please try again.";
const INVITE_ROLE_LABELS = {
  admin: "Admin",
  external: "External collaborator",
  member: "Member",
} satisfies Record<OrganizationMemberInviteInput["role"], string>;
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

type InvitationAction = "cancel" | "resend";

function formatRoleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatInvitationCount(count: number) {
  return count === 1 ? "1 open" : `${count} open`;
}

function getMemberInitial(member: CurrentMemberSummary) {
  return (member.name || member.email).trim().charAt(0).toUpperCase() || "U";
}

export function OrganizationMembersPage({
  activeOrganizationId,
  currentMember = {
    email: "You",
    name: "You",
    role: "member",
  },
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly currentMember?: CurrentMemberSummary;
}) {
  const isHydrated = useIsHydrated();
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
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
  const invitationRequestSequence = React.useRef(0);
  const invitationsOrganizationId = React.useRef(activeOrganizationId);
  const roleSelectTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [roleSelectOpen, setRoleSelectOpen] = React.useState(false);

  const loadInvitations = React.useCallback(async () => {
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

      if (requestSequence !== invitationRequestSequence.current) {
        return;
      }

      if (result.error || !result.data) {
        setLoadErrorMessage(INVITATION_LOAD_FAILURE_MESSAGE);
        return;
      }

      setInvitations(result.data.filter(isPendingInvitation).map(toInvitation));
    } catch {
      if (requestSequence !== invitationRequestSequence.current) {
        return;
      }
      setLoadErrorMessage(INVITATION_LOAD_FAILURE_MESSAGE);
    } finally {
      if (requestSequence === invitationRequestSequence.current) {
        setIsLoadingInvitations(false);
      }
    }
  }, [activeOrganizationId]);

  React.useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

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

  const shouldRenderInvitationsSection =
    isLoadingInvitations ||
    invitations.length > 0 ||
    Boolean(loadErrorMessage) ||
    Boolean(invitationActionErrorMessage) ||
    Boolean(invitationActionSuccessMessage);

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
                1 active
              </Badge>
            </div>
            <AppRowList aria-label="Current members">
              <AppRowListItem>
                <AppRowListLeading aria-hidden="true">
                  {getMemberInitial(currentMember)}
                </AppRowListLeading>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {currentMember.name || currentMember.email}
                  </p>
                  <p className="text-sm/6 break-all text-muted-foreground">
                    {currentMember.email}
                  </p>
                </div>
                <AppRowListMeta>
                  <Badge variant="secondary">
                    {formatRoleLabel(currentMember.role)}
                  </Badge>
                  <Badge variant="outline">You</Badge>
                </AppRowListMeta>
              </AppRowListItem>
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

function isPendingInvitation(input: { readonly status: string }) {
  return input.status === "pending";
}

function toInvitation(input: {
  readonly email: string;
  readonly id: string;
  readonly role: string;
  readonly status: string;
}): InvitationSummary {
  const role = decodeOrganizationRole(input.role);

  if (!isInviteRole(role)) {
    throw new Error("Invitation role is not invitable.");
  }

  return {
    email: input.email,
    id: input.id,
    role,
    status: input.status,
  };
}
