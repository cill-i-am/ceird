import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
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
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full rounded-3xl" />
        <Skeleton className="h-20 w-full rounded-3xl" />
        <Skeleton className="h-20 w-full rounded-3xl" />
      </div>
    );
  } else if (loadErrorMessage && invitations.length === 0) {
    invitationsContent = null;
  } else if (invitations.length === 0) {
    invitationsContent = (
      <Empty className="min-h-[240px] bg-muted/20 px-6 py-8">
        <EmptyHeader>
          <EmptyTitle>No pending invitations yet.</EmptyTitle>
          <EmptyDescription>
            Invite a teammate when you&apos;re ready to bring them into this
            workspace.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    invitationsContent = (
      <ul className="flex flex-col gap-3">
        {invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-col gap-4 rounded-3xl border bg-background/84 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <p className="font-medium">{invitation.email}</p>
              <p className="text-sm/6 text-muted-foreground">
                Awaiting a response from the invited teammate.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {formatRoleLabel(invitation.role)}
              </Badge>
              <Badge variant="outline">
                {formatRoleLabel(invitation.status)}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <header className="flex max-w-3xl flex-col gap-3">
        <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
          Crew access
        </Badge>
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-medium tracking-tight sm:text-4xl">
            Invite the people who keep the work moving.
          </h1>
          <p className="max-w-[65ch] text-sm/7 text-muted-foreground sm:text-base/7">
            Bring supervisors, coordinators, and office staff into the current
            workspace without making access management feel heavy.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Invite teammate</CardTitle>
            <CardDescription>
              Send the invite to the email they should use when signing in.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                        descriptionText="Use the address tied to the teammate you want in this workspace."
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
                        descriptionText="Admins can manage members and settings. Members can work inside the organization."
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
                    className="w-full"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Sending invitation..." : "Send invitation"}
                  </Button>
                )}
              </form.Subscribe>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardAction>
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {isLoadingInvitations
                  ? "Updating"
                  : `${invitations.length} pending`}
              </Badge>
            </CardAction>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>
              Outstanding invites for your current organization stay visible
              here until the teammate accepts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadErrorMessage ? (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{loadErrorMessage}</AlertDescription>
              </Alert>
            ) : null}
            {invitationsContent}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
