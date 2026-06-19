import {
  decodeInviteOrganizationMemberInput,
  InviteOrganizationMemberInputSchema,
} from "@ceird/identity-core";
import type {
  InvitableOrganizationRole,
  OrganizationSummary,
} from "@ceird/identity-core";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { ResponsiveCommandSelect } from "#/components/ui/command-select";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import {
  getErrorText,
  getFormErrorText,
} from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { EntryShell, EntrySurfaceCard } from "#/features/auth/entry-shell";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import {
  getBrowserLocationHref,
  navigateBrowserTo,
} from "#/lib/browser-navigation";
import { submitClientForm } from "#/lib/client-form-submit";
import { beginMutationFeedback } from "#/lib/mutation-feedback";
import {
  buildOrganizationTenantUrl,
  readTenantHostConfigFromEnv,
} from "#/lib/tenant-host";
import { cn } from "#/lib/utils";

import { clearOrganizationAccessClientCache } from "./organization-access-cache";
import {
  getCreateOrganizationFailureMessage,
  getInviteMemberFailureMessage,
} from "./organization-auth-errors";
import {
  INVITE_ROLE_SELECTION_GROUPS,
  isInviteRole,
} from "./organization-invite-role-options";
import { inviteOrganizationMember } from "./organization-members-api";
import {
  decodeCreateOrganizationNameInput,
  organizationOnboardingSchema,
} from "./organization-schemas";
import { createCurrentServerOrganization } from "./organization-server";

const CREATE_ORGANIZATION_FAILURE_MESSAGE =
  "We couldn't create your team. Please try again.";
const INVITE_FAILURE_MESSAGE =
  "We couldn't send that invitation. Please check the email and try again.";
