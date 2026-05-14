import { Children, cloneElement, isValidElement } from "react";
import type { ReactNode } from "react";

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
  const seenIds = new Set(describedByIds);

  for (const id of idsToAdd) {
    if (!seenIds.has(id)) {
      describedByIds.push(id);
      seenIds.add(id);
    }
  }

  return describedByIds.join(" ");
}

function addDescribedByToControl(
  node: ReactNode,
  controlId: string,
  idsToAdd: readonly string[]
): ReactNode {
  if (
    isValidElement<{
      "aria-describedby"?: string;
      children?: ReactNode;
      id?: string;
    }>(node)
  ) {
    if (node.props.id === controlId) {
      return cloneElement(node, {
        "aria-describedby": mergeDescribedBy(
          node.props["aria-describedby"],
          idsToAdd
        ),
      });
    }

    if (node.props.children) {
      return cloneElement(node, {
        children: Children.map(node.props.children, (child) =>
          addDescribedByToControl(child, controlId, idsToAdd)
        ),
      });
    }
  }

  return node;
}

export function AuthFormField(props: {
  readonly descriptionText?: ReactNode;
  readonly label: string;
  readonly htmlFor: string;
  readonly validationState?: "invalid";
  readonly errorText?: string;
  readonly children: ReactNode;
}) {
  const {
    children,
    descriptionText,
    errorText,
    htmlFor,
    label,
    validationState,
  } = props;
  const invalid = Boolean(errorText) || validationState === "invalid";
  const descriptionId = descriptionText ? `${htmlFor}-description` : undefined;
  const errorId = errorText ? `${htmlFor}-error` : undefined;
  const describedByIds: string[] = [];

  if (descriptionId) {
    describedByIds.push(descriptionId);
  }

  if (errorId) {
    describedByIds.push(errorId);
  }

  const content =
    describedByIds.length > 0
      ? addDescribedByToControl(children, htmlFor, describedByIds)
      : children;

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
