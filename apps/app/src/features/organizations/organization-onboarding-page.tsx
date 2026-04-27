import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import {
  getErrorText,
  getFormErrorText,
} from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { EntryShell, EntrySurfaceCard } from "#/features/auth/entry-shell";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { authClient } from "#/lib/auth-client";

import {
  decodeCreateOrganizationInput,
  organizationOnboardingSchema,
} from "./organization-schemas";

const CREATE_ORGANIZATION_FAILURE_MESSAGE =
  "We couldn't create your organization. Please try again.";

export function OrganizationOnboardingPage() {
  const navigate = useNavigate();
  const isHydrated = useIsHydrated();
  const form = useForm({
    defaultValues: {
      name: "",
      slug: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationOnboardingSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const input = decodeCreateOrganizationInput(value);
      const result = await authClient.organization.create({
        name: input.name,
        slug: input.slug,
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: CREATE_ORGANIZATION_FAILURE_MESSAGE,
            fields: {},
          },
        });

        return;
      }

      await navigate({ to: "/" });
    },
  });

  return (
    <main className="flex flex-1">
      <EntryShell
        mode="contained"
        badge="Workspace setup"
        title="Set up the workspace your team will use."
        description="Create the organization once, then move straight into inviting the rest of the team."
        supportingContent={
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                Workspace details
              </p>
              <p className="max-w-[48ch] text-sm/7 text-foreground/90">
                This is the same public setup flow as sign up and invitations:
                one workspace, one durable name, one slug your team can reuse in
                links and invites.
              </p>
            </div>

            <dl className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1 border-t border-border/60 pt-4">
                <dt className="text-xs font-medium text-muted-foreground uppercase">
                  Organization name
                </dt>
                <dd className="text-sm/6 text-muted-foreground">
                  Use the name your team already knows from calls, schedules,
                  and paperwork.
                </dd>
              </div>

              <div className="flex flex-col gap-1 border-t border-border/60 pt-4">
                <dt className="text-xs font-medium text-muted-foreground uppercase">
                  Organization slug
                </dt>
                <dd className="text-sm/6 text-muted-foreground">
                  Keep it clean and durable so invite links stay easy to share.
                </dd>
              </div>

              <div className="flex flex-col gap-1 border-t border-border/60 pt-4 sm:col-span-2">
                <dt className="text-xs font-medium text-muted-foreground uppercase">
                  After this step
                </dt>
                <dd className="text-sm/6 text-muted-foreground">
                  You&rsquo;ll land in the app and can start inviting teammates
                  right away.
                </dd>
              </div>
            </dl>
          </div>
        }
      >
        <EntrySurfaceCard
          badge="Workspace"
          className="max-w-lg"
          title="Create your organization"
          description="Add the organization name and slug to continue."
        >
          <form
            className="flex flex-col gap-6"
            method="post"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="name">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Organization name"
                      htmlFor="organization-name"
                      invalid={Boolean(errorText)}
                      descriptionText="Use the name your crew already knows."
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
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />
                    </AuthFormField>
                  );
                }}
              </form.Field>

              <form.Field name="slug">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Organization slug"
                      htmlFor="organization-slug"
                      invalid={Boolean(errorText)}
                      descriptionText="This becomes part of invite links and should stay easy to read."
                      errorText={errorText}
                    >
                      <Input
                        id="organization-slug"
                        name={field.name}
                        placeholder="acme-field-ops"
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
                  className="w-full"
                  disabled={isSubmitting || !isHydrated}
                >
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  {isSubmitting
                    ? "Creating organization..."
                    : "Create organization"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </EntrySurfaceCard>
      </EntryShell>
    </main>
  );
}
