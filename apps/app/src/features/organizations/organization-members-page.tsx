import { useForm } from "@tanstack/react-form";
import {
  decodeOrganizationRole,
  INVITABLE_ORGANIZATION_ROLES,
  InvitableOrganizationRole,
} from "@task-tracker/identity-core";
import type {
  OrganizationId,
  OrganizationRole,
} from "@task-tracker/identity-core";
import { Schema } from "effect";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import {
  AppRowList,
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
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { getErrorText } from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { authClient } from "#/lib/auth-client";

import {
  decodeOrganizationMemberInviteInput,
  organizationMemberInviteSchema,
} from "./organization-member-invite-schemas";
import type { OrganizationMemberInviteInput } from "./organization-member-invite-schemas";

interface InvitationSummary {
  readonly email: string;
  readonly id: string;
  readonly role: OrganizationRole;
  readonly status: string;
}

interface CurrentMemberSummary {
  readonly email: string;
  readonly name: string;
  readonly role: string;
}

const INVITE_FAILURE_MESSAGE =
  "We couldn't send that invitation. Please check the details and try again.";
const INVITATION_LOAD_FAILURE_MESSAGE =
  "We couldn't load invitations right now. Please try again.";
const INVITE_ROLE_LABELS = {
  admin: "Admin",
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
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [invitations, setInvitations] = React.useState<
    readonly InvitationSummary[]
  >([]);
  const [loadErrorMessage, setLoadErrorMessage] = React.useState<string | null>(
    null
  );
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null
  );
  const invitationRequestSequence = React.useRef(0);

  const loadInvitations = React.useCallback(async () => {
    invitationRequestSequence.current += 1;
    const requestSequence = invitationRequestSequence.current;
    setInvitations([]);
    setLoadErrorMessage(null);

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

    try {
      setInvitations(result.data.filter(isPendingInvitation).map(toInvitation));
    } catch {
      setLoadErrorMessage(INVITATION_LOAD_FAILURE_MESSAGE);
    }
  }, [activeOrganizationId]);

  React.useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const defaultValues: OrganizationMemberInviteInput = {
    email: "",
    role: "member",
  };

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationMemberInviteSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });
      setErrorMessage(null);
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

  const shouldRenderInvitationsSection =
    invitations.length > 0 || Boolean(loadErrorMessage);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <AppPageHeader eyebrow="Organization access" title="Members" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="current-members-heading">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <h2
                id="current-members-heading"
                className="font-heading text-lg font-medium tracking-tight"
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
                <div className="min-w-0 flex-1 space-y-1">
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
              className="flex flex-col gap-5"
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
                    disabled={isSubmitting}
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
                className="font-heading text-lg font-medium tracking-tight"
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
            {loadErrorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>{loadErrorMessage}</AlertDescription>
              </Alert>
            ) : null}
            {invitations.length > 0 ? (
              <AppRowList aria-label="Pending invitations">
                {invitations.map((invitation) => (
                  <AppRowListItem key={invitation.id}>
                    <AppRowListLeading aria-hidden="true">
                      {invitation.email.charAt(0).toUpperCase()}
                    </AppRowListLeading>
                    <div className="min-w-0 flex-1 space-y-1">
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
                      <Badge variant="secondary">
                        {formatRoleLabel(invitation.role)}
                      </Badge>
                      <Badge variant="outline">
                        {formatRoleLabel(invitation.status)}
                      </Badge>
                    </AppRowListMeta>
                  </AppRowListItem>
                ))}
              </AppRowList>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
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
  return {
    email: input.email,
    id: input.id,
    role: decodeOrganizationRole(input.role),
    status: input.status,
  };
}
