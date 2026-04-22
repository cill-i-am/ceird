import { createElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "#/components/ui/field";

function mergeDescribedBy(
  existingDescribedBy: unknown,
  idsToAdd: readonly string[]
): string {
  const describedByIds =
    typeof existingDescribedBy === "string"
      ? existingDescribedBy.split(/\s+/).filter(Boolean)
      : [];

  for (const id of idsToAdd) {
    if (!describedByIds.includes(id)) {
      describedByIds.push(id);
    }
  }

  return describedByIds.join(" ");
}

export function AuthFormField(props: {
  readonly descriptionText?: ReactNode;
  readonly label: string;
  readonly htmlFor: string;
  readonly invalid: boolean;
  readonly errorText?: string;
  readonly children: ReactNode;
}) {
  const { children, descriptionText, errorText, htmlFor, invalid, label } =
    props;
  const descriptionId = descriptionText ? `${htmlFor}-description` : undefined;
  const errorId = errorText ? `${htmlFor}-error` : undefined;
  const describedByIds = [descriptionId, errorId].filter(Boolean) as string[];
  let content = children;

  if (
    describedByIds.length > 0 &&
    isValidElement<{ "aria-describedby"?: string }>(
      children as ReactElement<{ "aria-describedby"?: string }>
    )
  ) {
    const control = children as ReactElement<{ "aria-describedby"?: string }>;

    content = createElement(control.type, {
      ...control.props,
      key: control.key,
      "aria-describedby": mergeDescribedBy(
        control.props["aria-describedby"],
        describedByIds
      ),
    });
  }

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {content}
      {descriptionText ? (
        <FieldDescription id={descriptionId}>
          {descriptionText}
        </FieldDescription>
      ) : null}
      {errorText ? (
        <FieldError id={errorId} errors={[{ message: errorText }]} />
      ) : null}
    </Field>
  );
}
