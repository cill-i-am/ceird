import type { OrganizationSummary } from "@ceird/identity-core";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";
import * as React from "react";

import { Button } from "#/components/ui/button";
import { ResponsiveCommandSelect } from "#/components/ui/command-select";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  getErrorText,
  getFormErrorText,
} from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { authQuietLinkClassName } from "#/features/auth/auth-link-styles";
import { EntryShell, EntrySurfaceCard } from "#/features/auth/entry-shell";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { authClient } from "#/lib/auth-client";
import { submitClientForm } from "#/lib/client-form-submit";
import { cn } from "#/lib/utils";

import {
  INVITE_ROLE_SELECTION_GROUPS,
  isInviteRole,
} from "./organization-invite-role-options";
import {
  decodeOrganizationMemberInviteInput,
  organizationMemberInviteSchema,
} from "./organization-member-invite-schemas";
import type { OrganizationMemberInviteInput } from "./organization-member-invite-schemas";
import {
  decodeCreateOrganizationNameInput,
  organizationOnboardingSchema,
} from "./organization-schemas";
import { createCurrentServerOrganization } from "./organization-server";

const CREATE_ORGANIZATION_FAILURE_MESSAGE =
  "We couldn't create your team. Please try again.";
const INVITE_FAILURE_MESSAGE =
  "We couldn't send that invitation. Please check the email and try again.";
const DEFAULT_INVITE_VALUES: OrganizationMemberInviteInput = {
  email: "",
  role: "member",
};

export function OrganizationOnboardingPage() {
  const navigate = useNavigate({ from: "/create-organization" });
  const isHydrated = useIsHydrated();
  const [createdOrganization, setCreatedOrganization] =
    React.useState<OrganizationSummary | null>(null);
  const form = useForm({
    defaultValues: {
      name: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationOnboardingSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const input = decodeCreateOrganizationNameInput(value);
      let organization: OrganizationSummary;

      try {
        organization = await createCurrentServerOrganization({ data: input });
      } catch {
        formApi.setErrorMap({
          onSubmit: {
            form: CREATE_ORGANIZATION_FAILURE_MESSAGE,
            fields: {},
          },
        });

        return;
      }

      setCreatedOrganization(organization);
    },
  });

  return (
    <main className="flex min-h-screen">
      <EntryShell>
        {createdOrganization ? (
          <InviteMembersStep
            organization={createdOrganization}
            isHydrated={isHydrated}
            onContinue={() => navigate({ to: "/" })}
          />
        ) : (
          <EntrySurfaceCard
            className="max-w-lg"
            title="Create your team"
            titleLevel={1}
            description="This keeps your jobs, sites, and invites in one shared place."
          >
            <form
              className="flex flex-col gap-6"
              method="post"
              noValidate
              onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
            >
              <FieldGroup>
                <form.Field name="name">
                  {(field) => {
                    const errorText = getErrorText(field.state.meta.errors);

                    return (
                      <AuthFormField
                        label="Team name"
                        htmlFor="organization-name"
                        errorText={errorText}
                      >
                        <Input
                          id="organization-name"
                          name={field.name}
                          autoComplete="organization"
                          placeholder="Acme Field Ops"
                          value={field.state.value}
                          aria-invalid={Boolean(errorText) || undefined}
                          onBlur={field.handleBlur}
                          onInput={(event) => {
                            field.handleChange(event.currentTarget.value);
                          }}
                        />
                      </AuthFormField>
                    );
                  }}
                </form.Field>
              </FieldGroup>

              <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                {(error) =>
                  getFormErrorText(error) ? (
                    <FieldError>{getFormErrorText(error)}</FieldError>
                  ) : null
                }
              </form.Subscribe>

              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full [view-transition-name:auth-card-action]"
                    loading={isSubmitting}
                    disabled={!isHydrated}
                  >
                    {isSubmitting ? "Creating team..." : "Create team"}
                  </Button>
                )}
              </form.Subscribe>
            </form>
          </EntrySurfaceCard>
        )}
      </EntryShell>
    </main>
  );
}

function InviteMembersStep({
  isHydrated,
  onContinue,
  organization,
}: {
  readonly isHydrated: boolean;
  readonly onContinue: () => Promise<void>;
  readonly organization: OrganizationSummary;
}) {
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [roleSelectOpen, setRoleSelectOpen] = React.useState(false);
  const form = useForm({
    defaultValues: DEFAULT_INVITE_VALUES,
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationMemberInviteSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });
      setStatusMessage(null);

      const invite = decodeOrganizationMemberInviteInput(value);
      const result = await authClient.organization.inviteMember({
        email: invite.email,
        organizationId: organization.id,
        role: invite.role,
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: INVITE_FAILURE_MESSAGE,
            fields: {},
          },
        });
        return;
      }

      formApi.reset();
      setRoleSelectOpen(false);
      setStatusMessage(`Invitation sent to ${invite.email}.`);
    },
  });

  return (
    <EntrySurfaceCard
      className="max-w-lg"
      title="Invite members"
      titleLevel={1}
      description="Add the people who need access to jobs, sites, and invites."
      footer={
        <div className="flex flex-col items-start gap-2 text-sm/6 text-muted-foreground">
          <button
            type="button"
            className={cn(authQuietLinkClassName, "cursor-pointer")}
            onClick={() => void onContinue()}
          >
            {statusMessage ? "Continue to Ceird" : "Skip for now"}
          </button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-6"
        method="post"
        noValidate
        onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
      >
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
                    id="invite-email"
                    name={field.name}
                    type="email"
                    autoComplete="email"
                    placeholder="m@example.com"
                    value={field.state.value}
                    aria-invalid={Boolean(errorText) || undefined}
                    onBlur={field.handleBlur}
                    onInput={(event) => {
                      field.handleChange(event.currentTarget.value);
                    }}
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
                    placeholder="Pick role"
                    emptyText="No roles found."
                    groups={INVITE_ROLE_SELECTION_GROUPS}
                    searchable={false}
                    showGroupHeadings={false}
                    ariaInvalid={errorText ? true : undefined}
                    open={roleSelectOpen}
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

        <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
          {(error) =>
            getFormErrorText(error) ? (
              <FieldError>{getFormErrorText(error)}</FieldError>
            ) : null
          }
        </form.Subscribe>

        {statusMessage ? (
          <p role="status" className="text-sm/6 text-muted-foreground">
            {statusMessage}
          </p>
        ) : null}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              size="lg"
              className="w-full [view-transition-name:auth-card-action]"
              loading={isSubmitting}
              disabled={!isHydrated}
            >
              {isSubmitting ? "Sending invite..." : "Send invite"}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </EntrySurfaceCard>
  );
}
