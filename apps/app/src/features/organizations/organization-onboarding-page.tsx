import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  getErrorText,
  getFormErrorText,
} from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import {
  EntryHighlightGrid,
  EntryShell,
  EntrySurfaceCard,
} from "#/features/auth/entry-shell";
import { authClient } from "#/lib/auth-client";

import {
  decodeCreateOrganizationInput,
  organizationOnboardingSchema,
} from "./organization-schemas";

const CREATE_ORGANIZATION_FAILURE_MESSAGE =
  "We couldn't create your organization. Please try again.";
const ORGANIZATION_SETUP_HIGHLIGHTS = [
  {
    title: "Name it clearly",
    description:
      "Use the name your team already recognizes on calls, invoices, and schedules.",
  },
  {
    title: "Keep the slug durable",
    description:
      "Choose a clean slug you can reuse in links and invites without second-guessing it.",
  },
  {
    title: "Invite the crew next",
    description:
      "Once the workspace exists, bring in coordinators, admins, and field staff.",
  },
] as const;

export function OrganizationOnboardingPage() {
  const navigate = useNavigate();
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
        title="Create the workspace your team will run from."
        description="Set up the organization name and slug once, then start inviting the people who will keep work moving."
        supportingContent={
          <EntryHighlightGrid items={ORGANIZATION_SETUP_HIGHLIGHTS} />
        }
      >
        <EntrySurfaceCard
          badge="Step 1"
          title="Create your organization"
          description="Add your organization name and slug to get started."
        >
          <form
            className="flex flex-col gap-6"
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
                  disabled={isSubmitting}
                >
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