interface OrganizationMemberInviteDraft {
  readonly email: string;
  readonly role: InvitableOrganizationRole;
}
const DEFAULT_INVITE_VALUES: OrganizationMemberInviteDraft = {
  email: "",
  role: "member",
};
type SetupStepState = "active" | "complete" | "upcoming";
type SetupPhase = "create" | "invite";

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
      onSubmit: Schema.toStandardSchemaV1(organizationOnboardingSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const input = decodeCreateOrganizationNameInput(value);
      let organization: OrganizationSummary;
      const mutationFeedback = beginMutationFeedback();

      try {
        organization = await createCurrentServerOrganization({ data: input });
      } catch (error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getCreateOrganizationFailureMessage(
              error,
              CREATE_ORGANIZATION_FAILURE_MESSAGE
            ),
            fields: {},
          },
        });

        return;
      }

      await mutationFeedback.waitForSuccess();
      clearOrganizationAccessClientCache();
      setCreatedOrganization(organization);
    },
  });

  return (
    <main className="flex min-h-screen">
      <EntryShell atmosphere="setup">
        {createdOrganization ? (
          <InviteMembersStep
            isHydrated={isHydrated}
            onContinue={() =>
              continueToCreatedOrganization({
                navigate,
                organization: createdOrganization,
              })
            }
          />
        ) : (
          <EntrySurfaceCard
            className="max-w-xl"
            title="Create your team"
            titleLevel={1}
            description="This keeps your jobs, sites, and invites in one shared place."
            headerAccessory={<WorkspaceSetupStepper phase="create" />}
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

async function continueToCreatedOrganization({
  navigate,
  organization,
}: {
  readonly navigate: (options: { readonly to: "/" }) => Promise<void>;
  readonly organization: OrganizationSummary;
}) {
  const tenantUrl = buildOrganizationTenantUrl(
    organization.slug,
    "/",
    readTenantHostConfigFromEnv()
  );

  if (tenantUrl && tenantUrl !== getBrowserLocationHref()) {
    navigateBrowserTo(tenantUrl);
    return;
  }

  await navigate({ to: "/" });
}

function InviteMembersStep({
  isHydrated,
  onContinue,
}: {
  readonly isHydrated: boolean;
  readonly onContinue: () => Promise<void>;
}) {
  const [hasSentInvite, setHasSentInvite] = React.useState(false);
  const [roleSelectOpen, setRoleSelectOpen] = React.useState(false);
  const form = useForm({
    defaultValues: DEFAULT_INVITE_VALUES,
    validators: {
      onSubmit: Schema.toStandardSchemaV1(InviteOrganizationMemberInputSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const mutationFeedback = beginMutationFeedback({
        minimumDurationMs: 500,
      });
      const invite = decodeInviteOrganizationMemberInput(value);

      try {
        await inviteOrganizationMember(invite);
      } catch (error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getInviteMemberFailureMessage(error, INVITE_FAILURE_MESSAGE),
            fields: {},
          },
        });
        return;
      }

      await mutationFeedback.waitForSuccess();
      formApi.reset();
      setRoleSelectOpen(false);
      setHasSentInvite(true);
      toast.success("Invite sent", {
        description: `${invite.email} will receive an email shortly.`,
      });
    },
  });

  return (
    <EntrySurfaceCard
      className="max-w-xl"
      title="Invite members"
      titleLevel={1}
      description="Add the people who need access to jobs, sites, and invites."
      headerAccessory={<WorkspaceSetupStepper phase="invite" />}
      footer={
        <div
          className={cn(
            "flex flex-col items-stretch gap-2",
            hasSentInvite ? undefined : "sm:items-start"
          )}
        >
          <Button
            type="button"
            variant={hasSentInvite ? "default" : "ghost"}
            size={hasSentInvite ? "lg" : "default"}
            className={cn(
              "justify-center",
              hasSentInvite
                ? "w-full [view-transition-name:auth-card-action]"
                : "min-h-11 px-3 text-muted-foreground sm:min-h-9"
            )}
            onClick={() => void onContinue()}
          >
            {hasSentInvite ? "Continue to Ceird" : "Skip for now"}
          </Button>
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

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              size="lg"
              variant={hasSentInvite ? "secondary" : "default"}
              className={cn(
                "w-full",
                hasSentInvite
                  ? undefined
                  : "[view-transition-name:auth-card-action]"
              )}
              loading={isSubmitting}
              disabled={!isHydrated}
            >
              {getInviteSubmitLabel({
                hasSentInvite,
                isSubmitting,
              })}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </EntrySurfaceCard>
  );
}

function WorkspaceSetupStepper({ phase }: { readonly phase: SetupPhase }) {
  const createState = phase === "create" ? "active" : "complete";
  const inviteState = phase === "invite" ? "active" : "upcoming";
  const progressLabel = phase === "invite" ? "Step 2 of 2" : "Step 1 of 2";
  const progressDescription = [
    progressLabel,
    getSetupStepAccessibleLabel({ label: "Create team", state: createState }),
    getSetupStepAccessibleLabel({
      label: "Invite members",
      state: inviteState,
    }),
  ].join(", ");

  return (
    <nav
      aria-label={`Workspace setup progress: ${progressDescription}`}
      className="mt-1 flex w-full max-w-sm items-center gap-4 text-xs/5"
    >
      <span className="shrink-0 font-medium text-muted-foreground">
        {progressLabel}
      </span>
      <div className="flex min-w-0 flex-1 items-center">
        <WorkspaceSetupStep label="Create team" state={createState} />
        <span
          aria-hidden="true"
          data-slot="workspace-setup-connector"
          className={cn(
            "h-px min-w-8 flex-1 rounded-full transition-[background-color,opacity] duration-200 motion-reduce:transition-none",
            getSetupConnectorClassName(createState)
          )}
        />
        <WorkspaceSetupStep label="Invite members" state={inviteState} />
      </div>
    </nav>
  );
}

function WorkspaceSetupStep({
  label,
  state,
}: {
  readonly label: string;
  readonly state: SetupStepState;
}) {
  const accessibleLabel = getSetupStepAccessibleLabel({
    label,
    state,
  });
  const tooltipText = getSetupStepTooltipText({
    label,
    state,
  });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={accessibleLabel}
            title={tooltipText}
            className={cn(
              "relative z-10 flex size-4 shrink-0 cursor-help items-center justify-center rounded-full border-0 p-0 ring-1 transition-[background-color,color,box-shadow,transform] duration-200 motion-reduce:transition-none",
              getSetupStepMarkerClassName(state)
            )}
          />
        }
      >
        <span className="sr-only">{accessibleLabel}</span>
        {state === "complete" ? (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={12}
            strokeWidth={2}
          />
        ) : (
          <span
            className={cn(
              "rounded-full",
              state === "active"
                ? "size-2 bg-primary"
                : "size-1.5 bg-muted-foreground/45"
            )}
          />
        )}
      </TooltipTrigger>

      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

function getInviteSubmitLabel({
  hasSentInvite,
  isSubmitting,
}: {
  readonly hasSentInvite: boolean;
  readonly isSubmitting: boolean;
}) {
  if (isSubmitting) {
    return "Sending invite...";
  }

  if (hasSentInvite) {
    return "Send another invite";
  }

  return "Send invite";
}

function getSetupStepAccessibleLabel({
  label,
  state,
}: {
  readonly label: string;
  readonly state: SetupStepState;
}) {
  if (state === "complete") {
    return `${label} complete`;
  }

  if (state === "active") {
    return `${label} current`;
  }

  return label === "Invite members" ? `${label} optional` : `${label} next`;
}

function getSetupStepTooltipText({
  label,
  state,
}: {
  readonly label: string;
  readonly state: SetupStepState;
}) {
  if (state === "complete") {
    return `Complete: ${label}`;
  }

  if (state === "active") {
    return `Current: ${label}`;
  }

  if (label === "Invite members") {
    return `Optional: ${label}`;
  }

  return `Next: ${label}`;
}

function getSetupStepMarkerClassName(state: SetupStepState) {
  if (state === "complete") {
    return "bg-success/10 text-success ring-success/25 shadow-[0_0_0_3px_color-mix(in_oklab,var(--success)_10%,transparent)] motion-safe:animate-in motion-safe:zoom-in-95";
  }

  if (state === "active") {
    return "size-5 bg-primary/15 text-primary ring-primary/35 shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_14%,transparent)] after:absolute after:inset-[-5px] after:rounded-full after:border after:border-primary/35 after:content-[''] motion-safe:after:animate-ping";
  }

  return "bg-background text-muted-foreground ring-border/70";
}

function getSetupConnectorClassName(createState: SetupStepState) {
  if (createState === "complete") {
    return "bg-success/45";
  }

  if (createState === "active") {
    return "[background:linear-gradient(90deg,color-mix(in_oklab,var(--primary)_58%,var(--border))_0_48%,var(--border)_52%_100%)]";
  }

  return "bg-border";
}
