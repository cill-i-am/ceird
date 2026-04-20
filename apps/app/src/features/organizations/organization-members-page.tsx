import { useForm } from "@tanstack/react-form";
import { Schema } from "effect";
import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
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
      <p className="text-sm text-muted-foreground">Loading invitations...</p>
    );
  } else if (loadErrorMessage && invitations.length === 0) {
    invitationsContent = null;
  } else if (invitations.length === 0) {
    invitationsContent = (
      <p className="text-sm text-muted-foreground">
        No pending invitations yet.
      </p>
    );
  } else {
    invitationsContent = (
      <ul className="space-y-3">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="rounded-lg border p-3">
            <p className="font-medium">{invitation.email}</p>
            <p className="text-sm text-muted-foreground">
              {invitation.role} · {invitation.status}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Invite teammates and keep track of pending invitations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="email">
                {(field) => (
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="invite-email"
                    >
                      Email
                    </label>
                    <Input
                      id="invite-email"
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                    {field.state.meta.errors[0] ? (
                      <FieldError>
                        {String(field.state.meta.errors[0])}
                      </FieldError>
                    ) : null}
                  </div>
                )}
              </form.Field>

              <form.Field name="role">
                {(field) => (
                  <div className="space-y-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="invite-role"
                    >
                      Role
                    </label>
                    <select
                      id="invite-role"
                      name={field.name}
                      className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.value as "admin" | "member"
                        )
                      }
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                )}
              </form.Field>
            </FieldGroup>

            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
            {successMessage ? (
              <p className="text-sm text-emerald-700">{successMessage}</p>
            ) : null}

            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Sending invitation..." : "Send invitation"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>
            Outstanding invites for your current organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadErrorMessage ? (
            <FieldError>{loadErrorMessage}</FieldError>
          ) : null}
          {invitationsContent}
        </CardContent>
      </Card>
    </div>
  );
}
