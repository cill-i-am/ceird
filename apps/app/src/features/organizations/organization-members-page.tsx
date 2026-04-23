import { useForm } from "@tanstack/react-form";
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
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Select } from "#/components/ui/select";
import { Skeleton } from "#/components/ui/skeleton";
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
  readonly role: string;
  readonly status: string;
}

const INVITE_FAILURE_MESSAGE =
  "We couldn't send that invitation. Please check the details and try again.";
const INVITATION_LOAD_FAILURE_MESSAGE =
  "We couldn't load invitations right now. Please try again.";

function formatRoleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatInvitationCount(count: number) {
  return count === 1 ? "1 open" : `${count} open`;
}

export function OrganizationMembersPage({
  activeOrganizationId,
}: {
  readonly activeOrganizationId: string;
}) {
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [invitations, setInvitations] = React.useState<
    readonly InvitationSummary[]
  >([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = React.useState(true);
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
    setIsLoadingInvitations(true);
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
      setIsLoadingInvitations(false);
      return;
    }

    setInvitations(
      result.data.filter((invitation) => invitation.status === "pending")
    );
    setIsLoadingInvitations(false);
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

  let invitationsContent: React.ReactNode = null;

  if (isLoadingInvitations) {
    invitationsContent = (
      <AppRowList aria-label="Pending invitations" aria-busy="true">
        {[0, 1, 2].map((row) => (
          <AppRowListItem key={row}>
            <Skeleton className="size-10 rounded-[calc(var(--radius)*2.2)]" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full max-w-64" />
            </div>
            <Skeleton className="h-7 w-24 rounded-full" />
          </AppRowListItem>
        ))}
      </AppRowList>
    );
  } else if (loadErrorMessage && invitations.length === 0) {
    invitationsContent = null;
  } else if (invitations.length === 0) {
    invitationsContent = (
      <Empty className="min-h-[220px] rounded-[calc(var(--radius)*3)] border-border/60 bg-background/72 px-6 py-8">
        <EmptyHeader>
          <EmptyTitle>No pending invitations yet.</EmptyTitle>
          <EmptyDescription>
            Send the first invite when you&apos;re ready to add someone.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    invitationsContent = (
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
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <AppPageHeader
        eyebrow="Organization access"
        title="Members"
        description="Invite teammates and track pending access from one place."
        actions={
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {isLoadingInvitations
              ? "Refreshing"
              : formatInvitationCount(invitations.length)}
          </Badge>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)]">
        <AppUtilityPanel
          title="Invite teammate"
          description="Send the invite to the address they will use to sign in."
          footer="Admins can manage members and settings. Members can work inside the organization."
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
                      descriptionText="Use their work address."
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
                      descriptionText="Admins manage access. Members can work."
                      errorText={errorText}
                    >
                      <Select
                        id="invite-role"
                        name={field.name}
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(
                            event.target.value as "admin" | "member"
                          )
                        }
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </Select>
                    </AuthFormField>
                  );
                }}
              </form.Field>
            </FieldGroup>

            {errorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}
            {successMessage ? (
              <Alert role="status" className="bg-muted/40">
                <AlertTitle>Invitation sent</AlertTitle>
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
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

        <section
          aria-labelledby="pending-invitations-heading"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h2
                id="pending-invitations-heading"
                className="font-heading text-lg font-medium tracking-tight"
              >
                Pending invitations
              </h2>
              <p className="text-sm/6 text-muted-foreground">
                Open access requests for this organization.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
              {isLoadingInvitations
                ? "Refreshing"
                : formatInvitationCount(invitations.length)}
            </Badge>
          </div>
          {loadErrorMessage ? (
            <Alert variant="destructive">
              <AlertDescription>{loadErrorMessage}</AlertDescription>
            </Alert>
          ) : null}
          {invitationsContent}
        </section>
      </div>
    </div>
  );
}
