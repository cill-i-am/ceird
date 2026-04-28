import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { Schema } from "effect";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  getErrorText,
  getFormErrorText,
} from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { authClient } from "#/lib/auth-client";

import type { OrganizationSummary } from "./organization-access";
import {
  decodeUpdateOrganizationInput,
  organizationSettingsSchema,
} from "./organization-schemas";

const UPDATE_ORGANIZATION_FAILURE_MESSAGE =
  "We couldn't update the organization. Please try again.";

export function OrganizationSettingsPage({
  organization,
}: {
  readonly organization: OrganizationSummary;
}) {
  const router = useRouter();
  const isHydrated = useIsHydrated();
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null
  );
  const [savedOrganizationName, setSavedOrganizationName] = React.useState(
    organization.name
  );
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const previousOrganizationIdRef = React.useRef(organization.id);

  const form = useForm({
    defaultValues: {
      name: organization.name,
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationSettingsSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });
      setSuccessMessage(null);

      const input = decodeUpdateOrganizationInput(value);

      if (input.name === savedOrganizationName) {
        formApi.reset({
          name: savedOrganizationName,
        });
        return;
      }

      let result;

      try {
        result = await authClient.organization.update({
          data: {
            name: input.name,
          },
          organizationId: organization.id,
        });
      } catch {
        formApi.setErrorMap({
          onSubmit: {
            form: UPDATE_ORGANIZATION_FAILURE_MESSAGE,
            fields: {},
          },
        });
        return;
      }

      if (result.error || !result.data) {
        formApi.setErrorMap({
          onSubmit: {
            form: UPDATE_ORGANIZATION_FAILURE_MESSAGE,
            fields: {},
          },
        });
        return;
      }

      formApi.reset({
        name: result.data.name,
      });
      setSavedOrganizationName(result.data.name);
      setSuccessMessage("Organization updated.");

      try {
        await router.invalidate();
      } catch {
        setSuccessMessage(
          "Organization updated. Refresh the page if the old name still appears elsewhere."
        );
      }
    },
  });

  React.useEffect(() => {
    if (previousOrganizationIdRef.current === organization.id) {
      return;
    }

    previousOrganizationIdRef.current = organization.id;
    setSuccessMessage(null);
    setSavedOrganizationName(organization.name);
    form.reset({
      name: organization.name,
    });
  }, [form, organization.id, organization.name]);

  useAppHotkey(
    "settingsSubmit",
    () => {
      if (form.state.isSubmitting || form.state.isDefaultValue) {
        return;
      }

      formRef.current?.requestSubmit();
    },
    { enabled: isHydrated }
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <AppPageHeader
        eyebrow="Organization"
        title="Organization settings"
        description="Keep the workspace identity current for everyone on the team."
      />

      <div className="grid max-w-5xl gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
        <AppUtilityPanel
          title="General"
          description="Update the name your team sees across Task Tracker."
          className="rounded-none border-x-0 border-t border-b bg-transparent p-0 pt-5 shadow-none supports-[backdrop-filter]:bg-transparent sm:p-0 sm:pt-5"
        >
          <form
            ref={formRef}
            className="flex max-w-xl flex-col gap-5"
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
                      errorText={errorText}
                    >
                      <Input
                        id="organization-name"
                        name={field.name}
                        autoComplete="organization"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onChange={(event) => {
                          setSuccessMessage(null);
                          field.handleChange(event.target.value);
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

            {successMessage ? (
              <p role="status" className="text-sm text-muted-foreground">
                {successMessage}
              </p>
            ) : null}

            <form.Subscribe
              selector={(state) => ({
                isDefaultValue: state.isDefaultValue,
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ isDefaultValue, isSubmitting }) => (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  loading={isSubmitting}
                  disabled={isDefaultValue || !isHydrated}
                >
                  {isSubmitting ? "Saving..." : "Save changes"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </AppUtilityPanel>

        <AppUtilityPanel
          title="Identity"
          description="These values are used when Task Tracker identifies this workspace."
        >
          <dl className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Slug
              </dt>
              <dd className="font-mono text-sm break-all text-foreground">
                {organization.slug}
              </dd>
            </div>
            <div className="flex flex-col gap-1 border-t border-border/60 pt-4">
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Access
              </dt>
              <dd className="text-sm/6 text-muted-foreground">
                Admins and owners can edit organization settings.
              </dd>
            </div>
          </dl>
        </AppUtilityPanel>
      </div>
    </div>
  );
}
