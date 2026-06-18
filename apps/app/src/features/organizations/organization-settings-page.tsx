import type { OrganizationSummary } from "@ceird/identity-core";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { Schema } from "effect";
import { ArrowRight } from "lucide-react";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button, buttonVariants } from "#/components/ui/button";
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
import { submitClientForm } from "#/lib/client-form-submit";
import { beginMutationFeedback } from "#/lib/mutation-feedback";

import { clearOrganizationAccessClientCache } from "./organization-access-cache";
import {
  decodeUpdateOrganizationInput,
  organizationSettingsSchema,
} from "./organization-schemas";

const UPDATE_ORGANIZATION_FAILURE_MESSAGE =
  "We couldn't update the organization. Please try again.";

// Organization settings owns the general form and routes label management to
// the dedicated realtime Labels surface.
// react-doctor-disable-next-line
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
  const savedOrganizationNameRef = React.useRef(organization.name);
  const [organizationFormDefaults, setOrganizationFormDefaults] =
    React.useState(() => ({
      name: organization.name,
    }));
  const settingsRootRef = React.useRef<HTMLDivElement | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const previousOrganizationRef = React.useRef({
    id: organization.id,
    name: organization.name,
  });
  const latestOrganizationIdRef = React.useRef(organization.id);
  latestOrganizationIdRef.current = organization.id;

  const form = useForm({
    defaultValues: organizationFormDefaults,
    validators: {
      onSubmit: Schema.toStandardSchemaV1(organizationSettingsSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });
      setSuccessMessage(null);

      const input = decodeUpdateOrganizationInput(value);

      if (input.name === savedOrganizationNameRef.current) {
        const savedOrganizationValues = {
          name: savedOrganizationNameRef.current,
        };

        setOrganizationFormDefaults(savedOrganizationValues);
        formApi.reset(savedOrganizationValues);
        return;
      }

      let result;
      const actionOrganizationId = organization.id;
      const mutationFeedback = beginMutationFeedback();

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

      await mutationFeedback.waitForSuccess();

      if (latestOrganizationIdRef.current !== actionOrganizationId) {
        return;
      }

      clearOrganizationAccessClientCache();
      let nextSuccessMessage =
        "Organization updated. Refresh the page if the old name still appears elsewhere.";

      try {
        await router.invalidate();
        nextSuccessMessage = "Organization updated.";
      } catch {
        // Keep the local form in sync with the accepted mutation even when a
        // follow-up route refresh fails.
      }

      if (latestOrganizationIdRef.current !== actionOrganizationId) {
        return;
      }

      const updatedOrganizationValues = {
        name: input.name,
      };

      setOrganizationFormDefaults(updatedOrganizationValues);
      formApi.reset(updatedOrganizationValues);
      savedOrganizationNameRef.current = input.name;
      setSuccessMessage(nextSuccessMessage);
    },
  });

  // Refresh local form state when the active organization data changes.
  // react-doctor-disable-next-line
  React.useEffect(() => {
    const previousOrganization = previousOrganizationRef.current;
    const isNewOrganization = previousOrganization.id !== organization.id;
    const isSameOrganizationRemoteNameChange =
      previousOrganization.id === organization.id &&
      previousOrganization.name !== organization.name;

    previousOrganizationRef.current = {
      id: organization.id,
      name: organization.name,
    };

    if (!isNewOrganization && !isSameOrganizationRemoteNameChange) {
      return;
    }

    savedOrganizationNameRef.current = organization.name;

    if (isNewOrganization) {
      setSuccessMessage(null);
    }

    if (isNewOrganization || form.state.isDefaultValue) {
      const nextOrganizationValues = {
        name: organization.name,
      };

      setOrganizationFormDefaults(nextOrganizationValues);
      form.reset(nextOrganizationValues);
    }
  }, [form, organization.id, organization.name]);

  useAppHotkey(
    "settingsSubmit",
    () => {
      const { activeElement } = document;
      const focusedForm =
        activeElement instanceof Element ? activeElement.closest("form") : null;
      const focusIsInsideGeneralForm =
        activeElement instanceof Node &&
        Boolean(formRef.current?.contains(activeElement));
      const focusIsInsideSettings =
        activeElement instanceof Node &&
        Boolean(settingsRootRef.current?.contains(activeElement));

      if (!focusIsInsideSettings) {
        return;
      }

      if (!focusIsInsideGeneralForm) {
        focusedForm?.requestSubmit();
        return;
      }

      if (form.state.isSubmitting || form.state.isDefaultValue) {
        return;
      }

      formRef.current?.requestSubmit();
    },
    { enabled: isHydrated }
  );

  return (
    <div
      ref={settingsRootRef}
      className="flex flex-1 flex-col gap-5 p-4 sm:gap-6 sm:p-6 lg:p-8"
    >
      <AppPageHeader
        title="Organization settings"
        className="border-b-0 pb-0"
      />

      <div className="flex max-w-5xl flex-col gap-5">
        <AppUtilityPanel id="organization-general" title="General">
          <form
            ref={formRef}
            className="flex max-w-xl flex-col gap-5"
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
                      label="Organization name"
                      htmlFor="organization-name"
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
              <output
                className="text-sm text-muted-foreground"
                aria-live="polite"
              >
                {successMessage}
              </output>
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
                  className="self-start max-sm:w-full max-sm:self-stretch"
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
          id="organization-labels-entry"
          title="Realtime Labels"
          description="Open the dedicated realtime label-management surface for this organization."
          actions={
            <a
              className={buttonVariants()}
              href="/organization/settings/labels"
            >
              Open labels
              <ArrowRight aria-hidden="true" />
            </a>
          }
        />
      </div>
    </div>
  );
}
